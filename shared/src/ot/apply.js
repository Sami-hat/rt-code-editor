'use strict';

const { isRetain, isInsert, isDelete, inputLength } = require('./operations');

/**
 * Apply an operation to a document string.
 * Walks components left-to-right, consuming the document.
 *
 * @param {string} doc - The current document
 * @param {Array} op - The operation to apply
 * @returns {string} - The resulting document
 * @throws {Error} if op's input length !== doc.length
 */
function apply(doc, op) {
  const expectedLen = inputLength(op);
  if (expectedLen !== doc.length) {
    throw new Error(
      `Operation input length (${expectedLen}) does not match document length (${doc.length})`
    );
  }

  let cursor = 0;
  const parts = [];

  for (const comp of op) {
    if (isRetain(comp)) {
      parts.push(doc.slice(cursor, cursor + comp.retain));
      cursor += comp.retain;
    } else if (isInsert(comp)) {
      parts.push(comp.insert);
      // insert does not advance cursor
    } else if (isDelete(comp)) {
      cursor += comp.delete;
      // delete skips characters
    } else {
      throw new Error('Unknown component type');
    }
  }

  return parts.join('');
}

module.exports = { apply };
