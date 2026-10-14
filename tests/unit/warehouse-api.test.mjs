import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  createWarehouseApi,
  createWarehouseReads,
} from '../../src/adapters/api/warehouse-api.ts';

const R = '33333333-3333-4333-8333-333333333333';
const EPOCH = '44444444-4444-4444-8444-444444444444';
const USER = '11111111-1111-4111-8111-111111111111';
const at = '2026-10-10T15:22:10+03:00';
const settings = { timeZone: 'Europe/Moscow', settingsVersion: '1' };
const context = {
  orgID: '22222222-2222-4222-8222-222222222222',
  tenantID: R,
  runtimeEpoch: EPOCH,
  settings,
  evaluatedAt: at,
  stateVersion: '7',
};
const envelope = (result) => ({ context, result });
const W = `/api/v2/r/${R}/warehouse`;
const fingerprint = 'a'.repeat(64);
const big = '9223372036854775807';

const stockRow = {
  productID: '125',
  name: 'Сыр пармезан',
  baseUnit: 'g',
  availableQuantity: big,
  pendingWriteoffQuantity: '1200000',
  onHandQuantity: '4400000',
  expiringQuantity: '0',
};
// Batch (schema 1) has no applied settings; BatchV2 adds them.
const batchV1 = {
  batchID: 'P-0142',
  deliveryID: 'dlv-1187',
  lineNo: '2',
  productID: '125',
  manufacturedAt: '2026-09-01T10:00:00+03:00',
  shelfLife: { value: '1', unit: 'month' },
  receivedAt: '2026-09-12T10:15:00+03:00',
  expiresAt: '2026-10-10T20:30:00+03:00',
  receivedQuantity: '2000000',
  remainingQuantity: '1200000',
};
const batch = {
  ...batchV1,
  appliedSettings: settings,
  tzdataVersion: 'go1.26.9-embedded',
};
const writeoffResult = {
  batchID: 'P-0142',
  productID: '125',
  writtenOffQuantity: '1200000',
  baseUnit: 'g',
  actorUserID: USER,
  confirmedAt: at,
  eventID: 'writeoff-fact-1',
};

function client(answer) {
  const calls = [];
  return {
    calls,
    read: (path, options) => {
      calls.push(['read', path, options]);
      return Promise.resolve(answer);
    },
    send: (method, path, options) => {
      calls.push(['send', method, path, options]);
      return Promise.resolve(answer);
    },
  };
}

const malformed = (outcome) => (error) =>
  error.failure.code === 'Malformed' && error.failure.outcome === outcome;

test('inventory and expiring batches hit the warehouse paths and keep int64 strings', async () => {
  const stock = client(envelope({ items: [stockRow] }));
  const inventory = await createWarehouseReads(stock).inventory(R, {
    background: true,
  });
  assert.equal(inventory.context.runtimeEpoch, EPOCH);
  assert.deepEqual(inventory.result.items, [stockRow]);
  assert.deepEqual(stock.calls[0], [
    'read',
    `${W}/inventory`,
    { background: true },
  ]);
  const expiring = client(
    envelope({
      evaluatedAt: at,
      stateVersion: '7',
      items: [
        {
          batchID: 'P-0142',
          productID: '125',
          remainingQuantity: '1200000',
          baseUnit: 'g',
          expiresAt: '2026-10-10T20:30:00+03:00',
          remainingSeconds: '18480',
          isExpired: false,
        },
      ],
    }),
  );
  const batches = await createWarehouseReads(expiring).expiringBatches(R, {
    background: false,
  });
  assert.equal(expiring.calls[0][1], `${W}/expiring-batches`);
  assert.equal(batches.result.evaluatedAt.epochMs, Date.parse(at));
  assert.deepEqual(batches.result.items[0], {
    batchID: 'P-0142',
    productID: '125',
    remainingQuantity: '1200000',
    baseUnit: 'g',
    expiresAt: {
      iso: '2026-10-10T20:30:00+03:00',
      epochMs: Date.parse('2026-10-10T20:30:00+03:00'),
    },
    remainingSeconds: '18480',
  });
});

