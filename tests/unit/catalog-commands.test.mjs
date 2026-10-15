import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { ApiError, localFailure } from '../../src/application/api.ts';
import {
  createCatalogCommands,
  productKey,
} from '../../src/application/catalog-commands.ts';
import { createCommandRunner } from '../../src/application/commands.ts';
import { createEpochRegistry } from '../../src/application/epochs.ts';
import { createMemoryAttemptStore } from './support/memory-attempt-store.mjs';

const U = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const R = '33333333-3333-4333-8333-333333333333';
const EPOCH = '44444444-4444-4444-8444-444444444444';
const refused = (status, code, outcome) =>
  new ApiError({ ...localFailure(code, outcome, status), retryable: false });
const product = { productID: '133', name: 'Сыр бри', baseUnit: 'g' };
const dish = {
  dishID: '213',
  name: 'Паста с белыми грибами',
  ingredients: [{ productID: '114', quantity: '100000', baseUnit: 'g' }],
};

function setup({
  epoch = EPOCH,
  store = createMemoryAttemptStore(),
  userID = U,
  first = 1,
} = {}) {
  const epochs = createEpochRegistry();
  if (epoch !== null) epochs.record(R, 'warehouse', epoch);
  let n = first - 1;
  const commands = createCommandRunner({
    newId: () => `cmd-${String((n += 1))}`,
    now: () => 0,
    epochs,
    onReset: () => {},
  });
  const calls = [];
  const answers = [];
  const answer = (name, args) => {
    calls.push([name, ...args]);
    if (answers.length === 0)
      return Promise.reject(new Error(`no ${name} answer`));
    const next = answers.shift();
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };
  const events = [];
  const catalog = createCatalogCommands({
    api: {
      registerProduct: (...args) => answer('registerProduct', args),
      defineDish: (...args) => answer('defineDish', args),
    },
    commands,
    restaurantID: R,
    userID,
    attempts: store,
    now: () => 1700,
    markStale: (topics) => events.push(['stale', topics]),
    onUnauthenticated: () => events.push(['check']),
  });
  return { catalog, commands, calls, answers, events, store };
}

test('a created product marks the catalog stale and returns the product', async () => {
  const { catalog, calls, answers, events } = setup();
  answers.push({ context: {}, result: product });
  assert.deepEqual(await catalog.registerProduct(product), {
    kind: 'created',
    value: product,
  });
  assert.deepEqual(calls, [['registerProduct', R, product, 'cmd-1', EPOCH]]);
  assert.deepEqual(events, [['stale', ['catalog']]]);
  assert.equal(catalog.pendingProduct(), undefined);
});

test('a dish goes through the same path', async () => {
  const { catalog, calls, answers } = setup();
  answers.push({ context: {}, result: dish });
  assert.equal((await catalog.defineDish(dish)).kind, 'created');
  assert.deepEqual(calls[0], ['defineDish', R, dish, 'cmd-1', EPOCH]);
});

test('refusals: code taken, bad data, other services, ended session, reset', async () => {
  const cases = [
    [refused(409, 'ProductConflict', 'not_committed'), { kind: 'conflict' }],
    [refused(409, 'DishConflict', 'not_committed'), { kind: 'conflict' }],
    [refused(400, 'InvalidArgument', 'not_committed'), { kind: 'invalid' }],
    [
      refused(503, 'UpstreamUnavailable', 'not_committed'),
      { kind: 'refused', code: 'UpstreamUnavailable' },
    ],
    [refused(401, 'Unauthenticated', 'not_committed'), { kind: 'ended' }],
    [refused(409, 'RuntimeReset', 'indeterminate'), { kind: 'reset' }],
  ];
  for (const [answer, outcome] of cases) {
    const { catalog, answers, events } = setup();
    answers.push(answer);
    assert.deepEqual(
      await catalog.registerProduct(product),
      outcome,
      answer.message,
    );
    assert.equal(
      events.some(([name]) => name === 'check'),
      outcome.kind === 'ended',
    );
  }
});

test('without a read of the warehouse epoch nothing is sent', async () => {
  const { catalog, calls } = setup({ epoch: null });
  assert.deepEqual(await catalog.registerProduct(product), {
    kind: 'refused',
    code: 'EpochUnknown',
  });
  assert.equal(calls.length, 0);
});

test('pending() survives a new visit and the check repeats the same command', async () => {
  const { catalog, commands, calls, answers } = setup();
  answers.push(refused(0, 'Transport', 'unknown'));
  assert.deepEqual(await catalog.registerProduct(product), { kind: 'unknown' });
  assert.deepEqual(catalog.pendingProduct(), product);
  assert.equal(commands.getSnapshot()[0].key, productKey(R));
  answers.push({ context: {}, result: product });
  // The form is closed, but even another input repeats the pending command.
  await catalog.registerProduct({ ...product, name: 'Другое' });
  assert.deepEqual(calls[1], ['registerProduct', R, product, 'cmd-1', EPOCH]);
  assert.equal(catalog.pendingProduct(), undefined);
});

const lost = () => refused(0, 'Transport', 'unknown');
const refOf = (kind) => ({ kind, userID: U, restaurantID: R });

