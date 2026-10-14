import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  analyticsFigures,
  attemptOpen,
  batchTile,
  boundaryText,
  catalogFigures,
  hoursLeftText,
  recommendationTile,
  reportTile,
  stopTile,
  tileStamp,
  tileWindows,
  writeoffFigures,
} from '../../src/presentation/overview/overview-rows.ts';
import { localFailure } from '../../src/application/api.ts';
import {
  R,
  failedRead,
  hrefs,
  instantOf,
  loaded,
  orderSnapshot,
  readContext,
  readyAccess,
  renderRoute,
  sampleRestaurant,
  text,
} from './support/render-route.mjs';

const MSK = 'Europe/Moscow';
// formatQuantity groups thousands with a no-break space; text() of a page
// turns it into a plain one.
const nbsp = '\u00a0';
const at = instantOf('2026-10-14T10:00:00+03:00');
const later = (seconds) =>
  instantOf(new Date(at.epochMs + seconds * 1000).toISOString());

const productItems = [
  { productID: 'parmesan', name: 'Сыр пармезан', baseUnit: 'g' },
  { productID: 'arugula', name: 'Руккола', baseUnit: 'g' },
  { productID: 'cream', name: 'Сливки 33%', baseUnit: 'ml' },
  { productID: 'tomato', name: 'Томаты черри', baseUnit: 'g' },
];
const names = new Map(productItems.map((p) => [p.productID, p.name]));
const servingNames = new Map(
  [
    ...productItems,
    { productID: 'chicken', name: 'Куриное филе', baseUnit: 'g' },
  ].map((p) => [p.productID, p]),
);

const batch = (batchID, productID, remainingQuantity, baseUnit, seconds) => ({
  batchID,
  productID,
  remainingQuantity,
  baseUnit,
  expiresAt: later(seconds),
  remainingSeconds: String(seconds),
});
// Four batches expire within 24 h; the fifth is in the 48 h window only.
const expiring = {
  evaluatedAt: at,
  stateVersion: '7',
  items: [
    batch('B-0139', 'cream', '20000', 'ml', 50_280),
    batch('B-0142', 'parmesan', '1200000', 'g', 21_480),
    batch('B-0171', 'parmesan', '2000000', 'g', 100_000),
    batch('B-0150', 'arugula', '450000', 'g', 21_540),
    batch('B-0151', 'tomato', '40000', 'g', 80_000),
  ],
};

const stockRow = (productID, name, baseUnit, available, extra = {}) => ({
  productID,
  name,
  baseUnit,
  availableQuantity: available,
  pendingWriteoffQuantity: '0',
  onHandQuantity: available,
  expiringQuantity: '0',
  ...extra,
});
const report = {
  context: readContext,
  result: {
    riskHours: 72,
    riskCutoff: instantOf('2026-10-17T10:00:00+03:00'),
    items: [
      stockRow('tomato', 'Томаты черри', 'g', '1540000', {
        expiringQuantity: '40000',
      }),
      stockRow('flour', 'Мука пшеничная', 'g', '250000125'),
      stockRow('arugula', 'Руккола', 'g', '450000', {
        expiringQuantity: '450000',
      }),
      stockRow('parmesan', 'Сыр пармезан', 'g', '3200000', {
        expiringQuantity: '1200000',
      }),
      stockRow('avocado', 'Авокадо', 'pcs', '6000', {
        expiringQuantity: '6000',
      }),
    ],
    nextCursor: undefined,
  },
};

