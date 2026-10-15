import assert from 'node:assert/strict';
import { test } from 'bun:test';
import examples from '../../api/completion-v1-examples.json' with { type: 'json' };
import batchExample from '../fixtures/ua1-product-batches.json' with { type: 'json' };
import { createWarehouseReads } from '../../src/adapters/api/warehouse-api.ts';

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

test('supply uses the real scoped read and preserves exact quantities and partial history', async () => {
  const value = structuredClone(examples.examples[0].value);
  const transport = client(value);
  const result = await createWarehouseReads(transport).supplySuggestions(
    value.context.tenantID,
    { background: true },
  );
  assert.equal(
    transport.calls[0][0],
    `/api/v2/r/${value.context.tenantID}/warehouse/supply-suggestions`,
  );
  assert.equal(result.result.items[0].suggestedQuantity, '5000');
  assert.equal(result.result.items[1].coverageDays, null);
  assert.equal(result.result.coverage.complete, false);
});

test('supply refuses wrong scope/capture, unknown fields and non-finite decimals', async () => {
  for (const mutate of [
    (v) => {
      v.result.items[0].averageDailyBaseUnits = 'NaN';
    },
    (v) => {
      v.result.items[0].supplier = 'unexpected';
    },
    (v) => {
      v.result.items[1].coverageDays = '0.000000';
    },
    (v) => {
      v.result.stateVersion = '43';
    },
    (v) => {
      v.result.coverage.complete = true;
    },
    (v) => {
      v.context.tenantID = '88888888-8888-4888-8888-888888888888';
    },
  ]) {
    const value = structuredClone(examples.examples[0].value);
    const id = value.context.tenantID;
    mutate(value);
    await assert.rejects(
      createWarehouseReads(client(value)).supplySuggestions(id, {
        background: false,
      }),
      (error) =>
        error.failure.code === 'Malformed' &&
        error.failure.outcome === 'unavailable',
    );
  }
});

test('batch pagination preserves a coherent capture and refuses cursor, scope or row drift', async () => {
  const first = structuredClone(batchExample);
  const second = structuredClone(batchExample);
  const row = structuredClone(first.result.items[0]);
  first.result.items = [row];
  first.result.nextCursor = 'captured-next';
  row.batch.batchID = 'first';
  second.result.items = [
    {
      ...structuredClone(row),
      batch: {
        ...structuredClone(row.batch),
        batchID: 'second',
        expiresAt: '2026-11-15T12:00:00+03:00',
      },
    },
  ];
  delete second.result.nextCursor;
  const id = first.context.tenantID;
  const transport = client(first, second);
  const result = await createWarehouseReads(transport).productBatches(
    id,
    first.result.productID,
    { background: false },
  );
  assert.equal(result.result.items.length, 2);
  assert.match(transport.calls[1][0], /cursor=captured-next$/);
  for (const mutate of [
    (v) => {
      v.result.page.stateVersion = '99';
    },
    (v) => {
      v.result.page.filterFingerprint = 'b'.repeat(64);
    },
    (v) => {
      v.result.items[0].batch.batchID = 'first';
    },
    (v) => {
      v.result.nextCursor = 'captured-next';
    },
  ]) {
    const changed = structuredClone(second);
    mutate(changed);
    await assert.rejects(
      createWarehouseReads(client(first, changed)).productBatches(
        id,
        first.result.productID,
        { background: false },
      ),
      (error) => error.failure.code === 'Malformed',
    );
  }
});

test('history captures a fixed recorded prefix and retains original delivery expiry', async () => {
  const context = structuredClone(batchExample.context);
  context.stateVersion = '3';
  const batch = structuredClone(batchExample.result.items[0].batch);
  batch.remainingQuantity = batch.receivedQuantity;
  const event = (sequence, type, payload, schemaVersion = 1) => ({
    tenantID: context.tenantID,
    runtimeEpoch: context.runtimeEpoch,
    event: {
      eventID: `event-${sequence}`,
      streamID: 'inventory',
      sequence: String(sequence),
      schemaVersion,
      commandID: `command-${sequence}`,
      commandFingerprint: 'a'.repeat(64),
      recordedAt: context.evaluatedAt,
      type,
      payload,
    },
  });
  const product = event(1, 'ProductRegistered', {
    product: { productID: batch.productID, name: 'Rice', baseUnit: 'g' },
  });
  const receipt = event(
    2,
    'DeliveryReceived',
    {
      delivery: {
        deliveryID: batch.deliveryID,
        number: '1',
        createdAt: batch.receivedAt,
        lines: [
          {
            productID: batch.productID,
            manufacturedAt: batch.manufacturedAt,
            shelfLife: batch.shelfLife,
            receivedAt: batch.receivedAt,
            quantity: batch.receivedQuantity,
          },
        ],
      },
      batches: [batch],
    },
    2,
  );
  const sale = event(3, 'OrderPlaced', {
    order: {
      orderID: 'order',
      proposalID: 'proposal',
      placedAt: context.evaluatedAt,
      acceptedPositions: [{ lineNo: '1', dishID: 'dish', portions: '1' }],
      allocations: [
        {
          productID: batch.productID,
          batchID: batch.batchID,
          quantity: '1000',
        },
      ],
    },
  });
  const first = { context, result: { events: [product, receipt] } };
  const second = { context, result: { events: [sale] } };
  const transport = client(first, second);
  const result = await createWarehouseReads(transport).history(
    context.tenantID,
    { background: false },
  );
  assert.equal(result.result.events.length, 3);
  assert.equal(
    result.result.events[1].fact.batches[0].expiresAt.iso,
    batch.expiresAt,
  );
  assert.equal(
    result.result.events[2].fact.order.allocations[0].batchID,
    batch.batchID,
  );
  assert.match(transport.calls[1][0], /fromSequence=2$/);
  for (const mutate of [
    (v) => {
      v.context = {
        ...v.context,
        runtimeEpoch: '88888888-8888-4888-8888-888888888888',
      };
    },
    (v) => {
      v.result.events[0].event.sequence = '4';
    },
    (v) => {
      v.result.events = [];
    },
  ]) {
    const changed = structuredClone(second);
    mutate(changed);
    await assert.rejects(
      createWarehouseReads(client(first, changed)).history(context.tenantID, {
        background: false,
      }),
      (error) => error.failure.code === 'Malformed',
    );
  }
});
