import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createElement as h } from 'react';
import {
  dialogText,
  dialogTitle,
  keepsDialog,
  pendingRows,
  pendingTitle,
  writeoffMessage,
} from '../../src/presentation/warehouse/writeoff-messages.ts';
import { WriteoffDialog } from '../../src/presentation/warehouse/writeoff-panel.tsx';
import {
  R,
  failedRead,
  instantOf,
  loaded,
  renderElement,
  renderRoute,
  text,
} from './support/render-route.mjs';

const nbsp = String.fromCharCode(0xa0);
const PATH = `/app/r/${R}/warehouse/expiry`;
const evaluatedAt = instantOf('2026-10-14T10:00:00+03:00');
const batch = (batchID, productID, expiresIso, remaining) => ({
  batchID,
  deliveryID: 'd-1',
  lineNo: '1',
  productID,
  manufacturedAt: instantOf('2025-10-14T10:00:00+03:00'),
  shelfLife: { value: '1', unit: 'day' },
  receivedAt: instantOf('2026-10-14T09:00:00+03:00'),
  expiresAt: instantOf(expiresIso),
  receivedQuantity: remaining,
  remainingQuantity: remaining,
});
const pending = {
  items: [
    {
      batch: batch('P-0170', '121', '2026-10-13T12:00:00+03:00', '1000000'),
      status: 'pending_writeoff',
    },
    {
      batch: batch('P-0164', '999', '2025-10-15T10:00:00+03:00', '1500'),
      status: 'pending_writeoff',
    },
    {
      batch: batch('P-0133', '121', '2026-10-10T15:00:00+03:00', '150000'),
      status: 'written_off',
    },
    {
      batch: batch('P-0180', '121', '2026-10-20T15:00:00+03:00', '150000'),
      status: 'available',
    },
  ],
};
const catalog = [{ productID: '121', name: 'Сливки 33%', baseUnit: 'ml' }];
const products = new Map(catalog.map((item) => [item.productID, item]));
const productsRead = loaded({ evaluatedAt, stateVersion: '1', items: catalog });
const windowRead = loaded({ evaluatedAt, stateVersion: '1', items: [] });
const result = {
  batchID: 'P-0170',
  productID: '121',
  writtenOffQuantity: '1000000',
  baseUnit: 'ml',
  actorUserID: 'u',
  confirmedAt: instantOf('2026-10-14T10:05:00+03:00'),
  eventID: 'e-1',
};

test('pending rows: pending_writeoff only, oldest first, unit from the catalog', () => {
  const rows = pendingRows(pending, products, 'Europe/Moscow');
  assert.deepEqual(rows, [
    {
      batchID: 'P-0164',
      productID: '999',
      product: '999',
      quantity: '1,5',
      expired: 'срок истёк 15.10.2025, 10:00',
    },
    {
      batchID: 'P-0170',
      productID: '121',
      product: 'Сливки 33%',
      quantity: `1${nbsp}000 мл`,
      expired: 'срок истёк 13.10.2026, 12:00',
    },
  ]);
  assert.equal(pendingTitle(2), 'Ожидают списания · 2');
  assert.equal(pendingTitle(undefined), 'Ожидают списания · …');
  assert.equal(dialogTitle('P-0170'), 'Списать партию P-0170?');
  assert.equal(
    dialogText(rows[1]),
    `Сливки 33% · остаток 1${nbsp}000 мл. Склад спишет фактический остаток партии на момент подтверждения. Отменить списание нельзя.`,
  );
});

test('outcome texts of spec 6.3', () => {
  const zone = 'Europe/Moscow';
  assert.deepEqual(
    writeoffMessage({ kind: 'written-off', result }, 'P-0170', zone),
    {
      tone: 'success',
      title: `Партия P-0170 списана: 1${nbsp}000 мл, 14.10.2026, 10:05.`,
      text: undefined,
    },
  );
  assert.deepEqual(writeoffMessage({ kind: 'unknown' }, 'P-0170', zone), {
    tone: 'unknown',
    title: 'Результат списания неизвестен',
    text: 'Ответ склада не получен. Списание могло пройти. Проверьте результат: проверка не спишет партию дважды.',
  });
  assert.deepEqual(writeoffMessage({ kind: 'already' }, 'P-0170', zone), {
    tone: 'info',
    title: 'Партия уже списана',
    text: 'Списание этой партии уже записано. Список обновлён.',
  });
  assert.deepEqual(writeoffMessage({ kind: 'not-pending' }, 'P-0170', zone), {
    tone: 'error',
    title: 'Партию пока нельзя списать',
    text: 'По данным склада срок годности партии ещё не истёк. Список обновлён.',
  });
  assert.deepEqual(writeoffMessage({ kind: 'not-found' }, 'P-0170', zone), {
    tone: 'error',
    title: 'Партия не найдена',
    text: 'Список обновлён.',
  });
  assert.deepEqual(
    writeoffMessage(
      { kind: 'refused', code: 'CommandConflict' },
      'P-0170',
      zone,
    ),
    {
      tone: 'error',
      title: 'Списание не выполнено',
      text: 'Склад отклонил запрос: ничего не записано. Повторите позже.',
    },
  );
  assert.deepEqual(writeoffMessage({ kind: 'check-failed' }, 'P-0170', zone), {
    tone: 'error',
    title: 'Проверка не удалась',
    text: 'Не удалось проверить. Повторите позже.',
  });
  assert.equal(writeoffMessage({ kind: 'reset' }, 'P-0170', zone), undefined);
  assert.equal(writeoffMessage({ kind: 'ended' }, 'P-0170', zone), undefined);
});

