import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { ChakraProvider } from '@chakra-ui/react';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { OverviewPage } from '../../src/presentation/overview/overview-page.tsx';
import { ServicesProvider } from '../../src/presentation/services.tsx';
import { usePermissions } from '../../src/presentation/session/hooks.ts';
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

// The warehouse of the render tests at 10:00 Moscow time: salmon has a batch
// in the 24 h window and one later in 48 h, cream waits for its write-off,
// eggs ran out.
const stockRows = [
  {
    productID: '130',
    name: 'Филе лосося',
    baseUnit: 'g',
    availableQuantity: '2100000',
    pendingWriteoffQuantity: '0',
    onHandQuantity: '2100000',
    expiringQuantity: '2100000',
  },
  {
    productID: '121',
    name: 'Сливки 33%',
    baseUnit: 'ml',
    availableQuantity: '0',
    pendingWriteoffQuantity: '1000000',
    onHandQuantity: '1000000',
    expiringQuantity: '0',
  },
  {
    productID: '132',
    name: 'Яйцо',
    baseUnit: 'pcs',
    availableQuantity: '0',
    pendingWriteoffQuantity: '0',
    onHandQuantity: '0',
    expiringQuantity: '0',
  },
];
const stockReportFor = (riskHours, cutoff) =>
  loaded({
    riskHours,
    riskCutoff: instantOf(cutoff),
    items: stockRows,
    nextCursor: undefined,
  });
