import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createElement as h } from 'react';
import {
  addRestaurantMessage,
  restaurantStateOf,
} from '../../src/presentation/organizations/add-restaurant-dialog.tsx';
import {
  nameError,
  organizationNameMessage,
  restaurantNameMessage,
} from '../../src/presentation/organizations/names.ts';
import {
  creationMessage,
  creationTone,
  followedCreation,
  refusalState,
  zoneUnsupported,
} from '../../src/presentation/organizations/new-organization-page.tsx';
import { ReadinessSteps } from '../../src/presentation/organizations/readiness-steps.tsx';
import {
  ORG,
  R,
  h1,
  labels,
  readyAccess,
  renderElement,
  renderRoute,
  sampleRestaurant,
  text,
} from './support/render-route.mjs';

const OPERATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

// The opening tag of the button with this caption.
const buttonTag = (html, caption) =>
  [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].find(
    (match) => match[1].replace(/<[^>]+>/g, '') === caption,
  )?.[0];

// The tag of the input with this name.
const inputTag = (html, name) =>
  [...html.matchAll(/<input[^>]*>/g)].find((match) =>
    match[0].includes(`name="${name}"`),
  )?.[0];

const operation = (status, overrides = {}) => ({
  kind: 'create-organization',
  name: 'Северная кухня',
  orgID: ORG,
  operationID: OPERATION,
  lifecycle: {
    operationID: OPERATION,
    commandID: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    orgID: ORG,
    restaurantIDs: [R],
    lifecycle: status === 'finished' ? 'ready' : 'registering',
    lifecycleVersion: '1',
    cleanup: 'not_required',
    services: [],
  },
  status,
  startedAt: 0,
  ...overrides,
});

test('a name is checked before it is sent', () => {
  assert.equal(nameError(''), 'required');
  assert.equal(nameError('  '), 'required');
  assert.equal(nameError('a'.repeat(101)), 'long');
  assert.equal(nameError('a'.repeat(100)), undefined);
  assert.equal(nameError('😀'.repeat(100)), undefined);
  assert.equal(nameError('😀'.repeat(101)), 'long');
  assert.equal(nameError('a\nb'), 'control');
  assert.equal(nameError('a\rb'), 'control');
  assert.equal(nameError('a\u0000b'), 'control');
  assert.equal(nameError('Северная кухня'), undefined);
});

test('name errors read as the frames say', () => {
  assert.equal(
    organizationNameMessage('required'),
    'Укажите название организации',
  );
  assert.equal(restaurantNameMessage('required'), 'Укажите название ресторана');
  for (const message of [organizationNameMessage, restaurantNameMessage]) {
    assert.equal(message('long'), 'Не длиннее 100 символов');
    assert.equal(
      message('control'),
      'Название не может содержать перевод строки',
    );
  }
});

test('NE02 asks to fill the marked fields', () => {
  assert.deepEqual(creationMessage({ kind: 'invalid' }, ''), {
    title: 'Предприятие не создано',
    text: 'Заполните поля, отмеченные ниже.',
  });
  assert.equal(creationTone({ kind: 'invalid' }), 'error');
});

test('NE02 from the service has no marked fields to point at', () => {
  const message = creationMessage({ kind: 'invalid', rejected: true }, '');
  assert.equal(message?.title, 'Предприятие не создано');
  assert.ok(!message?.text.includes('отмеченные ниже'));
});

test('a creation that can no longer be followed never opens the form again', () => {
  const message = creationMessage({ kind: 'untracked' }, 'Северная кухня');
  assert.equal(message?.title, 'Состояние подготовки неизвестно');
  assert.equal(
    message?.text,
    'Организация создана, но получить состояние подготовки не удалось. Откройте список организаций, чтобы проверить ресторан.',
  );
  assert.equal(creationTone({ kind: 'untracked' }), 'unknown');
  assert.ok(!message?.text.includes('не отвечает'));
});

