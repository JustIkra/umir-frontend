import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { ChakraProvider } from '@chakra-ui/react';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { OverviewPage } from '../../src/presentation/overview/overview-page.tsx';
import { ServicesProvider } from '../../src/presentation/services.tsx';
import { system } from '../../src/presentation/theme/system.ts';
import {
  NOW,
  R,
  activeSession,
  failedRead,
  fakeServices,
  h1,
  hrefs,
  instantOf,
  labels,
  loaded,
  orderSnapshot,
  readyAccess,
  redirectOf,
  renderRoute,
  resetSnapshot,
  sampleRestaurant,
  text,
} from './support/render-route.mjs';

const evaluatedAt = instantOf('2026-10-14T10:00:00+03:00');
const productItems = [
  { productID: '132', name: 'Яйцо', baseUnit: 'pcs' },
  { productID: '130', name: 'Филе лосося', baseUnit: 'g' },
  { productID: '121', name: 'Сливки 33%', baseUnit: 'ml' },
];
const sampleDish = {
  dishID: '206',
  name: 'Паста с лососем и шпинатом',
  ingredients: [
    { productID: '130', quantity: '120000', baseUnit: 'g' },
    { productID: '121', quantity: '50000', baseUnit: 'ml' },
    { productID: '124', quantity: '500', baseUnit: 'g' },
  ],
};
const catalogProducts = loaded({
  evaluatedAt,
  stateVersion: '1',
  items: productItems,
});
const catalogDishes = loaded({
  evaluatedAt,
  stateVersion: '1',
  items: [sampleDish, { dishID: '201', name: 'Борщ', ingredients: [] }],
});
const catalogDish = loaded({
  evaluatedAt,
  stateVersion: '1',
  dish: sampleDish,
});
const catalogData = {
  data: {
    products: catalogProducts,
    dishCatalog: catalogDishes,
    dish: catalogDish,
  },
};

const servingAt = instantOf('2026-10-14T10:00:00+03:00');
const servingData = {
  menu: loaded({
    evaluatedAt: servingAt,
    stateVersion: '1',
    dishes: [{ dishID: '206', name: 'Паста с лососем' }],
  }),
  stopList: loaded({
    evaluatedAt: servingAt,
    stateVersion: '1',
    dishes: [],
  }),
  recommendations: loaded({
    evaluatedAt: servingAt,
    stateVersion: '1',
    items: [],
  }),
  servingProducts: loaded({
    evaluatedAt: servingAt,
    stateVersion: '1',
    items: [],
  }),
};

const guest = { session: { status: 'anonymous', expired: false } };

const pages = [
  ['/login', 'Вход', ['Логин', 'Пароль', 'Запомнить меня'], guest],
  ['/password-reset', 'Восстановление пароля', ['Почта']],
  [
    '/password-reset/code',
    'Введите код',
    ['Код из письма'],
    {
      reset: resetSnapshot({
        step: 'code',
        email: 'a@b.ru',
        expiresAtMs: NOW + 600_000,
        resendAtMs: NOW,
      }),
    },
  ],
  [
    '/password-reset/new',
    'Новый пароль',
    ['Новый пароль', 'Повторите новый пароль'],
    { reset: resetSnapshot({ step: 'password', email: 'a@b.ru' }) },
  ],
  [`/app/r/${R}`, 'Обзор', []],
  [`/app/r/${R}/orders`, 'Новый заказ', [], { data: servingData }],
  [`/app/r/${R}/warehouse`, 'Склад', []],
  [`/app/r/${R}/warehouse/expiry`, 'Склад', []],
  [`/app/r/${R}/warehouse/history`, 'Склад', []],
  [
    `/app/r/${R}/warehouse/delivery`,
    'Приём поставки',
    ['Номер поставки', 'Дата и время создания поставки'],
  ],
  [`/app/r/${R}/catalog`, 'Справочники', [], catalogData],
  [`/app/r/${R}/catalog/dishes`, 'Справочники', [], catalogData],
  [
    `/app/r/${R}/catalog/dishes/206`,
    'Паста с лососем и шпинатом',
    [],
    catalogData,
  ],
  [
    `/app/r/${R}/catalog/products/new`,
    'Новый продукт',
    ['Название', 'Код продукта', 'граммы, г', 'миллилитры, мл', 'штуки, шт'],
  ],
  [`/app/r/${R}/catalog/dishes/new`, 'Новое блюдо', ['Название', 'Код блюда']],
  [
    '/app/settings',
    'Учётная запись',
    ['Текущий пароль', 'Новый пароль', 'Повторите новый пароль'],
  ],
  ['/app/no-restaurants', 'Нет доступных ресторанов', []],
];