test('pending writeoffs come with context at the top level', async () => {
  const fake = client({
    context,
    items: [
      { batch, status: 'pending_writeoff', appliedSettings: settings },
      { batch, status: 'written_off', appliedSettings: settings },
    ],
  });
  const pending = await createWarehouseReads(fake).pendingWriteoffs(R, {
    background: false,
  });
  assert.equal(fake.calls[0][1], `${W}/pending-writeoffs`);
  assert.equal(pending.context.stateVersion, '7');
  assert.deepEqual(
    pending.result.items.map((item) => item.status),
    ['pending_writeoff', 'written_off'],
  );
  const decoded = pending.result.items[0].batch;
  assert.deepEqual(decoded.shelfLife, { value: '1', unit: 'month' });
  assert.equal(decoded.lineNo, '2');
  assert.equal(decoded.expiresAt.iso, '2026-10-10T20:30:00+03:00');
  assert.equal(decoded.remainingQuantity, '1200000');
  assert.equal('appliedSettings' in decoded, false);
  await assert.rejects(
    createWarehouseReads(
      client({ context, items: [{ batch, status: 'lost' }] }),
    ).pendingWriteoffs(R, { background: false }),
    malformed('unavailable'),
  );
  await assert.rejects(
    createWarehouseReads(client(envelope({ items: [] }))).pendingWriteoffs(R, {
      background: false,
    }),
    malformed('unavailable'),
  );
});

test('the stock report is built from the top-level fields of its body', async () => {
  const body = {
    context,
    page: {
      tenantID: R,
      epoch: EPOCH,
      stateVersion: '7',
      prefixSequence: '1057',
      filterFingerprint: fingerprint,
      settings,
    },
    riskHours: 72,
    riskCutoff: '2026-10-13T15:22:10+03:00',
    items: [{ ...stockRow, expiringQuantity: '1200000' }],
    nextCursor: 'cur/2',
  };
  const fake = client(body);
  const report = await createWarehouseReads(fake).stockReport(
    R,
    { riskHours: 72, settingsVersion: '3', cursor: undefined },
    { background: true },
  );
  assert.deepEqual(fake.calls[0], [
    'read',
    `${W}/analytics/stock?riskHours=72&expectedSettingsVersion=3&limit=500`,
    { background: true },
  ]);
  assert.equal(report.context.tenantID, R);
  assert.equal(report.result.riskHours, 72);
  assert.equal(report.result.riskCutoff.iso, '2026-10-13T15:22:10+03:00');
  assert.equal(report.result.items[0].expiringQuantity, '1200000');
  assert.equal(report.result.nextCursor, 'cur/2');
  const last = client({ ...body, nextCursor: undefined });
  const page = await createWarehouseReads(last).stockReport(
    R,
    { riskHours: 168, settingsVersion: '3', cursor: 'cur/2' },
    { background: false },
  );
  assert.equal(
    last.calls[0][1],
    `${W}/analytics/stock?riskHours=168&expectedSettingsVersion=3&limit=500&cursor=cur%2F2`,
  );
  assert.equal(page.result.nextCursor, undefined);
  for (const broken of [
    { ...body, riskHours: 0 },
    { ...body, riskHours: '72' },
    { ...body, nextCursor: '' },
    { ...body, context: undefined },
  ]) {
    await assert.rejects(
      createWarehouseReads(client(broken)).stockReport(
        R,
        { riskHours: 72, settingsVersion: '3', cursor: undefined },
        { background: false },
      ),
      malformed('unavailable'),
    );
  }
});

const common = (sequence, type, schemaVersion) => ({
  eventID: `evt-${sequence}`,
  streamID: 'inventory',
  sequence,
  schemaVersion,
  commandID: `cmd-${sequence}`,
  commandFingerprint: fingerprint,
  recordedAt: at,
  type,
});
const delivery = {
  deliveryID: 'dlv-1192',
  number: '1192',
  createdAt: at,
  lines: [
    {
      productID: '125',
      manufacturedAt: at,
      shelfLife: { value: '30', unit: 'day' },
      receivedAt: at,
      quantity: '2000000',
    },
    {
      productID: '130',
      manufacturedAt: at,
      shelfLife: { value: '2', unit: 'day' },
      receivedAt: at,
      quantity: '100000',
    },
  ],
};
const record = (event) => ({ tenantID: R, runtimeEpoch: EPOCH, event });
const events = [
  {
    ...common('1', 'ProductRegistered', 1),
    payload: {
      product: { productID: '125', name: 'Сыр пармезан', baseUnit: 'g' },
    },
  },
  {
    ...common('2', 'DishDefined', 1),
    payload: {
      dish: {
        dishID: '207',
        name: 'Ризотто',
        ingredients: [{ productID: '125', quantity: '40000' }],
      },
    },
  },
  {
    ...common('3', 'DeliveryReceived', 1),
    payload: { delivery, batches: [batchV1] },
  },
  {
    ...common('4', 'DeliveryReceived', 2),
    payload: { delivery, batches: [batch, batch] },
  },
  {
    ...common('5', 'OrderPlaced', 1),
    payload: {
      order: {
        orderID: 'ord-20261010-0038',
        proposalID: 'prp-1',
        acceptedPositions: [
          { lineNo: '1', dishID: '207', portions: '2' },
          { lineNo: '2', dishID: '206', portions: '1' },
        ],
        allocations: [
          { productID: '125', batchID: 'P-0142', quantity: '80000' },
        ],
        placedAt: at,
      },
    },
  },
  {
    ...common('6', 'BatchExpired', 1),
    payload: {
      expiry: {
        batchID: 'P-0133',
        productID: '140',
        writtenOffQuantity: '150000',
        reason: 'EXPIRATION',
        expiresAt: at,
        processedAt: at,
      },
    },
  },
  {
    ...common('7', 'BatchExpiryPending', 2),
    tenantID: R,
    runtimeEpoch: EPOCH,
    payload: {
      batchID: 'P-0164',
      productID: '121',
      remainingQuantity: '1000000',
      baseUnit: 'ml',
      expiresAt: at,
    },
  },
  {
    ...common('8', 'BatchWriteoffConfirmed', 2),
    tenantID: R,
    runtimeEpoch: EPOCH,
    payload: writeoffResult,
  },
];

