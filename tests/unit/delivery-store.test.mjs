import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  createDeliveryStore,
  deliveryKeyPrefix,
} from '../../src/adapters/browser-storage/delivery-store.ts';

const draft = {
  number: 'ПН-0412',
  createdAt: '2026-10-14T09:30',
  lines: [
    {
      key: 1,
      productID: '114',
      quantity: '12,5',
      manufacturedAt: '2026-10-10T08:00',
      shelfLifeValue: '7',
      shelfLifeUnit: 'day',
      receivedAt: '2026-10-14T09:00',
    },
    {
      key: 3,
      productID: '',
      quantity: '',
      manufacturedAt: '',
      shelfLifeValue: '',
      shelfLifeUnit: 'month',
      receivedAt: '',
    },
  ],
  nextKey: 4,
};
const input = {
  deliveryID: 'd-1',
  number: 'ПН-0412',
  createdAt: { civil: { localDateTime: '2026-10-14T09:30:00' } },
  expectedSettingsVersion: '3',
  lines: [
    {
      productID: '114',
      manufacturedAt: {
        civil: { localDateTime: '2026-10-26T02:30:00', occurrence: 'later' },
      },
      shelfLife: { value: '7', unit: 'day' },
      receivedAt: { instant: '2026-10-14T09:00:00+03:00' },
      quantity: '12500',
    },
  ],
};
const record = (userID = 'u1', restaurantID = 'r1') => ({
  userID,
  restaurantID,
  draft,
  deliveryID: 'd-1',
  attempt: { commandID: 'c1', epoch: 'e1', startedAt: 5, input },
});

function memoryStorage(entries = []) {
  const items = new Map(entries);
  return {
    items,
    get length() {
      return items.size;
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

test('a saved delivery comes back for the same user and restaurant', () => {
  const storage = memoryStorage();
  createDeliveryStore(storage).save(record());
  assert.deepEqual(createDeliveryStore(storage).load('u1', 'r1'), record());
  assert.ok(storage.items.has(`${deliveryKeyPrefix}u1.r1`));
  createDeliveryStore(storage).save({
    ...record(),
    deliveryID: undefined,
    attempt: undefined,
  });
  const empty = createDeliveryStore(storage).load('u1', 'r1');
  assert.equal(empty.deliveryID, undefined);
  assert.equal(empty.attempt, undefined);
  assert.deepEqual(empty.draft, draft);
});

test('a record of another user or restaurant is not read', () => {
  for (const other of [record('u2'), record('u1', 'r2')]) {
    const storage = memoryStorage([
      [`${deliveryKeyPrefix}u1.r1`, JSON.stringify(other)],
    ]);
    assert.equal(createDeliveryStore(storage).load('u1', 'r1'), undefined);
    assert.equal(storage.items.size, 0);
  }
});

test('a damaged record is removed', () => {
  const line = draft.lines[0];
  const attempt = record().attempt;
  const inputLine = input.lines[0];
  const damaged = [
    'not json',
    JSON.stringify({ ...record(), draft: { ...draft, lines: [] } }),
    JSON.stringify({
      ...record(),
      draft: { ...draft, lines: [{ ...line, key: 'one' }] },
    }),
    JSON.stringify({
      ...record(),
      draft: { ...draft, lines: [{ ...line, shelfLifeUnit: 'year' }] },
    }),
    JSON.stringify({ ...record(), draft: { ...draft, nextKey: 3 } }),
    JSON.stringify({ ...record(), deliveryID: 7 }),
    JSON.stringify({ ...record(), attempt: { ...attempt, commandID: 1 } }),
    JSON.stringify({ ...record(), attempt: { ...attempt, startedAt: null } }),
    JSON.stringify({
      ...record(),
      attempt: { ...attempt, input: { ...input, createdAt: {} } },
    }),
    JSON.stringify({
      ...record(),
      attempt: {
        ...attempt,
        input: {
          ...input,
          lines: [
            {
              ...inputLine,
              manufacturedAt: {
                civil: { localDateTime: '2026-10-26T02:30:00', occurrence: 1 },
              },
            },
          ],
        },
      },
    }),
    JSON.stringify({
      ...record(),
      attempt: {
        ...attempt,
        input: {
          ...input,
          lines: [{ ...inputLine, shelfLife: { value: '7', unit: 'week' } }],
        },
      },
    }),
    JSON.stringify({
      ...record(),
      attempt: { ...attempt, input: { ...input, lines: [] } },
    }),
  ];
  for (const raw of damaged) {
    const storage = memoryStorage([[`${deliveryKeyPrefix}u1.r1`, raw]]);
    assert.equal(createDeliveryStore(storage).load('u1', 'r1'), undefined, raw);
    assert.equal(storage.items.size, 0, raw);
  }
});

test('clear drops one delivery; clearAll drops every delivery and nothing else', () => {
  const storage = memoryStorage([
    ['umir.lastRestaurant', 'r1'],
    ['umir.order.u1.r1', '{}'],
  ]);
  const store = createDeliveryStore(storage);
  store.save(record('u1', 'r1'));
  store.save(record('u1', 'r2'));
  store.save(record('u2', 'r1'));
  store.clear('u1', 'r1');
  assert.equal(store.load('u1', 'r1'), undefined);
  assert.deepEqual(store.load('u1', 'r2'), record('u1', 'r2'));
  store.clearAll();
  assert.deepEqual(
    [...storage.items.keys()],
    ['umir.lastRestaurant', 'umir.order.u1.r1'],
  );
});

test('blocked storage keeps nothing and never throws', () => {
  const blocked = {
    length: 1,
    key: () => {
      throw new Error('SecurityError');
    },
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {
      throw new Error('SecurityError');
    },
  };
  const store = createDeliveryStore(blocked);
  store.save(record());
  store.clear('u1', 'r1');
  store.clearAll();
  assert.equal(store.load('u1', 'r1'), undefined);
  assert.equal(createDeliveryStore(undefined).load('u1', 'r1'), undefined);
});
