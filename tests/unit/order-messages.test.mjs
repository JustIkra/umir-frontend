import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  acceptanceText,
  attemptMessage,
  changeRows,
  compositionText,
  confirmedLines,
  draftSummary,
  finalText,
  noticeMessage,
  outcomeMessage,
  previousRows,
} from '../../src/presentation/orders/order-messages.ts';
import {
  R,
  instantOf,
  orderSnapshot,
  renderRoute,
  text,
} from './support/render-route.mjs';

const at = instantOf('2026-10-14T15:06:10+03:00');
const products = new Map([
  ['130', { productID: '130', name: 'Филе лосося', baseUnit: 'g' }],
]);
const names = new Map([
  ['206', 'Паста с лососем и шпинатом'],
  ['208', 'Салат с лососем'],
  ['202', 'Брускетта'],
]);
const proposal = {
  proposalID: 'prp-1',
  evaluatedAt: at,
  stateVersion: '1',
  requestedPositions: [
    { lineNo: '1', dishID: '202', portions: '2' },
    { lineNo: '2', dishID: '206', portions: '3' },
    { lineNo: '3', dishID: '208', portions: '1' },
  ],
  acceptedPositions: [
    { lineNo: '1', dishID: '202', portions: '2' },
    { lineNo: '2', dishID: '206', portions: '1' },
  ],
  changes: [
    {
      lineNo: '2',
      dishID: '206',
      requestedPortions: '3',
      acceptedPortions: '1',
      deficits: [
        {
          productID: '130',
          requiredQuantity: '360000',
          availableQuantity: '220000',
        },
      ],
    },
    {
      lineNo: '3',
      dishID: '208',
      requestedPortions: '1',
      acceptedPortions: '0',
      deficits: [
        {
          productID: '130',
          requiredQuantity: '110000',
          availableQuantity: '100000',
        },
      ],
    },
  ],
  warehouseEpoch: '66666666-6666-4666-8666-666666666666',
};
const attempt = {
  commandID: '7f3c9e21',
  proposalID: 'prp-1',
  runtimeEpoch: 'e',
  proposal,
  startedAt: Date.parse('2026-10-14T15:06:24+03:00'),
  state: 'sent',
};

test('compositions and the draft summary', () => {
  assert.equal(
    compositionText(proposal.acceptedPositions),
    '2 позиции, 3 порции',
  );
  assert.equal(
    draftSummary([
      { lineNo: 1, dishID: 'a', portions: '1' },
      { lineNo: 2, dishID: 'b', portions: '8' },
    ]),
    '2 позиции · 9 порций',
  );
  assert.equal(finalText(proposal), 'Итоговый состав · 2 позиции, 3 порции');
});

test('the shortage dialog: cut and excluded positions with their deficits', () => {
  assert.deepEqual(changeRows(proposal, names, products), [
    {
      lineNo: '2',
      title: 'Поз. 2 · Паста с лососем и шпинатом',
      text: 'Запрошено 3 порции, доступна 1',
      change: '3 → 1',
      excluded: false,
      deficits: [
        'Филе лосося: на 3 порции нужно 360 г, доступно для позиции 220 г',
      ],
    },
    {
      lineNo: '3',
      title: 'Поз. 3 · Салат с лососем',
      text: 'Запрошена 1 порция, доступно 0 — позиция исключена',
      change: '1 → 0',
      excluded: true,
      deficits: [
        'Филе лосося: на 1 порцию нужно 110 г, доступно для позиции 100 г',
      ],
    },
  ]);
  assert.equal(
    acceptanceText(proposal, false),
    'Принято 2 из 3 позиций, 3 из 6 порций. Сокращение не принимается автоматически.',
  );
  assert.equal(
    acceptanceText(proposal, true),
    'Принято 2 из 3 позиций, 3 из 6 порций. Нужно новое подтверждение.',
  );
});

test('the requested participle agrees with the number', () => {
  const rows = (requested) =>
    changeRows(
      {
        ...proposal,
        changes: [
          {
            lineNo: '2',
            dishID: '206',
            requestedPortions: requested,
            acceptedPortions: '1',
            deficits: [],
          },
        ],
      },
      names,
      products,
    )[0].text;
  assert.equal(rows('1'), 'Запрошена 1 порция, доступна 1');
  assert.equal(rows('21'), 'Запрошена 21 порция, доступна 1');
  assert.equal(rows('5'), 'Запрошено 5 порций, доступна 1');
});

