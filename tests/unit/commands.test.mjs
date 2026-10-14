import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { ApiError, localFailure } from '../../src/application/api.ts';
import { createCommandRunner } from '../../src/application/commands.ts';
import { createEpochRegistry } from '../../src/application/epochs.ts';

const R = '33333333-3333-4333-8333-333333333333';
const refused = (code, outcome) =>
  new ApiError({ ...localFailure(code, outcome, 409), retryable: false });

function setup() {
  let id = 0;
  const resets = [];
  const epochs = createEpochRegistry();
  const runner = createCommandRunner({
    newId: () => `cmd-${String((id += 1))}`,
    now: () => 1000,
    epochs,
    onReset: (restaurantID) => resets.push(restaurantID),
  });
  return { runner, epochs, resets };
}

// An execute() that records its calls and settles with the next outcome.
function command(...outcomes) {
  const calls = [];
  const execute = (commandID, epoch) => {
    calls.push({ commandID, epoch });
    const next = outcomes.shift();
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };
  return { calls, execute };
}

const timeout = () => refused('UpstreamTimeout', 'unknown');

test('a committed command resolves with its value and leaves no attempt', async () => {
  const { runner } = setup();
  const sent = command('ok');
  const result = await runner.run({
    key: 'k',
    label: 'входа',
    execute: sent.execute,
  });
  assert.deepEqual(result, { kind: 'committed', value: 'ok' });
  assert.deepEqual(sent.calls, [{ commandID: 'cmd-1', epoch: undefined }]);
  assert.deepEqual(runner.getSnapshot(), []);
});

test('an unknown outcome keeps the attempt; running the key again resends it', async () => {
  const { runner } = setup();
  const first = command(timeout(), 'done');
  const unknown = await runner.run({
    key: 'k',
    label: 'входа',
    restaurantID: R,
    execute: first.execute,
  });
  assert.equal(unknown.kind, 'unknown');
  assert.deepEqual(unknown.attempt, {
    key: 'k',
    commandID: 'cmd-1',
    label: 'входа',
    restaurantID: R,
    startedAt: 1000,
  });
  assert.deepEqual(
    runner.getSnapshot().map((attempt) => attempt.commandID),
    ['cmd-1'],
  );
  const second = command('never');
  const done = await runner.run({
    key: 'k',
    label: 'входа',
    execute: second.execute,
  });
  assert.deepEqual(done, { kind: 'committed', value: 'done' });
  assert.deepEqual(
    first.calls.map((call) => call.commandID),
    ['cmd-1', 'cmd-1'],
  );
  assert.equal(second.calls.length, 0);
  assert.deepEqual(runner.getSnapshot(), []);
});

test('retry(key) resends a pending attempt and is undefined without one', async () => {
  const { runner } = setup();
  assert.equal(runner.retry('k'), undefined);
  const sent = command(timeout(), 'ok');
  await runner.run({ key: 'k', label: 'x', execute: sent.execute });
  assert.deepEqual(await runner.retry('k'), { kind: 'committed', value: 'ok' });
  assert.deepEqual(
    sent.calls.map((call) => call.commandID),
    ['cmd-1', 'cmd-1'],
  );
});

test('a refusal closes the attempt; the next run gets a new commandID', async () => {
  const { runner } = setup();
  const sent = command(refused('InvalidCredentials', 'not_committed'), 'ok');
  const rejected = await runner.run({
    key: 'k',
    label: 'входа',
    execute: sent.execute,
  });
  assert.equal(rejected.kind, 'rejected');
  assert.equal(rejected.failure.code, 'InvalidCredentials');
  await runner.run({ key: 'k', label: 'входа', execute: sent.execute });
  assert.deepEqual(
    sent.calls.map((call) => call.commandID),
    ['cmd-1', 'cmd-2'],
  );
});

test('a recorded refusal and an unavailable service also close the attempt', async () => {
  for (const outcome of ['committed', 'unavailable']) {
    const { runner } = setup();
    const result = await runner.run({
      key: 'k',
      label: 'x',
      execute: command(refused('InvalidArgument', outcome)).execute,
    });
    assert.equal(result.kind, 'rejected', outcome);
    assert.deepEqual(runner.getSnapshot(), []);
  }
});

test('RuntimeReset settles as reset and reports the restaurant', async () => {
  const { runner, epochs, resets } = setup();
  epochs.record(R, 'warehouse', 'e1');
  const result = await runner.run({
    key: 'k',
    label: 'x',
    restaurantID: R,
    service: 'warehouse',
    execute: command(refused('RuntimeReset', 'indeterminate')).execute,
  });
  assert.equal(result.kind, 'reset');
  assert.deepEqual(resets, [R]);
  assert.deepEqual(runner.getSnapshot(), []);
});

