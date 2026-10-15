import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { recordedAllocations } from '../../src/application/recorded-allocations.ts';
const expiry = { iso: '2026-10-20T12:00:00+03:00', epochMs: 1792486800000 };
const order = {
  allocations: [
    { productID: 'P', batchID: 'B2', quantity: '1000' },
    { productID: 'P', batchID: 'B1', quantity: '2000' },
    { productID: 'Q', batchID: 'B3', quantity: '3000' },
  ],
};
const history = {
  context: { runtimeEpoch: 'epoch' },
  result: {
    events: [
      {
        fact: {
          kind: 'receipt',
          batches: [
            { productID: 'P', batchID: 'B1', expiresAt: expiry },
            { productID: 'OTHER', batchID: 'B3', expiresAt: expiry },
          ],
        },
      },
    ],
  },
};
test('historical allocations keep backend order and only join recorded receipt expiry for the same product', () => {
  const rows = recordedAllocations(order, 'epoch', history);
  assert.deepEqual(
    rows.map(({ batchID, quantity }) => ({ batchID, quantity })),
    order.allocations.map(({ batchID, quantity }) => ({ batchID, quantity })),
  );
  assert.equal(rows[0].expiresAt, undefined);
  assert.equal(rows[1].expiresAt, expiry);
  assert.equal(rows[2].expiresAt, undefined);
});
test('a changed or missing epoch never joins a reused batch id from current history', () => {
  for (const epoch of ['new-epoch', undefined])
    assert.ok(
      recordedAllocations(order, epoch, history).every(
        (row) => row.expiresAt === undefined,
      ),
    );
  assert.ok(
    recordedAllocations(order, 'epoch', undefined).every(
      (row) => row.expiresAt === undefined,
    ),
  );
});
