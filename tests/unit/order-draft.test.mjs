import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  addDish,
  draftTotals,
  invalidLines,
  linesOf,
  portionsValid,
  removeLine,
  setPortions,
} from '../../src/domain/order-draft.ts';

test('every added dish is a new position with one portion, numbered in order', () => {
  let draft = addDish([], '201');
  draft = addDish(draft, '202');
  draft = addDish(draft, '201');
  assert.deepEqual(draft, [
    { lineNo: 1, dishID: '201', portions: '1' },
    { lineNo: 2, dishID: '202', portions: '1' },
    { lineNo: 3, dishID: '201', portions: '1' },
  ]);
  assert.deepEqual(linesOf(draft, '201'), [1, 3]);
});

test('removing a position renumbers the rest', () => {
  const draft = removeLine(addDish(addDish(addDish([], 'a'), 'b'), 'c'), 2);
  assert.deepEqual(
    draft.map((line) => [line.lineNo, line.dishID]),
    [
      [1, 'a'],
      [2, 'c'],
    ],
  );
});

test('portions keep the typed text; only whole numbers above zero are valid', () => {
  const draft = setPortions(addDish(addDish([], 'a'), 'b'), 2, '2,5');
  assert.equal(draft[1].portions, '2,5');
  assert.deepEqual(invalidLines(draft), [2]);
  for (const text of ['1', '12', ' 3 '])
    assert.equal(portionsValid(text), true, text);
  for (const text of ['', '0', '-1', '1.5', '01', 'abc'])
    assert.equal(portionsValid(text), false, text);
});

test('totals count positions and the valid portions', () => {
  const draft = setPortions(addDish(addDish([], 'a'), 'b'), 1, '3');
  assert.deepEqual(draftTotals(draft), { positions: 2, portions: '4' });
  assert.deepEqual(draftTotals([]), { positions: 0, portions: '0' });
});