test('NE05 tells the preparation takes up to a minute', () => {
  const message = creationMessage(
    { kind: 'preparing', operationID: OPERATION },
    'Северная кухня',
  );
  assert.equal(
    message?.text,
    'Подготовка ресторана обычно занимает до минуты. Страницу можно не обновлять.',
  );
  assert.equal(
    creationTone({ kind: 'preparing', operationID: OPERATION }),
    'info',
  );
});

test('NE06 names the new enterprise', () => {
  assert.equal(
    creationMessage({ kind: 'ready', restaurantID: R }, 'Северная кухня')
      ?.title,
    'Предприятие «Северная кухня» готово к работе',
  );
  assert.equal(creationTone({ kind: 'ready', restaurantID: R }), 'success');
});

test('NE09 offers the preparation again without creating the organization again', () => {
  const message = creationMessage(
    { kind: 'stalled', operationID: OPERATION },
    'Северная кухня',
  );
  assert.equal(message?.title, 'Подготовка ресторана не завершена');
  assert.equal(
    message?.text,
    'Организация создана, рабочее пространство ресторана не подготовлено. Повторите подготовку — организация повторно не создаётся.',
  );
});

test('NE07 never promises either outcome', () => {
  const message = creationMessage({ kind: 'unknown' }, '');
  assert.equal(message?.title, 'Результат создания неизвестен');
  assert.equal(
    message?.text,
    'Ответ сервиса не получен. Предприятие могло быть создано. Повторная отправка не требуется: проверка продолжит ту же попытку.',
  );
  assert.equal(creationTone({ kind: 'unknown' }), 'unknown');
});

test('NE08 and NE10 are two reasons the enterprise was not created', () => {
  const unavailable = creationMessage({ kind: 'not-created' }, '');
  assert.equal(unavailable?.title, 'Предприятие не создано');
  assert.equal(
    unavailable?.text,
    'Сервис авторизации не отвечает. Данные сохранены в форме, повторите отправку через несколько минут.',
  );
  const checked = creationMessage({ kind: 'not-created', checked: true }, '');
  assert.equal(checked?.title, 'Предприятие не создано');
  assert.equal(
    checked?.text,
    'Проверка показала, что попытка не завершена. Введённые данные сохранены, форму можно отправить повторно.',
  );
  const limited = creationMessage({ kind: 'not-created', seconds: 45 }, '');
  assert.match(limited?.text ?? '', /45 с/);
});

test('NE11 says the account may not create organizations', () => {
  const message = creationMessage({ kind: 'forbidden' }, '');
  assert.equal(message?.title, 'Создание предприятия недоступно');
  assert.equal(
    message?.text,
    'Политика сервиса не разрешает этой учётной записи создавать организации. Доступ к существующей организации предоставляет её администратор.',
  );
});

test('only the states with news have a message', () => {
  assert.equal(creationMessage({ kind: 'editing' }, ''), undefined);
  assert.equal(creationMessage({ kind: 'sending' }, ''), undefined);
});

test('the refusals of Auth become the screen states', () => {
  assert.deepEqual(
    refusalState(
      { kind: 'invalid', code: 'InvalidArgument', fields: {} },
      false,
    ),
    {
      kind: 'invalid',
      rejected: true,
    },
  );
  assert.deepEqual(
    refusalState(
      { kind: 'invalid', code: 'UnknownTimeZone', fields: {} },
      false,
    ),
    { kind: 'zone' },
  );
  assert.deepEqual(refusalState({ kind: 'forbidden' }, false), {
    kind: 'forbidden',
  });
  assert.deepEqual(refusalState({ kind: 'unknown', code: 'Transport' }, true), {
    kind: 'unknown',
  });
  assert.deepEqual(
    refusalState({ kind: 'unavailable', code: 'AuthUnavailable' }, false),
    { kind: 'not-created' },
  );
  assert.deepEqual(
    refusalState({ kind: 'unavailable', code: 'AuthUnavailable' }, true),
    { kind: 'not-created', checked: true },
  );
  assert.deepEqual(refusalState({ kind: 'limited', seconds: 60 }, false), {
    kind: 'not-created',
    seconds: 60,
  });
  assert.deepEqual(refusalState({ kind: 'ended' }, false), {
    kind: 'editing',
  });
});

