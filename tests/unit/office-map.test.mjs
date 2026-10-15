import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { renderRoute, text } from './support/render-route.mjs';

const address = 'Ростов-на-Дону, ул. Тургеневская, 10/6';
const query = encodeURIComponent('Ростов-на-Дону, Тургеневская улица, 10/6');

test('the contacts show the office on a Yandex map', async () => {
  const html = await renderRoute('/');
  const plain = text(html);
  assert.ok(plain.includes(address));
  assert.ok(plain.includes('Пн–пт, 9:00–18:00'));
  assert.ok(!plain.includes('[адрес офиса]'));
  assert.ok(!plain.includes('[часы работы поддержки]'));
  assert.ok(
    html.includes(
      `src="https://yandex.ru/map-widget/v1/?text=${query}&amp;z=17"`,
    ),
  );
  assert.ok(html.includes(`title="Карта: ${address}"`));
  assert.ok(html.includes('loading="lazy"'));
  assert.ok(html.includes(`href="https://yandex.ru/maps/?text=${query}"`));
});

test('the policies name the Yandex map and its cookies', async () => {
  const cookies = text(await renderRoute('/cookies'));
  assert.ok(cookies.includes('встроена карта сервиса Яндекс Карты'));
  assert.ok(!cookies.includes('сторонние виджеты и сквозные'));
  const privacy = text(await renderRoute('/privacy'));
  assert.ok(privacy.includes('загружается с сервиса Яндекс Карты'));
});