test('the shortage dialog follows frame 04: reduced, excluded, missing, final', async () => {
  const html = text(
    await renderRoute(`/app/r/${R}/orders`, {
      order: orderSnapshot({
        phase: { kind: 'proposal', proposal, previous: undefined },
      }),
    }),
  );
  for (const part of [
    'Что изменилось',
    'Исключённые позиции',
    'Не хватает ингредиентов',
    'Доступное количество учитывает позиции выше по порядку заказа.',
    'Итоговый состав · 2 позиции, 3 порции',
  ])
    assert.ok(html.includes(part), part);
  const again = text(
    await renderRoute(`/app/r/${R}/orders`, {
      order: orderSnapshot({
        phase: {
          kind: 'proposal',
          proposal,
          previous: {
            ...proposal,
            proposalID: 'prp-0',
            acceptedPositions: proposal.requestedPositions,
          },
        },
      }),
    }),
  );
  assert.ok(!again.includes('Что было в прошлом предложении'));
  assert.ok(again.includes('В прошлом предложении 3 порции'));
});

test('a new proposal is compared with the previous one', () => {
  const previous = {
    ...proposal,
    proposalID: 'prp-0',
    acceptedPositions: [
      { lineNo: '1', dishID: '202', portions: '2' },
      { lineNo: '2', dishID: '206', portions: '3' },
      { lineNo: '3', dishID: '208', portions: '1' },
    ],
  };
  assert.deepEqual(
    previousRows(proposal, previous, names).map((row) => row.text),
    [
      'В прошлом предложении 3 порции, доступна 1',
      'В прошлом предложении 1 порция, доступно 0 — позиция исключена',
    ],
  );
});

test('attempt messages: D2, D3, D4, F5', () => {
  const lost = attemptMessage(
    { kind: 'unknown', attempt, checking: false },
    'Europe/Moscow',
  );
  assert.equal(lost.title, 'Результат оформления неизвестен');
  assert.equal(
    lost.text,
    'Ответ сервиса заказов не получен. Продажа могла быть записана. Не оформляйте заказ повторно: проверка продолжит ту же попытку.',
  );
  assert.equal(lost.stamp, 'Попытка от 14.10.2026, 15:06:24 UTC+3');
  assert.equal(lost.footer, 'Новый заказ — после результата этой попытки.');
  assert.equal(
    attemptMessage(
      { kind: 'unknown', attempt, checking: true },
      'Europe/Moscow',
    ).text,
    'Проверяем эту же попытку — вторая продажа не создаётся.',
  );
  assert.equal(
    attemptMessage(
      { kind: 'pending', attempt, checking: false },
      'Europe/Moscow',
    ).title,
    'Оформление ожидает результата',
  );
  const conflict = attemptMessage(
    { kind: 'conflict', attempt, checking: false },
    'Europe/Moscow',
  );
  assert.equal(conflict.title, 'Запрос отклонён: номер попытки уже занят');
  assert.equal(
    conflict.stamp,
    'Попытка от 14.10.2026, 15:06:24 UTC+3 · CommandConflict',
  );
  assert.equal(
    conflict.footer,
    'Новый заказ — после того, как результат попытки установлен.',
  );
});

