import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { ApiError, localFailure } from '../../src/application/api.ts';
import { createCommandRunner } from '../../src/application/commands.ts';
import { createEpochRegistry } from '../../src/application/epochs.ts';
import { createWarehouseCommands } from '../../src/application/warehouse-commands.ts';
import { createMemoryAttemptStore } from './support/memory-attempt-store.mjs';

// R2: runtimeEpoch is the storage generation. A process restart does not
// change it; only a confirmed loss or rollback of the history does.
const U = '11111111-1111-4111-8111-111111111111';
const R = '33333333-3333-4333-8333-333333333333';
const E = '44444444-4444-4444-8444-444444444444';
const NEXT = '55555555-5555-4555-8555-555555555555';

// One visit of the tab: its own runner and epochs, the store is shared.
function visit(api, store, epoch) {
  const epochs = createEpochRegistry();
  epochs.record(R, 'warehouse', epoch);
  const resets = [];
  let n = 0;
  const commands = createCommandRunner({
    newId: () => `new-${String((n += 1))}`,
    now: () => 0,
    epochs,
    onReset: (restaurantID) => resets.push(restaurantID),
  });
  const value = createWarehouseCommands({
    api,
    commands,
    restaurantID: R,
    userID: U,
    attempts: store,
    now: () => 1700,
    newID: () => 'delivery-new',
    markStale: () => {},
    onUnauthenticated: () => {},
  });
  return { value, commands, epochs, resets };
}
const lost = () => new ApiError(localFailure('Transport', 'unknown'));
const receipt = { deliveryID: 'd', batchIDs: [], batches: [] };

test('a changed server process under the same generation repeats the saved command and reaches the result', async () => {
  const store = createMemoryAttemptStore();
  const calls = [];
  const first = visit(
    {
      confirmWriteoff: async (...args) => {
        calls.push(args);
        throw lost();
      },
    },
    store,
    E,
  );
  assert.equal((await first.value.confirmWriteoff('B', E)).kind, 'unknown');
  // The tab reloads; the service restarted but the generation is the same.
  const second = visit(
    {
      confirmWriteoff: async (...args) => {
        calls.push(args);
        return { context: {}, result: { productID: 'P' } };
      },
    },
    store,
    E,
  );
  assert.equal(second.value.pendingWriteoff('B'), true);
  assert.equal((await second.value.confirmWriteoff('B', E)).kind, 'created');
  assert.deepEqual(calls[1], calls[0]);
  assert.deepEqual(second.resets, []);
  assert.equal(second.value.pendingWriteoff('B'), false);
});

test('RuntimeReset from the server drops the attempt and its record and marks the restaurant outdated', async () => {
  const store = createMemoryAttemptStore();
  const ref = { kind: 'writeoff', userID: U, restaurantID: R, batchID: 'B' };
  const tab = visit(
    {
      confirmWriteoff: async () => {
        throw new ApiError(localFailure('RuntimeReset', 'indeterminate', 409));
      },
    },
    store,
    E,
  );
  assert.equal((await tab.value.confirmWriteoff('B', E)).kind, 'reset');
  assert.deepEqual(tab.resets, [R]);
  assert.equal(tab.value.pendingWriteoff('B'), false);
  assert.equal(store.load(ref).status, 'absent');
});

test('a generation that changed between the reload and the repeat is a reset and is not repeated', async () => {
  const store = createMemoryAttemptStore();
  const first = visit(
    {
      receiveDelivery: async () => {
        throw lost();
      },
    },
    store,
    E,
  );
  const input = {
    number: '1',
    createdAt: { civil: { localDateTime: '2026-10-15T12:00:00' } },
    expectedSettingsVersion: '1',
    lines: [],
  };
  assert.equal(
    (await first.value.receiveDelivery(input, 'Europe/Moscow', E)).kind,
    'unknown',
  );
  // The repeat carries the epoch it was first sent under; the server of the
  // new generation refuses it with RuntimeReset.
  const seen = [];
  const second = visit(
    {
      receiveDelivery: async (_restaurantID, _input, commandID, epoch) => {
        seen.push([commandID, epoch]);
        if (epoch !== NEXT) {
          throw new ApiError(
            localFailure('RuntimeReset', 'indeterminate', 409),
          );
        }
        return { context: {}, result: receipt };
      },
    },
    store,
    NEXT,
  );
  assert.equal(second.value.pendingDelivery() !== undefined, true);
  assert.equal(
    (await second.value.receiveDelivery(input, 'Europe/Moscow', NEXT)).kind,
    'reset',
  );
  assert.equal(seen.length, 1);
  assert.equal(seen[0][1], E);
  assert.deepEqual(second.resets, [R]);
  assert.equal(second.value.pendingDelivery(), undefined);
});