test('TZ09 names the zone Auth does not know', () => {
  assert.equal(
    zoneUnsupported('Etc/GMT-3'),
    'Зона «Etc/GMT-3» не поддерживается сервисом. Выберите зону из списка.',
  );
  assert.equal(
    creationMessage({ kind: 'zone' }, '')?.text,
    'Зона не поддерживается сервисом. Выберите зону из списка.',
  );
});

test('the followed operation decides the preparation states', () => {
  const preparing = { kind: 'preparing', operationID: OPERATION };
  assert.deepEqual(followedCreation(preparing, []), preparing);
  assert.deepEqual(followedCreation(preparing, [operation('following')]), {
    kind: 'preparing',
    operationID: OPERATION,
  });
  assert.deepEqual(followedCreation(preparing, [operation('finished')]), {
    kind: 'ready',
    restaurantID: R,
  });
  assert.deepEqual(followedCreation(preparing, [operation('stalled')]), {
    kind: 'stalled',
    operationID: OPERATION,
  });
  assert.deepEqual(followedCreation(preparing, [operation('lost')]), {
    kind: 'untracked',
  });
  const editing = { kind: 'editing' };
  assert.deepEqual(followedCreation(editing, [operation('finished')]), editing);
});

test('NE01 is an empty form with the zone of Moscow', async () => {
  const html = await renderRoute('/app/organizations/new');
  assert.equal(h1(html), 'Создать предприятие');
  for (const label of [
    'Название организации',
    'Название первого ресторана',
    'Часовой пояс организации',
  ])
    assert.ok(labels(html).includes(label), label);
  assert.match(text(html), /Москва — Europe\/Moscow · UTC\+3/);
  assert.match(text(html), /Отображается в меню и письмах-приглашениях/);
  assert.ok(!buttonTag(html, 'Создать предприятие')?.includes('disabled'));
  assert.ok(!text(html).includes('Результат создания неизвестен'));
});

test('a creation without a known outcome locks the form and offers the check', async () => {
  const html = await renderRoute('/app/organizations/new', {
    organizations: { pending: new Set(['org.create']) },
  });
  assert.ok(buttonTag(html, 'Создать предприятие')?.includes('disabled'));
  assert.ok(inputTag(html, 'organizationName')?.includes('disabled'));
  assert.ok(inputTag(html, 'restaurantName')?.includes('disabled'));
  assert.match(text(html), /Результат создания неизвестен/);
  assert.ok(buttonTag(html, 'Проверить результат'));
});

const adminAccess = readyAccess(
  [
    sampleRestaurant({ roles: ['Admin'] }),
    sampleRestaurant({
      restaurantID: '99999999-9999-4999-8999-999999999999',
      name: 'На Чехова',
      lifecycle: 'registering',
      roles: [],
    }),
  ],
  { admin: true },
);

test('RS01 is an empty dialog that repeats the zone of the organization', async () => {
  const html = await renderRoute(`/app/organizations/${ORG}`, {
    access: adminAccess,
  });
  assert.ok(labels(html).includes('Название ресторана'));
  assert.match(
    text(html),
    /Часовой пояс — как у организации: Москва — Europe\/Moscow, UTC\+3\./,
  );
  assert.ok(buttonTag(html, 'Добавить')?.includes('type="submit"'));
  assert.ok(!text(html).includes('Результат добавления неизвестен'));
});

test('RS06 locks the dialog while the answer is unknown', async () => {
  const html = await renderRoute(`/app/organizations/${ORG}`, {
    access: adminAccess,
    organizations: { pending: new Set([`org.restaurant.add.${ORG}`]) },
  });
  assert.match(text(html), /Результат добавления неизвестен/);
  assert.ok(inputTag(html, 'restaurantName')?.includes('disabled'));
  assert.ok(buttonTag(html, 'Проверить результат'));
});

