import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  analyticsWeek,
  coverageRows,
  flowRows,
  nextRow,
  percentText,
  riskChart,
  roundTenth,
  segmentShares,
  shareTenths,
} from '../../src/domain/analytics.ts';

const MAX = 9223372036854775807n;

test('roundTenth rounds half up and drops a zero fraction', () => {
  assert.equal(roundTenth('2.142857'), '2.1');
  assert.equal(roundTenth('2.150000'), '2.2');
  assert.equal(roundTenth('2.960000'), '3');
  assert.equal(roundTenth('9.950000'), '10');
  assert.equal(roundTenth('1428.571429'), '1428.6');
  assert.equal(roundTenth('0.040000'), '0');
  assert.equal(roundTenth('0.000000'), '0');
  assert.equal(roundTenth('7'), '7');
});

test('shares are exact tenths of a percent rounded down, even near int64', () => {
  assert.equal(shareTenths(1n, 3n), 333n);
  assert.equal(shareTenths(5n, 0n), 0n);
  assert.equal(shareTenths(MAX - 1n, MAX), 999n);
  assert.equal(percentText(333n), '33 %');
  assert.equal(percentText(1000n), '100 %');
  assert.equal(percentText(5n), '<1 %');
  assert.equal(percentText(0n), '0 %');
  assert.deepEqual(segmentShares([1n, 1n, 2n]), [25, 25, 50]);
  assert.deepEqual(segmentShares([0n, 0n]), [0, 0]);
  assert.deepEqual(segmentShares([MAX, MAX]), [50, 50]);
});

const supply = (productID, productName, coverageDays, blockedDishIDs = []) => ({
  productID,
  productName,
  coverageDays,
  blockedDishIDs,
});

test('coverage rows: dish blockers first, then the shortest cover; the scale clamps', () => {
  const rows = coverageRows(
    [
      supply('a', 'Мука', '2.500000'),
      supply('b', 'Молоко', null, ['d1']),
      supply('c', 'Сыр', '12.000000', ['d1', 'd2']),
      supply('d', 'Масло', '0.500000'),
      supply('e2', 'Мука', '2.500000'),
    ],
    7,
  );
  assert.deepEqual(
    rows.map((row) => row.item.productID),
    ['c', 'b', 'd', 'a', 'e2'],
  );
  assert.deepEqual(
    rows.map((row) => row.reason),
    ['blocking', 'blocking', 'low', 'low', 'low'],
  );
  assert.equal(rows[0].fill, 100);
  assert.equal(rows[1].fill, undefined);
  assert.equal(rows[2].fill, 7.142);
  assert.deepEqual(coverageRows([], 7), []);
});

const stock = (productID, name, available, pending, expiring) => ({
  productID,
  name,
  baseUnit: 'g',
  availableQuantity: available,
  pendingWriteoffQuantity: pending,
  onHandQuantity: String(BigInt(available) + BigInt(pending)),
  expiringQuantity: expiring,
});

test('risk rows keep products at risk by exact share; calm and empty ones are counted', () => {
  const chart = riskChart([
    stock('a', 'Мука', '10000', '0', '0'),
    stock('b', 'Сыр', '3000', '1000', '1000'),
    stock('c', 'Молоко', '0', '500', '0'),
    stock('d', 'Масло', '0', '0', '0'),
    stock('e', 'Яйца', '2000', '0', '1000'),
  ]);
  assert.deepEqual(
    chart.rows.map((row) => row.item.productID),
    ['c', 'b', 'e'],
  );
  assert.equal(chart.calm, 1);
  assert.equal(chart.stocked, 4);
  const [all, half] = chart.rows;
  assert.deepEqual(
    [all.safe, all.expiring, all.pending, all.riskTenths],
    [0n, 0n, 500n, 1000n],
  );
  assert.deepEqual(
    [half.safe, half.expiring, half.pending, half.riskTenths],
    [2000n, 1000n, 1000n, 500n],
  );
  assert.deepEqual(riskChart([]), { rows: [], calm: 0, stocked: 0 });
});

const move = (productID, name, ordered, writtenOff) => ({
  productID,
  name,
  baseUnit: 'g',
  receivedQuantity: '5000',
  orderedQuantity: ordered,
  writtenOffQuantity: writtenOff,
});

test('flow rows: only products that left the warehouse, the largest write-off share first', () => {
  const rows = flowRows([
    move('a', 'Мука', '9000', '1000'),
    move('b', 'Сыр', '0', '0'),
    move('c', 'Молоко', '0', '300'),
    move('d', 'Масло', '1', '0'),
  ]);
  assert.deepEqual(
    rows.map((row) => row.item.productID),
    ['c', 'a', 'd'],
  );
  assert.deepEqual(
    rows.map((row) => row.writtenOffTenths),
    [1000n, 100n, 0n],
  );
});

test('the week ends today in the restaurant zone', () => {
  const week = (iso, zone) => analyticsWeek(Date.parse(iso), zone);
  assert.deepEqual(week('2026-10-14T07:00:00Z', 'Europe/Moscow'), {
    fromDate: '2026-10-08',
    throughDate: '2026-10-14',
  });
  assert.deepEqual(week('2026-10-14T21:30:00Z', 'Europe/Moscow'), {
    fromDate: '2026-10-09',
    throughDate: '2026-10-15',
  });
  assert.deepEqual(week('2026-10-14T15:00:00Z', 'Asia/Vladivostok'), {
    fromDate: '2026-10-09',
    throughDate: '2026-10-15',
  });
  assert.deepEqual(week('2026-03-08T05:30:00Z', 'America/New_York'), {
    fromDate: '2026-03-02',
    throughDate: '2026-03-08',
  });
  assert.deepEqual(week('2027-01-03T09:00:00Z', 'Europe/Moscow'), {
    fromDate: '2026-12-28',
    throughDate: '2027-01-03',
  });
  assert.deepEqual(week('2028-03-05T09:00:00Z', 'Europe/Moscow'), {
    fromDate: '2028-02-28',
    throughDate: '2028-03-05',
  });
});

test('arrows move the active row within the chart', () => {
  assert.equal(nextRow(0, 'ArrowDown', 3), 1);
  assert.equal(nextRow(2, 'ArrowDown', 3), 2);
  assert.equal(nextRow(0, 'ArrowUp', 3), 0);
  assert.equal(nextRow(1, 'ArrowUp', 3), 0);
  assert.equal(nextRow(2, 'Home', 3), 0);
  assert.equal(nextRow(0, 'End', 3), 2);
  assert.equal(nextRow(0, 'ArrowDown', 1), 0);
  assert.equal(nextRow(0, 'Tab', 3), undefined);
  assert.equal(nextRow(0, 'ArrowDown', 0), undefined);
});