test('outcome messages: F1, F2, F4, E12, reset, C2 and notices', () => {
  const tz = 'Europe/Moscow';
  assert.equal(
    outcomeMessage({ kind: 'not-found', afterAttempt: false }, tz).title,
    'Предложение больше не найдено',
  );
  assert.deepEqual(
    outcomeMessage({ kind: 'not-found', afterAttempt: true }, tz),
    {
      tone: 'info',
      title: 'Предложение больше не действует',
      text: 'Сервис заказов ответил на ту же попытку: предложение больше не действует, а записана ли продажа, он не подтверждает. Прежде чем оформлять заново, проверьте по истории склада, не списаны ли продукты по этой попытке.',
    },
  );
  assert.equal(
    outcomeMessage(
      { kind: 'refused', code: 'InventoryUnavailable', proposal },
      tz,
    ).text,
    'Сервис склада не подготовил актуальные остатки. Продажа не записана, продукты не списаны.',
  );
  assert.equal(
    outcomeMessage(
      { kind: 'refused', code: 'UpstreamUnavailable', proposal },
      tz,
    ).text,
    'Сервис заказов не принял оформление. Продажа не записана, продукты не списаны.',
  );
  assert.deepEqual(outcomeMessage({ kind: 'reset' }, tz), {
    tone: 'unknown',
    title: 'Результат оформления неизвестен',
    text: 'Сервис заказов перезапустился, проверить эту попытку нельзя. Перед новым заказом убедитесь, что продажа не записана.',
  });
  assert.equal(
    outcomeMessage({ kind: 'superseded', replacement: proposal }, tz).text,
    'Состав предложения пересчитан, сохранено новое предложение от 15:06:10. Прежнее предложение оформить нельзя, продажа по нему не записана.',
  );
  assert.equal(
    outcomeMessage({ kind: 'superseded', replacement: undefined }, tz).title,
    'Предложение больше не найдено',
  );
  assert.equal(
    outcomeMessage({ kind: 'empty', proposal: undefined }, tz).title,
    'Ни одно блюдо из заказа сейчас нельзя приготовить',
  );
  assert.deepEqual(noticeMessage({ kind: 'prepare-failed' }), {
    tone: 'error',
    title: 'Не удалось проверить заказ',
    text: 'Сервис заказов не ответил. Состав сохранён, повторите проверку.',
  });
  assert.equal(
    noticeMessage({ kind: 'portions', lines: [2] }).text,
    'Исправьте количество в поз. 2: допустимо только целое число порций больше 0. Введённое значение сохранено.',
  );
  assert.equal(
    noticeMessage({ kind: 'check-failed' }).text,
    'Не удалось проверить. Повторите позже.',
  );
});

test('a placed order names the time of the service and the composition', () => {
  const order = {
    orderID: 'ord-1',
    proposalID: 'prp-1',
    acceptedPositions: proposal.acceptedPositions,
    allocations: [],
    placedAt: instantOf('2026-10-14T15:06:31+03:00'),
  };
  assert.deepEqual(confirmedLines(order, 'Europe/Moscow'), {
    stamp: 'Записан сервисом 14.10.2026, 15:06:31 UTC+3',
    composition: 'Оформленный состав · 2 позиции, 3 порции',
  });
});

test('the panel follows the phase of the order', async () => {
  const render = async (order) =>
    text(await renderRoute(`/app/r/${R}/orders`, { order }));
  assert.ok((await render(orderSnapshot())).includes('Заказ пуст'));
  assert.ok(
    (
      await render(
        orderSnapshot({
          phase: { kind: 'unknown', attempt, checking: false },
          locked: true,
        }),
      )
    ).includes('Проверить результат'),
  );
  assert.ok(
    (
      await render(
        orderSnapshot({
          phase: { kind: 'pending', attempt, checking: false },
          locked: true,
        }),
      )
    ).includes('Оформление ожидает результата'),
  );
  assert.ok(
    (
      await render(
        orderSnapshot({ phase: { kind: 'not-found', afterAttempt: true } }),
      )
    ).includes('Предложение больше не действует'),
  );
  assert.ok(
    (
      await render(
        orderSnapshot({
          phase: { kind: 'refused', code: 'InventoryUnavailable', proposal },
        }),
      )
    ).includes('Повторить оформление'),
  );
  assert.ok(
    (
      await render(
        orderSnapshot({
          phase: {
            kind: 'proposal',
            proposal: { ...proposal, changes: [] },
            previous: undefined,
          },
        }),
      )
    ).includes('Подтвердить состав'),
  );
  const placed = await render(
    orderSnapshot({
      phase: {
        kind: 'confirmed',
        order: {
          orderID: 'ord-1',
          proposalID: 'prp-1',
          acceptedPositions: proposal.acceptedPositions,
          allocations: [],
          placedAt: at,
        },
        afterCheck: false,
      },
    }),
  );
  assert.ok(placed.includes('Заказ оформлен'));
  assert.ok(placed.includes('ord-1'));
});