test('the dialog messages follow the frames', () => {
  const name = 'На Ленина';
  assert.deepEqual(addRestaurantMessage({ kind: 'unknown' }, name), {
    title: 'Результат добавления неизвестен',
    text: 'Ответ сервиса не получен. Ресторан мог быть добавлен. Повторная отправка не требуется: проверка продолжит ту же попытку.',
  });
  assert.equal(
    addRestaurantMessage({ kind: 'forbidden' }, name)?.title,
    'Добавление недоступно',
  );
  assert.equal(
    addRestaurantMessage({ kind: 'not-added' }, name)?.title,
    'Ресторан не добавлен',
  );
  assert.match(
    addRestaurantMessage({ kind: 'not-added', seconds: 30 }, name)?.text ?? '',
    /30 с/,
  );
  assert.equal(addRestaurantMessage({ kind: 'editing' }, name), undefined);
  assert.equal(addRestaurantMessage({ kind: 'sending' }, name), undefined);
});

test('the dialog states come from the outcomes', () => {
  assert.deepEqual(restaurantStateOf({ kind: 'forbidden' }, false), {
    kind: 'forbidden',
  });
  assert.deepEqual(restaurantStateOf({ kind: 'gone' }, false), {
    kind: 'gone',
  });
  assert.deepEqual(
    restaurantStateOf(
      { kind: 'invalid', code: 'InvalidArgument', fields: {} },
      false,
    ),
    {
      kind: 'rejected',
    },
  );
  assert.deepEqual(restaurantStateOf({ kind: 'unknown', code: 'T' }, true), {
    kind: 'unknown',
  });
  assert.deepEqual(
    restaurantStateOf({ kind: 'unavailable', code: 'AuthUnavailable' }, false),
    { kind: 'not-added' },
  );
  assert.deepEqual(restaurantStateOf({ kind: 'limited', seconds: 60 }, false), {
    kind: 'not-added',
    seconds: 60,
  });
  assert.deepEqual(restaurantStateOf({ kind: 'ended' }, false), {
    kind: 'editing',
  });
});

test('NE05 marks the second step as current and NE06 completes all three', () => {
  const steps = [
    'Организация создана',
    'Ресторан подготавливается',
    'Готово к работе',
  ];
  const preparing = renderElement(h(ReadinessSteps, { stage: 'preparing' }));
  for (const step of steps) assert.ok(text(preparing).includes(step), step);
  assert.equal(preparing.match(/aria-current="step"/g)?.length, 1);
  assert.match(text(preparing), /Ресторан подготавливается — выполняется/);
  const ready = renderElement(h(ReadinessSteps, { stage: 'ready' }));
  assert.ok(!ready.includes('aria-current'));
  assert.match(text(ready), /Готово к работе — выполнено/);
  const stalled = renderElement(h(ReadinessSteps, { stage: 'stalled' }));
  assert.match(text(stalled), /Ресторан подготавливается — не завершено/);
});

test('the pending creation shows the values it was sent with', async () => {
  const html = await renderRoute('/app/organizations/new', {
    organizations: {
      pending: new Set(['org.create']),
      pendingOrganization: {
        name: 'Северная кухня',
        timeZone: 'Asia/Yekaterinburg',
        firstRestaurantName: 'На Невском',
      },
    },
  });
  assert.ok(
    inputTag(html, 'organizationName')?.includes('value="Северная кухня"'),
  );
  assert.ok(inputTag(html, 'restaurantName')?.includes('value="На Невском"'));
  assert.match(text(html), /Екатеринбург — Asia\/Yekaterinburg · UTC\+5/);
});

test('the pending restaurant shows the name it was sent with', async () => {
  const html = await renderRoute(`/app/organizations/${ORG}`, {
    access: adminAccess,
    organizations: {
      pending: new Set([`org.restaurant.add.${ORG}`]),
      pendingRestaurantName: 'На Ленина',
    },
  });
  assert.ok(inputTag(html, 'restaurantName')?.includes('value="На Ленина"'));
});

test('NE06 names the enterprise as the followed operation does', () => {
  const state = followedCreation(
    { kind: 'preparing', operationID: OPERATION },
    [operation('finished', { name: 'Северная кухня' })],
  );
  assert.equal(
    creationMessage(state, 'Северная кухня')?.title,
    'Предприятие «Северная кухня» готово к работе',
  );
});
