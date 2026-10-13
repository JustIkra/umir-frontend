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
  ['/app/orders', 'Заказы', []],
  ['/app/warehouse', 'Склад', []],
  ['/app/catalog', 'Справочники', []],
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