for (const [path, title, fields, options] of pages) {
  test(`${path} shows «${title}» with its fields`, async () => {
    const html = await renderRoute(path, options);
    assert.equal(h1(html), title);
    for (const field of fields)
      assert.ok(labels(html).includes(field), `${path}: no label «${field}»`);
  });
}

test('internal links lead to existing pages', async () => {
  const sources = [
    '/',
    '/privacy',
    '/login',
    '/password-reset',
    '/password-reset/code',
    '/password-reset/new',
    '/app',
    `/app/r/${R}`,
    '/app/settings',
    '/app/no-restaurants',
    `/app/r/${R}/orders`,
    `/app/r/${R}/warehouse`,
    `/app/r/${R}/warehouse/expiry`,
    `/app/r/${R}/warehouse/history`,
    `/app/r/${R}/warehouse/delivery`,
    `/app/r/${R}/catalog`,
    `/app/r/${R}/catalog/dishes`,
    `/app/r/${R}/catalog/dishes/206`,
    `/app/r/${R}/catalog/products/new`,
    `/app/r/${R}/catalog/dishes/new`,
  ];
  const checked = new Set();
  for (const source of sources)
    for (const href of hrefs(
      await renderRoute(
        source,
        source === '/login'
          ? guest
          : source.includes('/catalog')
            ? catalogData
            : {},
      ),
    )) {
      if (!href.startsWith('/') || href.startsWith('//')) continue;
      const path = href.split('#')[0] || '/';
      if (checked.has(path)) continue;
      checked.add(path);
      assert.notEqual(
        h1(
          await renderRoute(path, path.includes('/catalog') ? catalogData : {}),
        ),
        'Страница не найдена',
        `${source} → ${href}`,
      );
    }
});

test('sign-in has no code step and explains an ended session', async () => {
  assert.equal(h1(await renderRoute('/login/code')), 'Страница не найдена');
  const html = await renderRoute(
    `/login?return=${encodeURIComponent(`/app/r/${R}`)}&expired=1`,
    { session: { status: 'anonymous', expired: true } },
  );
  assert.match(text(html), /Сессия завершена/);
  assert.match(
    text(html),
    /Войдите снова — после входа откроется та же страница\./,
  );
});

test('the account menu signs out through /logout', async () => {
  assert.ok(hrefs(await renderRoute(`/app/r/${R}`)).includes('/logout'));
});

test('sign-in with an active session opens the app or the safe return address', async () => {
  assert.equal(await redirectOf('/login'), '/app');
  const orders = `/app/r/${R}/orders?step=draft`;
  assert.equal(
    await redirectOf(`/login?return=${encodeURIComponent(orders)}`),
    orders,
  );
  assert.equal(
    await redirectOf(
      `/login?return=${encodeURIComponent('https://evil.example/app')}`,
    ),
    '/app',
  );
  assert.equal(await redirectOf('/login', guest), undefined);
  const lost = { status: 0, code: 'Transport', outcome: 'unavailable' };
  assert.equal(
    await redirectOf('/login', {
      session: { status: 'unavailable', failure: lost },
    }),
    undefined,
  );
});

test('the landing opens the app through sign-in', async () => {
  const links = hrefs(await renderRoute('/'));
  assert.ok(links.includes('/login'));
  assert.ok(!links.includes('/app'));
});

const notFound = 'Страница не найдена';

test('unimplemented prototype routes do not expose sample data', async () => {
  for (const path of [
    '/app/organizations',
    '/app/organizations/yug',
    '/app/organizations/yug/members',
    '/app/organizations/yug/members/i-kovaleva',
    '/app/organizations/yug/invitations',
    '/app/organizations/yug/invitations/new',
    '/app/organizations/yug/profile',
    '/app/organizations/new',
    `/app/r/${R}/menu`,
    `/app/r/${R}/analytics`,
  ])
    assert.equal(h1(await renderRoute(path)), notFound, path);
});

