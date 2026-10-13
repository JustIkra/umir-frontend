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
