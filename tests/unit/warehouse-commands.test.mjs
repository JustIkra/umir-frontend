import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { ApiError, localFailure } from '../../src/application/api.ts';
import { createCommandRunner } from '../../src/application/commands.ts';
import { createEpochRegistry } from '../../src/application/epochs.ts';
import { createAttemptStore } from '../../src/adapters/browser-storage/attempt-store.ts';
import { createWarehouseCommands } from '../../src/application/warehouse-commands.ts';
import { createMemoryAttemptStore } from './support/memory-attempt-store.mjs';

const U = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
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
function setup(api, { store = createMemoryAttemptStore(), userID = U } = {}) {
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
    userID,
    attempts: store,
    now: () => 1700,
    newID: () => `delivery-${++n}`,
    markStale: (topics) => invalidations.push(topics),
    onUnauthenticated: () => {},
  });
  return { value, epochs, invalidations, commands, store };
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

const lostThenAnswer = () => {
  const calls = [];
  let lost = true;
  return {
    calls,
    receiveDelivery: async (id, input, command, epoch) => {
      calls.push(structuredClone([id, input, command, epoch]));
      if (lost) {
        lost = false;
        throw new ApiError(localFailure('Transport', 'unknown'));
      }
      return { context: {}, result: { deliveryID: input.deliveryID } };
    },
    confirmWriteoff: async (id, batch, command, epoch) => {
      calls.push(structuredClone([id, batch, command, epoch]));
      if (lost) {
        lost = false;
        throw new ApiError(localFailure('Transport', 'unknown'));
      }
      return { context: {}, result: {} };
    },
  };
};