const batchV2 = (batchID, productID, quantity) => ({
  batchID,
  deliveryID: 'd-1190',
  lineNo: '1',
  productID,
  manufacturedAt: instantOf('2026-10-01T08:00:00+03:00'),
  shelfLife: { value: '5', unit: 'day' },
  receivedAt: instantOf('2026-10-01T09:00:00+03:00'),
  expiresAt: instantOf('2026-10-06T08:00:00+03:00'),
  receivedQuantity: quantity,
  remainingQuantity: quantity,
});
const pending = {
  items: [
    {
      batch: batchV2('B-0164', 'cream', '1000000'),
      status: 'pending_writeoff',
    },
    { batch: batchV2('B-0165', 'cream', '500000'), status: 'pending_writeoff' },
    { batch: batchV2('B-0133', 'arugula', '150000'), status: 'written_off' },
  ],
};
const inventory = {
  items: [
    stockRow('parmesan', 'Сыр пармезан', 'g', '3200000'),
    stockRow('arugula', 'Руккола', 'g', '450000'),
    stockRow('cream', 'Сливки 33%', 'ml', '0', {
      pendingWriteoffQuantity: '1500000',
      onHandQuantity: '1500000',
    }),
  ],
};
const stopList = {
  evaluatedAt: at,
  stateVersion: '7',
  dishes: [
    {
      dishID: '203',
      name: 'Паста карбонара',
      deficits: [
        {
          productID: 'cream',
          requiredQuantity: '50000',
          availableQuantity: '20000',
        },
      ],
    },
    {
      dishID: '207',
      name: 'Цезарь с курицей',
      deficits: [
        {
          productID: 'chicken',
          requiredQuantity: '120000',
          availableQuantity: '0',
        },
      ],
    },
  ],
};
const reason = (productID, productName, batchID, perPortion, seconds) => ({
  productID,
  productName,
  batchID,
  quantityPerPortion: perPortion,
  baseUnit: 'g',
  expiresAt: later(seconds),
});
const recommendations = {
  evaluatedAt: at,
  stateVersion: '7',
  items: [
    {
      dishID: '206',
      dishName: 'Ризотто с пармезаном и рукколой',
      priorityExpiresAt: later(21_480),
      reasons: [
        reason('parmesan', 'Сыр пармезан', 'B-0142', '40000', 21_480),
        reason('arugula', 'Руккола', 'B-0150', '30000', 21_540),
      ],
    },
  ],
};

const data = {
  products: loaded({ evaluatedAt: at, stateVersion: '7', items: productItems }),
  dishCatalog: loaded({
    evaluatedAt: at,
    stateVersion: '7',
    items: [
      { dishID: '203', name: 'Паста карбонара', ingredients: [] },
      {
        dishID: '206',
        name: 'Ризотто с пармезаном и рукколой',
        ingredients: [],
      },
    ],
  }),
  expiringBatches: loaded(expiring),
  pendingWriteoffs: loaded(pending),
  inventory: loaded(inventory),
  stopList: loaded(stopList),
  recommendations: loaded(recommendations),
  servingProducts: loaded({
    evaluatedAt: at,
    stateVersion: '7',
    items: [...servingNames.values()],
  }),
};

const tileNames = [
  'Склад',
  'Меню и рекомендации',
  'Заказы',
  'Справочники',
  'Под списание',
  'Аналитика',
];
const tiles = (html) =>
  [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)]
    .map((match) => text(match[1]))
    .filter((name) => tileNames.includes(name));
// The text of one tile: from its <section> to the next one.
const tile = (html, name) => {
  const part = html
    .split('<section')
    .find((chunk) => chunk.includes(`>${name}</h2>`));
  assert.ok(part, `no tile «${name}»`);
  return { html: part, text: text(`<section${part}`) };
};
const overview = (options = {}) =>
  renderRoute(`/app/r/${R}`, { data, ...options });
const asRole = (roles) =>
  overview({ access: readyAccess([sampleRestaurant({ roles })]) });

