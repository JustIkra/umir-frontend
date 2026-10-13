import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { h1, hrefs, labels, renderRoute } from './support/render-route.mjs';

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
  ['/app', 'Обзор', []],
  ['/app/orders', 'Новый заказ', []],
  ['/app/orders/draft', 'Новый заказ', []],
  ['/app/orders/proposal', 'Новый заказ', []],
  ['/app/orders/placed', 'Новый заказ', []],
  ['/app/warehouse', 'Склад', []],
  ['/app/warehouse/expiry', 'Склад', []],
  ['/app/warehouse/history', 'Склад', []],
  [
    '/app/warehouse/delivery',
    'Приём поставки',
    ['Номер поставки', 'Дата и время создания поставки (Москва, UTC+3)'],
  ],
  ['/app/catalog', 'Справочники', []],
  ['/app/catalog/dishes', 'Справочники', []],
  ['/app/catalog/dishes/206', 'Паста с лососем и шпинатом', []],
  [
    '/app/catalog/products/new',
    'Новый продукт',
    ['Название', 'Код продукта', 'граммы, г', 'миллилитры, мл', 'штуки, шт'],
  ],
  ['/app/catalog/dishes/new', 'Новое блюдо', ['Название', 'Код блюда']],
  ['/app/menu', 'Меню и рекомендации', []],
  ['/app/analytics', 'Аналитика', []],
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
  assert.ok(!hrefs(html).includes('/app/orders'));
  assert.ok(!html.includes('Рабочее место'));
  assert.ok(hrefs(html).includes('/app/organizations/new'));
});

test('the catalog lists the sample products and dishes', async () => {
  const productsHtml = await renderRoute('/app/catalog');
  assert.ok(productsHtml.includes('Яйцо куриное'));
  assert.ok(hrefs(productsHtml).includes('/app/catalog/products/new'));
  const dishesHtml = await renderRoute('/app/catalog/dishes');
  assert.ok(hrefs(dishesHtml).includes('/app/catalog/dishes/206'));
  assert.ok(!hrefs(dishesHtml).includes('/app/catalog/dishes/201'));
});

test('dish pages exist only for sample recipes', async () => {
  for (const path of ['/app/catalog/dishes/201', '/app/catalog/dishes/999'])
    assert.equal(h1(await renderRoute(path)), notFound, path);
});

test('section pages keep their sidebar item current', async () => {
  const html = await renderRoute('/app/catalog/dishes');
  assert.match(html, /<a[^>]*aria-current="page"[^>]*href="\/app\/catalog"/);
});

test('the warehouse shows the sample stock, expiry and history', async () => {
  const stockHtml = await renderRoute('/app/warehouse');
  assert.ok(stockHtml.includes('P-0158'));
  assert.ok(hrefs(stockHtml).includes('/app/warehouse/delivery'));
  assert.ok(
    (await renderRoute('/app/warehouse/expiry')).includes('через 20 ч 38 мин'),
  );
  assert.ok((await renderRoute('/app/warehouse/history')).includes('#1057'));
});

test('the order flow goes from the menu to the placed order', async () => {
  assert.ok(
    hrefs(await renderRoute('/app/orders')).includes('/app/orders/draft'),
  );
  const draft = await renderRoute('/app/orders/draft');
  assert.ok(draft.includes('5 позиций · 9 порций'));
  assert.ok(hrefs(draft).includes('/app/orders/proposal'));
  const proposalHtml = await renderRoute('/app/orders/proposal');
  assert.ok(proposalHtml.includes('Не весь заказ можно приготовить'));
  const placed = await renderRoute('/app/orders/placed');
  assert.ok(placed.includes('ord-20261010-0042'));
  assert.ok(hrefs(placed).includes('/app/warehouse/history'));
});

test('overview tiles lead into the sections', async () => {
  const links = hrefs(await renderRoute('/app'));
  for (const path of [
    '/app/orders',
    '/app/warehouse',
    '/app/warehouse/delivery',
    '/app/warehouse/history',
    '/app/warehouse/expiry',
    '/app/catalog/products/new',
    '/app/catalog/dishes/new',
    '/app/menu',
    '/app/analytics',
  ])
    assert.ok(links.includes(path), path);
});
