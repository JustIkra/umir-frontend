import assert from 'node:assert/strict';
import { test } from 'bun:test';
import fin from '../../api/completion-v1-examples.json' with { type: 'json' };
import {
  decodePlanningEnvelope,
  decodeSupplySuggestions,
} from '../../src/adapters/api/decode/planning.ts';
import {
  R,
  failedRead,
  h1,
  hrefs,
  instantOf,
  loaded,
  readContext,
  readyAccess,
  renderRoute,
  sampleRestaurant,
  text,
} from './support/render-route.mjs';

const page = `/app/r/${R}/analytics`;
const access = (roles, overrides = {}) =>
  readyAccess([sampleRestaurant({ roles, ...overrides })]);
const warehouse = access(['Warehouse']);
const context = (iso) => ({ ...readContext, evaluatedAt: instantOf(iso) });
const count = (haystack, needle) => haystack.split(needle).length - 1;

const stopRead = loaded({
  evaluatedAt: instantOf('2026-10-14T10:00:00+03:00'),
  stateVersion: '1',
  dishes: [{}, {}, {}],
});
const pendingRead = loaded(
  { items: [{}, {}] },
  context('2026-10-14T09:30:00+03:00'),
);
const expiringRead = loaded({
  evaluatedAt: instantOf('2026-10-14T10:00:00+03:00'),
  stateVersion: '1',
  items: [{ isExpired: false }, { isExpired: false }, { isExpired: true }],
});

test('«Аналитика» opens for the warehouse role and is linked from the sidebar and the overview', async () => {
  assert.equal(h1(await renderRoute(page, { access: warehouse })), 'Аналитика');
  const overview = await renderRoute(`/app/r/${R}`, { access: warehouse });
  assert.ok(count(hrefs(overview).join(' '), page) >= 2);
  assert.ok(
    text(overview).includes(
      'Что скоро закончится, что может испортиться и куда уходят продукты',
    ),
  );
});

test('an administrator opens «Аналитика»', async () => {
  const admin = readyAccess([sampleRestaurant({ roles: ['Admin'] })], {
    admin: true,
  });
  assert.equal(h1(await renderRoute(page, { access: admin })), 'Аналитика');
});

test('a waiter has no «Аналитика» link, and the address says there is no access', async () => {
  const waiter = access(['Waiter']);
  const overview = await renderRoute(`/app/r/${R}`, { access: waiter });
  assert.ok(!hrefs(overview).includes(page));
  assert.ok(
    text(await renderRoute(page, { access: waiter })).includes(
      'Нет доступа к разделу «Аналитика»',
    ),
  );
});

test('the tiles count stop-list dishes, batches to write off and batches that spoil within 2 days', async () => {
  const html = await renderRoute(page, {
    access: warehouse,
    data: {
      stopList: stopRead,
      pendingWriteoffs: pendingRead,
      expiringBatches: expiringRead,
    },
  });
  const plain = text(html);
  for (const label of ['В стоп-листе', 'Ждут списания', 'Испортится за 2 дня'])
    assert.ok(plain.includes(label), label);
  assert.ok(plain.includes('3 блюда'));
  assert.equal(count(plain, '2 партии'), 2);
  assert.equal(count(hrefs(html).join(' '), `/app/r/${R}/warehouse/expiry`), 2);
});

test('a tile that failed shows a dash and «Повторить»; a loading tile says so', async () => {
  const plain = text(
    await renderRoute(page, {
      access: warehouse,
      data: { stopList: failedRead('UpstreamUnavailable', 503) },
    }),
  );
  assert.ok(plain.includes('—'));
  assert.ok(plain.includes('Повторить'));
  assert.ok(plain.includes('Получаем данные…'));
});

