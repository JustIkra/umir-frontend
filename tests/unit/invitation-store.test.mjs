import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  createInvitationStore,
  invitationKey,
} from '../../src/adapters/browser-storage/invitation-store.ts';

const record = {
  invitationID: '22222222-2222-4222-8222-222222222222',
  mode: 'register',
  displayName: 'Ирина Ковалёва',
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
    initial === undefined ? [] : [[invitationKey, initial]],
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

test('a saved record comes back, with or without the proof, in both modes', () => {
  const storage = memoryStorage();
  const store = createInvitationStore(storage);
  store.save(record);
  assert.deepEqual(createInvitationStore(storage).load(), record);
  const waiting = { ...record, proof: undefined };
  store.save(waiting);
  assert.deepEqual(createInvitationStore(storage).load(), waiting);
  const accepting = { ...record, mode: 'accept', displayName: '' };
  store.save(accepting);
  assert.deepEqual(createInvitationStore(storage).load(), accepting);
  store.clear();
  assert.equal(storage.items.has(invitationKey), false);
});

test('the record lives under umir.invite', () => {
  assert.equal(invitationKey, 'umir.invite');
});

test('the password never reaches the storage, whatever the caller passes', () => {
  const storage = memoryStorage();
  createInvitationStore(storage).save({
    ...record,
    password: 'correct horse',
    repeat: 'correct horse',
  });
  const raw = storage.items.get(invitationKey);
  assert.equal(raw.includes('correct horse'), false);
  assert.equal(raw.includes('password'), false);
  assert.deepEqual(createInvitationStore(storage).load(), record);
});

test('a damaged or foreign record is removed and counts as none', () => {
  for (const raw of [
    'not json',
    '[]',
    '{"email":1}',
    JSON.stringify({ ...record, mode: 'login' }),
    JSON.stringify({ ...record, displayName: 1 }),
    JSON.stringify({ ...record, invitationID: '' }),
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
    assert.equal(createInvitationStore(storage).load(), undefined, raw);
    assert.equal(storage.items.has(invitationKey), false, raw);
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
  const store = createInvitationStore(blocked);
  store.save(record);
  store.clear();
  assert.equal(store.load(), undefined);
  assert.equal(createInvitationStore(undefined).load(), undefined);
});
