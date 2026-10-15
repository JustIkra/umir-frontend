import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  createRegistrationStore,
  registrationKey,
} from '../../src/adapters/browser-storage/registration-store.ts';

const record = {
  email: 'i.kovaleva@example.test',
  displayName: 'Ирина Ковалёва',
  challenge: {
    challengeID: '44444444-4444-4444-8444-444444444444',
    expiresAt: { iso: '2026-10-15T10:10:00+03:00', epochMs: 1 },
    resendAvailableAt: { iso: '2026-10-15T10:01:00+03:00', epochMs: 2 },
    state: 'pending',
  },
  proof: 'proof-1',
};

function memoryStorage(initial) {
  const items = new Map(
    initial === undefined ? [] : [[registrationKey, initial]],
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
  const store = createRegistrationStore(storage);
  store.save(record);
  assert.deepEqual(createRegistrationStore(storage).load(), record);
  const waiting = { ...record, proof: undefined };
  store.save(waiting);
  assert.deepEqual(createRegistrationStore(storage).load(), waiting);
  store.clear();
  assert.equal(storage.items.has(registrationKey), false);
});

test('the record lives under umir.register', () => {
  assert.equal(registrationKey, 'umir.register');
});

test('the password never reaches the storage, whatever the caller passes', () => {
  const storage = memoryStorage();
  createRegistrationStore(storage).save({
    ...record,
    password: 'correct horse',
    repeat: 'correct horse',
  });
  const raw = storage.items.get(registrationKey);
  assert.equal(raw.includes('correct horse'), false);
  assert.equal(raw.includes('password'), false);
  assert.deepEqual(createRegistrationStore(storage).load(), record);
});

test('a damaged or foreign record is removed and counts as none', () => {
  for (const raw of [
    'not json',
    '[]',
    '{"email":1}',
    JSON.stringify({ ...record, email: 1 }),
    JSON.stringify({ ...record, displayName: 1 }),
    JSON.stringify({ ...record, proof: '' }),
    JSON.stringify({ ...record, proof: 7 }),
    JSON.stringify({
      ...record,
      challenge: { ...record.challenge, state: 'sent' },
    }),
    JSON.stringify({
      ...record,
      challenge: { ...record.challenge, challengeID: 'X' },
    }),
  ]) {
    const storage = memoryStorage(raw);
    assert.equal(createRegistrationStore(storage).load(), undefined, raw);
    assert.equal(storage.items.has(registrationKey), false, raw);
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
  const store = createRegistrationStore(blocked);
  store.save(record);
  store.clear();
  assert.equal(store.load(), undefined);
  assert.equal(createRegistrationStore(undefined).load(), undefined);
});
