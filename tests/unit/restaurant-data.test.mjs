import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  ApiError,
  failureOf,
  localFailure,
} from '../../src/application/api.ts';
import { createEpochRegistry } from '../../src/application/epochs.ts';
import { createModelRegistry } from '../../src/application/models.ts';
import { createRestaurantData } from '../../src/application/restaurant-data.ts';

const R = '33333333-3333-4333-8333-333333333333';
const WAREHOUSE = '44444444-4444-4444-8444-444444444444';
const SERVING = '55555555-5555-4555-8555-555555555555';
const RESTARTED = '66666666-6666-4666-8666-666666666666';
const AGAIN = '77777777-7777-4777-8777-777777777777';
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

const sale = (sequence, orderID = `O${String(sequence)}`) => ({
  type: 'OrderPlaced',
  sequence: String(sequence),
  recordedAt: { iso: '2026-10-14T10:00:00+03:00', epochMs: sequence },
  orderID,
  positions: 1,
});
const sales = (from, to, orderID) =>
  Array.from({ length: to - from + 1 }, (_, index) =>
    sale(from + index, orderID),
  );

function fakeReads() {
  const calls = [];
  // The warehouse journal: events after fromSequence, up to 500 per page.
  const journal = { epoch: WAREHOUSE, events: [], failFrom: undefined };
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
    journal,
    reads: {
      products: warehouse('products'),
      dishCatalog: warehouse('dishCatalog'),
      dish: warehouse('dish'),
      suggestID: warehouse('suggestID'),
      servingProducts: serving('servingProducts'),
      menu: serving('menu'),
      stopList: serving('stopList'),
      recommendations: serving('recommendations'),
    },
    warehouseReads: {
      inventory: warehouse('inventory'),
      expiringBatches: warehouse('expiringBatches'),
      pendingWriteoffs: warehouse('pendingWriteoffs'),
      stockReport: warehouse('stockReport'),
      history: (restaurantID, fromSequence, options) => {
        calls.push(['history', restaurantID, fromSequence, options]);
        journal.onRead?.(fromSequence);
        if (journal.failFrom === fromSequence) {
          return Promise.reject(
            new ApiError(localFailure('Transport', 'unavailable')),
          );
        }
        const from = BigInt(fromSequence);
        return Promise.resolve({
          context: { runtimeEpoch: journal.epoch },
          result: {
            events: journal.events
              .filter((event) => BigInt(event.sequence) > from)
              .slice(0, 500),
          },
        });
      },
    },
  };
}

function setup() {
  const epochs = createEpochRegistry();
  const models = createModelRegistry({ now: () => 0, epochs });
  const fake = fakeReads();
  const settings = { version: '7' };
  const data = createRestaurantData(
    models,
    fake.reads,
    fake.warehouseReads,
    R,
    () => settings.version,
  );
  return {
    epochs,
    models,
    data,
    calls: fake.calls,
    journal: fake.journal,
    settings,
  };
}

const names = (calls) => calls.map(([name]) => name);
const froms = (calls) =>
  calls.filter(([name]) => name === 'history').map(([, , from]) => from);
const sequences = (model) =>
  model.getSnapshot().value.result.events.map((event) => event.sequence);
const range = (from, to) =>
  Array.from({ length: to - from + 1 }, (_, index) => String(from + index));

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
  assert.deepEqual(calls, [
    ['products', R, { background: false }],
    ['menu', R, { background: false }],
    ['dish', R, 'a/b', { background: false }],
    ['suggestID', R, 'dish', { background: false }],
  ]);
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

test('only the recommendations re-read on a tick', async () => {
  const { data, models, calls } = setup();
  data.menu().subscribe(() => undefined);
  data.recommendations().subscribe(() => undefined);
  await settled();
  calls.length = 0;
  models.markTime(R);
  await settled();
  assert.deepEqual(names(calls), ['recommendations']);
});