test('history decodes every event schema of the contract', async () => {
  const fake = client(envelope({ events: events.map(record) }));
  const history = await createWarehouseReads(fake).history(R, '1050', {
    background: false,
  });
  assert.equal(fake.calls[0][1], `${W}/history?fromSequence=1050`);
  const recordedAt = { iso: at, epochMs: Date.parse(at) };
  assert.deepEqual(history.result.events, [
    { type: 'ProductRegistered', sequence: '1', recordedAt },
    { type: 'DishDefined', sequence: '2', recordedAt },
    {
      type: 'DeliveryReceived',
      sequence: '3',
      recordedAt,
      number: '1192',
      lines: 2,
      batches: 1,
    },
    {
      type: 'DeliveryReceived',
      sequence: '4',
      recordedAt,
      number: '1192',
      lines: 2,
      batches: 2,
    },
    {
      type: 'OrderPlaced',
      sequence: '5',
      recordedAt,
      orderID: 'ord-20261010-0038',
      positions: 2,
    },
    {
      type: 'BatchExpired',
      sequence: '6',
      recordedAt,
      batchID: 'P-0133',
      productID: '140',
      quantity: '150000',
      baseUnit: undefined,
    },
    {
      type: 'BatchExpiryPending',
      sequence: '7',
      recordedAt,
      batchID: 'P-0164',
      productID: '121',
      quantity: '1000000',
      baseUnit: 'ml',
    },
    {
      type: 'BatchWriteoffConfirmed',
      sequence: '8',
      recordedAt,
      batchID: 'P-0142',
      productID: '125',
      quantity: '1200000',
      baseUnit: 'g',
    },
  ]);
});

test('an unknown event type or schema version fails the whole history read', async () => {
  const unknownType = { ...common('9', 'StockCounted', 1), payload: {} };
  const unknownSchema = { ...events[3], schemaVersion: 3 };
  for (const event of [unknownType, unknownSchema]) {
    await assert.rejects(
      createWarehouseReads(
        client(envelope({ events: [record(events[0]), record(event)] })),
      ).history(R, '0', { background: false }),
      malformed('unavailable'),
    );
  }
});

