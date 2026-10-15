import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createElement as h } from 'react';
import { selectedTime, visibleTimes } from '../../src/presentation/ui/masks.ts';
import { SearchSelect } from '../../src/presentation/ui/search-select.tsx';
import { TimeField } from '../../src/presentation/ui/time-field.tsx';
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

test('the time field is a combobox with a masked numeric input', () => {
  const html = renderElement(
    h(TimeField, {
      id: 't1',
      name: 'made-time-1',
      defaultValue: '14:27',
      'aria-label': 'Время изготовления, строка 1',
    }),
  );
  assert.match(html, /role="combobox"/);
  assert.match(html, /inputMode="numeric"|inputmode="numeric"/);
  assert.match(html, /placeholder="чч:мм"/);
  assert.match(html, /value="14:27"/);
  assert.match(html, /<input type="hidden" name="made-time-1" value="14:27"/);
  assert.doesNotMatch(html, /type="time"/);
});

test('a held time is completed in the hidden input, an invalid one is kept', () => {
  const hidden = (defaultValue) =>
    renderElement(
      h(TimeField, { id: 't', name: 'made-time', defaultValue }),
    ).match(/<input type="hidden" name="made-time" value="([^"]*)"/)?.[1];
  assert.equal(hidden('9'), '09:00');
  assert.equal(hidden('14:'), '14:00');
  assert.equal(hidden('14:75'), '14:75');
  assert.equal(hidden(''), '');
});

test('a held time shows the whole list, typing filters it', () => {
  assert.equal(visibleTimes('14:30', false).length, 48);
  assert.equal(visibleTimes('', true).length, 48);
  assert.deepEqual([...visibleTimes('14:', true)], ['14:00', '14:30']);
  assert.equal(visibleTimes('14:2', true).length, 48);
});

test('only a half hour of the list is the checked item', () => {
  assert.deepEqual([...selectedTime('14:30')], ['14:30']);
  assert.deepEqual([...selectedTime('14:27')], []);
  assert.deepEqual([...selectedTime('')], []);
});

const timeItem = (html, time) =>
  html.match(
    new RegExp(`<div[^>]*role="option"[^>]*data-value="${time}"[^>]*>`),
  )?.[0];

test('a held half hour is the checked item and the list is not cut to it', () => {
  const html = renderElement(h(TimeField, { id: 't', defaultValue: '14:30' }));
  assert.match(timeItem(html, '14:30') ?? '', /data-state="checked"/);
  assert.match(timeItem(html, '14:00') ?? '', /data-state="unchecked"/);
  assert.equal(html.match(/role="option"/g)?.length, 48);
});

test('a time between the half hours checks no item', () => {
  const html = renderElement(h(TimeField, { id: 't', defaultValue: '14:27' }));
  assert.doesNotMatch(html, /data-state="checked"/);
  assert.equal(html.match(/role="option"/g)?.length, 48);
});
