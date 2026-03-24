'use strict';

const { transform } = require('@rt-collab/shared/src/ot/transform');
const { apply } = require('@rt-collab/shared/src/ot/apply');
const { retain, insert, del } = require('@rt-collab/shared/src/ot/operations');

/**
 * Helper: verify the convergence property for two concurrent ops on a document.
 * apply(apply(doc, a), bPrime) === apply(apply(doc, b), aPrime)
 */
function assertConvergence(doc, a, b, priority = 'left') {
  const [aPrime, bPrime] = transform(a, b, priority);
  const resultAB = apply(apply(doc, a), bPrime);
  const resultBA = apply(apply(doc, b), aPrime);
  expect(resultAB).toBe(resultBA);
  return resultAB;
}

describe('transform', () => {
  describe('insert vs insert', () => {
    test('inserts at different positions', () => {
      const doc = 'abcd';
      const a = [retain(1), insert('X'), retain(3)];  // "aXbcd"
      const b = [retain(3), insert('Y'), retain(1)];  // "abcYd"
      const result = assertConvergence(doc, a, b);
      expect(result).toBe('aXbcYd');
    });

    test('inserts at same position, priority=left (a goes first)', () => {
      const doc = 'abcd';
      const a = [retain(2), insert('X'), retain(2)];
      const b = [retain(2), insert('Y'), retain(2)];
      const result = assertConvergence(doc, a, b, 'left');
      expect(result).toBe('abXYcd');
    });

    test('inserts at same position, priority=right (b goes first)', () => {
      const doc = 'abcd';
      const a = [retain(2), insert('X'), retain(2)];
      const b = [retain(2), insert('Y'), retain(2)];
      const result = assertConvergence(doc, a, b, 'right');
      expect(result).toBe('abYXcd');
    });

    test('both insert at start of document', () => {
      const doc = 'abc';
      const a = [insert('X'), retain(3)];
      const b = [insert('Y'), retain(3)];
      const result = assertConvergence(doc, a, b, 'left');
      expect(result).toBe('XYabc');
    });

    test('both insert multi-character strings at same position', () => {
      const doc = 'ab';
      const a = [retain(1), insert('XXX'), retain(1)];
      const b = [retain(1), insert('YY'), retain(1)];
      const result = assertConvergence(doc, a, b, 'left');
      expect(result).toBe('aXXXYYb');
    });
  });

  describe('insert vs delete', () => {
    test('insert before delete range', () => {
      const doc = 'abcde';
      const a = [retain(1), insert('X'), retain(4)];  // "aXbcde"
      const b = [retain(3), del(2)];                    // "abc"
      const result = assertConvergence(doc, a, b);
      expect(result).toBe('aXbc');
    });

    test('insert after delete range', () => {
      const doc = 'abcde';
      const a = [retain(4), insert('X'), retain(1)];  // "abcdXe"
      const b = [del(2), retain(3)];                    // "cde"
      const result = assertConvergence(doc, a, b);
      expect(result).toBe('cdXe');
    });

    test('insert inside delete range', () => {
      const doc = 'abcde';
      const a = [retain(2), insert('X'), retain(3)];   // "abXcde"
      const b = [retain(1), del(3), retain(1)];         // "ae"
      const result = assertConvergence(doc, a, b);
      // a inserts X at position 2. b deletes positions 1-3 (bcd).
      // After transform: a's insert survives, b's delete still removes what it can.
      expect(result).toBe('aXe');
    });
  });

  describe('delete vs delete', () => {
    test('non-overlapping deletes (a before b)', () => {
      const doc = 'abcdef';
      const a = [del(2), retain(4)];                    // "cdef"
      const b = [retain(4), del(2)];                    // "abcd"
      const result = assertConvergence(doc, a, b);
      expect(result).toBe('cd');
    });

    test('non-overlapping deletes (b before a)', () => {
      const doc = 'abcdef';
      const a = [retain(4), del(2)];                    // "abcd"
      const b = [del(2), retain(4)];                    // "cdef"
      const result = assertConvergence(doc, a, b);
      expect(result).toBe('cd');
    });

    test('overlapping deletes (partial overlap)', () => {
      const doc = 'abcdef';
      const a = [retain(1), del(3), retain(2)];         // "aef"
      const b = [retain(2), del(3), retain(1)];         // "abf"
      // a deletes bcd (positions 1-3), b deletes cde (positions 2-4)
      // Combined: all of bcde deleted -> "af"
      const result = assertConvergence(doc, a, b);
      expect(result).toBe('af');
    });

    test('identical deletes (same range)', () => {
      const doc = 'abcde';
      const a = [retain(1), del(3), retain(1)];         // "ae"
      const b = [retain(1), del(3), retain(1)];         // "ae"
      const result = assertConvergence(doc, a, b);
      expect(result).toBe('ae');
    });

    test('adjacent deletes', () => {
      const doc = 'abcdef';
      const a = [retain(1), del(2), retain(3)];         // "adef"
      const b = [retain(3), del(2), retain(1)];         // "abcf"
      const result = assertConvergence(doc, a, b);
      expect(result).toBe('af');
    });
  });

  describe('delete vs insert', () => {
    test('delete range that spans an insert point', () => {
      const doc = 'abcde';
      const a = [retain(1), del(3), retain(1)];         // "ae"
      const b = [retain(2), insert('X'), retain(3)];    // "abXcde"
      const result = assertConvergence(doc, a, b);
      // b inserted X inside the range a deleted. X survives.
      expect(result).toBe('aXe');
    });

    test('insert at boundary of delete (before)', () => {
      const doc = 'abcde';
      const a = [retain(2), del(2), retain(1)];         // "abe"
      const b = [retain(2), insert('X'), retain(3)];    // "abXcde"
      const result = assertConvergence(doc, a, b);
      expect(result).toBe('abXe');
    });
  });

  describe('identity and edge cases', () => {
    test('identity transformed against any op yields equivalent result', () => {
      const doc = 'hello';
      const id = [retain(5)];
      const op = [retain(2), insert('X'), retain(3)];

      const [idPrime, opPrime] = transform(id, op);
      // Applying id then opPrime should give same result as applying op then idPrime
      const result = assertConvergence(doc, id, op);
      expect(result).toBe('heXllo');
    });

    test('transform on empty document (insert vs insert)', () => {
      const doc = '';
      const a = [insert('hello')];
      const b = [insert('world')];
      const result = assertConvergence(doc, a, b, 'left');
      expect(result).toBe('helloworld');
    });

    test('convergence with complex operations', () => {
      const doc = 'The quick brown fox';
      // a: "The slow brown fox"
      const a = [retain(4), del(5), insert('slow'), retain(10)];
      // b: "The quick red fox"
      const b = [retain(10), del(5), insert('red'), retain(4)];
      const result = assertConvergence(doc, a, b);
      expect(result).toBe('The slow red fox');
    });

    test('throws on input length mismatch', () => {
      const a = [retain(5)];
      const b = [retain(3)];
      expect(() => transform(a, b)).toThrow(/input length/i);
    });
  });
});