test('receiveDelivery sends the exact body with civil times in seconds and the epoch', async () => {
  const fake = client(
    envelope({
      deliveryID: 'dlv-1192',
      batchIDs: ['P-0142'],
      batches: [batch],
    }),
  );
  const received = await createWarehouseApi(fake).receiveDelivery(
    R,
    {
      deliveryID: 'dlv-1192',
      number: '1192',
      createdAt: { civil: { localDateTime: '2026-10-10T15:20' } },
      expectedSettingsVersion: '3',
      lines: [
        {
          productID: '125',
          manufacturedAt: {
            civil: { localDateTime: '2026-10-25T02:30', occurrence: 'later' },
          },
          shelfLife: { value: '1', unit: 'month' },
          receivedAt: { civil: { localDateTime: '2026-10-10T15:00:00' } },
          quantity: '2000000',
        },
        {
          productID: '130',
          manufacturedAt: { instant: '2026-10-01T09:00:00+03:00' },
          shelfLife: { value: '2', unit: 'day' },
          receivedAt: { civil: { localDateTime: '2026-10-10T15:00' } },
          quantity: '100000',
        },
      ],
    },
    'cmd-1',
    EPOCH,
  );
  assert.deepEqual(fake.calls[0], [
    'send',
    'POST',
    `${W}/deliveries`,
    {
      body: {
        commandID: 'cmd-1',
        deliveryID: 'dlv-1192',
        number: '1192',
        createdAt: { civil: { localDateTime: '2026-10-10T15:20:00' } },
        expectedSettingsVersion: '3',
        lines: [
          {
            productID: '125',
            manufacturedAt: {
              civil: {
                localDateTime: '2026-10-25T02:30:00',
                occurrence: 'later',
              },
            },
            shelfLife: { value: '1', unit: 'month' },
            receivedAt: { civil: { localDateTime: '2026-10-10T15:00:00' } },
            quantity: '2000000',
          },
          {
            productID: '130',
            manufacturedAt: { instant: '2026-10-01T09:00:00+03:00' },
            shelfLife: { value: '2', unit: 'day' },
            receivedAt: { civil: { localDateTime: '2026-10-10T15:00:00' } },
            quantity: '100000',
          },
        ],
      },
      epoch: EPOCH,
    },
  ]);
  assert.equal(received.result.deliveryID, 'dlv-1192');
  assert.equal(received.result.batches[0].batchID, 'P-0142');
  assert.equal(
    received.result.batches[0].expiresAt.epochMs,
    Date.parse('2026-10-10T20:30:00+03:00'),
  );
  await assert.rejects(
    createWarehouseApi(
      client(envelope({ deliveryID: 'dlv-1192' })),
    ).receiveDelivery(
      R,
      {
        deliveryID: 'dlv-1192',
        number: '1',
        createdAt: { instant: at },
        expectedSettingsVersion: '3',
        lines: [],
      },
      'cmd-2',
      EPOCH,
    ),
    malformed('unknown'),
  );
});

test('confirmWriteoff posts the batch with the epoch and decodes the result', async () => {
  const fake = client(envelope(writeoffResult));
  const result = await createWarehouseApi(fake).confirmWriteoff(
    R,
    'P-0142',
    'cmd-3',
    EPOCH,
  );
  assert.deepEqual(fake.calls[0], [
    'send',
    'POST',
    `${W}/writeoffs`,
    { body: { commandID: 'cmd-3', batchID: 'P-0142' }, epoch: EPOCH },
  ]);
  assert.deepEqual(result.result, {
    ...writeoffResult,
    confirmedAt: { iso: at, epochMs: Date.parse(at) },
  });
  await assert.rejects(
    createWarehouseApi(
      client(envelope({ ...writeoffResult, actorUserID: 'someone' })),
    ).confirmWriteoff(R, 'P-0142', 'cmd-3', EPOCH),
    malformed('unknown'),
  );
});

test('lookupWriteoff reads the command with the original epoch and decodes all four observations', async () => {
  const lookup = (observation) => ({
    context,
    commandID: 'cmd 3',
    batchID: 'P/0142',
    commandFingerprint: fingerprint,
    observation,
  });
  const fake = client(lookup({ state: 'pending', outcome: 'unknown' }));
  assert.deepEqual(
    await createWarehouseApi(fake).lookupWriteoff(R, {
      commandID: 'cmd 3',
      batchID: 'P/0142',
      epoch: EPOCH,
    }),
    { state: 'pending' },
  );
  assert.deepEqual(fake.calls[0], [
    'read',
    `${W}/writeoffs/commands?commandID=cmd%203&batchID=P%2F0142`,
    { background: false, epoch: EPOCH },
  ]);
  const cases = [
    [
      {
        state: 'committed',
        outcome: 'committed',
        result: envelope(writeoffResult),
      },
      {
        state: 'committed',
        result: {
          ...writeoffResult,
          confirmedAt: { iso: at, epochMs: Date.parse(at) },
        },
      },
    ],
    [{ state: 'unseen', outcome: 'unknown' }, { state: 'unseen' }],
    [
      {
        state: 'rejected',
        outcome: 'not_committed',
        error: {
          code: 'NotPendingWriteoff',
          outcome: 'not_committed',
          message: 'not pending',
          retryable: false,
        },
      },
      { state: 'rejected', code: 'NotPendingWriteoff' },
    ],
  ];
  for (const [observation, expected] of cases) {
    assert.deepEqual(
      await createWarehouseApi(client(lookup(observation))).lookupWriteoff(R, {
        commandID: 'cmd 3',
        batchID: 'P/0142',
        epoch: EPOCH,
      }),
      expected,
    );
  }
  await assert.rejects(
    createWarehouseApi(
      client(lookup({ state: 'maybe', outcome: 'unknown' })),
    ).lookupWriteoff(R, { commandID: 'c', batchID: 'b', epoch: EPOCH }),
    malformed('unavailable'),
  );
});
