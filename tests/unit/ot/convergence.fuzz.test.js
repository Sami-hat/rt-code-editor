'use strict';

const { apply } = require('@rt-collab/shared/src/ot/apply');
const { transform } = require('@rt-collab/shared/src/ot/transform');
const { compose } = require('@rt-collab/shared/src/ot/compose');
const {
  retain,
  insert,
  del,
  inputLength,
  outputLength,
  normalize,
} = require('@rt-collab/shared/src/ot/operations');

// --- Random generation helpers ---

const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomString(maxLen) {
  const len = randomInt(0, maxLen);
  let s = '';
  for (let i = 0; i < len; i++) {
    s += CHARS[randomInt(0, CHARS.length - 1)];
  }
  return s;
}

/**
 * Generate a random valid compound operation for a document of given length.
 * The operation's inputLength will equal docLen.
 */
function randomOperation(docLen) {
  const op = [];
  let remaining = docLen;

  while (remaining > 0) {
    const choice = Math.random();

    if (choice < 0.3) {
      // retain
      const n = randomInt(1, remaining);
      op.push(retain(n));
      remaining -= n;
    } else if (choice < 0.6) {
      // delete
      const n = randomInt(1, remaining);
      op.push(del(n));
      remaining -= n;
    } else {
      // insert (doesn't consume remaining)
      const text = randomString(10);
      if (text.length > 0) {
        op.push(insert(text));
      }
    }
  }

  // Possibly one more insert at the end
  if (Math.random() < 0.3) {
    const text = randomString(10);
    if (text.length > 0) {
      op.push(insert(text));
    }
  }

  return normalize(op);
}

/**
 * Generate an insert-only operation for a document of given length.
 */
function randomInsertOnlyOp(docLen) {
  const op = [];
  let remaining = docLen;

  while (remaining > 0) {
    if (Math.random() < 0.5) {
      const n = randomInt(1, remaining);
      op.push(retain(n));
      remaining -= n;
    } else {
      const text = randomString(8);
      if (text.length > 0) {
        op.push(insert(text));
      }
    }
  }

  // Must retain any leftover
  if (remaining > 0) {
    op.push(retain(remaining));
  }

  return normalize(op);
}

/**
 * Generate a delete-only operation for a document of given length.
 */
function randomDeleteOnlyOp(docLen) {
  const op = [];
  let remaining = docLen;

  while (remaining > 0) {
    if (Math.random() < 0.5) {
      const n = randomInt(1, remaining);
      op.push(retain(n));
      remaining -= n;
    } else {
      const n = randomInt(1, remaining);
      op.push(del(n));
      remaining -= n;
    }
  }

  return normalize(op);
}

/**
 * Assert the transform convergence property:
 * apply(apply(doc, a), b') === apply(apply(doc, b), a')
 */
function assertTransformConvergence(doc, a, b) {
  const [aPrime, bPrime] = transform(a, b, 'left');

  // Verify length invariants
  expect(inputLength(aPrime)).toBe(outputLength(b));
  expect(inputLength(bPrime)).toBe(outputLength(a));

  const resultAB = apply(apply(doc, a), bPrime);
  const resultBA = apply(apply(doc, b), aPrime);
  expect(resultAB).toBe(resultBA);
}

/**
 * Assert the compose property:
 * apply(doc, compose(a, b)) === apply(apply(doc, a), b)
 */
function assertComposeProperty(doc, a) {
  const intermediateDoc = apply(doc, a);
  const b = randomOperation(intermediateDoc.length);
  const composed = compose(a, b);
  const stepwise = apply(intermediateDoc, b);
  const direct = apply(doc, composed);
  expect(direct).toBe(stepwise);
}

describe('convergence fuzz tests', () => {
  test('random insert-only operations (100 iterations)', () => {
    for (let i = 0; i < 100; i++) {
      const doc = randomString(50);
      if (doc.length === 0) continue;
      const a = randomInsertOnlyOp(doc.length);
      const b = randomInsertOnlyOp(doc.length);
      assertTransformConvergence(doc, a, b);
    }
  });

  test('random delete-only operations (100 iterations)', () => {
    for (let i = 0; i < 100; i++) {
      const doc = randomString(50);
      if (doc.length === 0) continue;
      const a = randomDeleteOnlyOp(doc.length);
      const b = randomDeleteOnlyOp(doc.length);
      assertTransformConvergence(doc, a, b);
    }
  });

  test('random mixed operations (500 iterations)', () => {
    for (let i = 0; i < 500; i++) {
      const doc = randomString(100);
      const a = randomOperation(doc.length);
      const b = randomOperation(doc.length);
      assertTransformConvergence(doc, a, b);
    }
  });

  test('random operations on empty document (100 iterations)', () => {
    for (let i = 0; i < 100; i++) {
      const doc = '';
      const a = randomOperation(0);
      const b = randomOperation(0);
      assertTransformConvergence(doc, a, b);
    }
  });

  test('random operations on large document (10,000+ chars, 50 iterations)', () => {
    for (let i = 0; i < 50; i++) {
      const doc = randomString(10000) + 'a'.repeat(100); // ensure at least 100 chars
      const a = randomOperation(doc.length);
      const b = randomOperation(doc.length);
      assertTransformConvergence(doc, a, b);
    }
  });

  test('compose property with random operations (200 iterations)', () => {
    for (let i = 0; i < 200; i++) {
      const doc = randomString(80);
      const a = randomOperation(doc.length);
      assertComposeProperty(doc, a);
    }
  });

  test('transform with both priority directions (100 iterations)', () => {
    for (let i = 0; i < 100; i++) {
      const doc = randomString(60);
      const a = randomOperation(doc.length);
      const b = randomOperation(doc.length);

      // Both priority directions should produce convergent results
      const [aP1, bP1] = transform(a, b, 'left');
      const [aP2, bP2] = transform(a, b, 'right');

      const resultLeft = apply(apply(doc, a), bP1);
      const resultLeftB = apply(apply(doc, b), aP1);
      expect(resultLeft).toBe(resultLeftB);

      const resultRight = apply(apply(doc, a), bP2);
      const resultRightB = apply(apply(doc, b), aP2);
      expect(resultRight).toBe(resultRightB);
    }
  });
});