const OTHER = '55555555-5555-4555-8555-555555555555';
const ASIA = '66666666-6666-4666-8666-666666666666';

// Access sorts organizations by name: «Азия Групп» comes before «Восток Фуд».
const twoOrganizations = {
  status: 'ready',
  organizations: [
    {
      orgID: ASIA,
      name: 'Азия Групп',
      settings: { timeZone: 'Asia/Yekaterinburg', settingsVersion: '1' },
      admin: false,
      restaurants: [
        sampleRestaurant({
          restaurantID: OTHER,
          orgID: ASIA,
          orgName: 'Азия Групп',
          name: 'На Тургеневской',
          roles: ['Waiter'],
          timeZone: 'Asia/Yekaterinburg',
        }),
      ],
    },
    ...readyAccess().organizations,
  ],
};

// The account menu dialog, and the first «Разделы» navigation (the sidebar).
const accountMenu = (html) =>
  /<dialog[^>]*aria-label="Учётная запись"[^>]*>([\s\S]*?)<\/dialog>/.exec(
    html,
  )?.[1] ?? '';
const sectionLinks = (html) =>
  hrefs(
    /<nav[^>]*aria-label="Разделы"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ??
      '',
  );

test('the account menu lists real workplaces without prototype management links', async () => {
  const html = await renderRoute(`/app/r/${R}`, { access: twoOrganizations });
  const menu = accountMenu(html);
  assert.ok(!hrefs(menu).some((path) => path.startsWith('/app/organizations')));
  assert.ok(menu.includes('Найти ресторан'));
  assert.equal(menu.match(/aria-current="true"/g)?.length, 1);
  assert.match(text(menu), /Марина Белова/);
  assert.match(text(menu), /m\.belova/);
  // The organization of the current restaurant goes first (W08).
  const order = text(menu);
  assert.ok(order.indexOf('Восток Фуд') < order.indexOf('Азия Групп'));
  assert.match(order, /На Тургеневской/);
});

test('without restaurants the shell has no sections and no workplaces', async () => {
  const html = await renderRoute('/app/no-restaurants', {
    access: readyAccess([]),
  });
  assert.ok(!hrefs(html).includes(`/app/r/${R}/orders`));
  assert.ok(!html.includes('Рабочее место'));
  assert.ok(!hrefs(html).includes('/app/organizations/new'));
});

test('an organization without restaurants adds no workplaces (W13)', async () => {
  const memberOnly = {
    status: 'ready',
    organizations: readyAccess().organizations.map((organization) => ({
      ...organization,
      restaurants: [],
    })),
  };
  assert.equal(
    await redirectOf('/app', { access: memberOnly }),
    '/app/no-restaurants',
  );
  const html = await renderRoute('/app/no-restaurants', { access: memberOnly });
  assert.ok(!html.includes('Рабочее место'));
  assert.ok(!html.includes('Найти ресторан'));
});

test('outside a restaurant the menu marks no restaurant current', async () => {
  for (const path of ['/app/settings']) {
    const menu = accountMenu(await renderRoute(path));
    assert.ok(menu.includes('Найти ресторан'), path);
    assert.equal(menu.match(/aria-current="true"/g)?.length ?? 0, 0, path);
  }
});

test('the catalog lists the products and dishes of the restaurant', async () => {
  const productsHtml = await renderRoute(`/app/r/${R}/catalog`, catalogData);
  assert.ok(productsHtml.includes('Филе лосося'));
  assert.ok(hrefs(productsHtml).includes(`/app/r/${R}/catalog/products/new`));
  const dishesHtml = await renderRoute(
    `/app/r/${R}/catalog/dishes`,
    catalogData,
  );
  assert.ok(hrefs(dishesHtml).includes(`/app/r/${R}/catalog/dishes/206`));
  assert.ok(hrefs(dishesHtml).includes(`/app/r/${R}/catalog/dishes/201`));
});

