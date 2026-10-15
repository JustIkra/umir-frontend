import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createElement as h } from 'react';
import { SearchSelect } from '../../src/presentation/ui/search-select.tsx';
import { renderElement } from './support/render-route.mjs';

const products = [
  { value: 'parmesan', label: 'Сыр пармезан', code: 'parmesan' },
  { value: 'arugula', label: 'Руккола', code: 'arugula' },
];

test('the search select is a combobox with a hidden value, not a select', () => {
  const html = renderElement(
    h(SearchSelect, {
      id: 'p1',
      name: 'product-1',
      options: products,
      defaultValue: 'arugula',
      placeholder: 'Выберите продукт',
    }),
  );
  assert.match(html, /role="combobox"/);
  assert.match(html, /<input[^>]*id="p1"/);
  assert.match(html, /<input type="hidden" name="product-1" value="arugula"/);
  assert.match(html, /value="Руккола"/);
  assert.doesNotMatch(html, /<select/);
});

test('a value whose options arrive later shows the name once they do', () => {
  const empty = renderElement(
    h(SearchSelect, {
      id: 'p',
      options: [],
      value: 'parmesan',
      placeholder: 'Выберите продукт',
    }),
  );
  assert.doesNotMatch(empty, /value="parmesan"/);
  const loaded = renderElement(
    h(SearchSelect, {
      id: 'p',
      options: products,
      value: 'parmesan',
      placeholder: 'Выберите продукт',
    }),
  );
  assert.match(loaded, /value="Сыр пармезан"/);
});

test('a disabled search select disables its input and trigger', () => {
  const html = renderElement(
    h(SearchSelect, {
      id: 'p',
      options: products,
      placeholder: 'Выберите продукт',
      disabled: true,
    }),
  );
  // Ark writes disabled before id on the server, so the order is not asserted.
  assert.match(html, /<input(?=[^>]*\sid="p")(?=[^>]*\sdisabled="")/);
  assert.match(
    html,
    /<button[^>]*aria-label="Показать список"[^>]*disabled=""/,
  );
});
