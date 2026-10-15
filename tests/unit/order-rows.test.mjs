import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  deficitText,
  evaluationText,
  inDraftText,
  inSentence,
  menuRows,
  productMap,
  recommendationRows,
  stopRows,
} from '../../src/presentation/orders/order-rows.ts';
import {
  NOW,
  R,
  failedRead,
  instantOf,
  loaded,
  loadingRead,
  orderSnapshot,
  renderRoute,
  text,
} from './support/render-route.mjs';

const at = instantOf('2026-10-14T10:00:00+03:00');
const products = productMap([
  { productID: '121', name: 'Сливки 33%', baseUnit: 'ml' },
  { productID: '109', name: 'Куриное филе', baseUnit: 'g' },
]);
const menu = {
  evaluatedAt: at,
  stateVersion: '1',
  dishes: [
    { dishID: '206', name: 'Паста с лососем' },
    { dishID: '207', name: 'Ризотто' },
  ],
};
const stopList = {
  evaluatedAt: at,
  stateVersion: '1',
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
};
const recommendations = {
  coverage: { complete: false },
  evaluatedAt: at,
  stateVersion: '1',
  items: [
    {
      dishID: '207',
      score: '0.500000',
      demandBasis: 'fallback',
      dishName: 'Ризотто с пармезаном и рукколой',
      priorityExpiresAt: instantOf('2026-10-14T20:30:00+03:00'),
      reasons: [
        {
          productID: '125',
          productName: 'Сыр пармезан',
          batchID: 'P-0142',
          riskQuantity: '400000',
          targetPortions: '10',
          remainingSeconds: '37800',
          quantityPerPortion: '40000',
          baseUnit: 'g',
          expiresAt: instantOf('2026-10-14T20:30:00+03:00'),
        },
        {
          productID: '117',
          productName: 'Руккола',
          batchID: 'P-0150',
          riskQuantity: '90000',
          targetPortions: '3',
          remainingSeconds: '37800',
          quantityPerPortion: '30000',
          baseUnit: 'g',
          expiresAt: instantOf('2026-10-14T20:30:00+03:00'),
        },
      ],
    },
  ],
};
const draft = [
  { lineNo: 1, dishID: '206', portions: '1' },
  { lineNo: 2, dishID: '207', portions: '1' },
  { lineNo: 3, dishID: '206', portions: '2' },
];

test('positions in the draft are named on the menu row', () => {
  assert.equal(inDraftText(draft, '206'), 'В заказе: поз. 1 и 3');
  assert.equal(inDraftText(draft, '999'), undefined);
  assert.deepEqual(menuRows(menu, draft, 'ризот'), [
    { dishID: '207', name: 'Ризотто', inDraft: 'В заказе: поз. 2' },
  ]);
});

test('the stop list names what one portion lacks', () => {
  assert.equal(inSentence('Сливки 33%'), 'сливки 33%');
  assert.equal(inSentence('FEFO-набор'), 'FEFO-набор');
  assert.equal(
    deficitText(
      {
        productID: '121',
        requiredQuantity: '50000',
        availableQuantity: '20000',
      },
      products,
    ),
    'сливки 33% — нужно 50 мл, есть 20 мл',
  );
  assert.equal(
    deficitText(
      { productID: '999', requiredQuantity: '1500', availableQuantity: '0' },
      products,
    ),
    '999 — нужно 1,5, есть 0',
  );
  assert.deepEqual(stopRows(stopList, products, ''), [
    {
      dishID: '205',
      name: 'Паста карбонара',
      reasons: ['На порцию не хватает: сливки 33% — нужно 50 мл, есть 20 мл'],
    },
  ]);
});

test('recommendations: nearest expiry and every reason in the zone', () => {
  assert.deepEqual(recommendationRows(recommendations, 'Europe/Moscow'), [
    {
      rank: 1,
      dishID: '207',
      name: 'Ризотто с пармезаном и рукколой',
      nearest: 'Ближайший срок риска — 14.10.2026, 20:30.',
      demand: 'Спрос без полной истории: ориентир 2 порции/ч',
      reasons: [
        {
          title: 'Сыр пармезан · партия P-0142',
          risk: 'Под риском 400 г',
          target: 'Ориентир: 10 порц. для этого количества',
          perPortion: '40 г на порцию',
          expires: 'Срок до 14.10.2026, 20:30',
        },
        {
          title: 'Руккола · партия P-0150',
          risk: 'Под риском 90 г',
          target: 'Ориентир: 3 порц. для этого количества',
          perPortion: '30 г на порцию',
          expires: 'Срок до 14.10.2026, 20:30',
        },
      ],
    },
  ]);
  assert.equal(
    evaluationText(NOW, 'Europe/Moscow'),
    'Оценка 14.10.2026, 10:00:00 UTC+3',
  );
});

const data = {
  menu: loaded(menu),
  stopList: loaded(stopList),
  recommendations: loaded(recommendations),
  servingProducts: loaded({
    evaluatedAt: at,
    stateVersion: '1',
    items: [...products.values()],
  }),
};

test('the orders page counts the tabs and marks dishes in the draft', async () => {
  const plain = text(
    await renderRoute(`/app/r/${R}/orders`, {
      data,
      order: orderSnapshot({ draft }),
    }),
  );
  for (const part of [
    'Меню · 2',
    'Стоп-лист · 1',
    'Рекомендации · 1',
    'Оценка 14.10.2026, 10:00:00 UTC+3',
    'В заказе: поз. 1 и 3',
    'Среда, 14 октября 2026 · Москва, UTC+3',
  ])
    assert.ok(plain.includes(part), part);
});

test('the menu tab: loading, unavailable, empty', async () => {
  const loading = text(
    await renderRoute(`/app/r/${R}/orders`, { data: { menu: loadingRead } }),
  );
  assert.ok(loading.includes('Меню · …'));
  assert.ok(loading.includes('Получаем новую оценку…'));
  const failed = text(
    await renderRoute(`/app/r/${R}/orders`, {
      data: { menu: failedRead('InventoryUnavailable', 503) },
    }),
  );
  assert.ok(failed.includes('Меню · —'));
  assert.ok(failed.includes('Не удалось получить меню'));
  assert.ok(
    failed.includes(
      'Склад сейчас не может подготовить остатки. Это не значит, что доступных блюд нет. Повторите чтение.',
    ),
  );
  const empty = text(
    await renderRoute(`/app/r/${R}/orders`, {
      data: { menu: loaded({ ...menu, dishes: [] }) },
    }),
  );
  assert.ok(empty.includes('Нет блюд, доступных хотя бы для одной порции'));
  assert.ok(empty.includes('Открыть стоп-лист'));
});
