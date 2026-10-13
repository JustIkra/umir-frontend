import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createReadModel } from '../../src/application/read-model.ts';

// Each load returns a promise the test settles by hand.
function controlledLoader() {
  const calls = [];
  const load = (options) =>
    new Promise((resolve, reject) => {
      calls.push({ options, resolve, reject });
    });
  return { calls, load };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

function model(loader, { refreshOnTick = false, now = () => 1000 } = {}) {
  return createReadModel(loader.load, { refreshOnTick, now });
}

test('the first subscriber reads once in the foreground', async () => {
  const loader = controlledLoader();
  const readModel = model(loader, { now: () => 5000 });
  readModel.subscribe(() => undefined);
  readModel.subscribe(() => undefined);
  assert.deepEqual(
    loader.calls.map((call) => call.options),
    [{ background: false }],
  );
  assert.equal(readModel.getSnapshot().loading, true);
  loader.calls[0].resolve('остатки');
  await settled();
  assert.deepEqual(readModel.getSnapshot(), {
    value: 'остатки',
    loadedAt: 5000,
    loading: false,
    failed: false,
    failure: undefined,
  });
});

// React StrictMode subscribes, unsubscribes and subscribes again on mount.
test('a remount during the first read does not read twice', () => {
  const loader = controlledLoader();
  const readModel = model(loader);
  const unsubscribe = readModel.subscribe(() => undefined);
  unsubscribe();
  readModel.subscribe(() => undefined);
  assert.equal(loader.calls.length, 1);
});

test('a stale model without subscribers reads on the next subscription', async () => {
  const loader = controlledLoader();
  const readModel = model(loader);
  const unsubscribe = readModel.subscribe(() => undefined);
  loader.calls[0].resolve('v1');
  await settled();
  unsubscribe();
  readModel.markStale('all');
  assert.equal(loader.calls.length, 1);
  readModel.subscribe(() => undefined);
  assert.deepEqual(
    loader.calls.map((call) => call.options),
    [{ background: false }, { background: false }],
  );
});

test('marks during a request cause exactly one background request after it', async () => {
  const loader = controlledLoader();
  const readModel = model(loader);
  readModel.subscribe(() => undefined);
  readModel.markStale('all');
  readModel.markStale('all');
  readModel.markStale('all');
  assert.equal(loader.calls.length, 1);
  loader.calls[0].resolve('v1');
  await settled();
  assert.deepEqual(
    loader.calls.map((call) => call.options),
    [{ background: false }, { background: true }],
  );
  loader.calls[1].resolve('v2');
  await settled();
  assert.equal(loader.calls.length, 2);
  assert.equal(readModel.getSnapshot().value, 'v2');
});

test('only the response to the latest request is applied', async () => {
  const loader = controlledLoader();
  const readModel = model(loader);
  readModel.subscribe(() => undefined);
  readModel.refresh();
  loader.calls[1].resolve('newer');
  await settled();
  loader.calls[0].resolve('older');
  await settled();
  assert.equal(readModel.getSnapshot().value, 'newer');
});

test('a superseded response does not end the loading state', async () => {
  const loader = controlledLoader();
  const readModel = model(loader);
  readModel.subscribe(() => undefined);
  readModel.refresh();
  loader.calls[0].resolve('older');
  await settled();
  assert.deepEqual(readModel.getSnapshot(), {
    value: undefined,
    loadedAt: undefined,
    loading: true,
    failed: false,
    failure: undefined,
  });
});

test('a failed read keeps the last value and its time', async () => {
  let clock = 1000;
  const loader = controlledLoader();
  const readModel = model(loader, { now: () => clock });
  readModel.subscribe(() => undefined);
  loader.calls[0].resolve('v1');
  await settled();
  clock = 7000;
  readModel.refresh();
  const error = new Error('UpstreamUnavailable');
  loader.calls[1].reject(error);
  await settled();
  assert.deepEqual(readModel.getSnapshot(), {
    value: 'v1',
    loadedAt: 1000,
    loading: false,
    failed: true,
    failure: error,
  });
});

test('ticks re-read only models that depend on time', async () => {
  const plain = controlledLoader();
  const timed = controlledLoader();
  const plainModel = model(plain);
  const timedModel = model(timed, { refreshOnTick: true });
  plainModel.subscribe(() => undefined);
  timedModel.subscribe(() => undefined);
  plain.calls[0].resolve('v1');
  timed.calls[0].resolve('v1');
  await settled();
  plainModel.markStale('time');
  timedModel.markStale('time');
  assert.equal(plain.calls.length, 1);
  assert.deepEqual(timed.calls[1].options, { background: true });
});

test('subscribers hear every snapshot change', async () => {
  const loader = controlledLoader();
  const readModel = model(loader);
  const seen = [];
  readModel.subscribe(() => {
    seen.push(readModel.getSnapshot().loading);
  });
  loader.calls[0].resolve('v1');
  await settled();
  assert.deepEqual(seen, [true, false]);
});

test('a success after a failure clears the failure', async () => {
  const loader = controlledLoader();
  const readModel = model(loader);
  readModel.subscribe(() => undefined);
  const error = new Error('Transport');
  loader.calls[0].reject(error);
  await settled();
  assert.equal(readModel.getSnapshot().failure, error);
  readModel.refresh();
  loader.calls[1].resolve('v');
  await settled();
  assert.equal(readModel.getSnapshot().failure, undefined);
  assert.equal(readModel.getSnapshot().failed, false);
});
