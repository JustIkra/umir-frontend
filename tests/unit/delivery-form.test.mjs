import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { localFailure } from '../../src/application/api.ts';
import { productMap } from '../../src/presentation/orders/order-rows.ts';
import {
  checkFailedMessage,
  civilKind,
  civilNow,
  civilParts,
  deliveryErrors,
  deliveryInput,
  deliveryMessage,
  deliverySummary,
  organizationSettings,
  receiptView,
  timeFieldsOf,
  withCivilPart,
} from '../../src/presentation/warehouse/delivery-form.ts';
import {
  NOW,
  ORG,
  R,
  deliverySnapshot,
  hrefs,
  instantOf,
  labels,
  loaded,
  readyAccess,
  renderRoute,
  sampleRestaurant,
  text,
} from './support/render-route.mjs';

const MSK = 'Europe/Moscow';
const BERLIN = 'Europe/Berlin';
const products = productMap([
  { productID: '114', name: 'Руккола', baseUnit: 'g' },
  { productID: '121', name: 'Сливки 33%', baseUnit: 'ml' },
]);
const line = (overrides = {}) => ({
  key: 1,
  productID: '114',
  quantity: '0,45',
  manufacturedAt: '2026-10-12T08:00',
  shelfLifeValue: '5',
  shelfLifeUnit: 'day',
  receivedAt: '2026-10-14T09:30',
  ...overrides,
});
const draft = (overrides = {}) => ({
  number: '1192',
  createdAt: '2026-10-14T09:00',
  lines: [line()],
  nextKey: 2,
  ...overrides,
});
const emptyLine = {
  key: 1,
  productID: '',
  quantity: '',
  manufacturedAt: '',
  shelfLifeValue: '',
  shelfLifeUnit: 'day',
  receivedAt: '',
};
// 10:00 in Moscow, the clock of render tests.
const nowLocal = '2026-10-14T10:00';

test('a date and a time field share one draft value', () => {
  assert.deepEqual(civilParts(''), { date: '', time: '' });
  assert.deepEqual(civilParts('2026-10-14T'), { date: '2026-10-14', time: '' });
  assert.deepEqual(civilParts('T09:30'), { date: '', time: '09:30' });
  assert.equal(withCivilPart('', 'date', '2026-10-14'), '2026-10-14T');
  assert.equal(
    withCivilPart('2026-10-14T', 'time', '09:30'),
    '2026-10-14T09:30',
  );
  assert.equal(withCivilPart('T09:30', 'time', ''), '');
});

test('the current local minute is taken in the organization zone', () => {
  assert.equal(civilNow(NOW, MSK), '2026-10-14T10:00');
  assert.equal(civilNow(NOW, 'Asia/Yekaterinburg'), '2026-10-14T12:00');
});

test('a local minute is regular, repeated (DS01) or skipped (DS02) in its zone', () => {
  assert.equal(civilKind('2026-10-14T10:00', BERLIN), 'regular');
  assert.equal(civilKind('2026-10-25T02:30', BERLIN), 'repeated');
  assert.equal(civilKind('2026-03-29T02:30', BERLIN), 'skipped');
  assert.equal(civilKind('2026-10-25T02:30', MSK), 'regular');
  assert.equal(civilKind('2026-02-30T10:00', MSK), undefined);
  assert.equal(civilKind('2026-10-14T', MSK), undefined);
  const fields = draft({
    createdAt: '2026-10-25T02:30',
    lines: [
      line({
        key: 3,
        manufacturedAt: '2026-10-25T02:15',
        receivedAt: '2026-10-25T04:00',
      }),
      line({ key: 4, receivedAt: '2026-03-29T02:30' }),
    ],
  });
  assert.deepEqual(
    [...timeFieldsOf(fields, BERLIN, 'repeated')],
    ['createdAt', '3.manufacturedAt'],
  );
  assert.deepEqual(
    [...timeFieldsOf(fields, BERLIN, 'skipped')],
    ['4.receivedAt'],
  );
  assert.equal(timeFieldsOf(fields, MSK, 'repeated').size, 0);
});

test('an empty draft: every field asks for a value', () => {
  const errors = deliveryErrors(
    draft({ number: ' ', createdAt: '', lines: [emptyLine] }),
    products,
    nowLocal,
  );
  assert.deepEqual(errors.fields, {
    number: 'Укажите номер поставки',
    createdAt: 'Укажите дату и время создания',
  });
  assert.deepEqual(errors.lines.get(1), {
    productID: 'Выберите продукт',
    quantity: 'Укажите количество',
    receivedAt: 'Укажите дату и время поступления',
    manufacturedAt: 'Укажите дату и время изготовления',
    shelfLife: 'Укажите срок годности — целое число больше 0',
  });
  assert.equal(errors.count, 7);
  // Half a time is no time.
  assert.equal(
    deliveryErrors(draft({ createdAt: '2026-10-14T' }), products, nowLocal)
      .fields.createdAt,
    'Укажите дату и время создания',
  );
});

