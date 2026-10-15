import assert from 'node:assert/strict';
import { test } from 'bun:test';
import fin from '../../api/completion-v1-examples.json' with { type: 'json' };
import batches from '../fixtures/ua1-product-batches.json' with { type: 'json' };
import {
  decodePlanningEnvelope,
  decodeSupplySuggestions,
} from '../../src/adapters/api/decode/planning.ts';
import {
  R,
  loaded,
  readyAccess,
  sampleRestaurant,
  renderRoute,
  text,
} from './support/render-route.mjs';

const pending = {
  items: [{ batch: batches.result.items[0].batch, status: 'pending_writeoff' }],
};
test('stock and M6 display actual quantities and partial-history facts', async () => {
  const supply = decodePlanningEnvelope(
    fin.examples[0].value,
    decodeSupplySuggestions,
    'warehouse',
  );
  const html = await renderRoute(`/app/r/${R}/warehouse`, {
    data: {
      inventory: loaded({
        items: [
          {
            productID: 'real-product',
            name: 'Продукт со стенда',
            baseUnit: 'g',
            availableQuantity: '12345',
            pendingWriteoffQuantity: '1000',
            onHandQuantity: '13345',
            expiringQuantity: '0',
          },
        ],
      }),
      supplySuggestions: loaded(supply.result, supply.context),
    },
  });
  const page = text(html);
  assert.match(page, /Продукт со стенда/);
  assert.match(page, /Можно использовать12,345 г/);
  assert.match(page, /Что докупить/);
  assert.match(page, /Данных пока мало/);
  assert.doesNotMatch(page, /P-0158/);
});
test('a human writeoff waits for the batch quantity unit instead of asking for blind confirmation', async () => {
  const html = await renderRoute(`/app/r/${R}/warehouse/expiry`, {
    data: { pendingWriteoffs: loaded(pending) },
  });
  assert.ok(
    /<button[^>]*disabled[^>]*>Подтвердить списание<\/button>/.test(html),
  );
});
test('the delivery header names the city of the organization time zone', async () => {
  const access = readyAccess([
    sampleRestaurant({ timeZone: 'Asia/Yekaterinburg' }),
  ]);
  const html = await renderRoute(`/app/r/${R}/warehouse/delivery`, { access });
  assert.match(text(html), / · Екатеринбург/);
  assert.match(text(html), /Изготовлено/);
  assert.doesNotMatch(text(html), /Asia\/Yekaterinburg|Москва|UTC/);
});
test('the delivery form has typed fields and no system select', async () => {
  const html = await renderRoute(`/app/r/${R}/warehouse/delivery`);
  assert.doesNotMatch(html, /<select/);
  assert.match(html, /aria-label="Открыть календарь"/);
  assert.match(
    html,
    /<input type="hidden" name="createdDate" value="14.10.2026"/,
  );
  assert.match(html, /<input type="hidden" name="createdTime" value="10:00"/);
  assert.match(html, /placeholder="Найти продукт"/);
  assert.match(html, /name="shelf-1"/);
  assert.match(html, /aria-label="Больше дней: строка 1"/);
  assert.doesNotMatch(html, />дней<\/option>/);
});
test('an unfinished delivery comes back into the typed fields', async () => {
  const civil = (localDateTime) => ({ civil: { localDateTime } });
  const html = await renderRoute(`/app/r/${R}/warehouse/delivery`, {
    pendingDelivery: {
      number: '1192',
      createdAt: civil('2026-10-13T09:00:00'),
      expectedSettingsVersion: '1',
      lines: [
        {
          productID: 'parmesan',
          quantity: '1500',
          manufacturedAt: civil('2026-10-10T09:40:00'),
          receivedAt: civil('2026-10-13T08:30:00'),
          shelfLife: { value: '7', unit: 'day' },
        },
      ],
    },
  });
  assert.match(html, /name="createdDate" value="13.10.2026"/);
  assert.match(html, /name="createdTime" value="09:00"/);
  assert.match(html, /name="made-date-1" value="10.10.2026"/);
  assert.match(html, /name="made-time-1" value="09:40"/);
  assert.match(html, /name="received-date-1" value="13.10.2026"/);
  assert.match(html, /name="received-time-1" value="08:30"/);
  assert.match(
    html,
    /name="shelf-1"[^>]*value="7"|value="7"[^>]*name="shelf-1"/,
  );
});
test('the closed delivery form disables every typed field', async () => {
  // No products are loaded, so the form is closed.
  const html = await renderRoute(`/app/r/${R}/warehouse/delivery`);
  const tags = (pattern) =>
    html.match(
      new RegExp(`<(?:button|input|span)\\s[^>]*${pattern}[^>]*>`, 'g'),
    ) ?? [];
  const disabled = (pattern, count) => {
    const found = tags(pattern);
    assert.equal(found.length, count, pattern);
    for (const tag of found) assert.match(tag, /\sdisabled=""/, tag);
  };
  disabled('aria-label="Открыть календарь"', 3);
  disabled('aria-label="Показать время"', 3);
  disabled('aria-label="Показать список"', 1);
  disabled('role="combobox"', 4);
  disabled('aria-label="Меньше дней: строка 1"', 1);
  disabled('aria-label="Больше дней: строка 1"', 1);
  disabled('name="shelf-1"', 1);
  const segments = tags('role="spinbutton"');
  assert.ok(segments.length > 0);
  for (const tag of segments) {
    assert.match(tag, /contentEditable="false"/, tag);
    assert.match(tag, /aria-disabled="true"/, tag);
  }
  assert.doesNotMatch(html, /contentEditable="true"/);
});
