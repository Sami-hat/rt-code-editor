'use strict';

const {
  isRetain,
  isInsert,
  isDelete,
  inputLength,
  normalize,
} = require('./operations');

/**
 * Iterator that walks through an operation's components,
 * supporting partial consumption via take(n).
 */
class ComponentIterator {
  constructor(op) {
    this.op = op;
    this.index = 0;
    this.offset = 0; // how far into current component we've consumed
  }

  hasNext() {
    return this.index < this.op.length;
  }

  peekType() {
    if (!this.hasNext()) return null;
    const comp = this.op[this.index];
    if (isRetain(comp)) return 'retain';
    if (isInsert(comp)) return 'insert';
    if (isDelete(comp)) return 'delete';
    return null;
  }

  /**
   * Peek at the remaining length of the current component.
   */
  peekLength() {
    if (!this.hasNext()) return Infinity;
    const comp = this.op[this.index];
    if (isRetain(comp)) return comp.retain - this.offset;
    if (isInsert(comp)) return comp.insert.length - this.offset;
    if (isDelete(comp)) return comp.delete - this.offset;
    return Infinity;
  }

  /**
   * Consume up to n characters from the current component.
   * For inserts, n refers to characters of inserted text.
   */
  take(n) {
    if (!this.hasNext()) {
      return { retain: n }; // implicit retain past end
    }

    const comp = this.op[this.index];
    const remaining = this.peekLength();

    if (isRetain(comp)) {
      const len = Math.min(n, remaining);
      this._advance(len, remaining);
      return { retain: len };
    }

    if (isInsert(comp)) {
      const len = Math.min(n, remaining);
      const text = comp.insert.slice(this.offset, this.offset + len);
      // offset was already at this.offset before _advance, need to grab text first
      // Actually we need the text from the current offset
      const startOffset = this.offset;
      this._advance(len, remaining);
      return { insert: comp.insert.slice(startOffset, startOffset + len) };
    }

    if (isDelete(comp)) {
      const len = Math.min(n, remaining);
      this._advance(len, remaining);
      return { delete: len };
    }

    throw new Error('Unknown component type');
  }

  /**
   * Take the entire remaining portion of the current component.
   */
  takeAll() {
    return this.take(this.peekLength());
  }

  _advance(consumed, remaining) {
    if (consumed >= remaining) {
      this.index++;
      this.offset = 0;
    } else {
      this.offset += consumed;
    }
  }
}

/**
 * Transform two concurrent operations.
 *
 * Both a and b must have the same inputLength (they apply to the same document).
 * Returns [aPrime, bPrime] such that:
 *   apply(apply(doc, a), bPrime) === apply(apply(doc, b), aPrime)
 *
 * @param {Array} a - First operation
 * @param {Array} b - Second operation
 * @param {'left'|'right'} priority - Tie-breaking for concurrent inserts.
 *   'left' means a's insert goes first at the same position.
 * @returns {[Array, Array]} - [aPrime, bPrime]
 */
function transform(a, b, priority = 'left') {
  if (inputLength(a) !== inputLength(b)) {
    throw new Error(
      `Transform requires equal input lengths: ${inputLength(a)} !== ${inputLength(b)}`
    );
  }

  const iterA = new ComponentIterator(a);
  const iterB = new ComponentIterator(b);
  const aPrime = [];
  const bPrime = [];

  while (iterA.hasNext() || iterB.hasNext()) {
    // Case 1: Insert in a (a's insert doesn't consume any input from b)
    if (iterA.peekType() === 'insert' &&
        (iterB.peekType() !== 'insert' || priority === 'left')) {
      const comp = iterA.takeAll();
      aPrime.push(comp);
      bPrime.push({ retain: comp.insert.length });
      continue;
    }

    // Case 2: Insert in b (symmetric)
    if (iterB.peekType() === 'insert') {
      const comp = iterB.takeAll();
      bPrime.push(comp);
      aPrime.push({ retain: comp.insert.length });
      continue;
    }

    // From here, both sides consume input characters. We must have matching types.
    if (!iterA.hasNext() && !iterB.hasNext()) break;

    const lenA = iterA.peekLength();
    const lenB = iterB.peekLength();
    const minLen = Math.min(lenA, lenB);

    const typeA = iterA.peekType();
    const typeB = iterB.peekType();

    // Case 3: Retain/Retain
    if (typeA === 'retain' && typeB === 'retain') {
      iterA.take(minLen);
      iterB.take(minLen);
      aPrime.push({ retain: minLen });
      bPrime.push({ retain: minLen });
    }
    // Case 4: Delete/Delete — both delete same chars, emit nothing
    else if (typeA === 'delete' && typeB === 'delete') {
      iterA.take(minLen);
      iterB.take(minLen);
      // Neither a' nor b' needs to do anything — chars are already gone
    }
    // Case 5: Delete in a, Retain in b
    else if (typeA === 'delete' && typeB === 'retain') {
      const comp = iterA.take(minLen);
      iterB.take(minLen);
      aPrime.push(comp); // a' still deletes
      // b' doesn't emit — the chars a deleted are gone
    }
    // Case 6: Retain in a, Delete in b (symmetric)
    else if (typeA === 'retain' && typeB === 'delete') {
      iterA.take(minLen);
      const comp = iterB.take(minLen);
      bPrime.push(comp); // b' still deletes
      // a' doesn't emit — the chars b deleted are gone
    }
    // Should not reach here if both iterators are well-formed
    else {
      if (!iterA.hasNext() && !iterB.hasNext()) break;
      throw new Error(
        `Unexpected component combination: a=${typeA}, b=${typeB}`
      );
    }
  }

  return [normalize(aPrime), normalize(bPrime)];
}

module.exports = { transform, ComponentIterator };
