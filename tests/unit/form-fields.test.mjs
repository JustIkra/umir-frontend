import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createElement as h } from 'react';
import { DateField } from '../../src/presentation/ui/date-field.tsx';
import {
  monthTitle,
  selectedTime,
  visibleTimes,
} from '../../src/presentation/ui/masks.ts';
import { QuantityInput } from '../../src/presentation/ui/form.tsx';
import { SearchSelect } from '../../src/presentation/ui/search-select.tsx';
import { Stepper, daysUnit } from '../../src/presentation/ui/stepper.tsx';
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

test('the date field has segments, a calendar button and a hidden value', () => {
  const html = renderElement(
    h(DateField, {
      id: 'd1',
      labelId: 'd1-label',
      name: 'made-date-1',
      defaultValue: '2026-10-15',
      today: '2026-10-15',
      timeZone: 'Europe/Moscow',
    }),
  );
  assert.match(html, /role="spinbutton"/);
  assert.match(html, /aria-label="Открыть календарь"/);
  assert.match(
    html,
    /<input type="hidden" name="made-date-1" value="15.10.2026"/,
  );
  assert.doesNotMatch(html, /type="date"/);
});

test('an empty date field gives an empty hidden value', () => {
  const html = renderElement(
    h(DateField, {
      id: 'd',
      name: 'd',
      today: '2026-10-15',
      timeZone: 'Asia/Yekaterinburg',
    }),
  );
  assert.match(html, /<input type="hidden" name="d" value=""/);
});

// Ark renders the attributes of the button in its own order, so the check
// looks for each one apart from the others.
test('a disabled date field disables the calendar button', () => {
  const html = renderElement(
    h(DateField, {
      id: 'd',
      today: '2026-10-15',
      timeZone: 'Europe/Moscow',
      disabled: true,
    }),
  );
  assert.match(
    html,
    /<button(?=[^>]*aria-label="Открыть календарь")(?=[^>]*disabled="")[^>]*>/,
  );
});

test('the calendar header is the month and the year, capitalised once', () => {
  assert.equal(monthTitle('октябрь 2026 г.'), 'Октябрь 2026');
  assert.equal(monthTitle('март 2027 г.'), 'Март 2027');
  assert.equal(monthTitle('Май 2026'), 'Май 2026');
  assert.equal(monthTitle(''), '');
});

test('the stepper names days and posts its value', () => {
  const html = renderElement(
    h(Stepper, {
      id: 's1',
      name: 'shelf-1',
      value: '3',
      label: 'строка 1',
      unit: daysUnit,
      invalid: false,
      onChange: () => {},
    }),
  );
  assert.match(
    html,
    /<input[^>]*name="shelf-1"[^>]*value="3"|<input[^>]*value="3"[^>]*name="shelf-1"/,
  );
  assert.match(html, /aria-label="Меньше дней: строка 1"/);
  assert.match(html, />дня</);
});

test('the stepper still names portions by default', () => {
  const html = renderElement(
    h(Stepper, { value: '5', label: 'позиция 1', onChange: () => {} }),
  );
  assert.match(html, /aria-label="Больше порций: позиция 1"/);
  assert.match(html, />порций</);
});

test('the quantity field asks for a decimal keyboard', () => {
  const html = renderElement(
    h(QuantityInput, { unit: 'г', defaultValue: '1,5' }),
  );
  assert.match(html, /inputMode="decimal"|inputmode="decimal"/);
  assert.match(html, /value="1,5"/);
});
