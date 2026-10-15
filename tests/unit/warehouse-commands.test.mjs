import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { ApiError, localFailure } from '../../src/application/api.ts';
import { createCommandRunner } from '../../src/application/commands.ts';
import { createEpochRegistry } from '../../src/application/epochs.ts';
import { createWarehouseCommands } from '../../src/application/warehouse-commands.ts';

const R = '33333333-3333-4333-8333-333333333333';
const E = '44444444-4444-4444-8444-444444444444';
const NEXT = '55555555-5555-4555-8555-555555555555';
const civil = { civil: { localDateTime: '2026-10-15T12:00:00' } };
const draft = () => ({
  number: 'invoice-1',
  createdAt: structuredClone(civil),
  expectedSettingsVersion: '1',
  lines: [
    {
      productID: 'P',
      quantity: '1000',
      manufacturedAt: structuredClone(civil),
      receivedAt: structuredClone(civil),
      shelfLife: { value: '2', unit: 'day' },
    },
  ],
});
function setup(api) {
  const epochs = createEpochRegistry();
  epochs.record(R, 'warehouse', E);
  let n = 0;
  const commands = createCommandRunner({
    newId: () => `command-${++n}`,
    now: () => 0,
    epochs,
    onReset: () => {},
  });
  const invalidations = [];
  const value = createWarehouseCommands({
    api,
    commands,
    restaurantID: R,
    newID: () => `delivery-${++n}`,
    markStale: (topics) => invalidations.push(topics),
    onUnauthenticated: () => {},
  });
  return { value, epochs, invalidations };
}

test('a lost delivery reply retries frozen dates, quantity, command and epoch exactly once', async () => {
  const calls = [];
  const deliveries = new Map();
  let lost = true;
  const api = {
    receiveDelivery: async (id, input, command, epoch) => {
      calls.push(structuredClone([id, input, command, epoch]));
      if (!deliveries.has(command))
        deliveries.set(command, {
          context: { runtimeEpoch: epoch },
          result: {
            deliveryID: input.deliveryID,
            batchIDs: ['B'],
            batches: [],
          },
        });
      if (lost) {
        lost = false;
        throw new ApiError(localFailure('Transport', 'unknown'));
      }
      return deliveries.get(command);
    },
  };
  const { value, epochs, invalidations } = setup(api);
  const input = draft();
  assert.equal(
    (await value.receiveDelivery(input, 'Europe/Moscow', E)).kind,
    'unknown',
  );
  input.lines[0].quantity = '9000';
  input.lines[0].receivedAt.civil.localDateTime = '2027-01-01T00:00:00';
  epochs.record(R, 'warehouse', NEXT);
  assert.equal(value.pendingDeliveryTimeZone(), 'Europe/Moscow');
  assert.equal(value.pendingDelivery().lines[0].quantity, '1000');
  assert.equal(
    (await value.receiveDelivery(input, 'Asia/Yekaterinburg', E)).kind,
    'created',
  );
  assert.deepEqual(calls[1], calls[0]);
  assert.equal(deliveries.size, 1);
  assert.equal(value.pendingDelivery(), undefined);
  assert.equal(invalidations.length, 1);
});

test('writeoff retries the original command after reply loss and releases it on reset', async () => {
  const calls = [];
  const { value, epochs } = setup({
    confirmWriteoff: async (...args) => {
      calls.push(args);
      throw new ApiError(
        localFailure(
          calls.length === 1 ? 'Transport' : 'RuntimeReset',
          calls.length === 1 ? 'unknown' : 'indeterminate',
        ),
      );
    },
  });
  assert.equal((await value.confirmWriteoff('B', E)).kind, 'unknown');
  assert.equal(value.pendingWriteoff('B'), true);
  epochs.record(R, 'warehouse', NEXT);
  assert.equal((await value.confirmWriteoff('B', E)).kind, 'reset');
  assert.deepEqual(calls[1], calls[0]);
  assert.equal(value.pendingWriteoff('B'), false);
});

test('a new writeoff or delivery from an old visible epoch never targets a reused ID after reset', async () => {
  const calls = [];
  const { value, epochs } = setup({
    confirmWriteoff: async (...args) => {
      calls.push(args);
      return { result: {} };
    },
    receiveDelivery: async (...args) => {
      calls.push(args);
      return { result: {} };
    },
  });
  epochs.record(R, 'warehouse', NEXT);
  assert.equal((await value.confirmWriteoff('B', E)).kind, 'reset');
  assert.equal(
    (await value.receiveDelivery(draft(), 'Europe/Moscow', E)).kind,
    'reset',
  );
  assert.equal(calls.length, 0);
});
