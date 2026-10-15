import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  findProduct,
  products,
} from '../../examples/ui-prototype/placeholder-catalog.ts';
import { overview } from '../../examples/ui-prototype/placeholder-orders.ts';
import {
  history,
  stock,
} from '../../examples/ui-prototype/placeholder-warehouse.ts';

test('the delivery products sample is unique and findable', () => {
  assert.equal(products.length, 32);
  assert.equal(new Set(products.map((p) => p.code)).size, 32);
  assert.equal(findProduct('101')?.name, 'Авокадо');
  assert.equal(findProduct('999'), undefined);
});

test('the overview sample has every tile', () => {
  assert.deepEqual(Object.keys(overview), [
    'warehouse',
    'menu',
    'catalog',
    'writeoff',
    'analytics',
  ]);
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