function sessionStorageStub() {
  const items = new Map();
  return {
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

for (const [name, makeStore] of [
  ['in memory', () => createMemoryAttemptStore()],
  ['on a Storage', () => createAttemptStore(sessionStorageStub())],
]) {
  test(`${name}: a delivery whose reply was lost survives a reload and is resent as it was`, async () => {
    const store = makeStore();
    const api = lostThenAnswer();
    const first = setup(api, { store });
    assert.equal(
      (await first.value.receiveDelivery(draft(), 'Europe/Moscow', E)).kind,
      'unknown',
    );
    // A new tab: a new runner and new factories over the same storage.
    const second = setup(api, { store });
    assert.equal(second.value.pendingDeliveryTimeZone(), 'Europe/Moscow');
    assert.equal(second.value.pendingDelivery().deliveryID, 'delivery-1');
    assert.equal(second.value.pendingDelivery().lines[0].quantity, '1000');
    assert.equal(second.commands.getSnapshot().length, 1);
    const other = draft();
    other.lines[0].quantity = '9000';
    assert.equal(
      (await second.value.receiveDelivery(other, 'Asia/Yekaterinburg', E)).kind,
      'created',
    );
    assert.equal(api.calls.length, 2);
    assert.deepEqual(api.calls[1], api.calls[0]);
    assert.equal(api.calls[1][2], 'command-2');
    assert.equal(second.value.pendingDelivery(), undefined);
    assert.equal(
      store.load({ kind: 'delivery', userID: U, restaurantID: R }).status,
      'absent',
    );
  });

  test(`${name}: a write-off whose reply was lost survives a reload with its command and epoch`, async () => {
    const store = makeStore();
    const api = lostThenAnswer();
    const first = setup(api, { store });
    assert.equal((await first.value.confirmWriteoff('B', E)).kind, 'unknown');
    const second = setup(api, { store });
    assert.equal(second.value.pendingWriteoff('B'), true);
    assert.equal(second.value.pendingWriteoff('C'), false);
    assert.equal((await second.value.confirmWriteoff('B', E)).kind, 'created');
    assert.deepEqual(api.calls[1], api.calls[0]);
    assert.equal(second.value.pendingWriteoff('B'), false);
  });
}

test('a resend of the same attempt keeps one record and one command', async () => {
  const store = createMemoryAttemptStore();
  let saves = 0;
  const save = store.save;
  store.save = (record) => {
    saves += 1;
    return save(record);
  };
  const { value } = setup(
    {
      confirmWriteoff: async () => {
        throw new ApiError(localFailure('Transport', 'unknown'));
      },
    },
    { store },
  );
  await value.confirmWriteoff('B', E);
  await value.confirmWriteoff('B', E);
  await value.confirmWriteoff('B', E);
  assert.equal(saves, 1);
  const kept = store.list(U).entries;
  assert.equal(kept.length, 1);
  assert.equal(kept[0].result.record.commandID, 'command-1');
});

test('the record is written before the API is called', async () => {
  const store = createMemoryAttemptStore();
  let seen;
  const { value } = setup(
    {
      confirmWriteoff: async () => {
        seen = store.load({
          kind: 'writeoff',
          userID: U,
          restaurantID: R,
          batchID: 'B',
        });
        return { context: {}, result: {} };
      },
    },
    { store },
  );
  await value.confirmWriteoff('B', E);
  assert.equal(seen.status, 'ok');
  assert.equal(seen.record.epoch, E);
  assert.equal(seen.record.startedAt, 1700);
});

test('a committed answer, a definite refusal and a reset remove the record; unknown keeps it', async () => {
  const cases = [
    [() => ({ context: {}, result: {} }), 'created', false],
    [
      () => {
        throw new ApiError(localFailure('Refused', 'not_committed', 409));
      },
      'refused',
      false,
    ],
    [
      () => {
        throw new ApiError(localFailure('Down', 'unavailable', 503));
      },
      'refused',
      false,
    ],
    [
      () => {
        throw new ApiError(localFailure('RuntimeReset', 'indeterminate', 409));
      },
      'reset',
      false,
    ],
    [
      () => {
        throw new ApiError(localFailure('Transport', 'unknown'));
      },
      'unknown',
      true,
    ],
  ];
  for (const [answer, kind, kept] of cases) {
    const { value, store } = setup({
      confirmWriteoff: async () => answer(),
    });
    assert.equal((await value.confirmWriteoff('B', E)).kind, kind);
    assert.equal(store.list(U).entries.length, kept ? 1 : 0, kind);
  }
});

test('a late answer of a detached attempt does not remove a newer record', async () => {
  const store = createMemoryAttemptStore();
  let release;
  const slow = new Promise((resolve) => {
    release = resolve;
  });
  const { value, commands } = setup(
    { confirmWriteoff: async () => slow },
    { store },
  );
  const first = value.confirmWriteoff('B', E);
  commands.clear();
  const ref = { kind: 'writeoff', userID: U, restaurantID: R, batchID: 'B' };
  store.save({
    ...store.load(ref).record,
    commandID: 'newer',
  });
  release({ context: {}, result: {} });
  await first;
  assert.equal(store.load(ref).record.commandID, 'newer');
});

test('records stay when the tab clears its runner (sign-out)', async () => {
  const { value, commands, store } = setup({
    confirmWriteoff: async () => {
      throw new ApiError(localFailure('Transport', 'unknown'));
    },
  });
  await value.confirmWriteoff('B', E);
  commands.clear();
  assert.equal(store.list(U).entries.length, 1);
});

test('storage that refuses writes: one API call, no record, a warning flag', async () => {
  const store = createMemoryAttemptStore();
  store.block();
  const calls = [];
  const { value } = setup(
    {
      receiveDelivery: async (...args) => {
        calls.push(args);
        throw new ApiError(localFailure('Transport', 'unknown'));
      },
    },
    { store },
  );
  assert.equal(value.deliveryAttempt.notSaved(), false);
  assert.equal(
    (await value.receiveDelivery(draft(), 'Europe/Moscow', E)).kind,
    'unknown',
  );
  assert.equal(calls.length, 1);
  assert.equal(value.deliveryAttempt.notSaved(), true);
  assert.equal(value.writeoffAttempt('B').notSaved(), false);
  assert.equal(value.pendingDeliveryTimeZone(), 'Europe/Moscow');
});

test('the warning goes away when the attempt is settled', async () => {
  const store = createMemoryAttemptStore();
  store.block();
  const { value } = setup(
    { confirmWriteoff: async () => ({ context: {}, result: {} }) },
    { store },
  );
  await value.confirmWriteoff('B', E);
  assert.equal(value.writeoffAttempt('B').notSaved(), false);
});

test('a damaged record stops the operation: no API call, no new command', async () => {
  const store = createMemoryAttemptStore();
  store.corrupt({ kind: 'delivery', userID: U, restaurantID: R });
  const calls = [];
  const { value, commands } = setup(
    {
      receiveDelivery: async (...args) => {
        calls.push(args);
        return { context: {}, result: {} };
      },
    },
    { store },
  );
  assert.equal(value.deliveryAttempt.damaged(), true);
  assert.deepEqual(await value.receiveDelivery(draft(), 'Europe/Moscow', E), {
    kind: 'refused',
    code: 'AttemptDamaged',
  });
  assert.equal(calls.length, 0);
  assert.equal(commands.getSnapshot().length, 0);
  assert.equal(store.list(U).entries.length, 1);
});

test('a damaged write-off record blocks only its own batch', async () => {
  const store = createMemoryAttemptStore();
  store.corrupt({ kind: 'writeoff', userID: U, restaurantID: R, batchID: 'B' });
  const calls = [];
  const { value } = setup(
    {
      confirmWriteoff: async (...args) => {
        calls.push(args);
        return { context: {}, result: {} };
      },
    },
    { store },
  );
  assert.equal(value.writeoffAttempt('B').damaged(), true);
  assert.equal(value.writeoffAttempt('C').damaged(), false);
  assert.equal((await value.confirmWriteoff('B', E)).kind, 'refused');
  assert.equal(calls.length, 0);
  assert.equal((await value.confirmWriteoff('C', E)).kind, 'created');
  assert.equal(calls.length, 1);
});

test('a record that becomes damaged after the factory was built still stops the call', async () => {
  const store = createMemoryAttemptStore();
  const calls = [];
  const { value } = setup(
    {
      confirmWriteoff: async (...args) => {
        calls.push(args);
        return { context: {}, result: {} };
      },
    },
    { store },
  );
  store.corrupt({ kind: 'writeoff', userID: U, restaurantID: R, batchID: 'B' });
  assert.equal((await value.confirmWriteoff('B', E)).kind, 'refused');
  assert.equal(calls.length, 0);
  assert.equal(value.writeoffAttempt('B').damaged(), true);
});

test('discarding a damaged record opens the operation again', async () => {
  const store = createMemoryAttemptStore();
  store.corrupt({ kind: 'delivery', userID: U, restaurantID: R });
  const calls = [];
  const { value } = setup(
    {
      receiveDelivery: async (...args) => {
        calls.push(args);
        return { context: {}, result: { deliveryID: 'x' } };
      },
    },
    { store },
  );
  let heard = 0;
  value.deliveryAttempt.subscribe(() => {
    heard += 1;
  });
  assert.equal(value.deliveryAttempt.discardCorrupt(), 'ok');
  assert.equal(heard, 1);
  assert.equal(value.deliveryAttempt.damaged(), false);
  assert.equal(
    (await value.receiveDelivery(draft(), 'Europe/Moscow', E)).kind,
    'created',
  );
  assert.equal(calls.length, 1);
});

test('a readable record cannot be discarded', async () => {
  const store = createMemoryAttemptStore();
  const { value } = setup(
    {
      confirmWriteoff: async () => {
        throw new ApiError(localFailure('Transport', 'unknown'));
      },
    },
    { store },
  );
  await value.confirmWriteoff('B', E);
  assert.equal(value.writeoffAttempt('B').discardCorrupt(), 'refused');
  assert.equal(value.pendingWriteoff('B'), true);
  assert.equal(store.list(U).entries.length, 1);
});

test('another user does not see the records', async () => {
  const store = createMemoryAttemptStore();
  const api = lostThenAnswer();
  const first = setup(api, { store });
  await first.value.receiveDelivery(draft(), 'Europe/Moscow', E);
  await first.value.confirmWriteoff('B', E);
  const stranger = setup(api, { store, userID: OTHER });
  assert.equal(stranger.value.pendingDelivery(), undefined);
  assert.equal(stranger.value.pendingWriteoff('B'), false);
  assert.equal(stranger.commands.getSnapshot().length, 0);
});

test('records of another restaurant are not restored here', async () => {
  const store = createMemoryAttemptStore();
  store.save({
    kind: 'writeoff',
    userID: U,
    restaurantID: 'other-restaurant',
    commandID: 'c',
    epoch: E,
    startedAt: 1,
    payload: { batchID: 'B' },
  });
  const { value } = setup({}, { store });
  assert.equal(value.pendingWriteoff('B'), false);
});

const writeoffRef = {
  kind: 'writeoff',
  userID: U,
  restaurantID: R,
  batchID: 'B',
};

test('a second command is not sent over a readable record of another command', async () => {
  const store = createMemoryAttemptStore();
  let release;
  const slow = new Promise((resolve) => {
    release = resolve;
  });
  const calls = [];
  const { value, commands } = setup(
    {
      confirmWriteoff: async (...args) => {
        calls.push(args);
        return slow;
      },
    },
    { store },
  );
  const first = value.confirmWriteoff('B', E);
  // The runner lost the attempt (as after clear()), but its command may still
  // be on its way and its record is the only trace.
  commands.clear();
  assert.deepEqual(await value.confirmWriteoff('B', E), {
    kind: 'refused',
    code: 'AttemptUnresolved',
  });
  assert.equal(calls.length, 1);
  assert.equal(store.load(writeoffRef).record.commandID, 'command-1');
  assert.equal(commands.getSnapshot().length, 0);
  // The first command ends: its record goes and the operation is free again.
  release({ context: {}, result: {} });
  await first;
  assert.equal(store.load(writeoffRef).status, 'absent');
  assert.equal((await value.confirmWriteoff('B', E)).kind, 'created');
  assert.equal(calls.length, 2);
});

test('a reload keeps the record readable for the retry of the same command', async () => {
  const store = createMemoryAttemptStore();
  const api = lostThenAnswer();
  const first = setup(api, { store });
  assert.equal((await first.value.confirmWriteoff('B', E)).kind, 'unknown');
  // After the reload nothing else is called: only the button of W11 retries.
  const second = setup(api, { store });
  const [attempt] = second.commands.getSnapshot();
  assert.equal(attempt.commandID, 'command-1');
  const result = await second.commands.retry(attempt.key);
  assert.equal(result.kind, 'committed');
  assert.deepEqual(api.calls[1], api.calls[0]);
  assert.equal(second.commands.getSnapshot().length, 0);
  assert.equal(store.load(writeoffRef).status, 'absent');
});

test('the saved epoch is used even when the current one is different', async () => {
  const store = createMemoryAttemptStore();
  store.save({
    kind: 'writeoff',
    userID: U,
    restaurantID: R,
    commandID: 'saved-command',
    epoch: NEXT,
    startedAt: 5,
    payload: { batchID: 'B' },
  });
  const calls = [];
  const { value, commands } = setup(
    {
      confirmWriteoff: async (...args) => {
        calls.push(args);
        return { context: {}, result: {} };
      },
    },
    { store },
  );
  // The screen sees the current epoch E; the saved command was sent under NEXT.
  assert.equal(commands.getSnapshot()[0].commandID, 'saved-command');
  assert.equal((await value.confirmWriteoff('B', E)).kind, 'created');
  assert.deepEqual(calls, [[R, 'B', 'saved-command', NEXT]]);
});

test('a record that cannot be removed does not turn a committed answer into a failure', async () => {
  const store = createMemoryAttemptStore();
  store.remove = () => 'unavailable';
  const { value, invalidations } = setup(
    { confirmWriteoff: async () => ({ context: {}, result: {} }) },
    { store },
  );
  assert.equal((await value.confirmWriteoff('B', E)).kind, 'created');
  assert.equal(invalidations.length, 1);
  assert.equal(store.load(writeoffRef).status, 'ok');
  assert.equal(value.pendingWriteoff('B'), false);
});

test('sign-out of A, B in, A back: the attempt of A is restored, B never sees it', async () => {
  const store = createMemoryAttemptStore();
  const api = lostThenAnswer();
  const a1 = setup(api, { store });
  await a1.value.confirmWriteoff('B', E);
  // Sign-out clears the runner and the factories, not the records.
  a1.commands.clear();
  const b = setup(api, { store, userID: OTHER });
  assert.equal(b.value.pendingWriteoff('B'), false);
  assert.equal(b.commands.getSnapshot().length, 0);
  b.commands.clear();
  const a2 = setup(api, { store });
  assert.equal(a2.value.pendingWriteoff('B'), true);
  assert.equal(a2.commands.getSnapshot()[0].commandID, 'command-1');
  assert.equal(store.list(OTHER).entries.length, 0);
});

test('a settled record that could not be removed is removed before the next command', async () => {
  const store = createMemoryAttemptStore();
  const remove = store.remove;
  let removable = false;
  store.remove = (ref) => (removable ? remove(ref) : 'unavailable');
  const calls = [];
  const { value } = setup(
    {
      confirmWriteoff: async (...args) => {
        calls.push(args);
        return { context: {}, result: {} };
      },
    },
    { store },
  );
  assert.equal((await value.confirmWriteoff('B', E)).kind, 'created');
  assert.equal(store.load(writeoffRef).record.commandID, 'command-1');
  // Still blocked: the leftover stays and the next command is refused.
  assert.deepEqual(await value.confirmWriteoff('B', E), {
    kind: 'refused',
    code: 'AttemptUnresolved',
  });
  assert.equal(calls.length, 1);
  // The storage works again: the settled record goes and the command is sent.
  removable = true;
  assert.equal((await value.confirmWriteoff('B', E)).kind, 'created');
  assert.equal(calls.length, 2);
  assert.equal(store.load(writeoffRef).status, 'absent');
});

test('a readable record of an unsettled command is not removed by the retry of the cleanup', async () => {
  const store = createMemoryAttemptStore();
  store.save({
    kind: 'writeoff',
    userID: U,
    restaurantID: R,
    commandID: 'foreign',
    epoch: E,
    startedAt: 1,
    payload: { batchID: 'B' },
  });
  const removed = [];
  const remove = store.remove;
  store.remove = (ref) => {
    removed.push(ref);
    return remove(ref);
  };
  const { value, commands } = setup(
    { confirmWriteoff: async () => ({ context: {}, result: {} }) },
    { store },
  );
  commands.clear();
  assert.deepEqual(await value.confirmWriteoff('B', E), {
    kind: 'refused',
    code: 'AttemptUnresolved',
  });
  assert.deepEqual(removed, []);
  assert.equal(store.load(writeoffRef).record.commandID, 'foreign');
});

test('the state of one operation keeps its identity between reads', () => {
  const { value } = setup({});
  assert.equal(value.writeoffAttempt('B'), value.writeoffAttempt('B'));
  assert.notEqual(value.writeoffAttempt('B'), value.writeoffAttempt('C'));
  assert.equal(value.deliveryAttempt, value.deliveryAttempt);
});

const limited = (retryAfterSeconds) =>
  new ApiError({
    ...localFailure('RateLimited', 'not_committed', 429),
    retryable: true,
    retryAfterSeconds,
  });

test('a 429 on a delivery or a write-off reports the wait and frees the command', async () => {
  const calls = [];
  const answers = [limited(7), limited(undefined)];
  const { value, store } = setup({
    receiveDelivery: async (...args) => {
      calls.push(args);
      throw answers.shift();
    },
    confirmWriteoff: async (...args) => {
      calls.push(args);
      throw answers.shift();
    },
  });
  assert.deepEqual(await value.receiveDelivery(draft(), 'Europe/Moscow', E), {
    kind: 'rate-limited',
    retryAfterSeconds: 7,
  });
  assert.equal(value.pendingDelivery(), undefined);
  assert.deepEqual(await value.confirmWriteoff('B', E), {
    kind: 'rate-limited',
    retryAfterSeconds: 60,
  });
  assert.equal(value.pendingWriteoff('B'), false);
  assert.equal(calls.length, 2);
  assert.equal(
    store.load({ kind: 'writeoff', userID: U, restaurantID: R, batchID: 'B' })
      .status,
    'absent',
  );
});

test('a 503 before dispatch frees the delivery; after dispatch the same command is repeated', async () => {
  const calls = [];
  const answers = [
    new ApiError(localFailure('ServiceUnavailable', 'not_committed', 503)),
    new ApiError(localFailure('ServiceUnavailable', 'unknown', 503)),
    {
      context: { runtimeEpoch: E },
      result: { deliveryID: 'd', batchIDs: [], batches: [] },
    },
  ];
  const { value } = setup({
    receiveDelivery: async (...args) => {
      calls.push(args);
      const next = answers.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  });
  assert.deepEqual(await value.receiveDelivery(draft(), 'Europe/Moscow', E), {
    kind: 'refused',
    code: 'ServiceUnavailable',
  });
  assert.equal(value.pendingDelivery(), undefined);
  assert.equal(
    (await value.receiveDelivery(draft(), 'Europe/Moscow', E)).kind,
    'unknown',
  );
  assert.equal(
    (await value.receiveDelivery(draft(), 'Europe/Moscow', E)).kind,
    'created',
  );
  assert.notEqual(calls[0][2], calls[1][2]);
  assert.equal(calls[1][2], calls[2][2]);
  assert.deepEqual(calls[1][1], calls[2][1]);
});