test('overview tiles follow the role permissions', async () => {
  const waiter = await asRole(['Waiter']);
  assert.deepEqual(tiles(waiter), ['Меню и рекомендации', 'Заказы']);
  assert.ok(text(waiter).includes('Собрать заказ'));
  assert.ok(!tile(waiter, 'Заказы').text.includes('История продаж'));
  for (const path of ['/warehouse/delivery', '/catalog/products/new'])
    assert.ok(!hrefs(waiter).includes(`/app/r/${R}${path}`), path);

  const warehouse = await asRole(['Warehouse']);
  assert.deepEqual(tiles(warehouse), [
    'Склад',
    'Меню и рекомендации',
    'Справочники',
    'Под списание',
    'Аналитика',
  ]);
  assert.ok(!text(warehouse).includes('Собрать заказ'));

  const admin = await asRole(['Admin']);
  assert.deepEqual(tiles(admin), tileNames);
  assert.ok(text(admin).includes('Собрать заказ'));
  assert.ok(tile(admin, 'Заказы').text.includes('История продаж'));
});

test('the header names the organization and the restaurant from access and today in their zone', async () => {
  const html = await overview({
    access: readyAccess([
      sampleRestaurant({ orgName: 'Север Фуд', name: 'На Литейном' }),
    ]),
  });
  const page = text(html);
  assert.ok(page.includes('Север Фуд · На Литейном'));
  // NOW is 2026-10-14T07:00Z: Wednesday 10:00 in Moscow.
  assert.ok(page.includes('Среда, 14 октября 2026 · Москва, UTC+3'));
  assert.ok(!page.includes('Суббота, 10 октября'));
});

test('unverified access keeps the tiles of the last ready answer', async () => {
  const failure = localFailure('NotFound', 'not_committed', 404);
  const html = await overview({
    access: {
      status: 'unverified',
      failure,
      previous: readyAccess().organizations,
    },
  });
  assert.deepEqual(tiles(html), tileNames);
  assert.ok(text(html).includes('Собрать заказ'));
  assert.ok(text(html).includes('Восток Фуд · На Пушкинской'));
});

test('unverified access with no earlier answer says so instead of an empty header', async () => {
  const failure = localFailure('NotFound', 'not_committed', 404);
  const html = await overview({ access: { status: 'unverified', failure } });
  const page = text(html);
  assert.ok(page.includes('Доступ не проверен'));
  assert.ok(page.includes('Повторить проверку'));
  assert.deepEqual(tiles(html), []);
});

test('the warehouse tile shows the batches of the 24 h window', async () => {
  const shown = tile(await overview(), 'Склад').text;
  for (const part of [
    'оценка 10:00',
    '24 ч',
    '3 дня',
    '7 дней',
    'Граница: 15.10.2026, 10:00 (Москва, UTC+3)',
    '4 партии',
    'с остатком и сроком до выбранной границы',
    'B-0142 · остаток 1 200 г',
    'Истекает через 6 ч',
    'Ещё 1 партия в окне',
    'Принять поставку',
    'Все партии и остатки',
  ])
    assert.ok(shown.includes(part), `no «${part}»`);
});

test('the other tiles show their figures and texts', async () => {
  const html = await overview();
  const menu = tile(html, 'Меню и рекомендации').text;
  for (const part of [
    '2 блюда недоступны',
    'Не хватает на порцию: сливки 33% — нужно 50 мл, есть 20 мл',
    'Не хватает на порцию: куриное филе — нужно 120 г, есть 0 г',
    '1. Ризотто с пармезаном и рукколой',
    'Обе причины:',
    'Сыр пармезан · партия B-0142',
    '40 г на порцию',
  ])
    assert.ok(menu.includes(part), `menu: no «${part}»`);
  const orders = tile(html, 'Заказы').text;
  assert.ok(orders.includes('Подготовка не резервирует остатки.'));
  assert.ok(!orders.includes('Результат оформления неизвестен'));
  assert.ok(
    tile(html, 'Справочники').text.includes(
      'Блюда из стоп-листа по-прежнему отображаются в общем каталоге.',
    ),
  );
  assert.ok(tile(html, 'Под списание').html.includes('Перейти к списанию'));
  assert.ok(tile(html, 'Аналитика').text.includes('оценка 10:00'));
});

