'use strict';

const { compose } = require('@rt-collab/shared/src/ot/compose');
const { apply } = require('@rt-collab/shared/src/ot/apply');
const { retain, insert, del } = require('@rt-collab/shared/src/ot/operations');

/**
 * Helper: verify the compose property for two sequential ops on a document.
 * apply(doc, compose(a, b)) === apply(apply(doc, a), b)
 */
function assertComposeProperty(doc, a, b) {
  const composed = compose(a, b);
  const stepwise = apply(apply(doc, a), b);
  const direct = apply(doc, composed);
  expect(direct).toBe(stepwise);
  return direct;
}

describe('compose', () => {
  test('compose two inserts at different positions', () => {
    const doc = 'abc';
    const a = [retain(1), insert('X'), retain(2)];   // "aXbc"
    const b = [retain(3), insert('Y'), retain(1)];   // "aXbYc"
    const result = assertComposeProperty(doc, a, b);
    expect(result).toBe('aXbYc');
  });

  test('compose insert then delete (cancel out)', () => {
    const doc = 'abc';
    const a = [retain(1), insert('XYZ'), retain(2)]; // "aXYZbc"
    const b = [retain(1), del(3), retain(2)];         // "abc"
    const result = assertComposeProperty(doc, a, b);
    expect(result).toBe('abc');
  });

  test('compose insert then partial delete', () => {
    const doc = 'abc';
    const a = [retain(1), insert('XYZ'), retain(2)]; // "aXYZbc"
    const b = [retain(1), del(2), retain(3)];         // "aZbc"
    const result = assertComposeProperty(doc, a, b);
    expect(result).toBe('aZbc');
  });

  test('compose retain+insert with retain+delete', () => {
    const doc = 'hello world';
    const a = [retain(5), insert(' beautiful'), retain(6)]; // "hello beautiful world"
    const b = [retain(16), del(5), insert('planet')];        // "hello beautiful planet"
    const result = assertComposeProperty(doc, a, b);
    expect(result).toBe('hello beautiful planet');
  });

  test('compose identity with any operation yields equivalent result', () => {
    const doc = 'hello';
    const id = [retain(5)];
    const op = [retain(2), insert('X'), retain(3)];

    const composed = compose(id, op);
    expect(apply(doc, composed)).toBe(apply(doc, op));
  });

  test('compose any operation with identity yields equivalent result', () => {
    const doc = 'hello';
    const op = [retain(2), insert('X'), retain(3)];
    // After op, doc is "heXllo" (length 6), so identity is retain(6)
    const id = [retain(6)];

    const composed = compose(op, id);
    expect(apply(doc, composed)).toBe(apply(doc, op));
  });

  test('compose three operations sequentially', () => {
    const doc = 'abcde';
    const a = [retain(2), insert('X'), retain(3)];     // "abXcde"
    const b = [retain(4), insert('Y'), retain(2)];     // "abXcYde"
    const c = [del(1), retain(6)];                       // "bXcYde"

    const ab = compose(a, b);
    const abc = compose(ab, c);
    const stepwise = apply(apply(apply(doc, a), b), c);
    expect(apply(doc, abc)).toBe(stepwise);
    expect(apply(doc, abc)).toBe('bXcYde');
  });

  test('compose delete then insert at same position', () => {
    const doc = 'hello';
    const a = [del(5)];                                  // ""
    const b = [insert('world')];                          // "world"
    const result = assertComposeProperty(doc, a, b);
    expect(result).toBe('world');
  });

  test('throws on length mismatch', () => {
    const a = [retain(5)]; // output length 5
    const b = [retain(3)]; // input length 3
    expect(() => compose(a, b)).toThrow(/cannot compose/i);
  });
});
