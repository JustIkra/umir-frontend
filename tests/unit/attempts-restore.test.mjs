import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  restoreAttempts,
  restoreWhenActive,
} from '../../src/application/attempts-restore.ts';
import { createMemoryAttemptStore } from './support/memory-attempt-store.mjs';

const U = 'user-1';
const OTHER = 'user-2';
const R1 = 'restaurant-1';
const R2 = 'restaurant-2';
const R3 = 'restaurant-3';

const record = (kind, restaurantID, userID = U, payload = {}) => ({
  kind,
  userID,
  restaurantID,
  commandID: `${kind}-${restaurantID}-${userID}`,
  epoch: 'e',
  startedAt: 1,
  payload,
});

function setupStore() {
  const store = createMemoryAttemptStore();
  store.save(record('delivery', R1));
  store.save(record('writeoff', R1, U, { batchID: 'B1' }));
  store.save(record('writeoff', R1, U, { batchID: 'B2' }));
  store.save(record('product', R2));
  store.save(record('dish', R3));
  store.save(record('delivery', R3, OTHER));
  return store;
}

function spies() {
  const calls = [];
  return {
    calls,
    warehouseCommands: (restaurantID) =>
      calls.push(['warehouse', restaurantID]),
    catalogCommands: (restaurantID) => calls.push(['catalog', restaurantID]),
  };
}

test('every restaurant of the saved attempts gets its factory once', () => {
  const run = spies();
  restoreAttempts({ store: setupStore(), userID: U, ...run });
  assert.deepEqual(
    run.calls.sort(),
    [
      ['catalog', R2],
      ['catalog', R3],
      ['warehouse', R1],
    ].sort(),
  );
});

test('damaged records bring their factory too, so the screen can show them', () => {
  const store = createMemoryAttemptStore();
  store.corrupt({ kind: 'delivery', userID: U, restaurantID: R1 });
  const run = spies();
  restoreAttempts({ store, userID: U, ...run });
  assert.deepEqual(run.calls, [['warehouse', R1]]);
});

test('another user and unreadable storage restore nothing', () => {
  const run = spies();
  restoreAttempts({ store: setupStore(), userID: 'nobody', ...run });
  const blocked = createMemoryAttemptStore();
  blocked.block();
  restoreAttempts({ store: blocked, userID: U, ...run });
  assert.deepEqual(run.calls, []);
});

function fakeSession(initial = { status: 'unknown' }) {
  let state = initial;
  const listeners = new Set();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => state,
    set(next) {
      state = next;
      for (const listener of listeners) listener();
    },
  };
}
const active = (userID) => ({ status: 'active', user: { userID } });

test('the restore starts after the session turns active and not before', () => {
  const session = fakeSession();
  const restored = [];
  restoreWhenActive(session, (userID) => restored.push(userID));
  assert.deepEqual(restored, []);
  session.set({ status: 'unavailable' });
  session.set({ status: 'anonymous', expired: false });
  assert.deepEqual(restored, []);
  session.set(active(U));
  assert.deepEqual(restored, [U]);
});

test('later notices of the same active session do not restore again', () => {
  const session = fakeSession();
  const restored = [];
  restoreWhenActive(session, (userID) => restored.push(userID));
  session.set(active(U));
  session.set(active(U));
  session.set(active(U));
  assert.deepEqual(restored, [U]);
});

test('the same user signing in again and another user restore again', () => {
  const session = fakeSession();
  const restored = [];
  restoreWhenActive(session, (userID) => restored.push(userID));
  session.set(active(U));
  session.set({ status: 'anonymous', expired: false });
  session.set(active(U));
  session.set(active(OTHER));
  assert.deepEqual(restored, [U, U, OTHER]);
});

test('a session that is already active restores at once; stopping detaches', () => {
  const session = fakeSession(active(U));
  const restored = [];
  const stop = restoreWhenActive(session, (userID) => restored.push(userID));
  assert.deepEqual(restored, [U]);
  stop();
  session.set({ status: 'anonymous', expired: false });
  session.set(active(OTHER));
  assert.deepEqual(restored, [U]);
});