test('a dish the catalog does not have shows «Блюдо не найдено»', async () => {
  const html = await renderRoute(`/app/r/${R}/catalog/dishes/999`, {
    data: { dish: failedRead('NotFound', 404) },
  });
  assert.ok(text(html).includes('Блюдо не найдено'));
});

test('section pages keep their sidebar item current', async () => {
  const html = await renderRoute(`/app/r/${R}/catalog/dishes`);
  assert.match(
    html,
    new RegExp(`<a[^>]*aria-current="page"[^>]*href="/app/r/${R}/catalog"`),
  );
});

test('warehouse pages wait for their real reads without sample figures', async () => {
  for (const suffix of ['', '/expiry', '/history']) {
    const html = await renderRoute(`/app/r/${R}/warehouse${suffix}`);
    assert.equal(h1(html), 'Склад');
    assert.doesNotMatch(text(html), /P-0158|#1057|через 20 ч 38 мин/);
    assert.match(text(html), /Получаем данные/);
  }
});

test('the order flow goes from the menu to the placed order', async () => {
  const route = `/app/r/${R}/orders`;
  const dishes = { data: servingData };
  const draft = await renderRoute(route, {
    ...dishes,
    order: orderSnapshot({
      draft: [
        { lineNo: 1, dishID: '206', portions: '4' },
        { lineNo: 2, dishID: '206', portions: '5' },
      ],
    }),
  });
  assert.ok(text(draft).includes('2 позиции · 9 порций'));
  assert.ok(text(draft).includes('Подготовить заказ'));
  assert.ok(text(draft).includes('Повтор блюда из поз. 1 — отдельная позиция'));
  assert.ok(text(draft).includes('Заказ · 2 позиции'));
  assert.ok(text(draft).includes('9 порций · не проверен'));
  const proposed = await renderRoute(route, {
    ...dishes,
    order: orderSnapshot({
      phase: {
        kind: 'proposal',
        previous: undefined,
        proposal: {
          proposalID: 'prp-1',
          evaluatedAt: instantOf('2026-10-14T10:00:00+03:00'),
          stateVersion: '1',
          requestedPositions: [{ lineNo: '1', dishID: '206', portions: '3' }],
          acceptedPositions: [{ lineNo: '1', dishID: '206', portions: '1' }],
          changes: [
            {
              lineNo: '1',
              dishID: '206',
              requestedPortions: '3',
              acceptedPortions: '1',
              deficits: [],
            },
          ],
          warehouseEpoch: '66666666-6666-4666-8666-666666666666',
        },
      },
    }),
  });
  assert.ok(text(proposed).includes('Не весь заказ можно приготовить'));
  const placed = await renderRoute(route, {
    ...dishes,
    order: orderSnapshot({
      phase: {
        kind: 'confirmed',
        context: { warehouseEpoch: '44444444-4444-4444-8444-444444444444' },
        afterCheck: false,
        order: {
          orderID: 'ord-20261010-0042',
          proposalID: 'prp-1',
          acceptedPositions: [{ lineNo: '1', dishID: '206', portions: '1' }],
          allocations: [],
          placedAt: instantOf('2026-10-14T10:01:00+03:00'),
        },
      },
    }),
  });
  assert.ok(placed.includes('ord-20261010-0042'));
  assert.ok(hrefs(placed).includes(`/app/r/${R}/warehouse/history`));
});

test('overview links lead to implemented sections without sample totals', async () => {
  const html = await renderRoute('/app');
  const links = hrefs(html);
  for (const path of [
    `/app/r/${R}/orders`,
    `/app/r/${R}/warehouse`,
    `/app/r/${R}/catalog`,
  ])
    assert.ok(links.includes(path), path);
  assert.ok(!links.includes(`/app/r/${R}/menu`));
  assert.ok(!links.includes(`/app/r/${R}/analytics`));
  assert.doesNotMatch(text(html), /Тальятелле|Масло трюфельное/);
});

test('a guest is sent to sign-in with the return address', async () => {
  assert.equal(
    await redirectOf(`/app/r/${R}/orders`, guest),
    `/login?return=${encodeURIComponent(`/app/r/${R}/orders`)}`,
  );
  assert.equal(
    await redirectOf('/app/settings', {
      session: { status: 'anonymous', expired: true },
    }),
    `/login?return=${encodeURIComponent('/app/settings')}&expired=1`,
  );
});

test('/app opens the remembered restaurant, the first one or «no restaurants»', async () => {
  const other = '55555555-5555-4555-8555-555555555555';
  const two = readyAccess([
    sampleRestaurant(),
    sampleRestaurant({ restaurantID: other, name: 'На Чехова' }),
  ]);
  assert.equal(
    await redirectOf('/app', { access: two, remembered: other }),
    `/app/r/${other}`,
  );
  assert.equal(await redirectOf('/app', { access: two }), `/app/r/${R}`);
  assert.equal(
    await redirectOf('/app', { access: readyAccess([]) }),
    '/app/no-restaurants',
  );
});

const unverified = {
  status: 'unverified',
  failure: {
    status: 404,
    code: 'NotFound',
    outcome: 'not_committed',
    retryable: false,
    retryAfterSeconds: undefined,
    currentEpoch: undefined,
    fieldErrors: {},
    sessionRevoked: false,
  },
};

test('/app without verified access shows W17', async () => {
  const html = await renderRoute('/app', { access: unverified });
  assert.equal(h1(html), 'Доступ не проверен');
  assert.equal(
    await redirectOf('/app', { access: unverified, remembered: R }),
    `/app/r/${R}`,
  );
});

test('a malformed restaurant id shows the 404 page', async () => {
  // R has no hex letters, so R.toUpperCase() would still be a valid id.
  for (const id of ['AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', `${R}x`, '123']) {
    assert.equal(h1(await renderRoute(`/app/r/${id}`)), notFound, id);
  }
});

test('a section without the right shows W14', async () => {
  const waiter = readyAccess([sampleRestaurant({ roles: ['Waiter'] })]);
  assert.equal(
    h1(await renderRoute(`/app/r/${R}/warehouse`, { access: waiter })),
    'Раздел «Склад» недоступен',
  );
  assert.equal(
    h1(await renderRoute(`/app/r/${R}/orders`, { access: waiter })),
    'Новый заказ',
  );
});

test('a restaurant outside access shows W15; a preparing one shows W16', async () => {
  const other = '55555555-5555-4555-8555-555555555555';
  assert.equal(
    h1(await renderRoute(`/app/r/${other}`)),
    'Доступ к ресторану отозван',
  );
  const preparing = readyAccess([
    sampleRestaurant({ lifecycle: 'registering', roles: [] }),
  ]);
  assert.equal(
    h1(await renderRoute(`/app/r/${R}`, { access: preparing })),
    'Ресторан подготавливается',
  );
});

test('without verified access a restaurant address still opens its sections', async () => {
  assert.equal(
    h1(await renderRoute(`/app/r/${R}/warehouse`, { access: unverified })),
    'Склад',
  );
});

test('restaurant links carry the restaurant id', async () => {
  const links = hrefs(await renderRoute(`/app/r/${R}`));
  assert.ok(links.includes(`/app/r/${R}/orders`));
  assert.ok(links.includes(`/app/r/${R}/warehouse`));
  assert.deepEqual(
    links.filter((href) =>
      /^\/app\/(orders|warehouse|catalog|menu|analytics)/.test(href),
    ),
    [],
  );
});

test('a session without an answer shows «Сессия не проверена» instead of the page', async () => {
  const session = { status: 'unavailable', failure: unverified.failure };
  for (const path of ['/app', '/app/settings', `/app/r/${R}/orders`]) {
    assert.equal(
      h1(await renderRoute(path, { session })),
      'Сессия не проверена',
      path,
    );
  }
});

test('/app checks unverified access again', async () => {
  const accessCalls = { ensure: 0, refresh: 0 };
  assert.equal(
    await redirectOf('/app', {
      access: unverified,
      refreshed: readyAccess(),
      accessCalls,
    }),
    `/app/r/${R}`,
  );
  assert.equal(accessCalls.refresh, 1);
});

test('pages outside a restaurant read access before render', async () => {
  const accessCalls = { ensure: 0, refresh: 0 };
  await renderRoute('/app/settings', { accessCalls });
  assert.equal(accessCalls.ensure, 1);
  const guestCalls = { ensure: 0, refresh: 0 };
  await redirectOf('/app/settings', {
    session: { status: 'anonymous', expired: false },
    accessCalls: guestCalls,
  });
  assert.equal(guestCalls.ensure, 0);
});

test('the shell shows the signed-in user and the restaurant from access', async () => {
  const html = await renderRoute(`/app/r/${R}`);
  assert.match(text(html), /Марина Белова/);
  assert.match(text(html), /На Пушкинской · Склад, Официант/);
});

test('the shell follows another user and the roles of the restaurant', async () => {
  const session = {
    ...activeSession,
    user: {
      ...activeSession.user,
      login: 'i.kovaleva',
      displayName: 'Ирина Ковалёва',
    },
  };
  const access = readyAccess([
    sampleRestaurant({ name: 'На Тургеневской', roles: ['Waiter'] }),
  ]);
  const html = await renderRoute(`/app/r/${R}`, { session, access });
  assert.match(text(html), /Ирина Ковалёва/);
  assert.match(text(accountMenu(html)), /i\.kovaleva/);
  assert.match(text(html), /На Тургеневской · Официант/);
  assert.ok(html.includes('aria-label="Учётная запись: Ирина Ковалёва"'));
  assert.deepEqual(sectionLinks(html), [`/app/r/${R}`, `/app/r/${R}/orders`]);
});

test('pages outside a restaurant without restaurants mark no section current', async () => {
  const html = await renderRoute('/app/settings', { access: readyAccess([]) });
  assert.ok((html.match(/aria-current="page"/g)?.length ?? 0) <= 1);
  assert.deepEqual(sectionLinks(html), []);
  assert.match(text(html), /Нет доступных ресторанов/);
});

test('access states leave the shell without sections', async () => {
  const preparing = readyAccess([
    sampleRestaurant({ lifecycle: 'registering', roles: [] }),
  ]);
  for (const [path, options, caption] of [
    [
      '/app/no-restaurants',
      { access: readyAccess([]) },
      'Нет доступных ресторанов',
    ],
    [`/app/r/${OTHER}`, {}, 'Доступ к ресторану отозван'],
    [`/app/r/${R}`, { access: preparing }, 'На Пушкинской · подготавливается'],
    ['/app', { access: unverified }, 'Доступ не проверен'],
  ]) {
    const html = await renderRoute(path, options);
    assert.deepEqual(sectionLinks(html), [], path);
    assert.ok(text(html).includes(caption), `${path}: no «${caption}»`);
  }
});

test('«Данные обновились» shows in the restaurant it belongs to', async () => {
  const shown = await renderRoute(`/app/r/${R}`, {
    notice: { restaurantID: R },
  });
  assert.match(text(shown), /Данные обновились/);
  const elsewhere = await renderRoute(`/app/r/${R}`, {
    notice: { restaurantID: OTHER },
  });
  assert.doesNotMatch(text(elsewhere), /Данные обновились/);
  // W15: the restaurant is out of access, its data is not shown.
  const revoked = await renderRoute(`/app/r/${OTHER}`, {
    notice: { restaurantID: OTHER },
  });
  assert.doesNotMatch(text(revoked), /Данные обновились/);
});

test('W12: the overview names the missing section between the header and the tiles', () => {
  const html = renderToString(
    h(
      ChakraProvider,
      { value: system },
      h(
        ServicesProvider,
        { services: fakeServices() },
        h(
          MemoryRouter,
          {
            initialEntries: [
              {
                pathname: `/app/r/${R}`,
                state: { missingSection: 'warehouse' },
              },
            ],
          },
          h(
            Routes,
            null,
            h(Route, {
              path: '/app/r/:restaurantID',
              element: h(OverviewPage),
            }),
          ),
        ),
      ),
    ),
  );
  const page = text(html);
  const notice = page.indexOf(
    'Раздел «Склад» недоступен в ресторане «На Пушкинской»',
  );
  // «Собрать заказ» is the header action; the warehouse tile follows.
  assert.ok(notice > page.indexOf('Обзор'), 'the notice follows the header');
  assert.ok(
    html.indexOf('недоступен в ресторане') <
      html.indexOf(`href="/app/r/${R}/warehouse"`),
    'the notice precedes the tiles',
  );
});