const warehouseData = {
  products: catalogProducts,
  inventory: loaded({ items: stockRows }),
  expiringBatches: loaded({
    evaluatedAt,
    stateVersion: '1',
    items: [
      {
        batchID: 'P-0147',
        productID: '130',
        remainingQuantity: '100000',
        baseUnit: 'g',
        expiresAt: instantOf('2026-10-15T06:38:00+03:00'),
        remainingSeconds: '74280',
      },
      {
        batchID: 'P-0158',
        productID: '130',
        remainingQuantity: '2000000',
        baseUnit: 'g',
        expiresAt: instantOf('2026-10-16T09:00:00+03:00'),
        remainingSeconds: '169200',
      },
    ],
  }),
  pendingWriteoffs: loaded({
    items: [
      {
        status: 'pending_writeoff',
        batch: {
          batchID: 'P-0164',
          deliveryID: 'dlv-1192',
          lineNo: '4',
          productID: '121',
          manufacturedAt: instantOf('2026-10-01T09:00:00+03:00'),
          shelfLife: { value: '10', unit: 'day' },
          receivedAt: instantOf('2026-10-14T09:21:00+03:00'),
          expiresAt: instantOf('2026-10-11T09:00:00+03:00'),
          receivedQuantity: '1000000',
          remainingQuantity: '1000000',
        },
      },
    ],
  }),
  stockReport: {
    72: stockReportFor(72, '2026-10-17T10:00:00+03:00'),
    168: stockReportFor(168, '2026-10-21T10:00:00+03:00'),
  },
  history: loaded({
    events: [
      {
        type: 'ProductRegistered',
        sequence: '1049',
        recordedAt: instantOf('2026-10-14T08:10:00+03:00'),
      },
      {
        type: 'DeliveryReceived',
        sequence: '1052',
        recordedAt: instantOf('2026-10-14T09:02:11+03:00'),
        number: '1190',
        lines: 2,
        batches: 2,
      },
      {
        type: 'OrderPlaced',
        sequence: '1055',
        recordedAt: instantOf('2026-10-14T09:06:31+03:00'),
        orderID: 'ord-20261014-0042',
        positions: 3,
      },
      {
        type: 'DeliveryReceived',
        sequence: '1056',
        recordedAt: instantOf('2026-10-14T09:21:08+03:00'),
        number: '1192',
        lines: 4,
        batches: 4,
      },
      {
        type: 'BatchExpiryPending',
        sequence: '1057',
        recordedAt: instantOf('2026-10-14T09:21:08+03:00'),
        batchID: 'P-0164',
        productID: '121',
        quantity: '1000000',
        baseUnit: 'ml',
      },
    ],
  }),
};
// The overview reads the warehouse, the catalog and serving.
const overviewData = {
  ...servingData,
  ...warehouseData,
  dishCatalog: catalogDishes,
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
  [`/app/r/${R}`, 'Обзор', [], { data: overviewData }],
  [`/app/r/${R}/orders`, 'Новый заказ', [], { data: servingData }],
  [`/app/r/${R}/warehouse`, 'Склад', [], { data: warehouseData }],
  [`/app/r/${R}/warehouse/expiry`, 'Склад', [], { data: warehouseData }],
  [`/app/r/${R}/warehouse/history`, 'Склад', [], { data: warehouseData }],
  [
    `/app/r/${R}/warehouse/delivery`,
    'Приём поставки',
    ['Номер поставки', 'Дата и время создания поставки (Москва, UTC+3)'],
    { data: warehouseData },
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
  [`/app/r/${R}/menu`, 'Меню и рекомендации', []],
  [`/app/r/${R}/analytics`, 'Аналитика', []],
  [
    '/app/settings',
    'Учётная запись',
    ['Текущий пароль', 'Новый пароль', 'Повторите новый пароль'],
  ],
  ['/app/organizations', 'Организации и рестораны', []],
  [
    '/app/organizations/yug',
    'Сеть ресторанов Южного федерального округа',
    ['Название ресторана'],
  ],
  ['/app/organizations/vostok-food', 'Восток Фуд', []],
  ['/app/organizations/vostok-food-europe', 'Восток Фуд Европа', []],
  [
    '/app/organizations/yug/members',
    'Сеть ресторанов Южного федерального округа',
    [],
  ],
  [
    '/app/organizations/yug/members/i-kovaleva',
    'Ирина Ковалёва',
    ['Склад', 'Официант'],
  ],
  [
    '/app/organizations/yug/invitations',
    'Сеть ресторанов Южного федерального округа',
    [],
  ],
  [
    '/app/organizations/yug/invitations/new',
    'Пригласить участника',
    ['Почта', 'Склад', 'Официант'],
  ],
  [
    '/app/organizations/yug/profile',
    'Сеть ресторанов Южного федерального округа',
    ['Часовой пояс организации'],
  ],
  [
    '/app/organizations/new',
    'Создать предприятие',
    [
      'Название организации',
      'Название первого ресторана',
      'Часовой пояс организации',
    ],
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
    '/app/organizations',
    '/app/organizations/yug',
    '/app/organizations/vostok-food',
    '/app/organizations/yug/members',
    '/app/organizations/yug/members/i-kovaleva',
    '/app/organizations/yug/invitations',
    '/app/organizations/yug/invitations/new',
    '/app/organizations/yug/profile',
    '/app/organizations/new',
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

test('unknown ids show the 404 page', async () => {
  for (const path of [
    '/app/organizations/nobody',
    '/app/organizations/nobody/members',
  ])
    assert.equal(h1(await renderRoute(path)), notFound, path);
});

test('the administrator sees organization tabs, a staff member does not', async () => {
  const admin = hrefs(await renderRoute('/app/organizations/yug'));
  for (const tab of ['', '/members', '/invitations', '/profile'])
    assert.ok(admin.includes(`/app/organizations/yug${tab}`), `tab ${tab}`);
  const staff = hrefs(await renderRoute('/app/organizations/vostok-food'));
  assert.ok(!staff.includes('/app/organizations/vostok-food/members'));
});

test('organization pages leave the sidebar without a current item', async () => {
  const current = (html) => html.match(/aria-current="page"/g)?.length ?? 0;
  assert.equal(current(await renderRoute('/app/organizations')), 0);
  assert.equal(current(await renderRoute('/app/organizations/yug')), 1);
});

test('staff and admin ids outside the sample show 404', async () => {
  for (const path of [
    '/app/organizations/vostok-food/members',
    '/app/organizations/yug/members/m-belova',
    '/app/organizations/yug/members/nobody',
    '/app/organizations/vostok-food/profile',
  ])
    assert.equal(h1(await renderRoute(path)), notFound, path);
});

test('the member page checks the sample roles', async () => {
  const html = await renderRoute('/app/organizations/yug/members/i-kovaleva');
  assert.equal(
    html.match(/<input[^>]*type="checkbox"[^>]*checked/g)?.length,
    3,
  );
});

test('invitation actions follow the status', async () => {
  const html = await renderRoute('/app/organizations/yug/invitations');
  // Three pending rows and the submit button of the closed CX01 dialog.
  assert.equal(html.match(/>Отменить приглашение</g)?.length, 3 + 1);
  assert.equal(html.match(/>Пригласить повторно</g)?.length, 3);
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

test('the account menu lists workplaces and leads to organizations', async () => {
  const html = await renderRoute(`/app/r/${R}`, { access: twoOrganizations });
  const menu = accountMenu(html);
  assert.ok(hrefs(menu).includes('/app/organizations'));
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
  assert.ok(hrefs(html).includes('/app/organizations/new'));
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
  for (const path of ['/app/settings', '/app/organizations']) {
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

test('the warehouse shows the sample stock, expiry and history', async () => {
  assert.ok(
    (await renderRoute(`/app/r/${R}/warehouse/expiry`)).includes(
      'через 20 ч 38 мин',
    ),
  );
  assert.ok(
    (await renderRoute(`/app/r/${R}/warehouse/history`)).includes('#1057'),
  );
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

test('overview tiles lead into the sections', async () => {
  const links = hrefs(await renderRoute('/app'));
  for (const path of [
    `/app/r/${R}/orders`,
    `/app/r/${R}/warehouse`,
    `/app/r/${R}/warehouse/delivery`,
    `/app/r/${R}/warehouse/history`,
    `/app/r/${R}/warehouse/expiry`,
    `/app/r/${R}/catalog/products/new`,
    `/app/r/${R}/catalog/dishes/new`,
    `/app/r/${R}/menu`,
    `/app/r/${R}/analytics`,
  ])
    assert.ok(links.includes(path), path);
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
  assert.deepEqual(sectionLinks(html), [
    `/app/r/${R}`,
    `/app/r/${R}/orders`,
    `/app/r/${R}/menu`,
  ]);
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
  assert.ok(
    notice > page.indexOf('Собрать заказ'),
    'the notice follows the header',
  );
  assert.ok(
    html.indexOf('недоступен в ресторане') <
      html.indexOf(`href="/app/r/${R}/warehouse"`),
    'the notice precedes the tiles',
  );
});

function Rights() {
  return h('output', null, [...usePermissions()].sort().join(' '));
}

const rightsOf = (options, restaurantID = R) =>
  text(
    renderToString(
      h(
        ServicesProvider,
        { services: fakeServices(options) },
        h(
          MemoryRouter,
          { initialEntries: [`/app/r/${restaurantID}`] },
          h(
            Routes,
            null,
            h(Route, { path: '/app/r/:restaurantID', element: h(Rights) }),
          ),
        ),
      ),
    ),
  );

test('usePermissions gives the rights of the restaurant in the address', () => {
  const rights = rightsOf().split(' ');
  for (const permission of [
    'stock.read',
    'delivery.create',
    'writeoff.confirm',
    'analytics.read',
    'catalog.read',
    'catalog.write',
    'menu.read',
    'recommendations.read',
    'order.prepare',
  ])
    assert.ok(rights.includes(permission), permission);
  assert.equal(
    rightsOf({
      access: readyAccess([sampleRestaurant({ roles: ['Waiter'] })]),
    }),
    'feedback.submit menu.read order.confirm order.prepare order.read recommendations.read',
  );
  assert.equal(
    rightsOf({ permissions: ['stock.read', 'analytics.read'] }),
    'analytics.read stock.read',
  );
});

test('usePermissions is empty until access is ready and outside access', () => {
  assert.equal(rightsOf({ access: { status: 'loading' } }), '');
  assert.equal(rightsOf({ access: unverified }), '');
  assert.equal(rightsOf({}, '55555555-5555-4555-8555-555555555555'), '');
});