for (const [name, kind, input, call, pending, key] of [
  [
    'product',
    'product',
    product,
    'registerProduct',
    'pendingProduct',
    'registerProduct',
  ],
  ['dish', 'dish', dish, 'defineDish', 'pendingDish', 'defineDish'],
]) {
  test(`${name}: a lost reply survives a reload and the resend keeps command, body and epoch`, async () => {
    const store = createMemoryAttemptStore();
    const one = setup({ store });
    one.answers.push(lost());
    assert.equal((await one.catalog[key](input)).kind, 'unknown');
    const two = setup({ store, first: 7 });
    assert.deepEqual(two.catalog[pending](), input);
    assert.equal(two.commands.getSnapshot().length, 1);
    two.answers.push({ context: {}, result: input });
    assert.equal(
      (await two.catalog[key]({ ...input, name: 'Другое' })).kind,
      'created',
    );
    assert.deepEqual(two.calls, [[call, R, input, 'cmd-1', EPOCH]]);
    assert.equal(two.catalog[pending](), undefined);
    assert.equal(store.load(refOf(kind)).status, 'absent');
  });

  test(`${name}: the record is written before the call, once, and settling removes it`, async () => {
    const store = createMemoryAttemptStore();
    const cases = [
      [{ context: {}, result: input }, false],
      [refused(409, 'Other', 'not_committed'), false],
      [refused(409, 'RuntimeReset', 'indeterminate'), false],
      [lost(), true],
    ];
    for (const [answer, kept] of cases) {
      const run = setup({ store: createMemoryAttemptStore() });
      let during;
      const api = run.store;
      const before = api.save;
      api.save = (record) => {
        during = run.calls.length;
        return before(record);
      };
      run.answers.push(answer);
      await run.catalog[key](input);
      assert.equal(during, 0);
      assert.equal(run.store.list(U).entries.length, kept ? 1 : 0);
    }
    assert.equal(store.list(U).entries.length, 0);
  });

  test(`${name}: a resend does not write a second record`, async () => {
    const run = setup();
    let saves = 0;
    const before = run.store.save;
    run.store.save = (record) => {
      saves += 1;
      return before(record);
    };
    run.answers.push(lost(), lost());
    await run.catalog[key](input);
    await run.catalog[key](input);
    assert.equal(saves, 1);
    assert.equal(run.store.list(U).entries.length, 1);
  });

  test(`${name}: storage that refuses writes sends once, keeps nothing and warns`, async () => {
    const run = setup();
    run.store.block();
    run.answers.push(lost());
    assert.equal(run.catalog[`${name}Attempt`].notSaved(), false);
    assert.equal((await run.catalog[key](input)).kind, 'unknown');
    assert.equal(run.calls.length, 1);
    assert.equal(run.catalog[`${name}Attempt`].notSaved(), true);
    assert.deepEqual(run.catalog[pending](), input);
  });

  test(`${name}: a damaged record sends nothing until it is discarded`, async () => {
    const store = createMemoryAttemptStore();
    store.corrupt(refOf(kind));
    const run = setup({ store });
    const attempt = run.catalog[`${name}Attempt`];
    assert.equal(attempt.damaged(), true);
    assert.deepEqual(await run.catalog[key](input), {
      kind: 'refused',
      code: 'AttemptDamaged',
    });
    assert.equal(run.calls.length, 0);
    assert.equal(run.commands.getSnapshot().length, 0);
    assert.equal(store.list(U).entries.length, 1);
    assert.equal(attempt.discardCorrupt(), 'ok');
    assert.equal(attempt.damaged(), false);
    run.answers.push({ context: {}, result: input });
    assert.equal((await run.catalog[key](input)).kind, 'created');
    assert.equal(run.calls.length, 1);
  });

  test(`${name}: a stranger does not see the record`, async () => {
    const store = createMemoryAttemptStore();
    const one = setup({ store });
    one.answers.push(lost());
    await one.catalog[key](input);
    const two = setup({ store, userID: OTHER });
    assert.equal(two.catalog[pending](), undefined);
    assert.equal(two.commands.getSnapshot().length, 0);
  });
}

test('the product attempt is not blocked by a damaged dish record', async () => {
  const store = createMemoryAttemptStore();
  store.corrupt(refOf('dish'));
  const run = setup({ store });
  run.answers.push({ context: {}, result: product });
  assert.equal(run.catalog.productAttempt.damaged(), false);
  assert.equal(run.catalog.dishAttempt.damaged(), true);
  assert.equal((await run.catalog.registerProduct(product)).kind, 'created');
});

test('a second product command is not sent over a readable record of another command', async () => {
  const run = setup();
  let release;
  const slow = new Promise((resolve) => {
    release = resolve;
  });
  run.answers.push(slow);
  const first = run.catalog.registerProduct(product);
  run.commands.clear();
  assert.deepEqual(await run.catalog.registerProduct(product), {
    kind: 'refused',
    code: 'AttemptUnresolved',
  });
  assert.equal(run.calls.length, 1);
  assert.equal(run.store.load(refOf('product')).record.commandID, 'cmd-1');
  release({ context: {}, result: product });
  await first;
  assert.equal(run.store.load(refOf('product')).status, 'absent');
});
