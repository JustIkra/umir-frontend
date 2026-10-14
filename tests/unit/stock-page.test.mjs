import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  noMatchText,
  stockRows,
  stockStamp,
} from '../../src/presentation/warehouse/stock-rows.ts';
import {
  NOW,
  R,
  failedRead,
  h1,
  hrefs,
  loaded,
  loadingRead,
  renderRoute,
  text,
} from './support/render-route.mjs';

const nbsp = String.fromCharCode(0xa0);
const PATH = `/app/r/${R}/warehouse`;
const row = (
  productID,
  name,
  baseUnit,
  available,
  pending,
  expiring = '0',
) => ({
  productID,
  name,
  baseUnit,
  availableQuantity: available,
  pendingWriteoffQuantity: pending,
  onHandQuantity: String(BigInt(available) + BigInt(pending)),
  expiringQuantity: expiring,
});
const inventory = {
  items: [
    row('130', 'Филе лосося', 'g', '2100000', '0', '100000'),
    row('118', 'Белые грибы', 'g', '0', '0'),
    row('121', 'Сливки 33%', 'ml', '0', '1000000'),
    row('101', 'Авокадо', 'pcs', '6000', '0'),
  ],
};

test('stock rows: by name, StockRow columns, notes for zero rows', () => {
  const rows = stockRows(inventory, '');
  assert.deepEqual(
    rows.map((item) => item.name),
    ['Авокадо', 'Белые грибы', 'Сливки 33%', 'Филе лосося'],
  );
  assert.deepEqual(rows[2], {
    productID: '121',
    name: 'Сливки 33%',
    available: '0 мл',
    pending: `1${nbsp}000 мл`,
    onHand: `1${nbsp}000 мл`,
    expiring: '0 мл',
    note: 'Весь остаток ожидает списания',
  });
  assert.equal(rows[1].note, 'Нет остатка');
  assert.equal(rows[0].note, undefined);
  assert.equal(rows[3].expiring, '100 г');
});

test('stock search: by name, no match text', () => {
  assert.deepEqual(
    stockRows(inventory, ' СЛИВКИ ').map((item) => item.productID),
    ['121'],
  );
  assert.deepEqual(stockRows(inventory, 'трюфель'), []);
  assert.equal(
    noMatchText(' трюфель '),
    'Нет продуктов, в названии которых есть „трюфель“.',
  );
  assert.equal(
    stockStamp(NOW, 'Europe/Moscow'),
    'Оценка 14.10.2026, 10:00:00 UTC+3',
  );
});

test('the stock page shows the columns, the stamp, the date and the rows', async () => {
  const html = await renderRoute(PATH, {
    data: { inventory: loaded(inventory) },
  });
  assert.equal(h1(html), 'Склад');
  const plain = text(html);
  for (const part of [
    'Среда, 14 октября 2026 · Москва, UTC+3',
    'Остатки',
    'Сроки годности',
    'История',
    'Оценка 14.10.2026, 10:00:00 UTC+3',
    'Продукт',
    'Доступно',
    'Ожидает списания',
    'В наличии',
    'Истекает за 48 ч',
    'Весь остаток ожидает списания',
    'Нет остатка',
    // text() folds the no-break space of thousands into a space.
    '2 100 г',
    '6 шт',
  ])
    assert.ok(plain.includes(part), part);
  assert.ok(html.includes('placeholder="Найти продукт"'));
  assert.ok(plain.indexOf('Авокадо') < plain.indexOf('Филе лосося'));
  assert.ok(hrefs(html).includes(`/app/r/${R}/warehouse/delivery`));
});

test('«Принять поставку» needs delivery.create', async () => {
  const plain = text(
    await renderRoute(PATH, {
      data: { inventory: loaded(inventory) },
      permissions: ['stock.read'],
    }),
  );
  assert.ok(!plain.includes('Принять поставку'));
});

test('S5 loading shows the skeleton and «Получаем новую оценку…»', async () => {
  const html = await renderRoute(PATH, { data: { inventory: loadingRead } });
  const plain = text(html);
  assert.ok(plain.includes('Получаем новую оценку…'));
  assert.ok(html.includes('aria-hidden="true"'));
  assert.ok(!plain.includes('0 г'));
});

test('S6 a refused read is not an empty warehouse', async () => {
  const plain = text(
    await renderRoute(PATH, {
      data: { inventory: failedRead('InventoryUnavailable', 503) },
    }),
  );
  assert.ok(plain.includes('Не удалось получить остатки'));
  assert.ok(
    plain.includes(
      'Склад сейчас не ответил. Это не пустой склад: повторите чтение.',
    ),
  );
  assert.ok(plain.includes('Повторить'));
  assert.ok(!plain.includes('Повторить загрузку'));
  assert.ok(!plain.includes('Остатков нет'));
  const preparing = text(
    await renderRoute(PATH, {
      data: { inventory: failedRead('RuntimeNotReady', 503) },
    }),
  );
  assert.ok(preparing.includes('Ресторан подготавливается'));
});

test('S7 empty: «Остатков нет» and «Принять поставку» with delivery.create', async () => {
  const empty = { data: { inventory: loaded({ items: [] }) } };
  const plain = text(await renderRoute(PATH, empty));
  assert.ok(plain.includes('Остатков нет'));
  assert.ok(
    plain.includes(
      'На складе нет продуктов с остатком. Примите поставку, чтобы появились партии.',
    ),
  );
  assert.equal(plain.split('Принять поставку').length - 1, 2);
  const reader = text(
    await renderRoute(PATH, { ...empty, permissions: ['stock.read'] }),
  );
  assert.ok(reader.includes('Остатков нет'));
  assert.ok(!reader.includes('Принять поставку'));
});

test('S8 a failed re-read keeps the rows under a stale notice', async () => {
  const stale = {
    ...loaded(inventory),
    failed: true,
    failure: failedRead('UpstreamUnavailable', 503).failure,
  };
  const plain = text(await renderRoute(PATH, { data: { inventory: stale } }));
  assert.ok(plain.includes('Показаны остатки на 14.10.2026, 10:00:00 UTC+3.'));
  assert.ok(
    plain.includes(
      'Новая оценка не получена — значения могут быть устаревшими.',
    ),
  );
  assert.ok(plain.includes('Повторить'));
  assert.ok(plain.includes('Авокадо'));
});
