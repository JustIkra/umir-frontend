import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  createOrderStore,
  orderKeyPrefix,
} from '../../src/adapters/browser-storage/order-store.ts';

const at = { iso: '2026-10-14T10:00:00+03:00', epochMs: 1 };
const proposal = {
  proposalID: 'prp-1',
  evaluatedAt: at,
  stateVersion: '1',
  requestedPositions: [],
  acceptedPositions: [],
  changes: [],
  warehouseEpoch: '66666666-6666-4666-8666-666666666666',
};
const record = (userID = 'u1', restaurantID = 'r1') => ({
  userID,
  restaurantID,
  lines: [{ lineNo: 1, dishID: '206', portions: '2' }],
  attempt: {
    commandID: 'c1',
    proposalID: 'prp-1',
    runtimeEpoch: 'e1',
    proposal,
    startedAt: 5,
    state: 'sent',
  },
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

test('a saved order comes back for the same user and restaurant', () => {
  const storage = memoryStorage();
  createOrderStore(storage).save(record());
  assert.deepEqual(createOrderStore(storage).load('u1', 'r1'), record());
  assert.ok(storage.items.has(`${orderKeyPrefix}u1.r1`));
  createOrderStore(storage).save({ ...record(), attempt: undefined });
  assert.equal(createOrderStore(storage).load('u1', 'r1').attempt, undefined);
});

test('a record of another user is not read', () => {
  const storage = memoryStorage([
    [`${orderKeyPrefix}u1.r1`, JSON.stringify(record('u2'))],
  ]);
  assert.equal(createOrderStore(storage).load('u1', 'r1'), undefined);
  assert.equal(createOrderStore(storage).load('u2', 'r1'), undefined);
  assert.equal(storage.items.size, 0);
});

test('a damaged record is removed', () => {
  for (const raw of [
    'not json',
    JSON.stringify({ ...record(), lines: [{ lineNo: 'one' }] }),
    JSON.stringify({
      ...record(),
      attempt: { ...record().attempt, state: 'maybe' },
    }),
    JSON.stringify({
      ...record(),
      attempt: { ...record().attempt, proposal: { proposalID: 3 } },
    }),
  ]) {
    const storage = memoryStorage([[`${orderKeyPrefix}u1.r1`, raw]]);
    assert.equal(createOrderStore(storage).load('u1', 'r1'), undefined, raw);
    assert.equal(storage.items.size, 0, raw);
  }
});

test('clear drops one order; clearAll drops every order and nothing else', () => {
  const storage = memoryStorage([['umir.lastRestaurant', 'r1']]);
  const store = createOrderStore(storage);
  store.save(record('u1', 'r1'));
  store.save(record('u1', 'r2'));
  store.clear('u1', 'r1');
  assert.equal(store.load('u1', 'r1'), undefined);
  store.clearAll();
  assert.deepEqual([...storage.items.keys()], ['umir.lastRestaurant']);
});

test('blocked storage keeps nothing and never throws', () => {
  const blocked = {
    length: 0,
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
  const store = createOrderStore(blocked);
  store.save(record());
  store.clear('u1', 'r1');
  store.clearAll();
  assert.equal(store.load('u1', 'r1'), undefined);
  assert.equal(createOrderStore(undefined).load('u1', 'r1'), undefined);
});
