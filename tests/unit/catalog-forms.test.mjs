import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  conflictText,
  createdDishText,
  createdNoticeOf,
  dishDraftOf,
  productDraftOf,
  createdProductText,
  dishErrors,
  fieldsSummary,
  footerCaption,
  linesSummary,
  outcomeMessage,
  productErrors,
  quantityErrorText,
} from '../../src/presentation/catalog/catalog-forms.ts';
import {
  R,
  instantOf,
  labels,
  loaded,
  renderRoute,
  text,
} from './support/render-route.mjs';

const products = [
  { productID: '125', name: 'Сыр пармезан', baseUnit: 'g' },
  { productID: '121', name: 'Сливки 33%', baseUnit: 'ml' },
];

test('product fields: K06', () => {
  assert.deepEqual(productErrors({ name: ' ', code: '', unit: undefined }), {
    name: 'Введите название',
    code: 'Введите код продукта',
    unit: 'Выберите единицу измерения',
  });
  assert.deepEqual(
    productErrors({ name: 'Сыр бри', code: '133', unit: 'g' }),
    {},
  );
  assert.deepEqual(fieldsSummary(3, false), {
    title: 'Проверьте 3 поля',
    text: 'Мы отметили ошибки у полей. Ничего не сохранено, данные остались в форме.',
  });
  assert.equal(fieldsSummary(1, true).title, 'Проверьте 1 поле');
  assert.equal(fieldsSummary(5, true).title, 'Проверьте 5 полей');
  assert.equal(
    fieldsSummary(2, true).text,
    'Мы отметили ошибки у полей и в рецепте. Ничего не сохранено, данные остались в форме.',
  );
});

test('dish recipe: empty, duplicate product, precision, missing product', () => {
  const empty = dishErrors({ name: '', code: '', lines: [] }, products);
  assert.deepEqual(empty.fields, {
    name: 'Введите название',
    code: 'Введите код блюда',
    recipe:
      'Добавьте хотя бы один ингредиент: блюдо без рецепта создать нельзя.',
  });
  const lines = [
    { key: 10, productID: '125', quantity: '20' },
    { key: 11, productID: '121', quantity: '0,0005' },
    { key: 12, productID: '125', quantity: '5' },
    { key: 13, productID: '', quantity: '1' },
  ];
  const errors = dishErrors({ name: 'Паста', code: '213', lines }, products);
  assert.deepEqual(errors.fields, {});
  assert.equal(
    errors.lines.get(11),
    'Укажите количество с точностью до 0,001 мл.',
  );
  assert.equal(
    errors.lines.get(12),
    'Сыр пармезан уже есть в строке 1. Измените количество там, а эту строку удалите.',
  );
  assert.equal(errors.lines.get(13), 'Выберите продукт');
  assert.equal(errors.lines.has(10), false);
  assert.equal(
    quantityErrorText('required', 'g'),
    'Введите количество на порцию',
  );
  assert.equal(quantityErrorText('format', 'g'), 'Введите число, например 0,5');
  assert.equal(
    quantityErrorText('zero', 'g'),
    'Количество должно быть больше нуля',
  );
  assert.equal(
    quantityErrorText('precision', undefined),
    'Укажите количество с точностью до 0,001 г.',
  );
});

test('line summaries: K17 and K18', () => {
  assert.deepEqual(linesSummary([5, 6]), {
    title: 'Блюдо не создано: ошибки в 2 строках',
    text: 'Мы отметили ошибки в строках 5 и 6. Ничего не сохранено, данные остались в форме.',
  });
  assert.deepEqual(linesSummary([6]), {
    title: 'Проверьте 1 строку',
    text: 'Мы отметили ошибку в строке 6. Ничего не сохранено, данные остались в форме.',
  });
});

test('conflict, created and outcome texts', () => {
  assert.equal(
    conflictText('product', '125', 'Сыр пармезан'),
    'Код 125 уже занят продуктом «Сыр пармезан». Укажите другой код.',
  );
  assert.equal(
    conflictText('dish', '206', undefined),
    'Код 206 уже занят. Укажите другой код.',
  );
  assert.deepEqual(createdProductText('Сыр бри', '133', 'g'), {
    title: 'Продукт «Сыр бри» создан',
    text: 'Код 133, единица — граммы. Продукт уже можно выбрать в поставках и рецептах. Изменить его после создания нельзя.',
  });
  assert.equal(
    createdDishText('Паста', '213', 5).text,
    'Код 213, 5 ингредиентов на порцию. Можно ли заказать блюдо сейчас, видно в меню в разделе «Заказы».',
  );
  assert.equal(
    createdDishText('Паста', '213', 1).text.startsWith(
      'Код 213, 1 ингредиент на порцию.',
    ),
    true,
  );
  assert.deepEqual(outcomeMessage('product', 'unknown'), {
    title: 'Не знаем, создан ли продукт',
    text: 'Связь прервалась. Нажмите «Проверить результат» — второй продукт не появится.',
  });
  assert.deepEqual(outcomeMessage('dish', 'reset'), {
    title: 'Не знаем, создано ли блюдо',
    text: 'Мы не можем подтвердить результат: данные на сервере обновились. Откройте список и проверьте, появилось ли блюдо.',
  });
  assert.deepEqual(outcomeMessage('product', 'invalid'), {
    title: 'Продукт не создан',
    text: 'Проверьте поля и попробуйте ещё раз. Ничего не сохранено, данные остались в форме.',
  });
  assert.deepEqual(outcomeMessage('dish', 'refused'), {
    title: 'Блюдо не создано',
    text: 'Не получилось сохранить. Данные остались в форме — попробуйте ещё раз.',
  });
});