test('each tile loads and fails on its own', async () => {
  const html = await overview({
    data: {
      ...data,
      pendingWriteoffs: failedRead('InventoryUnavailable', 503),
      dishCatalog: undefined,
    },
  });
  const writeoff = tile(html, 'Под списание').text;
  assert.ok(writeoff.includes('Данные не получены'));
  assert.ok(writeoff.includes('Повторить'));
  // Analytics reads the pending batches too.
  assert.ok(tile(html, 'Аналитика').text.includes('Данные не получены'));
  // The catalog waits for the dish catalog: a skeleton, not an error.
  const catalog = tile(html, 'Справочники');
  assert.ok(catalog.html.includes('aria-busy="true"'));
  assert.ok(!catalog.text.includes('Данные не получены'));
  // The warehouse tile has its own reads.
  assert.ok(tile(html, 'Склад').text.includes('4 партии'));
});

test('an order attempt with an open outcome shows on the orders tile', async () => {
  const html = await overview({
    order: orderSnapshot({
      phase: {
        kind: 'unknown',
        checking: false,
        attempt: {
          commandID: 'cmd-1',
          proposalID: 'prp-1',
          runtimeEpoch: readContext.runtimeEpoch,
          proposal: undefined,
          startedAt: at.epochMs,
          state: 'sent',
        },
      },
      locked: true,
    }),
  });
  const orders = tile(html, 'Заказы');
  assert.ok(orders.text.includes('Результат оформления неизвестен'));
  assert.ok(orders.text.includes('Открыть заказ'));
  assert.ok(orders.html.includes(`href="/app/r/${R}/orders"`));
});

test('the 24 h tile keeps batches within 24 hours, three rows and the rest', () => {
  const view = batchTile(expiring, names, MSK);
  assert.equal(view.count, '4 партии');
  assert.deepEqual(
    view.rows.map((row) => [row.title, row.detail, row.badge]),
    [
      ['Сыр пармезан', `B-0142 · остаток 1${nbsp}200 г`, 'Истекает через 6 ч'],
      ['Руккола', 'B-0150 · остаток 450 г', 'Истекает через 6 ч'],
      ['Сливки 33%', 'B-0139 · остаток 20 мл', 'Истекает через 14 ч'],
    ],
  );
  assert.equal(view.more, 'Ещё 1 партия в окне');
  assert.equal(view.boundary, 'Граница: 15.10.2026, 10:00 (Москва, UTC+3)');
  assert.equal(view.stamp, 'оценка 10:00');
  const one = batchTile(
    { ...expiring, items: expiring.items.slice(0, 1) },
    names,
    MSK,
  );
  assert.equal(one.count, '1 партия');
  assert.equal(one.more, undefined);
  const none = batchTile({ ...expiring, items: [] }, names, MSK);
  assert.equal(none.count, '0 партий');
  assert.deepEqual(none.rows, []);
});

test('the 3 and 7 day tiles count products of the report', () => {
  const view = reportTile(report, MSK);
  assert.equal(view.count, '4 продукта');
  assert.equal(view.note, 'с остатком, срок которого истекает до границы');
  assert.deepEqual(
    view.rows.map((row) => [row.title, row.detail, row.badge]),
    [
      ['Авокадо', 'истекает 6 шт', undefined],
      ['Руккола', 'истекает 450 г', undefined],
      ['Сыр пармезан', `истекает 1${nbsp}200 г`, undefined],
    ],
  );
  assert.equal(view.more, 'Ещё 1 продукт');
  assert.equal(view.boundary, 'Граница: 17.10.2026, 10:00 (Москва, UTC+3)');
  assert.equal(view.stamp, 'оценка 10:00');
});

