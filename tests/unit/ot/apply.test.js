'use strict';

const { apply } = require('@rt-collab/shared/src/ot/apply');
const { retain, insert, del } = require('@rt-collab/shared/src/ot/operations');

describe('apply', () => {
  test('insert into empty document', () => {
    expect(apply('', [insert('hello')])).toBe('hello');
  });

  test('insert into middle of document', () => {
    const op = [retain(2), insert('XY'), retain(2)];
    expect(apply('abcd', op)).toBe('abXYcd');
  });

  test('insert at beginning of document', () => {
    const op = [insert('>>'), retain(5)];
    expect(apply('hello', op)).toBe('>>hello');
  });

  test('insert at end of document', () => {
    const op = [retain(5), insert('!!')];
    expect(apply('hello', op)).toBe('hello!!');
  });

  test('delete from document', () => {
    const op = [retain(1), del(2), retain(1)];
    expect(apply('abcd', op)).toBe('ad');
  });

  test('delete entire document', () => {
    const op = [del(5)];
    expect(apply('hello', op)).toBe('');
  });

  test('complex mixed operation', () => {
    // "Hello world" -> "Hi beautiful world!"
    const op = [
      retain(1),   // keep "H"
      del(4),      // delete "ello"
      insert('i'), // insert "i"
      retain(1),   // keep " "
      insert('beautiful '), // insert "beautiful "
      retain(5),   // keep "world"
      insert('!'), // insert "!"
    ];
    expect(apply('Hello world', op)).toBe('Hi beautiful world!');
  });

  test('identity operation', () => {
    expect(apply('hello', [retain(5)])).toBe('hello');
  });

  test('identity on empty document', () => {
    expect(apply('', [])).toBe('');
  });

  test('throws on input length mismatch', () => {
    expect(() => apply('hello', [retain(3)])).toThrow(/input length/i);
    expect(() => apply('hi', [retain(5)])).toThrow(/input length/i);
  });

  test('large document (10,000+ characters)', () => {
    const doc = 'a'.repeat(10000);
    const op = [retain(5000), insert('MIDDLE'), retain(5000)];
    const result = apply(doc, op);
    expect(result.length).toBe(10006);
    expect(result.slice(5000, 5006)).toBe('MIDDLE');
  });
});
