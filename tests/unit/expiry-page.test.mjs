import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  batchCountText,
  batchRows,
  boundaryText,
  customHoursOf,
  customRiskHours,
  isCursorExpired,
  mergePages,
  productCountText,
  remainingText,
  reportRows,
  settingsRetry,
  windowHours,
  windowOf,
  zonedEpochMs,
} from '../../src/presentation/warehouse/expiry-rows.ts';
import {
  NOW,
  R,
  failedRead,
  h1,
  instantOf,
  labels,
  loaded,
  loadingRead,
  renderRoute,
  text,
} from './support/render-route.mjs';

const nbsp = String.fromCharCode(0xa0);
const HOUR = 3_600_000;
const PATH = `/app/r/${R}/warehouse/expiry`;
const evaluatedAt = instantOf('2026-10-14T10:00:00+03:00');
const batch = (
  batchID,
  productID,
  remainingSeconds,
  expiresIso,
  quantity,
  baseUnit = 'g',
) => ({
  batchID,
  productID,
  remainingQuantity: quantity,
  baseUnit,
  expiresAt: instantOf(expiresIso),
  remainingSeconds,
});
const expiring = {
  evaluatedAt,
  stateVersion: '1',
  items: [
    batch('P-0150', '119', '18480', '2026-10-14T15:08:00+03:00', '450000'),
    batch('P-0160', '120', '90000', '2026-10-15T11:00:00+03:00', '2000000'),
    batch('P-0142', '120', '18480', '2026-10-14T15:08:00+03:00', '1200000'),
    batch('P-0139', '121', '1800', '2026-10-14T10:30:00+03:00', '20000', 'ml'),
  ],
};
const productItems = [
  { productID: '119', name: 'Руккола', baseUnit: 'g' },
  { productID: '120', name: 'Сыр пармезан', baseUnit: 'g' },
];
const products = loaded({
  evaluatedAt,
  stateVersion: '1',
  items: productItems,
});
const names = new Map(productItems.map((item) => [item.productID, item.name]));
const stockRow = (productID, name, available, expiring) => ({
  productID,
  name,
  baseUnit: 'g',
  availableQuantity: available,
  pendingWriteoffQuantity: '0',
  onHandQuantity: available,
  expiringQuantity: expiring,
});
const report = (riskHours, items, nextCursor = undefined) => ({
  riskHours,
  riskCutoff: instantOf(
    new Date(evaluatedAt.epochMs + riskHours * HOUR).toISOString(),
  ),
  items,
  nextCursor,
});
const report72 = report(72, [
  stockRow('130', 'Филе лосося', '2100000', '100000'),
  stockRow('118', 'Белые грибы', '500000', '0'),
  stockRow('120', 'Сыр пармезан', '3200000', '1200000'),
]);

test('windows: hours, the address parameter, analytics.read', () => {
  assert.deepEqual(windowHours, { '24h': 24, '3d': 72, '7d': 168 });
  assert.equal(windowOf(null, true), '24h');
  assert.equal(windowOf('7d', true), '7d');
  assert.equal(windowOf('custom', true), 'custom');
  assert.equal(windowOf('7d', false), '24h');
  assert.equal(windowOf('30d', true), '24h');
  assert.equal(customHoursOf('50'), 50);
  assert.equal(customHoursOf(null), 24);
  assert.equal(customHoursOf('0'), 24);
  assert.equal(customHoursOf('8785'), 24);
  assert.equal(customHoursOf('1.5'), 24);
});

test('a custom boundary: whole hours up, from 1 to 8784', () => {
  assert.equal(customRiskHours(NOW + 1, NOW), 1);
  assert.equal(customRiskHours(NOW + 72 * HOUR, NOW), 72);
  assert.equal(customRiskHours(NOW + 72 * HOUR + 1, NOW), 73);
  assert.equal(customRiskHours(NOW + 8784 * HOUR, NOW), 8784);
  assert.equal(customRiskHours(NOW + 8784 * HOUR + 1, NOW), 'out-of-range');
  assert.equal(customRiskHours(NOW, NOW), 'out-of-range');
  assert.equal(customRiskHours(NOW - HOUR, NOW), 'out-of-range');
});

test('the boundary field is read in the zone of the organization', () => {
  assert.equal(
    zonedEpochMs('2026-10-16T12:00', 'Europe/Moscow'),
    Date.parse('2026-10-16T12:00:00+03:00'),
  );
  assert.equal(
    zonedEpochMs('2026-07-01T12:00', 'Europe/Berlin'),
    Date.parse('2026-07-01T12:00:00+02:00'),
  );
  assert.equal(
    zonedEpochMs('2026-12-01T12:00', 'Europe/Berlin'),
    Date.parse('2026-12-01T12:00:00+01:00'),
  );
  assert.equal(zonedEpochMs('16.10.2026 12:00', 'Europe/Moscow'), undefined);
  assert.equal(zonedEpochMs('', 'Europe/Moscow'), undefined);
});