test('warehouse reads: one model per read, per window and per page', () => {
  const { data } = setup();
  assert.equal(data.inventory(), data.inventory());
  assert.equal(data.expiringBatches(), data.expiringBatches());
  assert.equal(data.pendingWriteoffs(), data.pendingWriteoffs());
  assert.equal(data.history(), data.history());
  assert.equal(data.stockReport(72), data.stockReport(72));
  assert.notEqual(data.stockReport(72), data.stockReport(168));
  assert.equal(data.stockReportPage(72, 'c2'), data.stockReportPage(72, 'c2'));
  assert.notEqual(
    data.stockReportPage(72, 'c2'),
    data.stockReportPage(72, 'c3'),
  );
  assert.notEqual(data.stockReportPage(72, 'c2'), data.stockReport(72));
});

test('stock changes re-read the warehouse; analytics the report; sales and the catalog the history', async () => {
  const { data, models, calls } = setup();
  for (const model of [
    data.inventory(),
    data.expiringBatches(),
    data.pendingWriteoffs(),
    data.stockReport(72),
    data.stockReportPage(72, 'c2'),
    data.history(),
  ])
    model.subscribe(() => undefined);
  await settled();
  calls.length = 0;
  models.markStale(R, ['stock']);
  await settled();
  assert.deepEqual(names(calls).sort(), [
    'expiringBatches',
    'history',
    'inventory',
    'pendingWriteoffs',
    'stockReport',
    'stockReport',
  ]);
  for (const [topic, expected] of [
    ['analytics', ['stockReport', 'stockReport']],
    ['orders', ['history']],
    ['catalog', ['history']],
    ['menu', []],
  ]) {
    calls.length = 0;
    models.markStale(R, [topic]);
    await settled();
    assert.deepEqual(names(calls), expected, topic);
  }
});

test('the expiring batches and the first report page re-read on a tick', async () => {
  const { data, models, calls } = setup();
  for (const model of [
    data.inventory(),
    data.expiringBatches(),
    data.pendingWriteoffs(),
    data.stockReport(72),
    data.stockReportPage(72, 'c2'),
    data.history(),
  ])
    model.subscribe(() => undefined);
  await settled();
  calls.length = 0;
  models.markTime(R);
  await settled();
  assert.deepEqual(calls, [
    ['expiringBatches', R, { background: true }],
    [
      'stockReport',
      R,
      { riskHours: 72, settingsVersion: '7', cursor: undefined },
      { background: true },
    ],
  ]);
});

test('the report sends the settings version of the moment and its page cursor', async () => {
  const { data, calls, settings } = setup();
  const report = data.stockReport(168);
  report.subscribe(() => undefined);
  data.stockReportPage(168, 'c2').subscribe(() => undefined);
  await settled();
  assert.deepEqual(calls, [
    [
      'stockReport',
      R,
      { riskHours: 168, settingsVersion: '7', cursor: undefined },
      { background: false },
    ],
    [
      'stockReport',
      R,
      { riskHours: 168, settingsVersion: '7', cursor: 'c2' },
      { background: false },
    ],
  ]);
  // Access re-read the settings after SettingsChanged: the retry sends them.
  settings.version = '8';
  calls.length = 0;
  report.refresh();
  await settled();
  assert.deepEqual(calls[0][2], {
    riskHours: 168,
    settingsVersion: '8',
    cursor: undefined,
  });
});

test('without the settings version the report is not read', async () => {
  const { data, calls, settings } = setup();
  settings.version = undefined;
  const report = data.stockReport(72);
  report.subscribe(() => undefined);
  await settled();
  assert.equal(calls.length, 0);
  assert.equal(report.getSnapshot().failed, true);
  const failure = failureOf(report.getSnapshot().failure);
  assert.equal(failure?.code, 'SettingsUnknown');
  assert.equal(failure?.outcome, 'unavailable');
});

test('history reads every page to the end', async () => {
  const { data, models, calls, journal } = setup();
  journal.events = sales(1, 1000);
  const history = data.history();
  history.subscribe(() => undefined);
  await settled();
  // A full page may have a next one: exactly 1000 events end with an empty page.
  assert.deepEqual(froms(calls), ['0', '500', '1000']);
  assert.deepEqual(sequences(history), range(1, 1000));
  journal.events = sales(1, 1203);
  calls.length = 0;
  models.markStale(R, ['orders']);
  await settled();
  // The next read goes on from the last event, without the first pages again.
  assert.deepEqual(froms(calls), ['1000']);
  assert.deepEqual(sequences(history), range(1, 1203));
});

