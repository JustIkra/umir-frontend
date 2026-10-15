import assert from 'node:assert/strict';
import { test } from 'bun:test';
import fin from '../../api/completion-v1-examples.json' with { type: 'json' };
import {
  createCatalogApi,
  createOrderApi,
  createRestaurantReads,
} from '../../src/adapters/api/restaurant-api.ts';

const R = '33333333-3333-4333-8333-333333333333';
const EPOCH = '44444444-4444-4444-8444-444444444444';
const WEPOCH = '55555555-5555-4555-8555-555555555555';
const at = '2026-10-14T10:00:00+03:00';
const context = (serving = false) => ({
  orgID: '22222222-2222-4222-8222-222222222222',
  tenantID: R,
  runtimeEpoch: EPOCH,
  ...(serving ? { warehouseEpoch: WEPOCH } : {}),
  settings: { timeZone: 'Europe/Moscow', settingsVersion: '1' },
  evaluatedAt: at,
  stateVersion: '7',
});
const envelope = (result, serving = false) => ({
  context: context(serving),
  result,
});
const products = {
  evaluatedAt: at,
  stateVersion: '7',
  items: [{ productID: '130', name: 'Филе лосося', baseUnit: 'g' }],
};
const dish = {
  dishID: '206',
  name: 'Паста с лососем и шпинатом',
  ingredients: [{ productID: '130', quantity: '120000', baseUnit: 'g' }],
};
const proposal = {
  proposalID: 'prp-1',
  evaluatedAt: at,
  stateVersion: '9',
  requestedPositions: [{ lineNo: '1', dishID: '206', portions: '3' }],
  acceptedPositions: [{ lineNo: '1', dishID: '206', portions: '1' }],
  changes: [
    {
      lineNo: '1',
      dishID: '206',
      requestedPortions: '3',
      acceptedPortions: '1',
      deficits: [
        {
          productID: '130',
          requiredQuantity: '360000',
          availableQuantity: '220000',
        },
      ],
    },
  ],
  warehouseEpoch: WEPOCH,
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

test('catalog reads hit the warehouse paths and decode the envelope', async () => {
  const fake = client(envelope(products));
  const reads = createRestaurantReads(fake);
  const result = await reads.products(R, { background: true });
  assert.equal(result.context.runtimeEpoch, EPOCH);
  assert.equal(result.result.items[0].baseUnit, 'g');
  assert.deepEqual(fake.calls[0], [
    'read',
    `/api/v2/r/${R}/warehouse/products`,
    { background: true },
  ]);
  const detail = client(envelope({ evaluatedAt: at, stateVersion: '7', dish }));
  await createRestaurantReads(detail).dish(R, 'a/b 1', { background: false });
  assert.equal(
    detail.calls[0][1],
    `/api/v2/r/${R}/warehouse/dish?dishID=a%2Fb%201`,
  );
  const suggestion = client(
    envelope({ kind: 'product', suggestedID: '133', reserved: false }),
  );
  const suggested = await createRestaurantReads(suggestion).suggestID(
    R,
    'product',
    {
      background: false,
    },
  );
  assert.equal(suggested.result.suggestedID, '133');
  assert.equal(
    suggestion.calls[0][1],
    `/api/v2/r/${R}/warehouse/id-suggestions?kind=product`,
  );
});

test('serving reads keep the warehouse epoch of the context', async () => {
  const menu = client(
    envelope(
      {
        evaluatedAt: at,
        stateVersion: '3',
        dishes: [{ dishID: '206', name: 'Паста' }],
      },
      true,
    ),
  );
  const result = await createRestaurantReads(menu).menu(R, {
    background: false,
  });
  assert.equal(result.context.warehouseEpoch, WEPOCH);
  assert.equal(menu.calls[0][1], `/api/v2/r/${R}/serving/menu`);
  const stop = client(
    envelope(
      {
        evaluatedAt: at,
        stateVersion: '3',
        dishes: [
          {
            dishID: '205',
            name: 'Паста карбонара',
            deficits: [
              {
                productID: '121',
                requiredQuantity: '50000',
                availableQuantity: '20000',
              },
            ],
          },
        ],
      },
      true,
    ),
  );
  const list = await createRestaurantReads(stop).stopList(R, {
    background: false,
  });
  assert.equal(list.result.dishes[0].deficits[0].availableQuantity, '20000');
  const recs = client(structuredClone(fin.examples[2].value));
  const ranked = await createRestaurantReads(recs).recommendations(R, {
    background: true,
  });
  assert.equal(
    ranked.result.items[0].reasons[0].batchID,
    fin.examples[2].value.result.items[0].reasons[0].batchID,
  );
  assert.equal(recs.calls[0][1], `/api/v2/r/${R}/serving/recommendations`);
});

test('a malformed read is unavailable', async () => {
  await assert.rejects(
    createRestaurantReads(client(envelope({ items: [] }))).products(R, {
      background: false,
    }),
    (error) =>
      error.failure.code === 'Malformed' &&
      error.failure.outcome === 'unavailable',
  );
  await assert.rejects(
    createRestaurantReads(
      client(
        envelope({
          ...products,
          items: [{ productID: '1', name: 'x', baseUnit: 'kg' }],
        }),
      ),
    ).products(R, { background: false }),
    (error) => error.failure.code === 'Malformed',
  );
});

test('catalog commands send the exact body with the warehouse epoch', async () => {
  const fake = client(
    envelope({ productID: '133', name: 'Сыр бри', baseUnit: 'g' }),
  );
  const created = await createCatalogApi(fake).registerProduct(
    R,
    { productID: '133', name: 'Сыр бри', baseUnit: 'g' },
    'cmd-1',
    EPOCH,
  );
  assert.equal(created.result.productID, '133');
  assert.deepEqual(fake.calls[0], [
    'send',
    'POST',
    `/api/v2/r/${R}/warehouse/products`,
    {
      body: {
        commandID: 'cmd-1',
        productID: '133',
        name: 'Сыр бри',
        baseUnit: 'g',
      },
      epoch: EPOCH,
    },
  ]);
  const dishes = client(envelope(dish));
  await createCatalogApi(dishes).defineDish(
    R,
    { dishID: '206', name: dish.name, ingredients: dish.ingredients },
    'cmd-2',
    EPOCH,
  );
  assert.deepEqual(dishes.calls[0][3].body, {
    commandID: 'cmd-2',
    dishID: '206',
    name: dish.name,
    ingredients: [{ productID: '130', quantity: '120000', baseUnit: 'g' }],
  });
  await assert.rejects(
    createCatalogApi(client({})).registerProduct(
      R,
      { productID: '1', name: 'x', baseUnit: 'g' },
      'c',
      EPOCH,
    ),
    (error) => error.failure.outcome === 'unknown',
  );
});

test('prepare posts the positions with the serving epoch and no commandID', async () => {
  const fake = client(envelope(proposal, true));
  const result = await createOrderApi(fake).prepare(
    R,
    [{ dishID: '206', portions: '3' }],
    EPOCH,
  );
  assert.equal(result.result.changes[0].deficits[0].requiredQuantity, '360000');
  assert.deepEqual(fake.calls[0], [
    'send',
    'POST',
    `/api/v2/r/${R}/serving/order-proposals`,
    { body: { positions: [{ dishID: '206', portions: '3' }] }, epoch: EPOCH },
  ]);
});

test('confirm and resolve decode all five results', async () => {
  const order = {
    orderID: 'ord-1',
    proposalID: 'prp-1',
    acceptedPositions: proposal.acceptedPositions,
    allocations: [{ productID: '130', batchID: 'P-0147', quantity: '120000' }],
    placedAt: at,
  };
  const results = [
    { kind: 'OrderConfirmed', order },
    { kind: 'RequiresConfirmation', proposal },
    { kind: 'EmptyOrder' },
    { kind: 'ProposalSuperseded', supersededBy: 'prp-2' },
    { kind: 'ConfirmationPending' },
  ];
  for (const result of results) {
    const fake = client(envelope(result, true));
    const decoded = await createOrderApi(fake).confirm(
      R,
      'prp-1',
      'cmd-9',
      EPOCH,
    );
    assert.equal(decoded.result.kind, result.kind);
  }
  const fake = client(envelope({ kind: 'OrderConfirmed', order }, true));
  const confirmed = await createOrderApi(fake).confirm(
    R,
    'prp-1',
    'cmd-9',
    EPOCH,
  );
  assert.equal(confirmed.result.order.placedAt.epochMs, Date.parse(at));
  assert.deepEqual(fake.calls[0], [
    'send',
    'POST',
    `/api/v2/r/${R}/serving/order-confirmations`,
    { body: { commandID: 'cmd-9', proposalID: 'prp-1' }, epoch: EPOCH },
  ]);
  const resolve = client(envelope({ kind: 'ConfirmationPending' }, true));
  await createOrderApi(resolve).resolve(R, {
    commandID: 'cmd 9',
    proposalID: 'prp/1',
    runtimeEpoch: EPOCH,
  });
  assert.deepEqual(resolve.calls[0], [
    'read',
    `/api/v2/r/${R}/serving/order-confirmations/resolve?commandID=cmd%209&proposalID=prp%2F1&runtimeEpoch=${EPOCH}`,
    { background: false },
  ]);
});

test('an unknown confirm kind is malformed and unknown', async () => {
  await assert.rejects(
    createOrderApi(client(envelope({ kind: 'OrderMaybe' }, true))).confirm(
      R,
      'p',
      'c',
      EPOCH,
    ),
    (error) =>
      error.failure.code === 'Malformed' && error.failure.outcome === 'unknown',
  );
});
