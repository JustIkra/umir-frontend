import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  R,
  h1,
  hrefs,
  labels,
  readyAccess,
  redirectOf,
  renderRoute,
  sampleRestaurant,
} from './support/render-route.mjs';

const pages = [
  ['/login', 'Вход', ['Логин', 'Пароль', 'Запомнить меня']],
  ['/login/code', 'Введите код', ['Код из письма']],
  ['/password-reset', 'Восстановление пароля', ['Логин']],
  ['/password-reset/code', 'Введите код', ['Код из письма']],
  [
    '/password-reset/new',
    'Новый пароль',
    ['Новый пароль', 'Повторите новый пароль'],
  ],
  [`/app/r/${R}`, 'Обзор', []],
  [`/app/r/${R}/orders`, 'Новый заказ', []],
  [`/app/r/${R}/orders/draft`, 'Новый заказ', []],
  [`/app/r/${R}/orders/proposal`, 'Новый заказ', []],
  [`/app/r/${R}/orders/placed`, 'Новый заказ', []],
  [`/app/r/${R}/warehouse`, 'Склад', []],
  [`/app/r/${R}/warehouse/expiry`, 'Склад', []],
  [`/app/r/${R}/warehouse/history`, 'Склад', []],
  [
    `/app/r/${R}/warehouse/delivery`,
    'Приём поставки',
    ['Номер поставки', 'Дата и время создания поставки (Москва, UTC+3)'],
  ],
  [`/app/r/${R}/catalog`, 'Справочники', []],
  [`/app/r/${R}/catalog/dishes`, 'Справочники', []],
  [`/app/r/${R}/catalog/dishes/206`, 'Паста с лососем и шпинатом', []],
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

for (const [path, title, fields] of pages) {
  test(`${path} shows «${title}» with its fields`, async () => {
    const html = await renderRoute(path);
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
    '/login/code',
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
    `/app/r/${R}/orders/draft`,
    `/app/r/${R}/orders/proposal`,
    `/app/r/${R}/orders/placed`,
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
    for (const href of hrefs(await renderRoute(source))) {
      if (!href.startsWith('/') || href.startsWith('//')) continue;
      const path = href.split('#')[0] || '/';
      if (checked.has(path)) continue;
      checked.add(path);
      assert.notEqual(
        h1(await renderRoute(path)),
        'Страница не найдена',
        `${source} → ${href}`,
      );
    }
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

test('the account menu lists workplaces and leads to organizations', async () => {
  const html = await renderRoute('/app');
  assert.ok(hrefs(html).includes('/app/organizations'));
  assert.ok(html.includes('Найти ресторан'));
  assert.equal(html.match(/aria-current="true"/g)?.length, 1);
});

test('without restaurants the shell has no sections and no workplaces', async () => {
  const html = await renderRoute('/app/no-restaurants');
  assert.ok(!hrefs(html).includes(`/app/r/${R}/orders`));
  assert.ok(!html.includes('Рабочее место'));
  assert.ok(hrefs(html).includes('/app/organizations/new'));
});

test('the catalog lists the sample products and dishes', async () => {
  const productsHtml = await renderRoute(`/app/r/${R}/catalog`);
  assert.ok(productsHtml.includes('Яйцо куриное'));
  assert.ok(hrefs(productsHtml).includes(`/app/r/${R}/catalog/products/new`));
  const dishesHtml = await renderRoute(`/app/r/${R}/catalog/dishes`);
  assert.ok(hrefs(dishesHtml).includes(`/app/r/${R}/catalog/dishes/206`));
  assert.ok(!hrefs(dishesHtml).includes(`/app/r/${R}/catalog/dishes/201`));
});

test('dish pages exist only for sample recipes', async () => {
  for (const path of [
    `/app/r/${R}/catalog/dishes/201`,
    `/app/r/${R}/catalog/dishes/999`,
  ])
    assert.equal(h1(await renderRoute(path)), notFound, path);
});

test('section pages keep their sidebar item current', async () => {
  const html = await renderRoute(`/app/r/${R}/catalog/dishes`);
  assert.match(
    html,
    new RegExp(`<a[^>]*aria-current="page"[^>]*href="/app/r/${R}/catalog"`),
  );
});

test('the warehouse shows the sample stock, expiry and history', async () => {
  const stockHtml = await renderRoute(`/app/r/${R}/warehouse`);
  assert.ok(stockHtml.includes('P-0158'));
  assert.ok(hrefs(stockHtml).includes(`/app/r/${R}/warehouse/delivery`));
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
  assert.ok(
    hrefs(await renderRoute(`/app/r/${R}/orders`)).includes(
      `/app/r/${R}/orders/draft`,
    ),
  );
  const draft = await renderRoute(`/app/r/${R}/orders/draft`);
  assert.ok(draft.includes('5 позиций · 9 порций'));
  assert.ok(hrefs(draft).includes(`/app/r/${R}/orders/proposal`));
  const proposalHtml = await renderRoute(`/app/r/${R}/orders/proposal`);
  assert.ok(proposalHtml.includes('Не весь заказ можно приготовить'));
  const placed = await renderRoute(`/app/r/${R}/orders/placed`);
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
  const guest = { session: { status: 'anonymous', expired: false } };
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