test('times: not later than now, made not later than received', () => {
  const errors = deliveryErrors(
    draft({
      createdAt: '2026-10-14T10:01',
      lines: [
        line({
          manufacturedAt: '2026-10-14T09:31',
          receivedAt: '2026-10-14T09:30',
        }),
        line({ key: 2, receivedAt: '2026-10-14T10:05' }),
      ],
    }),
    products,
    nowLocal,
  );
  assert.equal(
    errors.fields.createdAt,
    'Время создания не может быть позже текущего',
  );
  assert.deepEqual(errors.lines.get(1), {
    manufacturedAt: 'Изготовление не может быть позже поступления',
  });
  assert.deepEqual(errors.lines.get(2), {
    receivedAt: 'Поступление не может быть позже текущего времени',
  });
  assert.equal(errors.count, 3);
  // The current minute itself is allowed.
  const now = deliveryErrors(
    draft({ createdAt: nowLocal, lines: [line({ receivedAt: nowLocal })] }),
    products,
    nowLocal,
  );
  assert.equal(now.count, 0);
});

test('quantity texts of the catalog with the unit of the product; shelf life is a whole number above 0', () => {
  const errors = deliveryErrors(
    draft({
      lines: [
        line({ quantity: '0,0005', shelfLifeValue: '0' }),
        line({
          key: 2,
          productID: '121',
          quantity: 'много',
          shelfLifeValue: '1,5',
        }),
        line({ key: 3, quantity: '0', shelfLifeValue: 'abc' }),
      ],
    }),
    products,
    nowLocal,
  );
  assert.deepEqual(errors.lines.get(1), {
    quantity: 'Не больше трёх знаков после запятой: минимум 0,001 г.',
    shelfLife: 'Укажите срок годности — целое число больше 0',
  });
  assert.equal(errors.lines.get(2)?.quantity, 'Введите число, например 0,5');
  assert.equal(
    errors.lines.get(3)?.quantity,
    'Количество должно быть больше нуля',
  );
  assert.equal(errors.count, 6);
});

test('a checked draft has no errors', () => {
  const errors = deliveryErrors(draft(), products, nowLocal);
  assert.deepEqual(errors.fields, {});
  assert.equal(errors.lines.size, 0);
  assert.equal(errors.count, 0);
});

test('the summary counts the fields', () => {
  assert.deepEqual(deliverySummary(1), {
    title: 'Поставка не принята: ошибки в 1 поле',
    text: 'Исправьте отмеченные поля — введённые значения сохранены.',
  });
  assert.equal(
    deliverySummary(3).title,
    'Поставка не принята: ошибки в 3 полях',
  );
  assert.equal(
    deliverySummary(21).title,
    'Поставка не принята: ошибки в 21 поле',
  );
});

test('the command body: civil times with zero seconds, thousandths, shelf life', () => {
  const checked = draft({
    number: ' 1192 ',
    lines: [
      line({
        quantity: '1 250,5',
        shelfLifeValue: '07',
        shelfLifeUnit: 'month',
      }),
    ],
  });
  assert.deepEqual(deliveryInput(checked, '7', undefined), {
    number: '1192',
    createdAt: { civil: { localDateTime: '2026-10-14T09:00:00' } },
    expectedSettingsVersion: '7',
    lines: [
      {
        productID: '114',
        manufacturedAt: { civil: { localDateTime: '2026-10-12T08:00:00' } },
        shelfLife: { value: '7', unit: 'month' },
        receivedAt: { civil: { localDateTime: '2026-10-14T09:30:00' } },
        quantity: '1250500',
      },
    ],
  });
  const chosen = deliveryInput(checked, '7', 'later');
  assert.deepEqual(chosen.createdAt, {
    civil: { localDateTime: '2026-10-14T09:00:00', occurrence: 'later' },
  });
  assert.deepEqual(chosen.lines[0].receivedAt, {
    civil: { localDateTime: '2026-10-14T09:30:00', occurrence: 'later' },
  });
});

test('the settings of the restaurant organization come from access', () => {
  assert.deepEqual(organizationSettings(readyAccess(), R), {
    timeZone: MSK,
    settingsVersion: '1',
  });
  assert.equal(organizationSettings(readyAccess(), 'other'), undefined);
  assert.equal(organizationSettings({ status: 'loading' }, R), undefined);
});

