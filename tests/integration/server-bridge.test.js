'use strict';

const { Document, DocumentManager, ResyncError, StaleOperationError } = require('@rt-collab/server');
const { retain, insert, del, apply } = require('@rt-collab/shared');
const { Persistence } = require('@rt-collab/server/src/db/persistence');

describe('Document - basic operations', () => {
  let doc;

  afterEach(() => {
    if (doc) doc.destroy();
  });

  test('apply operation at current version (no transform needed)', () => {
    doc = new Document('room1', { content: 'hello', version: 0 });

    const result = doc.receiveOperation(
      [retain(5), insert(' world')],
      0,
      'userA'
    );

    expect(result.version).toBe(1);
    expect(doc.content).toBe('hello world');
    expect(doc.version).toBe(1);
  });

  test('apply multiple sequential operations', () => {
    doc = new Document('room1', { content: '', version: 0 });

    doc.receiveOperation([insert('abc')], 0, 'userA');
    expect(doc.content).toBe('abc');

    doc.receiveOperation([retain(3), insert('def')], 1, 'userB');
    expect(doc.content).toBe('abcdef');
    expect(doc.version).toBe(2);
  });

  test('operations on empty document', () => {
    doc = new Document('room1', { content: '', version: 0 });

    doc.receiveOperation([insert('x')], 0, 'userA');
    expect(doc.content).toBe('x');

    doc.receiveOperation([del(1)], 1, 'userA');
    expect(doc.content).toBe('');
    expect(doc.version).toBe(2);
  });
});

describe('Document - concurrent operation transform', () => {
  let doc;

  afterEach(() => {
    if (doc) doc.destroy();
  });

  test('two clients at same version, inserts at different positions', () => {
    doc = new Document('room1', { content: 'abcd', version: 0 });

    // Client A: "aXbcd"
    doc.receiveOperation([retain(1), insert('X'), retain(3)], 0, 'userA');
    expect(doc.content).toBe('aXbcd');

    // Client B also based on version 0: "abcYd"
    // Must be transformed against A's op
    doc.receiveOperation([retain(3), insert('Y'), retain(1)], 0, 'userB');
    expect(doc.content).toBe('aXbcYd');
    expect(doc.version).toBe(2);
  });

  test('two clients at same version, inserts at same position', () => {
    doc = new Document('room1', { content: 'ab', version: 0 });

    // Client A: insert X at position 1
    doc.receiveOperation([retain(1), insert('X'), retain(1)], 0, 'userA');
    expect(doc.content).toBe('aXb');

    // Client B: insert Y at position 1 (same base version)
    // Server ops have priority='left', so server's existing op (A's) wins tie-break
    doc.receiveOperation([retain(1), insert('Y'), retain(1)], 0, 'userB');
    expect(doc.content).toBe('aXYb');
    expect(doc.version).toBe(2);
  });

  test('client with stale baseVersion (catchup over 3 ops)', () => {
    doc = new Document('room1', { content: 'abcde', version: 0 });

    // Apply 3 ops sequentially
    doc.receiveOperation([retain(5), insert('1')], 0, 'userA');   // "abcde1"
    doc.receiveOperation([retain(6), insert('2')], 1, 'userA');   // "abcde12"
    doc.receiveOperation([retain(7), insert('3')], 2, 'userA');   // "abcde123"
    expect(doc.version).toBe(3);

    // Client B submits based on version 0 (needs catchup over all 3)
    // B wants to insert "X" at position 2: "abXcde"
    doc.receiveOperation([retain(2), insert('X'), retain(3)], 0, 'userB');

    // X should still be at position 2, with the appended 1,2,3 at the end
    expect(doc.content).toBe('abXcde123');
    expect(doc.version).toBe(4);
  });

  test('three clients all at same baseVersion', () => {
    doc = new Document('room1', { content: 'hello', version: 0 });

    // All three based on version 0
    // A: insert at position 0
    doc.receiveOperation([insert('A'), retain(5)], 0, 'userA');
    expect(doc.content).toBe('Ahello');

    // B: insert at position 3 (in original doc)
    doc.receiveOperation([retain(3), insert('B'), retain(2)], 0, 'userB');
    expect(doc.content).toBe('AhelBlo');

    // C: insert at position 5 (end of original doc)
    doc.receiveOperation([retain(5), insert('C')], 0, 'userC');
    expect(doc.content).toBe('AhelBloC');
    expect(doc.version).toBe(3);
  });
});