test('remaining time: «через Ч ч ММ мин», under an hour «через ММ мин»', () => {
  assert.equal(remainingText('18480'), 'через 5 ч 08 мин');
  assert.equal(remainingText('18421'), 'через 5 ч 08 мин');
  assert.equal(remainingText('1800'), 'через 30 мин');
  assert.equal(remainingText('59'), 'через 01 мин');
  assert.equal(remainingText('86400'), 'через 24 ч 00 мин');
});

test('24 h rows: at most 86 400 s, by expiry then batch, names from the catalog', () => {
  assert.deepEqual(
    batchRows(expiring, names, 86_400n).map((row) => [
      row.batchID,
      row.product,
    ]),
    [
      ['P-0139', '121'],
      ['P-0142', 'Сыр пармезан'],
      ['P-0150', 'Руккола'],
    ],
  );
  const [first] = batchRows(expiring, names, 86_400n);
  assert.equal(first.quantity, '20 мл');
  assert.equal(first.remaining, 'через 30 мин');
  assert.equal(first.remainingSeconds, '1800');
  assert.equal(batchRows(expiring, names, 172_800n).length, 4);
  assert.equal(batchCountText(3), '3 партии с остатком и сроком до границы');
  assert.equal(batchCountText(5), '5 партий с остатком и сроком до границы');
  assert.equal(
    boundaryText(evaluatedAt.epochMs + 24 * HOUR, 'Europe/Moscow'),
    'Граница: 15.10.2026, 10:00 (Москва, UTC+3)',
  );
});

test('report rows: expiring only, by name, merged pages kept once', () => {
  assert.deepEqual(reportRows(report72), [
    {
      productID: '120',
      product: 'Сыр пармезан',
      expiring: `1${nbsp}200 г`,
      available: `3${nbsp}200 г`,
    },
    {
      productID: '130',
      product: 'Филе лосося',
      expiring: '100 г',
      available: `2${nbsp}100 г`,
    },
  ]);
  assert.deepEqual(
    reportRows(report72, 'лосос').map((row) => row.productID),
    ['130'],
  );
  const next = report(72, [
    stockRow('130', 'Филе лосося', '2100000', '100000'),
    stockRow('140', 'Шпинат', '540000', '40000'),
  ]);
  assert.deepEqual(
    reportRows(mergePages(report72, [next])).map((row) => row.productID),
    ['120', '130', '140'],
  );
  assert.equal(
    productCountText(1),
    '1 продукт с остатком, срок которого истекает до границы',
  );
  assert.equal(
    productCountText(2),
    '2 продукта с остатком, срок которого истекает до границы',
  );
  assert.equal(
    isCursorExpired(failedRead('RefreshRequired', 409).failure),
    true,
  );
  assert.equal(
    isCursorExpired(failedRead('UpstreamUnavailable', 503).failure),
    false,
  );
});

test('SettingsChanged repeats the report once, the second refusal is an error', () => {
  const changed = failedRead('SettingsChanged', 409, 'not_committed');
  const read = { ...changed, loadedAt: 5 };
  assert.equal(settingsRetry(loaded(report72), undefined), 'none');
  assert.equal(
    settingsRetry(failedRead('UpstreamUnavailable', 503), undefined),
    'none',
  );
  assert.equal(settingsRetry(read, undefined), 'due');
  assert.equal(
    settingsRetry({ ...read, loading: true }, { loadedAt: 5 }),
    'waiting',
  );
  assert.equal(settingsRetry(read, { loadedAt: 5 }), 'failed');
  // A success after the repeat allows the next one.
  assert.equal(settingsRetry({ ...read, loadedAt: 9 }, { loadedAt: 5 }), 'due');
});

test('the 24 h window shows the batches, the boundary and the switch', async () => {
  const html = await renderRoute(PATH, {
    data: { expiringBatches: loaded(expiring), products },
  });
  assert.equal(h1(html), 'Склад');
  assert.ok(html.includes('aria-label="Окно сроков"'));
  const plain = text(html);
  for (const part of [
    '24 ч',
    '3 дня',
    '7 дней',
    'Своя граница',
    'Граница: 15.10.2026, 10:00 (Москва, UTC+3)',
    '3 партии с остатком и сроком до границы',
    'Сыр пармезан',
    'Партия P-0142 · остаток 1 200 г',
    'через 5 ч 08 мин',
    'до 14.10.2026, 15:08',
    'Партия P-0139 · остаток 20 мл',
    'Оценка 14.10.2026, 10:00:00 UTC+3',
  ])
    assert.ok(plain.includes(part), part);
  assert.ok(!plain.includes('P-0160'));
  assert.ok(plain.indexOf('P-0139') < plain.indexOf('P-0142'));
});

test('without analytics.read only «24 ч» is offered', async () => {
  const plain = text(
    await renderRoute(`${PATH}?window=3d`, {
      data: { expiringBatches: loaded(expiring), products },
      permissions: ['stock.read', 'catalog.read'],
    }),
  );
  assert.ok(plain.includes('24 ч'));
  assert.ok(plain.includes('Партия P-0142'));
  for (const part of ['3 дня', '7 дней', 'Своя граница'])
    assert.ok(!plain.includes(part), part);
});

