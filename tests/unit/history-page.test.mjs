import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  historyRows,
  historyStamp,
  unreadableHistory,
} from '../../src/presentation/warehouse/history-rows.ts';
import { productMap } from '../../src/presentation/orders/order-rows.ts';
import {
  NOW,
  R,
  failedRead,
  instantOf,
  loaded,
  loadingRead,
  renderRoute,
  text,
} from './support/render-route.mjs';

const MSK = 'Europe/Moscow';
const at = (time) => instantOf(`2026-10-10T${time}+03:00`);
const productItems = [
  { productID: '114', name: 'Руккола', baseUnit: 'g' },
  { productID: '121', name: 'Сливки 33%', baseUnit: 'ml' },
  { productID: '140', name: 'FEFO-набор', baseUnit: 'pcs' },
];
const products = productMap(productItems);
// Ascending by sequence, as the history model keeps them.
const events = [
  { type: 'ProductRegistered', sequence: '1049', recordedAt: at('09:00:00') },
  {
    type: 'OrderPlaced',
    sequence: '1050',
    recordedAt: at('12:40:03'),
    orderID: 'ord-20261010-0038',
    positions: 2,
  },
  {
    type: 'DeliveryReceived',
    sequence: '1052',
    recordedAt: at('14:02:11'),
    number: '1190',
    lines: 2,
    batches: 2,
  },
  {
    type: 'BatchExpired',
    sequence: '1053',
    recordedAt: at('15:00:02'),
    batchID: 'P-0133',
    productID: '114',
    quantity: '150000',
    baseUnit: undefined,
  },
  { type: 'DishDefined', sequence: '1054', recordedAt: at('15:01:00') },
  {
    type: 'BatchExpiryPending',
    sequence: '1056',
    recordedAt: at('15:21:08'),
    batchID: 'P-0164',
    productID: '121',
    quantity: '500000',
    baseUnit: 'ml',
  },
  {
    type: 'BatchWriteoffConfirmed',
    sequence: '1057',
    recordedAt: at('15:25:00'),
    batchID: 'P-0170',
    productID: '140',
    quantity: '2500',
    baseUnit: 'pcs',
  },
  {
    type: 'OrderPlaced',
    sequence: '1058',
    recordedAt: at('15:30:00'),
    orderID: 'ord-20261010-0042',
    positions: 1,
  },
];
const history = { events };
const evaluatedAt = instantOf('2026-10-14T10:00:00+03:00');
const historyData = (value) => ({
  data: {
    history: loaded(value),
    products: loaded({ evaluatedAt, stateVersion: '1', items: productItems }),
  },
});
const page = `/app/r/${R}/warehouse/history`;

test('history rows: newest first, the type and the text of each event, no catalog events', () => {
  assert.deepEqual(historyRows(history, products, 'all', MSK), [
    {
      sequence: '#1058',
      kind: 'sale',
      label: 'Продажа',
      text: 'Заказ ord-20261010-0042 · 1 позиция',
      at: '10.10.2026, 15:30:00',
      time: '15:30:00',
    },
    {
      sequence: '#1057',
      kind: 'confirmed',
      label: 'Списание подтверждено',
      text: 'Партия P-0170 · FEFO-набор · 2,5 шт',
      at: '10.10.2026, 15:25:00',
      time: '15:25:00',
    },
    {
      sequence: '#1056',
      kind: 'pending',
      label: 'Ожидает списания',
      text: 'Партия P-0164 · сливки 33% · 500 мл',
      at: '10.10.2026, 15:21:08',
      time: '15:21:08',
    },
    {
      sequence: '#1053',
      kind: 'expired',
      label: 'Списание просрочки',
      text: 'Партия P-0133 · руккола · 150 г',
      at: '10.10.2026, 15:00:02',
      time: '15:00:02',
    },
    {
      sequence: '#1052',
      kind: 'receipt',
      label: 'Поступление',
      text: 'Поставка № 1190 · 2 строки, 2 партии',
      at: '10.10.2026, 14:02:11',
      time: '14:02:11',
    },
    {
      sequence: '#1050',
      kind: 'sale',
      label: 'Продажа',
      text: 'Заказ ord-20261010-0038 · 2 позиции',
      at: '10.10.2026, 12:40:03',
      time: '12:40:03',
    },
  ]);
});

test('history filters: deliveries, sales, and the three write-off events', () => {
  const ids = (filter) =>
    historyRows(history, products, filter, MSK).map((row) => row.sequence);
  assert.deepEqual(ids('deliveries'), ['#1052']);
  assert.deepEqual(ids('sales'), ['#1058', '#1050']);
  assert.deepEqual(ids('writeoffs'), ['#1057', '#1056', '#1053']);
});