describe('Document - version validation', () => {
  let doc;

  afterEach(() => {
    if (doc) doc.destroy();
  });

  test('reject baseVersion too far behind (ResyncError)', () => {
    doc = new Document('room1', { content: '', version: 0 });
    doc.maxCatchupGap = 5; // lower threshold for testing

    // Build up version by appending single chars
    for (let i = 0; i < 6; i++) {
      const len = doc.content.length;
      const op = len > 0 ? [retain(len), insert('x')] : [insert('x')];
      doc.receiveOperation(op, doc.version, 'userA');
    }
    expect(doc.version).toBe(6);

    // Client at version 0, gap is 6 > maxCatchupGap of 5
    expect(() => {
      doc.receiveOperation([insert('late')], 0, 'userB');
    }).toThrow(ResyncError);
  });

  test('reject baseVersion ahead of server', () => {
    doc = new Document('room1', { content: 'abc', version: 0 });

    expect(() => {
      doc.receiveOperation([retain(3), insert('x')], 5, 'userB');
    }).toThrow(StaleOperationError);
  });
});

describe('Document - event emission', () => {
  let doc;

  afterEach(() => {
    if (doc) doc.destroy();
  });

  test('operation event emitted with correct payload', () => {
    doc = new Document('room1', { content: 'hello', version: 0 });

    const events = [];
    doc.subscribe('operation', (data) => events.push(data));

    doc.receiveOperation([retain(5), insert('!')], 0, 'userA');

    expect(events).toHaveLength(1);
    expect(events[0].version).toBe(1);
    expect(events[0].userId).toBe('userA');
    expect(events[0].op).toBeDefined();
  });

  test('event includes userId so transport can exclude sender', () => {
    doc = new Document('room1', { content: 'ab', version: 0 });
    doc.addClient('clientA');
    doc.addClient('clientB');

    const events = [];
    doc.subscribe('operation', (data) => events.push(data));

    doc.receiveOperation([retain(2), insert('X')], 0, 'clientA');

    expect(events[0].userId).toBe('clientA');
    // Transport layer would check: if userId !== myClientId, apply the op
  });
});

describe('Document - snapshot strategy', () => {
  let doc;

  afterEach(() => {
    if (doc) doc.destroy();
  });

  test('snapshot triggered after threshold operations', () => {
    const persistence = new Persistence();
    const saveSnapshotSpy = jest.spyOn(persistence, 'saveSnapshot');

    doc = new Document('room1', {
      content: '',
      version: 0,
      persistence,
    });
    doc.snapshotOpThreshold = 10; // lower for testing

    // Apply exactly 10 operations (append chars)
    for (let i = 0; i < 10; i++) {
      const len = doc.content.length;
      const op = len > 0 ? [retain(len), insert('x')] : [insert('x')];
      doc.receiveOperation(op, doc.version, 'userA');
    }

    expect(saveSnapshotSpy).toHaveBeenCalledTimes(1);
    expect(saveSnapshotSpy).toHaveBeenCalledWith({
      roomId: 'room1',
      content: 'xxxxxxxxxx',
      version: 10,
    });

    // Apply 10 more
    for (let i = 0; i < 10; i++) {
      const len = doc.content.length;
      doc.receiveOperation([retain(len), insert('y')], doc.version, 'userA');
    }

    expect(saveSnapshotSpy).toHaveBeenCalledTimes(2);
  });

  test('snapshot triggered by timer', () => {
    jest.useFakeTimers();

    const persistence = new Persistence();
    const saveSnapshotSpy = jest.spyOn(persistence, 'saveSnapshot');

    doc = new Document('room1', {
      content: '',
      version: 0,
      persistence,
    });
    doc.snapshotTimeInterval = 100; // short interval for testing
    // Restart timer with new interval
    doc._stopSnapshotTimer();
    doc._startSnapshotTimer();

    // Apply a few ops (below threshold)
    doc.receiveOperation([insert('a')], 0, 'userA');
    doc.receiveOperation([retain(1), insert('b')], 1, 'userA');

    expect(saveSnapshotSpy).not.toHaveBeenCalled();

    // Advance timer past interval
    jest.advanceTimersByTime(150);

    expect(saveSnapshotSpy).toHaveBeenCalledTimes(1);
    expect(saveSnapshotSpy).toHaveBeenCalledWith({
      roomId: 'room1',
      content: 'ab',
      version: 2,
    });

    jest.useRealTimers();
  });
});

describe('DocumentManager', () => {
  test('loads document from persistence (snapshot + replay)', async () => {
    const persistence = new Persistence();

    // Pre-populate persistence with a snapshot and subsequent ops
    await persistence.saveSnapshot({
      roomId: 'room1',
      content: 'hello',
      version: 5,
    });
    await persistence.saveOperation('room1', {
      op: [retain(5), insert(' world')],
      userId: 'userA',
      version: 6,
    });
    await persistence.saveOperation('room1', {
      op: [retain(11), insert('!')],
      userId: 'userB',
      version: 7,
    });

    const manager = new DocumentManager({ persistence });
    const doc = await manager.getOrLoad('room1');

    expect(doc.content).toBe('hello world!');
    expect(doc.version).toBe(7);

    manager.destroyAll();
  });

  test('returns same document instance on subsequent calls', async () => {
    const manager = new DocumentManager();
    const doc1 = await manager.getOrLoad('room1');
    const doc2 = await manager.getOrLoad('room1');

    expect(doc1).toBe(doc2);

    manager.destroyAll();
  });
});