test('outcome messages P8–P10, DS03 and the reset', () => {
  assert.deepEqual(deliveryMessage({ kind: 'unknown', checking: false }, ''), {
    tone: 'unknown',
    title: 'Результат приёма неизвестен',
    text: 'Ответ склада не получен. Поставка могла быть принята. Проверьте результат: проверка повторит ту же отправку и не создаст второй приход.',
  });
  for (const code of ['InvalidArgument', 'InvalidRequest']) {
    assert.deepEqual(deliveryMessage({ kind: 'refused', code }, ''), {
      tone: 'error',
      title: 'Поставка не принята',
      text: 'Склад отклонил данные: ничего не записано. Проверьте форму и отправьте снова.',
    });
  }
  for (const code of [
    'UnknownTimeZone',
    'TimeZoneDataUnavailable',
    'PayloadTooLarge',
  ]) {
    assert.equal(
      deliveryMessage({ kind: 'refused', code }, '')?.text,
      'Склад сейчас не принял поставку: ничего не записано. Повторите отправку.',
    );
  }
  assert.deepEqual(deliveryMessage({ kind: 'conflict' }, ''), {
    tone: 'error',
    title: 'Поставка уже принята',
    text: 'Эта поставка уже записана другой отправкой, второй приход не создан. Откройте остатки или историю.',
  });
  assert.deepEqual(
    deliveryMessage({ kind: 'settings-changed' }, 'Екатеринбург, UTC+5'),
    {
      tone: 'error',
      title: 'Часовой пояс организации изменился',
      text: 'Пока вы заполняли форму, зона организации стала Екатеринбург, UTC+5. Проверьте даты и время — они будут отправлены в новой зоне.',
    },
  );
  assert.deepEqual(deliveryMessage({ kind: 'reset' }, ''), {
    tone: 'unknown',
    title: 'Данные обновились',
    text: 'Склад перезапустился. Проверьте остатки: если поставки там нет, отправьте её снова.',
  });
  for (const kind of [
    'editing',
    'sending',
    'ambiguous-time',
    'nonexistent-time',
  ])
    assert.equal(deliveryMessage({ kind }, ''), undefined, kind);
  assert.deepEqual(checkFailedMessage, {
    tone: 'error',
    title: 'Проверка не удалась',
    text: 'Не удалось проверить. Повторите позже.',
  });
});

const batch = (lineNo, batchID, productID, quantity, expiresAt) => ({
  batchID,
  deliveryID: 'd-1',
  lineNo,
  productID,
  manufacturedAt: instantOf('2026-10-12T08:00:00+03:00'),
  shelfLife: { value: '5', unit: 'day' },
  receivedAt: instantOf('2026-10-14T09:30:00+03:00'),
  expiresAt: instantOf(expiresAt),
  receivedQuantity: quantity,
  remainingQuantity: quantity,
});
const received = {
  kind: 'received',
  receipt: {
    deliveryID: 'd-1',
    batches: [
      batch('2', 'P-0202', '999', '20000', '2026-10-13T09:00:00+03:00'),
      batch('1', 'P-0201', '114', '450000', '2026-10-17T10:00:00+03:00'),
    ],
  },
  input: deliveryInput(
    draft({ lines: [line(), line({ key: 2 })] }),
    '1',
    undefined,
  ),
  evaluatedAt: instantOf('2026-10-14T10:00:00+03:00'),
};

test('P6: batches by line with «годна до»; a batch expired on receipt waits for a write-off', () => {
  assert.deepEqual(receiptView(received, products, MSK), {
    title: 'Поставка № 1192 принята',
    text: '2 строки — 2 партии. Срок «годна до» рассчитал склад.',
    rows: [
      {
        batchID: 'P-0201',
        title: 'Строка 1 · Руккола · 450 г',
        batch: 'Партия P-0201 · годна до 17.10.2026, 10:00',
        expired: false,
      },
      {
        batchID: 'P-0202',
        title: 'Строка 2 · 999 · 20',
        batch: 'Партия P-0202 · годна до 13.10.2026, 09:00',
        expired: true,
      },
    ],
  });
});

const page = `/app/r/${R}/warehouse/delivery`;
const zoneAccess = (timeZone) => ({
  status: 'ready',
  organizations: [
    {
      orgID: ORG,
      name: 'Восток Фуд',
      settings: { timeZone, settingsVersion: '3' },
      admin: false,
      restaurants: [sampleRestaurant({ timeZone })],
    },
  ],
});
const catalog = {
  products: loaded({
    evaluatedAt: instantOf('2026-10-14T10:00:00+03:00'),
    stateVersion: '1',
    items: [
      { productID: '114', name: 'Руккола', baseUnit: 'g' },
      { productID: '121', name: 'Сливки 33%', baseUnit: 'ml' },
    ],
  }),
};
const render = (delivery, access) =>
  renderRoute(page, {
    data: catalog,
    delivery,
    ...(access === undefined ? {} : { access }),
  });