test('a new warehouse epoch restarts history', async () => {
  const { data, models, epochs, calls, journal } = setup();
  journal.events = sales(1, 3);
  const history = data.history();
  history.subscribe(() => undefined);
  await settled();
  assert.deepEqual(sequences(history), ['1', '2', '3']);
  // The warehouse restarted: a new journal of 600 events.
  journal.epoch = RESTARTED;
  journal.events = sales(1, 600, 'N');
  calls.length = 0;
  models.markStale(R, ['stock']);
  await settled();
  assert.deepEqual(froms(calls), ['3', '0', '500']);
  const { events } = history.getSnapshot().value.result;
  assert.deepEqual(
    events.map((event) => event.sequence),
    range(1, 600),
  );
  assert.ok(events.every((event) => event.orderID === 'N'));
  assert.equal(epochs.get(R, 'warehouse'), RESTARTED);
  assert.deepEqual(models.getNotice(), { restaurantID: R });
});

test('a second restart within one read fails it and keeps the journal', async () => {
  const { data, models, calls, journal } = setup();
  journal.events = sales(1, 3);
  const history = data.history();
  history.subscribe(() => undefined);
  await settled();
  journal.epoch = RESTARTED;
  journal.events = sales(1, 600, 'N');
  journal.onRead = (from) => {
    if (from === '500') journal.epoch = AGAIN;
  };
  calls.length = 0;
  models.markStale(R, ['stock']);
  await settled();
  assert.deepEqual(froms(calls), ['3', '0', '500']);
  assert.equal(history.getSnapshot().failed, true);
  assert.deepEqual(sequences(history), ['1', '2', '3']);
  journal.onRead = undefined;
  calls.length = 0;
  history.refresh();
  await settled();
  assert.deepEqual(froms(calls), ['3', '0', '500']);
  assert.deepEqual(sequences(history), range(1, 600));
});

test('a failed page fails the read and keeps what was read before', async () => {
  const { data, models, calls, journal } = setup();
  journal.events = sales(1, 3);
  const history = data.history();
  history.subscribe(() => undefined);
  await settled();
  journal.events = sales(1, 600);
  journal.failFrom = '503';
  calls.length = 0;
  models.markStale(R, ['stock']);
  await settled();
  assert.deepEqual(froms(calls), ['3', '503']);
  assert.equal(history.getSnapshot().failed, true);
  assert.deepEqual(sequences(history), ['1', '2', '3']);
  // The retry starts from the last event kept, not from the failed page.
  journal.failFrom = undefined;
  calls.length = 0;
  history.refresh();
  await settled();
  assert.deepEqual(froms(calls), ['3', '503']);
  assert.deepEqual(sequences(history), range(1, 600));
});

test('overlapping reads add no duplicates', async () => {
  const { data, calls, journal } = setup();
  journal.events = sales(1, 3);
  const history = data.history();
  history.subscribe(() => undefined);
  await settled();
  journal.events = sales(1, 5);
  calls.length = 0;
  // The second refresh supersedes the first one in flight; both finish.
  history.refresh();
  history.refresh();
  await settled();
  assert.deepEqual(froms(calls), ['3', '3']);
  assert.deepEqual(sequences(history), range(1, 5));
  journal.events = sales(1, 6);
  calls.length = 0;
  history.refresh();
  await settled();
  assert.deepEqual(froms(calls), ['5']);
  assert.deepEqual(sequences(history), range(1, 6));
});

test('clearing the registry starts the history over', async () => {
  const { data, models, calls, journal } = setup();
  journal.events = sales(1, 3);
  data.history().subscribe(() => undefined);
  await settled();
  models.clear();
  calls.length = 0;
  const history = data.history();
  history.subscribe(() => undefined);
  await settled();
  assert.deepEqual(froms(calls), ['0']);
  assert.deepEqual(sequences(history), ['1', '2', '3']);
});
