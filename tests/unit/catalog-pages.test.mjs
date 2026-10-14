import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  catalogStamp,
  dishRows,
  productRows,
  recipeRows,
} from '../../src/presentation/catalog/catalog-rows.ts';
import {
  NOW,
  R,
  failedRead,
  h1,
  hrefs,
  instantOf,
  loaded,
  loadingRead,
  renderRoute,
  text,
} from './support/render-route.mjs';

const evaluatedAt = instantOf('2026-10-14T10:00:00+03:00');
const productItems = [
  { productID: '132', name: 'Яйцо', baseUnit: 'pcs' },
  { productID: '130', name: 'Филе лосося', baseUnit: 'g' },
  { productID: '121', name: 'Сливки 33%', baseUnit: 'ml' },
];
const products = { evaluatedAt, stateVersion: '1', items: productItems };
const dish = {
  dishID: '206',
  name: 'Паста с лососем и шпинатом',
  ingredients: [
    { productID: '130', quantity: '120000', baseUnit: 'g' },
    { productID: '121', quantity: '50000', baseUnit: 'ml' },
    { productID: '124', quantity: '500', baseUnit: 'g' },
  ],
};
const dishes = {
  evaluatedAt,
  stateVersion: '1',
  items: [dish, { dishID: '201', name: 'Борщ', ingredients: [] }],
};

test('rows: sorted by name, searched by name or code, recipe in the base unit', () => {
  assert.deepEqual(productRows(productItems, ''), [
    { code: '121', name: 'Сливки 33%', unit: 'миллилитры, мл' },
    { code: '130', name: 'Филе лосося', unit: 'граммы, г' },
    { code: '132', name: 'Яйцо', unit: 'штуки, шт' },
  ]);
  assert.deepEqual(
    productRows(productItems, '13').map((row) => row.code),
    ['130', '132'],
  );
  assert.deepEqual(dishRows(dishes.items, 'борщ'), [
    { code: '201', name: 'Борщ' },
  ]);
  assert.deepEqual(recipeRows(dish, productItems), [
    { no: 1, name: 'Филе лосося', code: '130', quantity: '120 г' },
    { no: 2, name: 'Сливки 33%', code: '121', quantity: '50 мл' },
    { no: 3, name: '124', code: '124', quantity: '0,5 г' },
  ]);
  assert.equal(
    catalogStamp(NOW, 'Europe/Moscow'),
    'Справочник на 14.10.2026, 10:00:00 UTC+3',
  );
});

test('the products list shows the read with counts, stamp and the zone caption', async () => {
  const plain = text(
    await renderRoute(`/app/r/${R}/catalog`, {
      data: { products: loaded(products), dishCatalog: loaded(dishes) },
    }),
  );
  assert.ok(plain.includes('Продукты · 3'));
  assert.ok(plain.includes('Блюда · 2'));
  assert.ok(plain.includes('Справочник на 14.10.2026, 10:00:00 UTC+3'));
  assert.ok(plain.includes('Среда, 14 октября 2026 · Москва, UTC+3'));
  assert.ok(plain.indexOf('Сливки 33%') < plain.indexOf('Филе лосося'));
  assert.ok(plain.includes('миллилитры, мл'));
});

test('the products list: loading, empty, unavailable', async () => {
  const loading = text(
    await renderRoute(`/app/r/${R}/catalog`, {
      data: { products: loadingRead },
    }),
  );
  assert.ok(loading.includes('Получаем новую оценку…'));
  assert.ok(loading.includes('Продукты · …'));
  const empty = text(
    await renderRoute(`/app/r/${R}/catalog`, {
      data: { products: loaded({ ...products, items: [] }) },
    }),
  );
  assert.ok(empty.includes('Продуктов пока нет'));
  assert.ok(empty.includes('Добавить продукт'));
  const failed = text(
    await renderRoute(`/app/r/${R}/catalog`, {
      data: { products: failedRead('UpstreamUnavailable', 503) },
    }),
  );
  assert.ok(failed.includes('Не удалось получить справочник продуктов'));
  assert.ok(
    failed.includes(
      'Справочник сейчас недоступен — это не значит, что он пуст.',
    ),
  );
  assert.ok(failed.includes('Повторить загрузку'));
});

test('every dish links to its card', async () => {
  const html = await renderRoute(`/app/r/${R}/catalog/dishes`, {
    data: { dishCatalog: loaded(dishes) },
  });
  assert.ok(hrefs(html).includes(`/app/r/${R}/catalog/dishes/206`));
  assert.ok(hrefs(html).includes(`/app/r/${R}/catalog/dishes/201`));
});

test('the dish card shows the recipe in base units and the zone of the stamp', async () => {
  const html = await renderRoute(`/app/r/${R}/catalog/dishes/206`, {
    data: {
      dish: loaded({ evaluatedAt, stateVersion: '1', dish }),
      products: loaded(products),
    },
  });
  assert.equal(h1(html), 'Паста с лососем и шпинатом');
  const plain = text(html);
  for (const part of [
    'Филе лосося',
    '120 г',
    '50 мл',
    '0,5 г',
    'Москва, UTC+3',
    'Рецептура одной порции · 3',
  ])
    assert.ok(plain.includes(part), part);
});

test('the dish card shows its header and «Получаем новую оценку…» while the read loads', async () => {
  const html = await renderRoute(`/app/r/${R}/catalog/dishes/206`, {
    data: { dish: loadingRead },
  });
  const plain = text(html);
  assert.ok(plain.includes('Получаем новую оценку…'));
  assert.ok(plain.includes('Справочники'));
  assert.ok(plain.includes('Блюда'));
});

test('a dish the catalog does not have shows «Блюдо не найдено»', async () => {
  const plain = text(
    await renderRoute(`/app/r/${R}/catalog/dishes/999`, {
      data: { dish: failedRead('NotFound', 404) },
    }),
  );
  assert.ok(plain.includes('Блюдо не найдено'));
  assert.ok(plain.includes('К списку блюд'));
});
