import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  dishes,
  findProduct,
  findRecipeDish,
  products,
} from '../../src/presentation/placeholder-catalog.ts';
import {
  draftOrder,
  menu,
  placedOrder,
  proposal,
} from '../../src/presentation/placeholder-orders.ts';
import {
  history,
  stock,
} from '../../src/presentation/placeholder-warehouse.ts';

test('the catalog sample matches K01 and K12', () => {
  assert.equal(products.length, 32);
  assert.equal(new Set(products.map((p) => p.code)).size, 32);
  assert.equal(dishes.length, 12);
  assert.deepEqual(
    dishes.filter((d) => d.recipe).map((d) => d.code),
    ['206'],
  );
  assert.equal(findRecipeDish('206')?.name, 'Паста с лососем и шпинатом');
  assert.equal(findRecipeDish('201'), undefined);
  assert.equal(findRecipeDish('999'), undefined);
});

test('recipe lines name catalog products', () => {
  for (const dish of dishes)
    for (const line of dish.recipe ?? [])
      assert.ok(findProduct(line.product), `${dish.code}: ${line.product}`);
});

test('the order sample is consistent from draft to placed order', () => {
  assert.equal(menu.length, 9);
  assert.equal(draftOrder.length, 5);
  assert.equal(proposal.rows.length, draftOrder.length);
  assert.equal(placedOrder.lines.length, 4);
});

test('the warehouse sample matches S1 and H1', () => {
  assert.equal(stock.length, 10);
  assert.deepEqual(
    stock.filter((row) => row.items).map((row) => row.product),
    ['Сыр пармезан'],
  );
  assert.deepEqual(
    history.map((event) => event.id),
    ['#1050', '#1051', '#1052', '#1053', '#1054', '#1055', '#1056', '#1057'],
  );
});