test('windows, stamps, boundaries and hours', () => {
  assert.deepEqual(
    tileWindows(false).map((option) => option.title),
    ['24 ч'],
  );
  assert.deepEqual(
    tileWindows(true).map((option) => option.title),
    ['24 ч', '3 дня', '7 дней'],
  );
  const ekb = Date.parse('2026-10-11T09:32:00Z');
  assert.equal(tileStamp(ekb, 'Asia/Yekaterinburg'), 'оценка 14:32');
  assert.equal(
    boundaryText(ekb, 'Asia/Yekaterinburg'),
    'Граница: 11.10.2026, 14:32 (Екатеринбург, UTC+5)',
  );
  assert.equal(hoursLeftText(21_480n), 'Истекает через 6 ч');
  assert.equal(hoursLeftText(3600n), 'Истекает через 1 ч');
  assert.equal(hoursLeftText(3601n), 'Истекает через 2 ч');
  assert.equal(hoursLeftText(60n), 'Истекает через 1 ч');
});

test('figures agree with their numbers', () => {
  const products = (n) => ({
    items: Array.from({ length: n }, (_, i) => ({ productID: String(i) })),
  });
  const dishes = (n) => ({
    items: Array.from({ length: n }, (_, i) => ({ dishID: String(i) })),
  });
  const pairs = (figures) =>
    figures.map((item) => `${item.value} ${item.label}`);
  assert.deepEqual(pairs(catalogFigures(products(24), dishes(12))), [
    '24 продукта',
    '12 блюд',
  ]);
  assert.deepEqual(pairs(catalogFigures(products(1), dishes(21))), [
    '1 продукт',
    '21 блюдо',
  ]);
  assert.deepEqual(pairs(writeoffFigures(pending)), ['2 партии', '1 продукт']);
  assert.deepEqual(pairs(writeoffFigures({ items: [] })), [
    '0 партий',
    '0 продуктов',
  ]);
  assert.deepEqual(pairs(analyticsFigures(inventory, expiring, pending)), [
    '2 продукта с запасом',
    '5 ближайших партий',
    '2 под списание',
  ]);
  assert.deepEqual(
    pairs(
      analyticsFigures(
        { items: inventory.items.slice(0, 1) },
        { ...expiring, items: expiring.items.slice(0, 4) },
        { items: [] },
      ),
    ),
    ['1 продукт с запасом', '4 ближайшие партии', '0 под списание'],
  );
});

test('the menu tile: the stop list and the first recommendation', () => {
  const stop = stopTile(stopList, servingNames);
  assert.equal(stop.unavailable, '2 блюда недоступны');
  assert.deepEqual(stop.dishes[0].reasons, [
    'Не хватает на порцию: сливки 33% — нужно 50 мл, есть 20 мл',
  ]);
  assert.equal(
    stopTile({ ...stopList, dishes: stopList.dishes.slice(1) }, servingNames)
      .unavailable,
    '1 блюдо недоступно',
  );
  assert.equal(
    stopTile({ ...stopList, dishes: [] }, servingNames).unavailable,
    'Стоп-лист пуст',
  );
  const first = recommendationTile(recommendations, MSK);
  assert.equal(first.title, '1. Ризотто с пармезаном и рукколой');
  assert.equal(
    first.note,
    'Ближайший срок партий одной порции — 14.10.2026, 15:58. Обе причины:',
  );
  assert.deepEqual(
    first.reasons.map((row) => [row.title, row.detail, row.badge]),
    [
      ['Сыр пармезан · партия B-0142', '40 г на порцию', 'Истекает через 6 ч'],
      ['Руккола · партия B-0150', '30 г на порцию', 'Истекает через 6 ч'],
    ],
  );
  const single = recommendationTile(
    {
      ...recommendations,
      items: [
        {
          ...recommendations.items[0],
          reasons: recommendations.items[0].reasons.slice(0, 1),
        },
      ],
    },
    MSK,
  );
  assert.ok(single.note.endsWith('Причина:'));
  assert.equal(
    recommendationTile({ ...recommendations, items: [] }, MSK),
    undefined,
  );
});

test('only an attempt the tab still holds counts as open', () => {
  for (const kind of ['unknown', 'pending', 'conflict'])
    assert.equal(attemptOpen({ kind }), true, kind);
  for (const kind of ['compose', 'confirmed', 'reset', 'not-found'])
    assert.equal(attemptOpen({ kind }), false, kind);
});