test('only an unknown outcome and a failed check keep the dialog open', () => {
  assert.equal(keepsDialog({ kind: 'unknown' }), true);
  assert.equal(keepsDialog({ kind: 'check-failed' }), true);
  for (const outcome of [
    { kind: 'written-off', result },
    { kind: 'already' },
    { kind: 'not-pending' },
    { kind: 'not-found' },
    { kind: 'reset' },
    { kind: 'refused', code: 'Forbidden' },
    { kind: 'ended' },
  ])
    assert.equal(keepsDialog(outcome), false, outcome.kind);
});

test('«Ожидают списания» sits under the window with the batches to confirm', async () => {
  const plain = text(
    await renderRoute(PATH, {
      data: {
        expiringBatches: windowRead,
        pendingWriteoffs: loaded(pending),
        products: productsRead,
      },
    }),
  );
  for (const part of [
    'Ожидают списания · 2',
    'Срок годности истёк. Партии не используются в заказах и остаются на складе до подтверждения списания.',
    'Сливки 33%',
    'Партия P-0170 · остаток 1 000 мл',
    'срок истёк 13.10.2026, 12:00',
    'Партия P-0164 · остаток 1,5',
  ])
    assert.ok(plain.includes(part), part);
  assert.ok(!plain.includes('P-0133'));
  assert.ok(!plain.includes('P-0180'));
  assert.equal(plain.split('Подтвердить списание').length - 1, 2);
  assert.ok(
    plain.indexOf('В окне нет партий') < plain.indexOf('Ожидают списания'),
  );
});

test('«Подтвердить списание» needs writeoff.confirm', async () => {
  const plain = text(
    await renderRoute(PATH, {
      data: {
        expiringBatches: windowRead,
        pendingWriteoffs: loaded(pending),
        products: productsRead,
      },
      permissions: ['stock.read', 'catalog.read'],
    }),
  );
  assert.ok(plain.includes('Партия P-0170'));
  assert.ok(!plain.includes('Подтвердить списание'));
});

test('the block on the report windows, empty and failed', async () => {
  const empty = text(
    await renderRoute(`${PATH}?window=3d`, {
      data: { pendingWriteoffs: loaded({ items: [] }) },
    }),
  );
  assert.ok(empty.includes('Ожидают списания · 0'));
  assert.ok(empty.includes('Партий, ожидающих списания, нет.'));
  const failed = text(
    await renderRoute(PATH, {
      data: {
        expiringBatches: windowRead,
        pendingWriteoffs: failedRead('InventoryUnavailable', 503),
      },
    }),
  );
  assert.ok(failed.includes('Не удалось получить партии под списание'));
  assert.ok(failed.includes('Повторить'));
  assert.ok(failed.includes('В окне нет партий'));
});

const row = pendingRows(pending, products, 'Europe/Moscow')[1];
const dialog = (props) =>
  renderElement(
    h(WriteoffDialog, {
      dialogRef: { current: null },
      row,
      step: 'confirm',
      notice: undefined,
      onConfirm: () => {},
      onCheck: () => {},
      onClosed: () => {},
      ...props,
    }),
  );

test('the dialog asks to write off the batch', () => {
  const plain = text(dialog());
  for (const part of [
    'Списать партию P-0170?',
    'Сливки 33% · остаток 1 000 мл. Склад спишет фактический остаток партии на момент подтверждения. Отменить списание нельзя.',
    'Списать партию',
    'Отмена',
  ])
    assert.ok(plain.includes(part), part);
  // The safe button comes first and gets the focus of the opened dialog.
  assert.ok(plain.indexOf('Отмена') < plain.lastIndexOf('Списать партию'));
});

test('while sending both buttons are closed and say «Списываем…»', () => {
  const html = dialog({ step: 'sending' });
  assert.ok(text(html).includes('Списываем…'));
  assert.equal(html.split('disabled=""').length - 1, 2);
  assert.ok(html.includes('aria-busy="true"'));
});

test('an unknown outcome offers «Проверить результат»; a failed check says so', () => {
  const unknown = text(dialog({ step: 'unknown' }));
  for (const part of [
    'Результат списания неизвестен',
    'Ответ склада не получен. Списание могло пройти. Проверьте результат: проверка не спишет партию дважды.',
    'Проверить результат',
    'Закрыть',
  ])
    assert.ok(unknown.includes(part), part);
  assert.ok(!unknown.includes('Списываем…'));
  const failed = text(
    dialog({
      step: 'unknown',
      notice: writeoffMessage({ kind: 'check-failed' }, 'P-0170', 'UTC'),
    }),
  );
  assert.ok(failed.includes('Не удалось проверить. Повторите позже.'));
  const checking = dialog({ step: 'checking' });
  assert.equal(checking.split('disabled=""').length - 1, 2);
});