test('3 days and 7 days show products of analytics/stock', async () => {
  const three = text(
    await renderRoute(`${PATH}?window=3d`, {
      data: { stockReport: { 72: loaded(report72) } },
    }),
  );
  for (const part of [
    'Граница: 17.10.2026, 10:00 (Москва, UTC+3)',
    '2 продукта с остатком, срок которого истекает до границы',
    'Сыр пармезан',
    'истекает 1 200 г из 3 200 г',
    'истекает 100 г из 2 100 г',
    'В этом окне склад считает остаток по продуктам, без партий.',
  ])
    assert.ok(three.includes(part), part);
  assert.ok(!three.includes('Белые грибы'));
  const seven = text(
    await renderRoute(`${PATH}?window=7d`, {
      data: {
        stockReport: {
          168: loaded(
            report(168, [stockRow('130', 'Филе лосося', '2100000', '2100000')]),
          ),
        },
      },
    }),
  );
  assert.ok(seven.includes('Граница: 21.10.2026, 10:00 (Москва, UTC+3)'));
  assert.ok(
    seven.includes('1 продукт с остатком, срок которого истекает до границы'),
  );
});

test('«Своя граница» reads the hours of the address and says how it rounds', async () => {
  const html = await renderRoute(`${PATH}?window=custom&hours=50`, {
    data: {
      stockReport: {
        50: loaded(
          report(50, [stockRow('130', 'Филе лосося', '2100000', '100000')]),
        ),
      },
    },
  });
  assert.ok(labels(html).includes('Дата и время границы (Москва, UTC+3)'));
  assert.ok(html.includes('type="datetime-local"'));
  const plain = text(html);
  assert.ok(plain.includes('Граница: 16.10.2026, 12:00 (Москва, UTC+3)'));
  assert.ok(
    plain.includes(
      'Склад считает границу в целых часах: показана ближайшая граница не раньше введённой.',
    ),
  );
  const fallback = text(
    await renderRoute(`${PATH}?window=custom`, {
      data: { stockReport: { 24: loaded(report(24, [])) } },
    }),
  );
  assert.ok(fallback.includes('Граница: 15.10.2026, 10:00 (Москва, UTC+3)'));
});

test('more than 500 products: «Показать ещё» for the next page', async () => {
  const plain = text(
    await renderRoute(`${PATH}?window=3d`, {
      data: {
        stockReport: { 72: loaded(report(72, report72.items, 'cursor-2')) },
      },
    }),
  );
  assert.ok(plain.includes('Показать ещё'));
  const last = text(
    await renderRoute(`${PATH}?window=3d`, {
      data: { stockReport: { 72: loaded(report72) } },
    }),
  );
  assert.ok(!last.includes('Показать ещё'));
});

test('S9 empty windows', async () => {
  const batches = text(
    await renderRoute(PATH, {
      data: { expiringBatches: loaded({ ...expiring, items: [] }) },
    }),
  );
  assert.ok(batches.includes('В окне нет партий'));
  assert.ok(
    batches.includes('До границы не истекает ни одна партия с остатком.'),
  );
  const products3d = text(
    await renderRoute(`${PATH}?window=3d`, {
      data: {
        stockReport: {
          72: loaded(
            report(72, [stockRow('118', 'Белые грибы', '500000', '0')]),
          ),
        },
      },
    }),
  );
  assert.ok(products3d.includes('До границы ничего не истекает'));
  assert.ok(
    products3d.includes(
      'Ни у одного продукта нет остатка со сроком до границы.',
    ),
  );
});

test('loading, a refused read, and SettingsChanged waits for the repeat', async () => {
  const loading = text(
    await renderRoute(PATH, { data: { expiringBatches: loadingRead } }),
  );
  assert.ok(loading.includes('Получаем новую оценку…'));
  const failed = text(
    await renderRoute(`${PATH}?window=3d`, {
      data: { stockReport: { 72: failedRead('CalculationUnavailable', 503) } },
    }),
  );
  assert.ok(failed.includes('Не удалось получить сроки годности'));
  assert.ok(!failed.includes('Повторить загрузку'));
  assert.ok(
    failed.includes(
      'Склад сейчас не ответил. Это не пустое окно: повторите чтение.',
    ),
  );
  const changed = text(
    await renderRoute(`${PATH}?window=3d`, {
      data: {
        stockReport: {
          72: failedRead('SettingsChanged', 409, 'not_committed'),
        },
      },
    }),
  );
  assert.ok(changed.includes('Получаем новую оценку…'));
  assert.ok(!changed.includes('Не удалось получить сроки годности'));
});

test('a failed re-read keeps the window under a stale notice', async () => {
  const stale = {
    ...loaded(expiring),
    failed: true,
    failure: failedRead('UpstreamUnavailable', 503).failure,
  };
  const plain = text(
    await renderRoute(PATH, { data: { expiringBatches: stale, products } }),
  );
  assert.ok(plain.includes('Показаны данные на 14.10.2026, 10:00:00 UTC+3.'));
  assert.ok(plain.includes('Партия P-0142'));
});
