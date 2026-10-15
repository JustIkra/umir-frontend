import assert from 'node:assert/strict';
import { test } from 'bun:test';
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