test('a service command sends its epoch and keeps it for resends', async () => {
  const { runner, epochs } = setup();
  epochs.record(R, 'serving', 'e1');
  const sent = command(timeout(), 'ok');
  await runner.run({
    key: 'k',
    label: 'x',
    restaurantID: R,
    service: 'serving',
    execute: sent.execute,
  });
  epochs.record(R, 'serving', 'e2');
  await runner.retry('k');
  assert.deepEqual(
    sent.calls.map((call) => call.epoch),
    ['e1', 'e1'],
  );
});

test('a service command without a known epoch is refused before sending', async () => {
  const { runner } = setup();
  const sent = command('ok');
  const result = await runner.run({
    key: 'k',
    label: 'x',
    restaurantID: R,
    service: 'warehouse',
    execute: sent.execute,
  });
  assert.equal(result.kind, 'rejected');
  assert.equal(result.failure.code, 'EpochUnknown');
  assert.equal(sent.calls.length, 0);
  assert.deepEqual(runner.getSnapshot(), []);
});

test('a failure that is not ApiError is an unknown outcome', async () => {
  const { runner } = setup();
  const result = await runner.run({
    key: 'k',
    label: 'x',
    execute: command(new TypeError('decode')).execute,
  });
  assert.equal(result.kind, 'unknown');
  assert.equal(result.failure.code, 'Malformed');
});

test('a second run while the first is in flight sends nothing', async () => {
  const { runner } = setup();
  let release;
  const calls = [];
  const execute = (commandID) => {
    calls.push(commandID);
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const first = runner.run({ key: 'k', label: 'x', execute });
  const second = runner.run({ key: 'k', label: 'x', execute });
  assert.equal(first, second);
  release('ok');
  assert.deepEqual(await second, { kind: 'committed', value: 'ok' });
  assert.deepEqual(calls, ['cmd-1']);
});

test('subscribers learn about attempts; discard and clear drop them', async () => {
  const { runner } = setup();
  let changes = 0;
  runner.subscribe(() => {
    changes += 1;
  });
  await runner.run({
    key: 'a',
    label: 'x',
    restaurantID: R,
    execute: command(timeout()).execute,
  });
  await runner.run({
    key: 'b',
    label: 'x',
    execute: command(timeout()).execute,
  });
  assert.ok(changes >= 2);
  assert.deepEqual(
    runner
      .getSnapshot()
      .filter((attempt) => attempt.restaurantID === R)
      .map((attempt) => attempt.key),
    ['a'],
  );
  runner.discard('a');
  assert.deepEqual(
    runner.getSnapshot().map((attempt) => attempt.key),
    ['b'],
  );
  runner.clear();
  assert.deepEqual(runner.getSnapshot(), []);
});

for (const [name, detach] of [
  [
    'discard detaches a run in flight: the next run sends a new command',
    (runner) => runner.discard('k'),
  ],
  ['clear detaches runs in flight', (runner) => runner.clear()],
]) {
  test(name, async () => {
    const { runner } = setup();
    const calls = [];
    const resolvers = [];
    const execute = (commandID) => {
      calls.push(commandID);
      return new Promise((resolve) => {
        resolvers.push(resolve);
      });
    };
    const first = runner.run({ key: 'k', label: 'x', execute });
    detach(runner);
    const second = runner.run({ key: 'k', label: 'x', execute });
    assert.deepEqual(calls, ['cmd-1', 'cmd-2']);
    resolvers[0]('old');
    assert.deepEqual(await first, { kind: 'committed', value: 'old' });
    assert.deepEqual(
      runner.getSnapshot().map((item) => item.commandID),
      ['cmd-2'],
      'the late answer leaves the newer attempt alone',
    );
    resolvers[1]('new');
    assert.deepEqual(await second, { kind: 'committed', value: 'new' });
    assert.deepEqual(runner.getSnapshot(), []);
  });
}

test('restore keeps a saved attempt and a retry resends it with the saved id and epoch', async () => {
  const sent = [];
  const commands = createCommandRunner({
    newId: () => 'new-id',
    now: () => 5,
    epochs: createEpochRegistry(),
    onReset: () => {},
  });
  const spec = {
    key: 'order.confirm.r',
    label: 'оформления заказа',
    restaurantID: 'r',
    service: 'serving',
    execute: (commandID, epoch) => {
      sent.push([commandID, epoch]);
      return Promise.resolve('ok');
    },
  };
  commands.restore(spec, {
    commandID: 'saved-id',
    epoch: 'saved-epoch',
    startedAt: 1,
  });
  assert.deepEqual(commands.getSnapshot(), [
    {
      key: 'order.confirm.r',
      commandID: 'saved-id',
      label: 'оформления заказа',
      restaurantID: 'r',
      startedAt: 1,
    },
  ]);
  commands.restore(spec, { commandID: 'other', epoch: 'x', startedAt: 2 });
  assert.equal(commands.getSnapshot()[0].commandID, 'saved-id');
  const result = await commands.run({
    ...spec,
    execute: () => Promise.reject(new Error('not this')),
  });
  assert.deepEqual(result, { kind: 'committed', value: 'ok' });
  assert.deepEqual(sent, [['saved-id', 'saved-epoch']]);
  assert.deepEqual(commands.getSnapshot(), []);
});
