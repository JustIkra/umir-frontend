import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  addDeliveryLine,
  emptyDeliveryDraft,
  isDeliveryDraftEmpty,
  removeDeliveryLine,
  setDeliveryField,
  setLineField,
} from '../../src/domain/delivery-draft.ts';

const emptyLine = (key) => ({
  key,
  productID: '',
  quantity: '',
  manufacturedAt: '',
  shelfLifeValue: '',
  shelfLifeUnit: 'day',
  receivedAt: '',
});

test('an empty draft has one empty line with key 1 and unit day', () => {
  assert.deepEqual(emptyDeliveryDraft(), {
    number: '',
    createdAt: '',
    lines: [emptyLine(1)],
    nextKey: 2,
  });
});

test('added lines get new keys; removed keys are not reused', () => {
  let draft = addDeliveryLine(addDeliveryLine(emptyDeliveryDraft()));
  assert.deepEqual(
    draft.lines.map((line) => line.key),
    [1, 2, 3],
  );
  draft = removeDeliveryLine(draft, 2);
  // The number on screen is the position: line 3 is now shown as «Строка 2».
  assert.deepEqual(
    draft.lines.map((line) => line.key),
    [1, 3],
  );
  draft = addDeliveryLine(draft);
  assert.deepEqual(
    draft.lines.map((line) => line.key),
    [1, 3, 4],
  );
  assert.equal(draft.nextKey, 5);
});

test('the last line is never removed; an unknown key changes nothing', () => {
  const single = emptyDeliveryDraft();
  assert.equal(removeDeliveryLine(single, 1), single);
  const two = addDeliveryLine(single);
  assert.equal(removeDeliveryLine(two, 7), two);
  const left = removeDeliveryLine(removeDeliveryLine(two, 1), 2);
  assert.deepEqual(
    left.lines.map((line) => line.key),
    [2],
  );
});

test('fields keep the text as typed', () => {
  let draft = setDeliveryField(emptyDeliveryDraft(), 'number', ' 1192 ');
  draft = setDeliveryField(draft, 'createdAt', '2026-10-10T15:20');
  draft = addDeliveryLine(draft);
  draft = setLineField(draft, 2, 'productID', '125');
  draft = setLineField(draft, 2, 'quantity', '0,0005');
  draft = setLineField(draft, 2, 'manufacturedAt', '2026-10-01T09:00');
  draft = setLineField(draft, 2, 'shelfLifeValue', 'abc');
  draft = setLineField(draft, 2, 'shelfLifeUnit', 'month');
  draft = setLineField(draft, 2, 'receivedAt', '2026-10-10T15:00');
  assert.equal(draft.number, ' 1192 ');
  assert.equal(draft.createdAt, '2026-10-10T15:20');
  assert.deepEqual(draft.lines[0], emptyLine(1));
  assert.deepEqual(draft.lines[1], {
    key: 2,
    productID: '125',
    quantity: '0,0005',
    manufacturedAt: '2026-10-01T09:00',
    shelfLifeValue: 'abc',
    shelfLifeUnit: 'month',
    receivedAt: '2026-10-10T15:00',
  });
});

test('an invalid shelf-life unit or an unknown line leaves the draft unchanged', () => {
  const draft = emptyDeliveryDraft();
  assert.equal(setLineField(draft, 1, 'shelfLifeUnit', 'year'), draft);
  assert.equal(setLineField(draft, 1, 'shelfLifeUnit', ''), draft);
  assert.equal(setLineField(draft, 9, 'quantity', '5'), draft);
  assert.equal(
    setLineField(draft, 1, 'shelfLifeUnit', 'month').lines[0].shelfLifeUnit,
    'month',
  );
});

test('isDeliveryDraftEmpty is true only while nothing is typed', () => {
  const draft = emptyDeliveryDraft();
  assert.equal(isDeliveryDraftEmpty(draft), true);
  // The unit choice and an extra empty line are not input.
  assert.equal(
    isDeliveryDraftEmpty(
      setLineField(addDeliveryLine(draft), 1, 'shelfLifeUnit', 'month'),
    ),
    true,
  );
  assert.equal(
    isDeliveryDraftEmpty(setDeliveryField(draft, 'number', '1')),
    false,
  );
  assert.equal(
    isDeliveryDraftEmpty(
      setDeliveryField(draft, 'createdAt', '2026-10-10T15:20'),
    ),
    false,
  );
  for (const field of [
    'productID',
    'quantity',
    'manufacturedAt',
    'shelfLifeValue',
    'receivedAt',
  ]) {
    const typed = setLineField(addDeliveryLine(draft), 2, field, 'x');
    assert.equal(isDeliveryDraftEmpty(typed), false, field);
  }
});