test('unverified access keeps the zone of the last ready answer', async () => {
  const failure = localFailure('NotFound', 'not_committed', 404);
  const html = await render(deliverySnapshot(), {
    status: 'unverified',
    failure,
    previous: zoneAccess('Asia/Yekaterinburg').organizations,
  });
  const plain = text(html);
  assert.ok(plain.includes('Время — Екатеринбург, UTC+5.'));
  assert.ok(!plain.includes('UTC.'));
  assert.ok(!plain.includes('Повторить'));
});

test('unverified access with no earlier answer offers «Повторить» instead of UTC labels', async () => {
  const failure = localFailure('NotFound', 'not_committed', 404);
  const html = await render(deliverySnapshot(), {
    status: 'unverified',
    failure,
  });
  const plain = text(html);
  assert.ok(plain.includes('Настройки организации не получены'));
  assert.ok(plain.includes('Повторить'));
  assert.ok(!plain.includes('UTC.'));
  assert.ok(!labels(html).some((label) => label.includes('UTC')));
});

test('P1: the form names the zone of the organization in every time field', async () => {
  const html = await render(
    deliverySnapshot({
      draft: draft({ number: '', createdAt: '', lines: [emptyLine] }),
    }),
    zoneAccess('Asia/Yekaterinburg'),
  );
  const found = labels(html);
  for (const label of [
    'Номер поставки',
    'Дата и время создания поставки (Екатеринбург, UTC+5)',
    'Продукт',
    'Количество',
    'Дата и время изготовления (Екатеринбург, UTC+5)',
    'Срок годности',
    'Дата и время поступления (Екатеринбург, UTC+5)',
  ])
    assert.ok(found.includes(label), label);
  const plain = text(html);
  for (const part of [
    'Каждая строка — отдельная партия. «Годна до» рассчитает склад от изготовления. Время — Екатеринбург, UTC+5.',
    'Строки поставки · 1',
    '1 строка → 1 партия',
    'дней',
    'месяцев',
    'Склад проверит всю форму; при ошибке ничего не записывается.',
    'Принять поставку',
  ])
    assert.ok(plain.includes(part), part);
  // Field errors wait for a submit.
  assert.ok(!plain.includes('Укажите номер поставки'));
});

test('P1: a restored draft keeps what was typed', async () => {
  const html = await render(
    deliverySnapshot({
      draft: draft({
        lines: [
          line({
            quantity: '1,5',
            shelfLifeValue: '3',
            shelfLifeUnit: 'month',
          }),
          line({ key: 2 }),
        ],
        nextKey: 3,
      }),
    }),
  );
  for (const value of [
    'value="1192"',
    'value="2026-10-14"',
    'value="09:00"',
    'value="1,5"',
    'value="3"',
  ])
    assert.ok(html.includes(value), value);
  const plain = text(html);
  assert.ok(plain.includes('Строки поставки · 2'));
  assert.ok(plain.includes('2 строки → 2 партии'));
});

test('P5: the fields are closed and the button waits', async () => {
  const html = await render(
    deliverySnapshot({
      draft: draft(),
      phase: { kind: 'sending' },
      locked: true,
    }),
  );
  assert.match(html, /<fieldset[^>]*disabled/);
  assert.ok(text(html).includes('Принимаем…'));
});

test('P6: the received delivery replaces the form', async () => {
  const html = await render(deliverySnapshot({ phase: received }));
  const plain = text(html);
  for (const part of [
    'Поставка № 1192 принята',
    '2 строки — 2 партии. Срок «годна до» рассчитал склад.',
    'Строка 1 · Руккола · 450 г',
    'Партия P-0201 · годна до 17.10.2026, 10:00',
    'Ожидает списания',
    'Срок истёк до поступления: партия на складе и ждёт подтверждения списания.',
    'Принять ещё поставку',
    'К остаткам',
  ])
    assert.ok(plain.includes(part), part);
  assert.ok(!labels(html).includes('Номер поставки'));
  assert.ok(hrefs(html).includes(`/app/r/${R}/warehouse`));
});

