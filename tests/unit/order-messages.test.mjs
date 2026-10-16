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
  assert.equal(
    finalText({ ...proposal, acceptedPositions: [] }),
    'Итоговый состав · 0 позиций',
  );
});

test('the shortage dialog: cut and excluded positions with their deficits', () => {
  assert.deepEqual(changeRows(proposal, names, products), [
    {
      lineNo: '2',
      title: 'Позиция 2 · Паста с лососем и шпинатом',
      text: 'Заказано 3 порции, можно приготовить 1',
      change: '3 → 1',
      excluded: false,
      deficits: [
        'Филе лосося: на 3 порции нужно 360 г, для этой позиции осталось 220 г',
      ],
    },
    {
      lineNo: '3',
      title: 'Позиция 3 · Салат с лососем',
      text: 'Заказана 1 порция, не хватает ни на одну — позиция исключена',
      change: '1 → 0',
      excluded: true,
      deficits: [
        'Филе лосося: на 1 порцию нужно 110 г, для этой позиции осталось 100 г',
      ],
    },
  ]);
  // Names and products not loaded yet never show their IDs.
  const [unnamed] = changeRows(proposal, new Map(), new Map());
  assert.equal(unnamed.title, 'Позиция 2 · блюдо');
  assert.equal(
    unnamed.deficits[0],
    'Продукт: на 3 порции нужно 360, для этой позиции осталось 220',
  );
  assert.equal(
    acceptanceText(proposal, false),
    'Осталось 2 из 3 позиций, 3 из 6 порций. Подтвердите, если вас устраивает такой заказ.',
  );
  assert.equal(
    acceptanceText(proposal, true),
    'Осталось 2 из 3 позиций, 3 из 6 порций. Подтвердите новый состав.',
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
  assert.equal(rows('1'), 'Заказана 1 порция, можно приготовить 1');
  assert.equal(rows('21'), 'Заказана 21 порция, можно приготовить 1');
  assert.equal(rows('5'), 'Заказано 5 порций, можно приготовить 1');
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
    'Не хватает продуктов',
    'Продукты сначала идут на блюда, добавленные раньше.',
    'Итоговый состав · 2 позиции, 3 порции',
    'Проверено 14 октября, 15:06',
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
  assert.ok(!again.includes('В прошлом предложении'));
  assert.ok(again.includes('В прошлом составе 3 порции'));
  assert.ok(
    again.includes(
      'Пока вы подтверждали, мы пересчитали состав в 15:06. Заказ ещё не оформлен.',
    ),
  );
  assert.doesNotMatch(again, /15:06:10|UTC/);
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
      'В прошлом составе 3 порции, можно приготовить 1',
      'В прошлом составе 1 порция, не хватает ни на одну — позиция исключена',
    ],
  );
});

test('attempt messages: D2, D3, D4, F5', () => {
  const lost = attemptMessage(
    { kind: 'unknown', attempt, checking: false },
    'Europe/Moscow',
  );
  assert.equal(lost.title, 'Не знаем, оформлен ли заказ');
  assert.equal(
    lost.text,
    'Связь прервалась. Не оформляйте заказ заново — нажмите «Проверить результат», заказ не задвоится.',
  );
  assert.equal(lost.stamp, 'Отправлено 14 октября, 15:06');
  assert.equal(
    lost.footer,
    'Новый заказ можно начать, когда станет ясно, прошёл ли этот.',
  );
  assert.equal(
    attemptMessage(
      { kind: 'unknown', attempt, checking: true },
      'Europe/Moscow',
    ).text,
    'Проверяем результат. Второй раз заказ не оформится.',
  );
  const pending = attemptMessage(
    { kind: 'pending', attempt, checking: false },
    'Europe/Moscow',
  );
  assert.equal(pending.title, 'Заказ ещё обрабатывается');
  assert.equal(
    pending.text,
    'Проверьте результат через минуту — заказ не задвоится.',
  );
  const conflict = attemptMessage(
    { kind: 'conflict', attempt, checking: false },
    'Europe/Moscow',
  );
  assert.equal(conflict.title, 'Похоже, этот заказ уже отправляли');
  assert.equal(
    conflict.text,
    'Повторная отправка не прошла, по ней ничего не списано. Проверьте результат или загляните в историю склада, прежде чем оформлять снова.',
  );
  // No code in the visible stamp.
  assert.equal(conflict.stamp, 'Отправлено 14 октября, 15:06');
  assert.equal(
    conflict.footer,
    'Новый заказ можно начать, когда станет ясно, прошёл ли этот.',
  );
});

