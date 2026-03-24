'use strict';

// --- Component Constructors ---

function retain(n) {
  if (typeof n !== 'number' || n <= 0) {
    throw new Error('retain length must be a positive number');
  }
  return { retain: n };
}

function insert(text) {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('insert text must be a non-empty string');
  }
  return { insert: text };
}

function del(n) {
  if (typeof n !== 'number' || n <= 0) {
    throw new Error('delete length must be a positive number');
  }
  return { delete: n };
}

// --- Type Checkers ---

function isRetain(comp) {
  return comp != null && typeof comp.retain === 'number';
}

function isInsert(comp) {
  return comp != null && typeof comp.insert === 'string';
}

function isDelete(comp) {
  return comp != null && typeof comp.delete === 'number';
}

// --- Component Length Helpers ---

function compLength(comp) {
  if (isRetain(comp)) return comp.retain;
  if (isInsert(comp)) return comp.insert.length;
  if (isDelete(comp)) return comp.delete;
  throw new Error('unknown component type');
}

// --- Operation Utilities ---

function inputLength(op) {
  let len = 0;
  for (const comp of op) {
    if (isRetain(comp)) len += comp.retain;
    else if (isDelete(comp)) len += comp.delete;
    // inserts don't consume input
  }
  return len;
}

function outputLength(op) {
  let len = 0;
  for (const comp of op) {
    if (isRetain(comp)) len += comp.retain;
    else if (isInsert(comp)) len += comp.insert.length;
    // deletes don't produce output
  }
  return len;
}

function normalize(op) {
  const result = [];
  for (const comp of op) {
    // Skip no-ops
    if (isRetain(comp) && comp.retain === 0) continue;
    if (isInsert(comp) && comp.insert === '') continue;
    if (isDelete(comp) && comp.delete === 0) continue;

    if (result.length > 0) {
      const last = result[result.length - 1];
      // Merge adjacent same-type components
      if (isRetain(comp) && isRetain(last)) {
        result[result.length - 1] = retain(last.retain + comp.retain);
        continue;
      }
      if (isInsert(comp) && isInsert(last)) {
        result[result.length - 1] = insert(last.insert + comp.insert);
        continue;
      }
      if (isDelete(comp) && isDelete(last)) {
        result[result.length - 1] = del(last.delete + comp.delete);
        continue;
      }
    }
    result.push(comp);
  }
  return result;
}

function identity(docLength) {
  if (docLength === 0) return [];
  return [retain(docLength)];
}

module.exports = {
  retain,
  insert,
  del,
  isRetain,
  isInsert,
  isDelete,
  compLength,
  inputLength,
  outputLength,
  normalize,
  identity,
};