test('the stamp shows the oldest loaded read and waits while nothing is loaded', async () => {
  const loadedPage = text(
    await renderRoute(page, {
      access: warehouse,
      data: { stopList: stopRead, pendingWriteoffs: pendingRead },
    }),
  );
  assert.ok(loadedPage.includes('Обновлено 14 октября, 09:30'));
  const empty = text(await renderRoute(page, { access: warehouse }));
  assert.ok(empty.includes('Получаем данные…'));
  assert.ok(!empty.includes('Обновлено'));
});

const supply = decodePlanningEnvelope(
  fin.examples[0].value,
  decodeSupplySuggestions,
  'warehouse',
);
const supplyRead = loaded(supply.result, supply.context);

test('«Скоро закончится» puts the dish blocker first and shows the cover from the supply hint', async () => {
  const html = await renderRoute(page, {
    access: warehouse,
    data: { supplySuggestions: supplyRead },
  });
  const plain = text(html);
  assert.ok(plain.includes('Скоро закончится'));
  assert.ok(plain.includes('Данных пока мало'));
  assert.ok(plain.indexOf('Milk') < plain.indexOf('Flour'));
  assert.ok(plain.includes('Держит в стоп-листе 1 блюдо'));
  assert.ok(plain.includes('Хватит на 2 дня'));
  for (const label of [
    'Запаса меньше чем на 3 дня',
    'Держит блюда в стоп-листе',
    'Линия — запас на 3 дня',
  ])
    assert.ok(plain.includes(label), label);
  assert.ok(
    html.includes(
      'aria-label="Flour: 2 г — можно использовать, 1 г — расход в день, 2\u00a0дня — хватит"',
    ),
  );
  assert.ok(
    html.includes(
      'aria-label="Milk: 0 мл — можно использовать, 0 мл — расход в день, 1 блюдо — в стоп-листе"',
    ),
  );
  assert.equal(count(html, 'data-segment="cover"'), 1);
  assert.ok(html.includes('data-threshold'));
});

test('«Скоро закончится» as a table lists every product with its numbers', async () => {
  const plain = text(
    await renderRoute(`${page}?supply=table`, {
      access: warehouse,
      data: { supplySuggestions: supplyRead },
    }),
  );
  assert.ok(plain.includes('Показать графиком'));
  assert.ok(plain.includes('Блюд в стоп-листе'));
  assert.ok(plain.includes('Расхода нет'));
  assert.ok(plain.includes('Flour'));
});

test('«Скоро закончится» when nothing runs out, and when the read fails', async () => {
  const calm = text(
    await renderRoute(page, {
      access: warehouse,
      data: {
        supplySuggestions: loaded(
          { ...supply.result, items: [] },
          supply.context,
        ),
      },
    }),
  );
  assert.ok(calm.includes('Сейчас ничего докупать не нужно.'));
  const failed = text(
    await renderRoute(page, {
      access: warehouse,
      data: { supplySuggestions: failedRead('UpstreamUnavailable', 503) },
    }),
  );
  assert.ok(failed.includes('Не удалось загрузить подсказку о закупках'));
  assert.ok(failed.includes('Попробовать ещё раз'));
});

const stockRow = (productID, name, available, pending, expiring) => ({
  productID,
  name,
  baseUnit: 'g',
  availableQuantity: available,
  pendingWriteoffQuantity: pending,
  onHandQuantity: String(BigInt(available) + BigInt(pending)),
  expiringQuantity: expiring,
});

test('«Что может испортиться» ranks products by the share at risk and counts the calm ones', async () => {
  const html = await renderRoute(page, {
    access: warehouse,
    data: {
      inventory: loaded({
        items: [
          stockRow('p1', 'Сыр', '4000000', '1000000', '1000000'),
          stockRow('p2', 'Молоко', '0', '500000', '0'),
          stockRow('p3', 'Мука', '9000000', '0', '0'),
        ],
      }),
    },
  });
  const plain = text(html);
  assert.ok(plain.indexOf('Молоко') < plain.indexOf('Сыр'));
  assert.ok(plain.includes('Риск 100 %'));
  assert.ok(plain.includes('Риск 40 %'));
  assert.ok(plain.includes('Без риска: ещё 1 продукт'));
  for (const label of [
    'Не испортится за 2 дня',
    'Испортится за 2 дня',
    'Ждёт списания',
  ])
    assert.ok(plain.includes(label), label);
  assert.ok(
    html.includes(
      'aria-label="Сыр: 3 000 г — не испортится за 2 дня, 1 000 г — испортится за 2 дня, 1 000 г — ждёт списания"',
    ),
  );
  assert.ok(html.includes('aria-label="Молоко: 500 г — ждёт списания"'));
  assert.equal(count(html, 'data-segment='), 4);
});