test('an unknown product shows its code; without a unit the number stands alone', () => {
  const [row] = historyRows(
    {
      events: [
        {
          type: 'BatchExpired',
          sequence: '7',
          recordedAt: at('10:00:00'),
          batchID: 'P-0099',
          productID: '998',
          quantity: '750',
          baseUnit: undefined,
        },
      ],
    },
    products,
    'all',
    'Asia/Yekaterinburg',
  );
  assert.equal(row.text, 'Партия P-0099 · 998 · 0,75');
  assert.equal(row.at, '10.10.2026, 12:00:00');
});

test('the stamp names the last event of the journal, or the read of an empty one', () => {
  assert.equal(
    historyStamp(history, NOW, MSK),
    'Последнее событие #1058 · 10.10.2026, 15:30:00 UTC+3',
  );
  assert.equal(
    historyStamp({ events: [] }, NOW, MSK),
    'Оценка 14.10.2026, 10:00:00 UTC+3',
  );
});

test('UnknownEventSchema and an undecodable event make the journal unreadable', () => {
  assert.equal(unreadableHistory('UnknownEventSchema'), true);
  assert.equal(unreadableHistory('Malformed'), true);
  assert.equal(unreadableHistory('UpstreamUnavailable'), false);
});

test('H1: the page shows the journal from the newest event with the stamp and the filter', async () => {
  const plain = text(await renderRoute(page, historyData(history)));
  for (const part of [
    'Последнее событие #1058 · 10.10.2026, 15:30:00 UTC+3',
    'Все',
    'Поступления',
    'Продажи',
    'Списания',
    'События от новых к старым',
    'Поставка № 1190 · 2 строки, 2 партии',
    'Партия P-0164 · сливки 33% · 500 мл',
    'Ожидает списания',
    'Списание подтверждено',
  ])
    assert.ok(plain.includes(part), part);
  assert.ok(plain.indexOf('#1058') < plain.indexOf('#1050'));
  assert.ok(!plain.includes('#1049'));
  assert.ok(!plain.includes('#1054'));
  assert.ok(!plain.includes('Показать ещё 100'));
});

test('the first hundred rows are shown; «Показать ещё 100» opens the next ones', async () => {
  const orders = (total) => ({
    events: Array.from({ length: total }, (_, index) => ({
      type: 'OrderPlaced',
      sequence: String(index + 1),
      recordedAt: at('12:00:00'),
      orderID: `o-${String(index + 1)}`,
      positions: 1,
    })),
  });
  const long = text(await renderRoute(page, historyData(orders(101))));
  assert.ok(long.includes('Показать ещё 100'));
  assert.ok(long.includes('Заказ o-101 · 1 позиция'));
  assert.ok(long.includes('Заказ o-2 · 1 позиция'));
  assert.ok(!long.includes('Заказ o-1 · 1 позиция'));
  const exact = text(await renderRoute(page, historyData(orders(100))));
  assert.ok(!exact.includes('Показать ещё 100'));
});

test('H6: the journal is being read', async () => {
  const plain = text(
    await renderRoute(page, { data: { history: loadingRead } }),
  );
  assert.ok(plain.includes('Получаем журнал…'));
  assert.ok(plain.includes('События от новых к старым'));
});

test('H7: the journal was not read', async () => {
  const plain = text(
    await renderRoute(page, {
      data: { history: failedRead('UpstreamUnavailable', 503) },
    }),
  );
  assert.ok(plain.includes('Не удалось получить историю'));
  assert.ok(
    plain.includes(
      'Склад не отдал журнал. Это не пустой журнал: повторите чтение.',
    ),
  );
  assert.ok(plain.includes('Повторить'));
  assert.ok(!plain.includes('Повторить загрузку'));
});

test('an event the client cannot show hides the whole journal', async () => {
  for (const read of [
    failedRead('UnknownEventSchema', 503),
    failedRead('Malformed', 200),
  ]) {
    const plain = text(await renderRoute(page, { data: { history: read } }));
    assert.ok(plain.includes('Не удалось показать историю'));
    assert.ok(
      plain.includes(
        'В журнале есть событие, которое приложение не умеет показать. Журнал не показан целиком, чтобы не скрыть его часть.',
      ),
    );
    assert.ok(!plain.includes('События от новых к старым'));
  }
});

test('a journal of catalog events only is empty for the operator', async () => {
  const plain = text(
    await renderRoute(page, historyData({ events: events.slice(0, 1) })),
  );
  assert.ok(plain.includes('Событий пока нет'));
  assert.ok(plain.includes('Здесь появятся поставки, продажи и списания.'));
  assert.ok(plain.includes('Последнее событие #1049'));
});

test('a restaurant that is not ready shows the shared state, not H7', async () => {
  const plain = text(
    await renderRoute(page, {
      data: { history: failedRead('RuntimeNotReady', 503) },
    }),
  );
  assert.ok(plain.includes('Ресторан подготавливается'));
  assert.ok(!plain.includes('Не удалось получить историю'));
});
