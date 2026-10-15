import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createElement as h } from 'react';
import {
  AccessRevoked,
  AccessUnverified,
  NoRestaurants,
  RestaurantPreparing,
  SectionUnavailable,
  SessionUnverified,
} from '../../src/presentation/app-shell/access-states.tsx';
import {
  InfoNotice,
  ServiceUnavailableAlert,
  UnknownOutcomeAlert,
} from '../../src/presentation/ui/states.tsx';
import { hrefs, renderElement, text } from './support/render-route.mjs';

const noop = () => {};
const R = '33333333-3333-4333-8333-333333333333';

test('W13 offers to create an enterprise or refresh the list', () => {
  const html = renderElement(h(NoRestaurants, { onRefresh: noop }));
  assert.match(text(html), /Нет доступных ресторанов/);
  assert.match(text(html), /Учётная запись не связана ни с одним рестораном\./);
  assert.match(text(html), /Обновить список/);
  assert.ok(hrefs(html).includes('/app/organizations/new'));
});

test('W14 names the section and the restaurant and leads to the overview', () => {
  const html = renderElement(
    h(SectionUnavailable, {
      section: 'Аналитика',
      restaurantName: 'На Тургеневской',
      overviewPath: `/app/r/${R}`,
    }),
  );
  assert.match(text(html), /Раздел «Аналитика» недоступен/);
  assert.match(
    text(html),
    /Роли в ресторане «На Тургеневской» не включают доступ к этому разделу\. Доступ назначает администратор организации\./,
  );
  assert.ok(hrefs(html).includes(`/app/r/${R}`));
  const unnamed = renderElement(
    h(SectionUnavailable, {
      section: 'Склад',
      restaurantName: undefined,
      overviewPath: `/app/r/${R}`,
    }),
  );
  assert.match(text(unnamed), /Роли в этом ресторане не включают доступ/);
});

test('W15 hides the restaurant and offers another one', () => {
  const html = renderElement(
    h(AccessRevoked, { restaurantName: 'На Тургеневской' }),
  );
  assert.match(text(html), /Доступ к ресторану отозван/);
  assert.match(
    text(html),
    /Администратор организации отозвал доступ к ресторану «На Тургеневской»\. Данные ресторана скрыты, незавершённые формы не отправлены\./,
  );
  assert.deepEqual(
    hrefs(html).filter((href) => href.startsWith('/app')),
    ['/app', '/app/settings'],
  );
  assert.match(
    text(renderElement(h(AccessRevoked, { restaurantName: undefined }))),
    /отозвал доступ к этому ресторану/,
  );
});

test('W16 and W17 keep their texts and actions', () => {
  const preparing = text(
    renderElement(
      h(RestaurantPreparing, { restaurantName: 'На Чехова', onRetry: noop }),
    ),
  );
  assert.match(preparing, /Ресторан подготавливается/);
  assert.match(
    preparing,
    /Ресторан «На Чехова» создан, рабочее пространство ещё не готово\. Подготовка обычно занимает до минуты\./,
  );
  assert.match(preparing, /Проверить снова/);
  const unverified = text(
    renderElement(
      h(AccessUnverified, { details: '404 NotFound', onRetry: noop }),
    ),
  );
  assert.match(unverified, /Доступ не проверен/);
  assert.match(
    unverified,
    /Сервис авторизации не отвечает, поэтому список ресторанов не получен\. Это не означает, что доступов нет\./,
  );
  assert.match(unverified, /Повторить проверку/);
  assert.match(unverified, /Подробности для поддержки/);
  assert.match(unverified, /404 NotFound/);
  const session = text(renderElement(h(SessionUnverified, { onRetry: noop })));
  assert.match(session, /Сессия не проверена/);
});

test('data alerts follow MN04, RS06 and W12', () => {
  const unavailable = renderElement(
    h(
      ServiceUnavailableAlert,
      { title: 'Не удалось получить меню', onRetry: noop },
      'Склад сейчас не может подготовить остатки.',
    ),
  );
  assert.match(unavailable, /role="alert"/);
  assert.match(
    text(unavailable),
    /Не удалось получить меню.*Попробовать ещё раз/,
  );
  const unknown = renderElement(
    h(
      UnknownOutcomeAlert,
      { title: 'Результат добавления неизвестен', onCheck: noop },
      'Ответ сервиса не получен.',
    ),
  );
  assert.match(
    text(unknown),
    /Результат добавления неизвестен.*Проверить результат/,
  );
  const info = renderElement(
    h(InfoNotice, { title: 'Данные обновились' }, 'Сервис перезапускался.'),
  );
  assert.match(info, /role="status"/);
  assert.match(info, /info-24/);
});