const many = Array.from({ length: 12 }, (_, i) =>
  stockRow(`p${String(i)}`, `Продукт ${String(i)}`, '1000', '0', '1000'),
);

test('«Что может испортиться» shows ten rows, then all of them, then a table', async () => {
  const read = (path) =>
    renderRoute(path, {
      access: warehouse,
      data: { inventory: loaded({ items: many }) },
    });
  const first = await read(page);
  assert.equal(count(first, 'aria-label="Продукт'), 10);
  assert.ok(text(first).includes('Показать все (12)'));
  const all = await read(`${page}?risk=all`);
  assert.equal(count(all, 'aria-label="Продукт'), 12);
  assert.ok(text(all).includes('Свернуть'));
  const table = text(await read(`${page}?risk=table`));
  assert.ok(table.includes('Риск'));
  assert.ok(table.includes('Продукт 11'));
  assert.ok(!table.includes('Показать все'));
});

test('«Что может испортиться» with an empty warehouse, without risk, and beside a failed card', async () => {
  const empty = text(
    await renderRoute(page, {
      access: warehouse,
      data: { inventory: loaded({ items: [] }) },
    }),
  );
  assert.ok(empty.includes('На складе пока ничего нет.'));
  const calm = text(
    await renderRoute(page, {
      access: warehouse,
      data: {
        inventory: loaded({
          items: [stockRow('p3', 'Мука', '9000', '0', '0')],
        }),
      },
    }),
  );
  assert.ok(
    calm.includes('В ближайшие 2 дня ничего не испортится, списаний нет.'),
  );
  const mixed = text(
    await renderRoute(page, {
      access: warehouse,
      data: {
        supplySuggestions: failedRead('UpstreamUnavailable', 503),
        inventory: loaded({
          items: [stockRow('p2', 'Молоко', '0', '500', '0')],
        }),
      },
    }),
  );
  assert.ok(mixed.includes('Не удалось загрузить подсказку о закупках'));
  assert.ok(mixed.includes('Риск 100 %'));
});

const coverage = (complete) => ({
  epoch: '44444444-4444-4444-8444-444444444444',
  coverageFrom: instantOf('2026-10-13T00:00:00+03:00'),
  complete,
  requestedFrom: instantOf('2026-10-08T00:00:00+03:00'),
  availableFrom: instantOf('2026-10-13T00:00:00+03:00'),
});
const moveRow = (productID, name, received, ordered, writtenOff) => ({
  productID,
  name,
  baseUnit: 'g',
  receivedQuantity: received,
  orderedQuantity: ordered,
  writtenOffQuantity: writtenOff,
});
const movements = (items, complete = true) =>
  loaded({
    from: instantOf('2026-10-08T00:00:00+03:00'),
    to: instantOf('2026-10-15T00:00:00+03:00'),
    coverage: coverage(complete),
    items,
  });

