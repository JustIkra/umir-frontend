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
  assert.match(page, /Пригодно12,345 г/);
  assert.match(page, /Предложения поставок/);
  assert.match(page, /История расхода неполная/);
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
test('delivery labels follow the actual organization time zone', async () => {
  const access = readyAccess([
    sampleRestaurant({ timeZone: 'Asia/Yekaterinburg' }),
  ]);
  const html = await renderRoute(`/app/r/${R}/warehouse/delivery`, { access });
  assert.match(text(html), /Изготовлено \(Asia\/Yekaterinburg\)/);
  assert.doesNotMatch(text(html), /Изготовлено \(Москва/);
});
