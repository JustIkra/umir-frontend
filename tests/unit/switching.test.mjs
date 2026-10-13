import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createElement as h } from 'react';
import { decideSwitch } from '../../src/application/switching.ts';
import {
  UnknownAttemptDialog,
  UnsavedFormDialog,
} from '../../src/presentation/app-shell/switch-dialogs.tsx';
import {
  R,
  renderElement,
  sampleRestaurant,
  text,
} from './support/render-route.mjs';

const other = sampleRestaurant({
  restaurantID: '55555555-5555-4555-8555-555555555555',
  name: 'На Тургеневской',
  roles: ['Waiter'],
});
const attempt = {
  key: 'orders.confirm',
  commandID: 'c',
  label: 'оформления заказа',
  restaurantID: R,
  startedAt: 0,
};

test('the switcher keeps the section when the new restaurant allows it', () => {
  assert.deepEqual(
    decideSwitch({
      target: other,
      section: 'orders',
      currentID: R,
      attempts: [],
      unsavedForm: undefined,
    }),
    {
      kind: 'go',
      to: {
        restaurantID: other.restaurantID,
        section: 'orders',
        missing: undefined,
      },
    },
  );
});

test('a section the new restaurant lacks leads to its overview (W12)', () => {
  assert.deepEqual(
    decideSwitch({
      target: other,
      section: 'warehouse',
      currentID: R,
      attempts: [],
      unsavedForm: undefined,
    }),
    {
      kind: 'go',
      to: {
        restaurantID: other.restaurantID,
        section: 'overview',
        missing: 'warehouse',
      },
    },
  );
});

test('an unsent form asks first (W10); an unknown attempt blocks the switch (W11)', () => {
  assert.equal(
    decideSwitch({
      target: other,
      section: 'orders',
      currentID: R,
      attempts: [],
      unsavedForm: 'Форма поставки',
    }).kind,
    'confirm-unsaved',
  );
  assert.deepEqual(
    decideSwitch({
      target: other,
      section: 'orders',
      currentID: R,
      attempts: [attempt],
      unsavedForm: 'Форма поставки',
    }),
    { kind: 'blocked-unknown', attempt },
  );
  const elsewhere = { ...attempt, restaurantID: other.restaurantID };
  assert.equal(
    decideSwitch({
      target: other,
      section: 'orders',
      currentID: R,
      attempts: [elsewhere],
      unsavedForm: undefined,
    }).kind,
    'go',
  );
});

test('W10 names the unsent form and the restaurant; «Остаться» comes first', () => {
  const html = renderElement(
    h(UnsavedFormDialog, {
      dialogRef: { current: null },
      form: 'Форма поставки',
      restaurantName: 'На Пушкинской',
      onLeave: () => {},
    }),
  );
  // Tags are dropped without spaces: title, text, then the buttons in order.
  assert.equal(
    text(html),
    'Перейти в другой ресторан?' +
      'Форма поставки в ресторане «На Пушкинской» не отправлена. При переходе введённые данные будут удалены.' +
      'Остаться' +
      'Перейти без сохранения',
  );
});

test('W11 names the attempt with its time in the restaurant time zone', () => {
  const html = renderElement(
    h(UnknownAttemptDialog, {
      dialogRef: { current: null },
      attempt,
      restaurantName: 'На Пушкинской',
      timeZone: 'Europe/Moscow',
      onCheck: () => {},
    }),
  );
  assert.equal(
    text(html),
    'Переход в другой ресторан недоступен' +
      'Результат оформления заказа от 03:00:00 (UTC+3) в ресторане «На Пушкинской» неизвестен. Перейти в другой ресторан можно после проверки этой попытки.' +
      'Проверить попытку' +
      'Закрыть',
  );
});