test('outcome messages: F1, F2, F4, E12, reset, C2 and notices', () => {
  const tz = 'Europe/Moscow';
  assert.equal(
    outcomeMessage(
      { kind: 'not-found', afterAttempt: false, checkedAt: undefined },
      tz,
    ).title,
    'Проверьте заказ заново',
  );
  assert.deepEqual(
    outcomeMessage(
      {
        kind: 'not-found',
        afterAttempt: true,
        checkedAt: Date.UTC(2026, 9, 14, 12, 31, 5),
      },
      tz,
    ),
    {
      tone: 'info',
      title: 'Данные заказа устарели',
      stamp: 'Проверено 14 октября, 15:31',
      text: 'Мы не можем подтвердить, оформлен ли заказ. Прежде чем оформлять снова, загляните в историю склада — не списаны ли уже продукты.',
    },
  );
  assert.equal(
    outcomeMessage(
      { kind: 'refused', code: 'InventoryUnavailable', proposal },
      tz,
    ).text,
    'Не получилось проверить остатки. Ничего не списано — попробуйте ещё раз.',
  );
  assert.equal(
    outcomeMessage(
      { kind: 'refused', code: 'UpstreamUnavailable', proposal },
      tz,
    ).text,
    'Заказ не прошёл. Ничего не списано — попробуйте ещё раз.',
  );
  assert.deepEqual(outcomeMessage({ kind: 'reset' }, tz), {
    tone: 'unknown',
    title: 'Не знаем, оформлен ли заказ',
    text: 'Данные на сервере обновились, и мы не можем подтвердить результат. Загляните в историю склада перед новым заказом.',
  });
  assert.deepEqual(
    outcomeMessage({ kind: 'superseded', replacement: proposal }, tz),
    {
      tone: 'info',
      title: 'Состав заказа обновился',
      text: 'Мы пересчитали заказ, прежний вариант не оформлен. Подтвердите обновлённый заказ.',
    },
  );
  assert.equal(
    outcomeMessage({ kind: 'superseded', replacement: undefined }, tz).title,
    'Проверьте заказ заново',
  );
  assert.equal(
    outcomeMessage({ kind: 'empty', proposal: undefined }, tz).title,
    'Ни одно блюдо из заказа сейчас нельзя приготовить',
  );
  assert.deepEqual(noticeMessage({ kind: 'prepare-failed' }), {
    tone: 'error',
    title: 'Не удалось проверить заказ',
    text: 'Блюда в заказе сохранены. Попробуйте ещё раз через пару минут.',
  });
  assert.deepEqual(noticeMessage({ kind: 'portions', lines: [2] }), {
    tone: 'error',
    title: 'Проверьте количество порций',
    text: 'В позиции 2 укажите целое число порций — 1 или больше.',
  });
  assert.equal(
    noticeMessage({ kind: 'portions', lines: [2, 3] }).text,
    'В позициях 2 и 3 укажите целое число порций — 1 или больше.',
  );
  assert.deepEqual(noticeMessage({ kind: 'check-failed' }), {
    tone: 'error',
    title: 'Не удалось проверить результат',
    text: 'Попробуйте ещё раз через минуту.',
  });
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
    stamp: 'Оформлен 14 октября, 15:06',
    composition: 'В заказе · 2 позиции, 3 порции',
  });
});

test('the panel follows the phase of the order', async () => {
  const render = async (order) =>
    text(await renderRoute(`/app/r/${R}/orders`, { order }));
  assert.ok((await render(orderSnapshot())).includes('Заказ пуст'));
  const unknown = await render(
    orderSnapshot({
      phase: { kind: 'unknown', attempt, checking: false },
      locked: true,
    }),
  );
  assert.ok(unknown.includes('Проверить результат'));
  assert.ok(unknown.includes('В заказе · 2 позиции, 3 порции'));
  // The IDs of the command and the proposal stay out of the page.
  assert.doesNotMatch(unknown, /7f3c9e21|prp-1|commandID|proposalID/);
  assert.ok(
    (
      await render(
        orderSnapshot({
          phase: { kind: 'pending', attempt, checking: false },
          locked: true,
        }),
      )
    ).includes('Заказ ещё обрабатывается'),
  );
  assert.doesNotMatch(
    await render(
      orderSnapshot({
        phase: { kind: 'conflict', attempt, checking: false },
        locked: true,
      }),
    ),
    /CommandConflict/,
  );
  assert.ok(
    (
      await render(
        orderSnapshot({
          phase: {
            kind: 'not-found',
            afterAttempt: true,
            checkedAt: Date.UTC(2026, 9, 14, 12, 31, 5),
          },
        }),
      )
    ).includes('Проверено 14 октября, 15:31'),
  );
  assert.ok(
    (
      await render(
        orderSnapshot({
          phase: { kind: 'refused', code: 'InventoryUnavailable', proposal },
        }),
      )
    ).includes('Оформить ещё раз'),
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
    ).includes('Оформить заказ'),
  );
  const placed = await render(
    orderSnapshot({
      phase: {
        kind: 'confirmed',
        context: { warehouseEpoch: '44444444-4444-4444-8444-444444444444' },
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
  assert.ok(placed.includes('Продукты списаны: сначала — с ближайшим сроком'));
  // The order ID is not shown.
  assert.ok(!placed.includes('ord-1'));
});

test('limits and admission refusals of an order use plain words', () => {
  const proposal = { acceptedPositions: [] };
  const refusal = (code) =>
    outcomeMessage(
      {
        kind: 'refused',
        code,
        proposal,
        retryAfterSeconds: undefined,
        retryUntil: undefined,
      },
      'Europe/Moscow',
    ).text;
  assert.equal(
    refusal('InvalidArgument'),
    'В заказе слишком много позиций. Уберите часть и попробуйте снова.',
  );
  assert.equal(
    refusal('LimitExceeded'),
    'Сейчас у ресторана слишком много неоформленных заказов. Подождите немного и попробуйте снова.',
  );
  assert.match(refusal('ServiceUnavailable'), /Ничего не оформлено/);
  for (const code of [
    'InvalidArgument',
    'LimitExceeded',
    'ServiceUnavailable',
  ]) {
    assert.doesNotMatch(refusal(code), /503|400|409|[A-Z][a-z]+[A-Z]/);
  }
  assert.equal(
    noticeMessage({ kind: 'too-many-positions' }).text,
    refusal('InvalidArgument'),
  );
  assert.equal(
    noticeMessage({ kind: 'limit-exceeded' }).text,
    refusal('LimitExceeded'),
  );
});
