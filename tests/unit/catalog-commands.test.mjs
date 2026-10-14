import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { ApiError, localFailure } from '../../src/application/api.ts';
import {
  createCatalogCommands,
  productKey,
} from '../../src/application/catalog-commands.ts';
import { createCommandRunner } from '../../src/application/commands.ts';
import { createEpochRegistry } from '../../src/application/epochs.ts';

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

function setup({ epoch = EPOCH } = {}) {
  const epochs = createEpochRegistry();
  if (epoch !== null) epochs.record(R, 'warehouse', epoch);
  let n = 0;
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
    markStale: (topics) => events.push(['stale', topics]),
    onUnauthenticated: () => events.push(['check']),
  });
  return { catalog, commands, calls, answers, events };
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