test('«Куда ушли продукты» ranks write-off shares and leaves out products that only arrived', async () => {
  const html = await renderRoute(page, {
    access: warehouse,
    data: {
      movementReport: movements([
        moveRow('a', 'Мука', '10000', '9000', '1000'),
        moveRow('b', 'Сыр', '5000', '0', '0'),
        moveRow('c', 'Молоко', '300', '0', '300'),
      ]),
    },
  });
  const plain = text(html);
  assert.ok(plain.includes('Куда ушли продукты за 7 дней'));
  assert.ok(plain.indexOf('Молоко') < plain.indexOf('Мука'));
  assert.ok(plain.includes('Списано 100 %'));
  assert.ok(plain.includes('Списано 10 %'));
  assert.ok(!html.includes('aria-label="Сыр'));
  assert.ok(
    html.includes(
      'aria-label="Мука: 9 г — ушло в блюда, 1 г — списано, 10 г — поступило"',
    ),
  );
  assert.ok(plain.includes('Ушло в блюда'));
  assert.ok(!plain.includes('Склад помнит движение только с'));
});

test('«Куда ушли продукты» names the start of a short history, the empty week and a failed read', async () => {
  const short = text(
    await renderRoute(page, {
      access: warehouse,
      data: {
        movementReport: movements(
          [moveRow('a', 'Мука', '0', '1000', '0')],
          false,
        ),
      },
    }),
  );
  assert.ok(
    short.includes(
      'Склад помнит движение только с 13 октября, 00:00. Более ранние дни не учтены.',
    ),
  );
  const empty = text(
    await renderRoute(page, {
      access: warehouse,
      data: {
        movementReport: movements([moveRow('b', 'Сыр', '5000', '0', '0')]),
      },
    }),
  );
  assert.ok(empty.includes('За 7 дней продукты не продавали и не списывали.'));
  const failed = text(
    await renderRoute(page, {
      access: warehouse,
      data: { movementReport: failedRead('UpstreamUnavailable', 503) },
    }),
  );
  assert.ok(failed.includes('Не удалось загрузить движение продуктов'));
});

test('«Куда ушли продукты» reads the week of the restaurant zone', async () => {
  const periods = [];
  await renderRoute(page, {
    access: access(['Warehouse'], { timeZone: 'Pacific/Honolulu' }),
    data: {
      movementReport: (period) => {
        periods.push(period);
        return movements([]);
      },
    },
  });
  // The render clock is 2026-10-14 07:00 UTC: 13 October, 21:00 in Honolulu.
  assert.deepEqual(periods.at(-1), {
    fromDate: '2026-10-07',
    throughDate: '2026-10-13',
    expectedSettingsVersion: '1',
  });
});

test('«Куда ушли продукты» waits for access instead of asking without a settings version', async () => {
  const queries = [];
  const plain = text(
    await renderRoute(page, {
      access: {
        status: 'unverified',
        failure: { code: 'UpstreamUnavailable', outcome: 'unavailable' },
        previous: undefined,
      },
      data: {
        movementReport: (query) => {
          queries.push(query);
          return movements([]);
        },
      },
    }),
  );
  assert.ok(plain.includes('Куда ушли продукты за 7 дней'));
  assert.ok(plain.includes('Получаем данные…'));
  assert.deepEqual(queries, []);
});

test('«Куда ушли продукты» asks with the settings version of the organization', async () => {
  const queries = [];
  const ready = access(['Warehouse']);
  ready.organizations[0].settings = {
    timeZone: 'Europe/Moscow',
    settingsVersion: '5',
  };
  await renderRoute(page, {
    access: ready,
    data: {
      movementReport: (query) => {
        queries.push(query);
        return movements([]);
      },
    },
  });
  assert.equal(queries.at(-1).expectedSettingsVersion, '5');
});

test('«Куда ушли продукты» as a table shows what arrived too', async () => {
  const plain = text(
    await renderRoute(`${page}?flow=table`, {
      access: warehouse,
      data: {
        movementReport: movements([
          moveRow('a', 'Мука', '10000', '9000', '1000'),
        ]),
      },
    }),
  );
  for (const header of [
    'Поступило',
    'Ушло в блюда',
    'Списано',
    'Доля списаний',
  ])
    assert.ok(plain.includes(header), header);
  assert.ok(plain.includes('10 %'));
});
