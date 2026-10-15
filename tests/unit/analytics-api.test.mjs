import assert from 'node:assert/strict';
import { test } from 'bun:test';
import examples from '../../api/backend-v2-examples.json' with { type: 'json' };
import { createWarehouseReads } from '../../src/adapters/api/warehouse-api.ts';

const sample = examples.schemaCases.find(
  (item) => item.name === 'incomplete movement coverage',
).value;
const R = sample.context.tenantID;
const week = { fromDate: '2026-10-07', throughDate: '2026-10-13' };
const path = `/api/v2/r/${R}/warehouse/analytics/movements?fromDate=2026-10-07&throughDate=2026-10-13&limit=500`;

const client = (...answers) => {
  const calls = [];
  return {
    calls,
    read: async (...args) => {
      calls.push(args);
      return answers.shift();
    },
  };
};
const row = (productID, ordered = '0', writtenOff = '0') => ({
  productID,
  name: productID,
  baseUnit: 'g',
  receivedQuantity: '0',
  orderedQuantity: ordered,
  writtenOffQuantity: writtenOff,
});
const page = (items, nextCursor) => {
  const value = structuredClone(sample);
  value.items = items;
  if (nextCursor !== undefined) value.nextCursor = nextCursor;
  return value;
};
const read = (transport, options = { background: false }) =>
  createWarehouseReads(transport).movementReport(R, week, options);
const refused = (...answers) =>
  assert.rejects(
    read(client(...answers)),
    (error) =>
      error.failure?.code === 'Malformed' &&
      error.failure.outcome === 'unavailable',
  );

test('the movement report asks for the week and keeps exact quantities and coverage', async () => {
  const transport = client(structuredClone(sample));
  const value = await read(transport);
  assert.equal(transport.calls[0][0], path);
  assert.equal(value.context.tenantID, R);
  assert.equal(value.result.items[0].receivedQuantity, '15000');
  assert.equal(value.result.from.iso, '2026-10-07T00:00:00+03:00');
  assert.equal(value.result.coverage.complete, false);
  assert.equal(
    value.result.coverage.availableFrom.iso,
    '2026-10-13T00:00:00+03:00',
  );
  assert.equal('page' in value.result, false);
  assert.equal('nextCursor' in value.result, false);
});

test('the movement report joins every page of one capture', async () => {
  const transport = client(
    page([row('a', '1000')], 'c1'),
    page([row('b', '0', '500')]),
  );
  const value = await read(transport, { background: true });
  assert.deepEqual(
    value.result.items.map((item) => item.productID),
    ['a', 'b'],
  );
  assert.equal(transport.calls[1][0], `${path}&cursor=c1`);
  assert.deepEqual(transport.calls[1][1], { background: true });
});

test('the movement report refuses a changed capture or period between pages', async () => {
  const version = page([row('b')]);
  version.page.stateVersion = '5';
  await refused(page([row('a')], 'c1'), version);
  const period = page([row('b')]);
  period.from = '2026-10-06T00:00:00+03:00';
  await refused(page([row('a')], 'c1'), period);
  const coverage = page([row('b')]);
  coverage.coverage.complete = true;
  await refused(page([row('a')], 'c1'), coverage);
});

test('the movement report refuses repeated products and cursors, empty pages with a cursor, a foreign restaurant and unknown fields', async () => {
  await refused(page([row('a')], 'c1'), page([row('a')]));
  await refused(page([row('a')], 'c1'), page([row('b')], 'c1'), page([]));
  await refused(page([], 'c1'), page([row('b')]));
  await refused(page([row('a'), row('a')]));
  const foreign = page([row('a')]);
  foreign.context.tenantID = '99999999-9999-4999-8999-999999999999';
  await refused(foreign);
  const otherPage = page([row('a')]);
  otherPage.page.tenantID = '99999999-9999-4999-8999-999999999999';
  await refused(otherPage);
  const extra = page([row('a')]);
  extra.items[0].supplier = 'unexpected';
  await refused(extra);
});