test('the product form shows the suggested code', async () => {
  const html = await renderRoute(`/app/r/${R}/catalog/products/new`, {
    data: {
      productSuggestion: loaded({ kind: 'product', suggestedID: '133' }),
    },
  });
  assert.deepEqual(labels(html).slice(0, 2), ['Название', 'Код продукта']);
  assert.ok(html.includes('value="133"'));
});

test('the product form stays closed for a pending create', async () => {
  const html = await renderRoute(`/app/r/${R}/catalog/products/new`, {
    pendingProduct: { productID: '133', name: 'Сыр бри', baseUnit: 'g' },
  });
  const plain = text(html);
  assert.ok(plain.includes('Не знаем, создан ли продукт'));
  assert.ok(
    plain.includes('Пока вы не проверите результат, поля менять нельзя.'),
  );
  assert.ok(plain.includes('Проверить результат'));
  assert.ok(html.includes('value="Сыр бри"'));
  assert.match(html, /<fieldset[^>]*disabled/);
});

test('the dish form shows the suggested code and stays closed for a pending create', async () => {
  const open = await renderRoute(`/app/r/${R}/catalog/dishes/new`, {
    data: {
      dishSuggestion: loaded({ kind: 'dish', suggestedID: '213' }),
      products: loaded({
        evaluatedAt: instantOf('2026-10-14T10:00:00+03:00'),
        stateVersion: '1',
        items: products,
      }),
    },
  });
  assert.ok(open.includes('value="213"'));
  const closed = await renderRoute(`/app/r/${R}/catalog/dishes/new`, {
    pendingDish: {
      dishID: '213',
      name: 'Паста',
      ingredients: [{ productID: '125', quantity: '20000', baseUnit: 'g' }],
    },
  });
  assert.ok(text(closed).includes('Не знаем, создано ли блюдо'));
  assert.match(closed, /<fieldset[^>]*disabled/);
});

test('the created notice is read from the router state', () => {
  const product = { kind: 'product', name: 'Сыр бри', code: '133', unit: 'g' };
  assert.deepEqual(createdNoticeOf({ created: product }), product);
  const dish = { kind: 'dish', name: 'Паста', code: '213', ingredients: 5 };
  assert.deepEqual(createdNoticeOf({ created: dish }), dish);
  assert.equal(createdNoticeOf(null), undefined);
  assert.equal(
    createdNoticeOf({ created: { ...product, unit: 'kg' } }),
    undefined,
  );
  assert.equal(
    createdNoticeOf({ created: { kind: 'dish', name: 'x', code: '1' } }),
    undefined,
  );
});

test('a pending input is restored into the drafts', () => {
  assert.deepEqual(
    productDraftOf({ productID: '133', name: 'Сыр бри', baseUnit: 'g' }),
    { name: 'Сыр бри', code: '133', unit: 'g' },
  );
  const dish = dishDraftOf({
    dishID: '213',
    name: 'Паста',
    ingredients: [
      { productID: '125', quantity: '20000', baseUnit: 'g' },
      { productID: '121', quantity: '500', baseUnit: 'ml' },
    ],
  });
  assert.equal(dish.name, 'Паста');
  assert.equal(dish.code, '213');
  assert.deepEqual(
    dish.lines.map((line) => [line.productID, line.quantity]),
    [
      ['125', '20'],
      ['121', '0,5'],
    ],
  );
  assert.equal(new Set(dish.lines.map((line) => line.key)).size, 2);
});

test('the form footer caption: waiting, locked, none after a reset, default', () => {
  assert.equal(
    footerCaption('product', 'sending'),
    'Создаём продукт. Повторное нажатие не создаст дубль.',
  );
  assert.equal(
    footerCaption('dish', 'sending'),
    'Создаём блюдо. Повторное нажатие не создаст дубль.',
  );
  assert.equal(
    footerCaption('dish', 'unknown'),
    'Пока вы не проверите результат, поля менять нельзя.',
  );
  assert.equal(footerCaption('product', 'reset'), undefined);
  assert.equal(
    footerCaption('product', 'idle'),
    'Если в форме ошибка, мы подскажем — ничего не сохранится.',
  );
});

test('a pending create shows the code that was sent, not the live suggestion', async () => {
  const product = await renderRoute(`/app/r/${R}/catalog/products/new`, {
    pendingProduct: { productID: '133', name: 'Сыр бри', baseUnit: 'g' },
    data: {
      productSuggestion: loaded({ kind: 'product', suggestedID: '134' }),
    },
  });
  assert.ok(product.includes('value="133"'));
  assert.ok(!product.includes('value="134"'));
  const dish = await renderRoute(`/app/r/${R}/catalog/dishes/new`, {
    pendingDish: { dishID: '213', name: 'Паста', ingredients: [] },
    data: { dishSuggestion: loaded({ kind: 'dish', suggestedID: '214' }) },
  });
  assert.ok(dish.includes('value="213"'));
  assert.ok(!dish.includes('value="214"'));
});
