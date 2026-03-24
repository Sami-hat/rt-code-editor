'use strict';

const {
  isRetain,
  isInsert,
  isDelete,
  outputLength,
  inputLength,
  normalize,
} = require('./operations');
const { ComponentIterator } = require('./transform');

/**
 * Compose two sequential operations into one.
 * a is applied first, b is applied second.
 * outputLength(a) must equal inputLength(b).
 *
 * Result: a single operation ab such that
 *   apply(doc, ab) === apply(apply(doc, a), b)
 *
 * @param {Array} a - First operation (applied first)
 * @param {Array} b - Second operation (applied second)
 * @returns {Array} - Combined operation
 */
function compose(a, b) {
  const aOut = outputLength(a);
  const bIn = inputLength(b);
  if (aOut !== bIn) {
    throw new Error(
      `Cannot compose: outputLength(a)=${aOut} !== inputLength(b)=${bIn}`
    );
  }

  const iterA = new ComponentIterator(a);
  const iterB = new ComponentIterator(b);
  const result = [];

  while (iterA.hasNext() || iterB.hasNext()) {
    // Case: b inserts new text (doesn't consume a's output)
    if (iterB.peekType() === 'insert') {
      result.push(iterB.takeAll());
      continue;
    }

    // Case: a deletes from original doc (doesn't produce output for b)
    if (iterA.peekType() === 'delete') {
      result.push(iterA.takeAll());
      continue;
    }

    if (!iterA.hasNext() && !iterB.hasNext()) break;

    const lenA = iterA.peekLength();
    const lenB = iterB.peekLength();
    const minLen = Math.min(lenA, lenB);

    const typeA = iterA.peekType();
    const typeB = iterB.peekType();

    // Case: a retains, b retains -> result retains
    if (typeA === 'retain' && typeB === 'retain') {
      iterA.take(minLen);
      iterB.take(minLen);
      result.push({ retain: minLen });
    }
    // Case: a retains, b deletes -> result deletes (chars a kept, b removes)
    else if (typeA === 'retain' && typeB === 'delete') {
      iterA.take(minLen);
      iterB.take(minLen);
      result.push({ delete: minLen });
    }
    // Case: a inserts, b retains -> result inserts (text a added, b keeps)
    else if (typeA === 'insert' && typeB === 'retain') {
      const comp = iterA.take(minLen);
      iterB.take(minLen);
      result.push(comp); // the insert
    }
    // Case: a inserts, b deletes -> cancel out (text a added, b removes)
    else if (typeA === 'insert' && typeB === 'delete') {
      iterA.take(minLen);
      iterB.take(minLen);
      // Nothing emitted — insert then delete cancels
    }
    else {
      if (!iterA.hasNext() && !iterB.hasNext()) break;
      throw new Error(
        `Unexpected compose combination: a=${typeA}, b=${typeB}`
      );
    }
  }

  return normalize(result);
}

module.exports = { compose };
