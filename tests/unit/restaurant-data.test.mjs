import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createEpochRegistry } from '../../src/application/epochs.ts';
import { createModelRegistry } from '../../src/application/models.ts';
import { createRestaurantData } from '../../src/application/restaurant-data.ts';

const R = '33333333-3333-4333-8333-333333333333';
const WAREHOUSE = '44444444-4444-4444-8444-444444444444';
const SERVING = '55555555-5555-4555-8555-555555555555';
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeReads() {
  const calls = [];
  const answer = (name, epoch, args) => {
    calls.push([name, ...args]);
    return Promise.resolve({
      context: { runtimeEpoch: epoch },
      result: { name },
    });
  };
  const warehouse =
    (name) =>
    (...args) =>
      answer(name, WAREHOUSE, args);
  const serving =
    (name) =>
    (...args) =>
      answer(name, SERVING, args);
  return {
    calls,
    reads: {
      products: warehouse('products'),
      dishCatalog: warehouse('dishCatalog'),
      movementReport: warehouse('movementReport'),
      dish: warehouse('dish'),
      suggestID: warehouse('suggestID'),
      servingProducts: serving('servingProducts'),
      menu: serving('menu'),
      stopList: serving('stopList'),
      recommendations: serving('recommendations'),
    },
  };
}

function setup() {
  const epochs = createEpochRegistry();
  const models = createModelRegistry({
    now: () => 0,
    epochs,
    createCancellation: () => new AbortController(),
  });
  const fake = fakeReads();
  const data = createRestaurantData(models, fake.reads, R);
  return { epochs, models, data, calls: fake.calls };
}

const names = (calls) => calls.map(([name]) => name);

test('the same read gives the same model; dishes are keyed by id', () => {
  const { data } = setup();
  assert.equal(data.products(), data.products());
  assert.equal(data.dish('206'), data.dish('206'));
  assert.notEqual(data.dish('206'), data.dish('207'));
  assert.notEqual(data.suggestion('product'), data.suggestion('dish'));
});

test('subscribing reads the restaurant and records the epoch of each service', async () => {
  const { data, epochs, calls } = setup();
  data.products().subscribe(() => undefined);
  data.menu().subscribe(() => undefined);
  data.dish('a/b').subscribe(() => undefined);
  data.suggestion('dish').subscribe(() => undefined);
  await settled();
  assert.deepEqual(
    calls.map((call) =>
      call.map((arg) => (arg?.signal ? { background: arg.background } : arg)),
    ),
    [
      ['products', R, { background: false }],
      ['menu', R, { background: false }],
      ['dish', R, 'a/b', { background: false }],
      ['suggestID', R, 'dish', { background: false }],
    ],
  );
  assert.equal(epochs.get(R, 'warehouse'), WAREHOUSE);
  assert.equal(epochs.get(R, 'serving'), SERVING);
});

test('catalog changes re-read the catalog and the menu; stock changes only the menu', async () => {
  const { data, models, calls } = setup();
  for (const model of [
    data.products(),
    data.menu(),
    data.stopList(),
    data.servingProducts(),
  ])
    model.subscribe(() => undefined);
  await settled();
  calls.length = 0;
  models.markStale(R, ['stock']);
  await settled();
  assert.deepEqual(names(calls).sort(), ['menu', 'stopList']);
  calls.length = 0;
  models.markStale(R, ['catalog']);
  await settled();
  assert.deepEqual(names(calls).sort(), [
    'menu',
    'products',
    'servingProducts',
    'stopList',
  ]);
});

test('menu, stop list and recommendations re-read on a tick', async () => {
  const { data, models, calls } = setup();
  data.menu().subscribe(() => undefined);
  data.stopList().subscribe(() => undefined);
  data.recommendations().subscribe(() => undefined);
  await settled();
  calls.length = 0;
  models.markTime(R);
  await settled();
  assert.deepEqual(names(calls), ['menu', 'stopList', 'recommendations']);
});

test('the movement report is one model per week and follows stock, orders, analytics and the tick', async () => {
  const { data, models, calls } = setup();
  const week = { fromDate: '2026-10-08', throughDate: '2026-10-14' };
  assert.equal(data.movementReport(week), data.movementReport({ ...week }));
  assert.notEqual(
    data.movementReport(week),
    data.movementReport({ fromDate: '2026-10-09', throughDate: '2026-10-15' }),
  );
  data.movementReport(week).subscribe(() => undefined);
  await settled();
  assert.deepEqual(calls[0].slice(0, 3), ['movementReport', R, week]);
  for (const topic of ['stock', 'orders', 'analytics']) {
    calls.length = 0;
    models.markStale(R, [topic]);
    await settled();
    assert.deepEqual(names(calls), ['movementReport'], topic);
  }
  calls.length = 0;
  models.markStale(R, ['catalog']);
  await settled();
  assert.deepEqual(names(calls), []);
  models.markTime(R);
  await settled();
  assert.deepEqual(names(calls), ['movementReport']);
});