test('P9: an unknown outcome closes the fields until the check', async () => {
  const unknown = {
    draft: draft(),
    phase: { kind: 'unknown', checking: false },
    locked: true,
  };
  const html = await render(deliverySnapshot(unknown));
  const plain = text(html);
  for (const part of [
    'Результат приёма неизвестен',
    'Ответ склада не получен. Поставка могла быть принята. Проверьте результат: проверка повторит ту же отправку и не создаст второй приход.',
    'Проверить результат',
    'Поля закрыты до результата.',
  ])
    assert.ok(plain.includes(part), part);
  assert.ok(!plain.includes('Принять поставку'));
  assert.match(html, /<fieldset[^>]*disabled/);
  const checking = text(
    await render(
      deliverySnapshot({
        ...unknown,
        phase: { kind: 'unknown', checking: true },
        notice: { kind: 'check-failed' },
      }),
    ),
  );
  assert.ok(checking.includes('Проверяем результат…'));
  assert.ok(checking.includes('Проверка не удалась'));
  assert.ok(checking.includes('Не удалось проверить. Повторите позже.'));
});

test('P10: a refusal keeps the form open', async () => {
  const html = await render(
    deliverySnapshot({
      draft: draft(),
      phase: { kind: 'refused', code: 'InvalidArgument' },
    }),
  );
  const plain = text(html);
  assert.ok(plain.includes('Поставка не принята'));
  assert.ok(
    plain.includes(
      'Склад отклонил данные: ничего не записано. Проверьте форму и отправьте снова.',
    ),
  );
  assert.ok(plain.includes('Принять поставку'));
  assert.doesNotMatch(html, /<fieldset[^>]*disabled/);
});

test('P8: an already received delivery leads to the stock', async () => {
  const html = await render(
    deliverySnapshot({ draft: draft(), phase: { kind: 'conflict' } }),
  );
  const plain = text(html);
  assert.ok(plain.includes('Поставка уже принята'));
  assert.ok(
    plain.includes(
      'Эта поставка уже записана другой отправкой, второй приход не создан. Откройте остатки или историю.',
    ),
  );
  assert.ok(plain.includes('К остаткам'));
  assert.ok(plain.includes('Принять ещё поставку'));
  assert.ok(!labels(html).includes('Номер поставки'));
});

test('DS01: the choice stands at the repeated time; elsewhere above the form', async () => {
  const ambiguous = {
    draft: draft({ createdAt: '2026-10-25T02:30' }),
    phase: { kind: 'ambiguous-time' },
  };
  const question =
    'Это время повторяется из‑за перевода часов. Выберите, какое из двух:';
  const berlin = await render(deliverySnapshot(ambiguous), zoneAccess(BERLIN));
  const atField = text(berlin);
  assert.equal(atField.split(question).length, 2);
  assert.ok(atField.indexOf(question) > atField.indexOf('Номер поставки'));
  assert.ok(labels(berlin).includes('Раньше — до перевода часов'));
  assert.ok(labels(berlin).includes('Позже — после перевода часов'));
  // Moscow has no repeated hour: the browser cannot point at a field.
  const above = text(await render(deliverySnapshot(ambiguous)));
  assert.equal(above.split(question).length, 2);
  assert.ok(above.indexOf(question) < above.indexOf('Номер поставки'));
});

test('DS02: the skipped time is marked at its field', async () => {
  const plain = text(
    await render(
      deliverySnapshot({
        draft: draft({ lines: [line({ receivedAt: '2026-03-29T02:30' })] }),
        phase: { kind: 'nonexistent-time' },
      }),
      zoneAccess(BERLIN),
    ),
  );
  const skipped =
    'Такого времени нет: часы переводились вперёд. Укажите другое время.';
  assert.ok(plain.includes(skipped));
  assert.ok(
    plain.indexOf(skipped) >
      plain.indexOf('Дата и время поступления (Берлин, UTC+2)'),
  );
});

test('DS03 and the reset keep the draft', async () => {
  const changed = text(
    await render(
      deliverySnapshot({ draft: draft(), phase: { kind: 'settings-changed' } }),
      zoneAccess('Asia/Yekaterinburg'),
    ),
  );
  assert.ok(changed.includes('Часовой пояс организации изменился'));
  assert.ok(
    changed.includes(
      'Пока вы заполняли форму, зона организации стала Екатеринбург, UTC+5. Проверьте даты и время — они будут отправлены в новой зоне.',
    ),
  );
  const reset = text(
    await render(
      deliverySnapshot({ draft: draft(), phase: { kind: 'reset' } }),
    ),
  );
  assert.ok(reset.includes('Данные обновились'));
  assert.ok(
    reset.includes(
      'Склад перезапустился. Проверьте остатки: если поставки там нет, отправьте её снова.',
    ),
  );
  assert.ok(reset.includes('Принять поставку'));
});
