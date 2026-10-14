import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  createPasswordResetStore,
  passwordResetKey,
} from '../../src/adapters/browser-storage/password-reset-store.ts';

const record = {
  email: 'a@b.ru',
  challenge: {
    challengeID: '44444444-4444-4444-8444-444444444444',
    expiresAt: { iso: '2026-10-14T10:10:00+03:00', epochMs: 1 },
    resendAvailableAt: { iso: '2026-10-14T10:01:00+03:00', epochMs: 2 },
    state: 'pending',
  },
  proof: 'proof-1',
};

function memoryStorage(initial) {
  const items = new Map(
    initial === undefined ? [] : [[passwordResetKey, initial]],
  );
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

test('a saved record comes back, with or without the proof', () => {
  const storage = memoryStorage();
  const store = createPasswordResetStore(storage);
  store.save(record);
  assert.deepEqual(createPasswordResetStore(storage).load(), record);
  store.save({ ...record, proof: undefined });
  assert.deepEqual(createPasswordResetStore(storage).load(), {
    ...record,
    proof: undefined,
  });
  store.clear();
  assert.equal(storage.items.has(passwordResetKey), false);
});

test('a damaged or foreign record is removed and counts as none', () => {
  for (const raw of [
    'not json',
    '{"email":1}',
    JSON.stringify({
      ...record,
      challenge: { ...record.challenge, state: 'sent' },
    }),
    JSON.stringify({ ...record, proof: '' }),
    JSON.stringify({
      ...record,
      challenge: { ...record.challenge, challengeID: 'X' },
    }),
  ]) {
    const storage = memoryStorage(raw);
    assert.equal(createPasswordResetStore(storage).load(), undefined, raw);
    assert.equal(storage.items.has(passwordResetKey), false, raw);
  }
});

test('blocked storage keeps nothing and never throws', () => {
  const blocked = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('QuotaExceededError');
    },
    removeItem() {
      throw new Error('SecurityError');
    },
  };
  const store = createPasswordResetStore(blocked);
  store.save(record);
  store.clear();
  assert.equal(store.load(), undefined);
  assert.equal(createPasswordResetStore(undefined).load(), undefined);
});
