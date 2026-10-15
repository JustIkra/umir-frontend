import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  zoneMessage,
  zoneOutcomeState,
} from '../../src/presentation/organizations/organization-profile-page.tsx';
import {
  filterZones,
  noZonesMessage,
} from '../../src/presentation/organizations/timezone-field.tsx';
import {
  NOW,
  ORG,
  failedRead,
  loadingRead,
  organizationProfile,
  readyAccess,
  renderRoute,
  sampleRestaurant,
  text,
} from './support/render-route.mjs';

const access = readyAccess([sampleRestaurant({ roles: ['Admin'] })], {
  admin: true,
});
const path = `/app/organizations/${ORG}/profile`;
const page = (organizations) => renderRoute(path, { access, organizations });

// The opening tag of the first element with this id.
const tagOf = (html, id) =>
  new RegExp(`<[a-z]+[^>]*\\sid="${id}"[^>]*>`).exec(html)?.[0];

test('the zone search finds a city or an identifier, ignoring case', () => {
  assert.deepEqual(filterZones('екат', NOW), ['Asia/Yekaterinburg']);
  assert.deepEqual(filterZones('ЕКАТ', NOW), ['Asia/Yekaterinburg']);
  assert.deepEqual(filterZones('Asia/Om', NOW), ['Asia/Omsk']);
  assert.deepEqual(filterZones('moscow', NOW), ['Europe/Moscow']);
  assert.deepEqual(filterZones('сидоров', NOW), []);
  assert.ok(filterZones('', NOW).includes('Europe/Moscow'));
  assert.ok(noZonesMessage.startsWith('Ничего не нашли.'));
  assert.ok(!noZonesMessage.includes('/'));
});

test('zoneMessage says what the frames TZ06 to TZ13 say', () => {
  const at = (state) => zoneMessage(state, NOW);
  assert.equal(at({ kind: 'idle' }), undefined);
  assert.deepEqual(at({ kind: 'changed' }), {
    text: 'Даты будут показываться по новому часовому поясу. Сроки уже принятых продуктов не изменятся.',
    tone: 'info',
  });
  assert.deepEqual(at({ kind: 'saving' }), {
    text: 'Сохраняем…',
    tone: 'info',
  });
  assert.deepEqual(at({ kind: 'saved', timeZone: 'Asia/Yekaterinburg' }), {
    title: 'Часовой пояс сохранён',
    text: 'Даты во всех ресторанах показываются по часовому поясу Екатеринбург (UTC+5).',
    tone: 'success',
  });
  assert.deepEqual(at({ kind: 'unsupported', timeZone: 'Etc/GMT-3' }), {
    text: 'Этот часовой пояс недоступен. Выберите из списка.',
    tone: 'error',
  });
  assert.deepEqual(at({ kind: 'forbidden' }), {
    title: 'Часовой пояс не сохранён',
    text: 'У вас больше нет роли администратора. Менять часовой пояс может только администратор организации.',
    tone: 'error',
  });
  assert.deepEqual(at({ kind: 'unavailable' }), {
    title: 'Часовой пояс не сохранён',
    text: 'Не получилось. Попробуйте через пару минут. Выбранный часовой пояс остался в поле.',
    tone: 'error',
  });
  assert.deepEqual(at({ kind: 'conflict', timeZone: 'Europe/Samara' }), {
    title: 'Часовой пояс уже изменён',
    text: 'Другой администратор уже выбрал часовой пояс Самара (UTC+4). Проверьте и, если нужно, сохраните свой ещё раз.',
    tone: 'error',
  });
  assert.deepEqual(at({ kind: 'conflict', timeZone: undefined }), {
    title: 'Часовой пояс уже изменён',
    text: 'Другой администратор уже сменил часовой пояс. Проверьте и, если нужно, сохраните свой ещё раз.',
    tone: 'error',
  });
  assert.deepEqual(at({ kind: 'unknown' }), {
    title: 'Не знаем, сохранился ли часовой пояс',
    text: 'Связь прервалась. Нажмите «Проверить результат» — повторно ничего не отправится.',
    tone: 'info',
  });
});

test('the answer of Auth decides the state of the zone', () => {
  const profile = {
    orgID: ORG,
    name: 'Северная сеть',
    settings: { timeZone: 'Asia/Omsk', settingsVersion: '2' },
    lifecycle: 'active',
    lifecycleVersion: '1',
  };
  const state = (outcome) => zoneOutcomeState(outcome, 'Asia/Omsk');
  assert.deepEqual(state({ kind: 'done', value: profile }), {
    kind: 'saved',
    timeZone: 'Asia/Omsk',
  });
  assert.deepEqual(
    state({ kind: 'invalid', code: 'UnknownTimeZone', fields: {} }),
    { kind: 'unsupported', timeZone: 'Asia/Omsk' },
  );
  assert.deepEqual(state({ kind: 'forbidden' }), { kind: 'forbidden' });
  assert.deepEqual(state({ kind: 'unavailable', code: 'AuthUnavailable' }), {
    kind: 'unavailable',
  });
  assert.deepEqual(state({ kind: 'limited', seconds: 60 }), {
    kind: 'unavailable',
  });
  assert.deepEqual(state({ kind: 'conflict' }), {
    kind: 'conflict',
    timeZone: undefined,
  });
  assert.deepEqual(state({ kind: 'unknown', code: 'Timeout' }), {
    kind: 'unknown',
  });
  assert.deepEqual(state({ kind: 'ended' }), { kind: 'idle' });
});

test('the profile shows the name and the zone of Auth', async () => {
  const html = await page({ profile: organizationProfile() });
  const plain = text(html);
  assert.ok(plain.includes('Профиль организации'));
  assert.ok(plain.includes('Северная сеть'));
  assert.ok(plain.includes('Москва (UTC+3)'));
  assert.ok(!plain.includes('Europe/Moscow'));
  assert.ok(!plain.includes('Сохранить часовой пояс'));
  assert.ok(!tagOf(html, 'organization-zone').includes('disabled'));
});

test('the zone of the profile, not the one of access, is shown', async () => {
  const html = await page({
    profile: organizationProfile({
      settings: { timeZone: 'Asia/Omsk', settingsVersion: '5' },
    }),
  });
  assert.ok(text(html).includes('Омск (UTC+6)'));
});

test('the profile loads under a skeleton', async () => {
  const html = await page({ profile: loadingRead });
  assert.ok(text(html).includes('Профиль организации'));
  assert.ok(!text(html).includes('Часовой пояс организации'));
});

test('a lost profile read is not the absence of a profile', async () => {
  const plain = text(
    await page({ profile: failedRead('AuthUnavailable', 503) }),
  );
  assert.ok(plain.includes('Не удалось загрузить профиль организации'));
  assert.ok(plain.includes('Попробуйте ещё раз.'));
  assert.ok(plain.includes('Попробовать ещё раз'));
});

test('a removed administrator role leaves the profile', async () => {
  const html = await page({
    profile: failedRead('Forbidden', 403, 'rejected'),
  });
  assert.ok(!text(html).includes('Не удалось загрузить профиль организации'));
  assert.ok(!text(html).includes('Часовой пояс организации'));
});

test('a zone without a known outcome locks the field', async () => {
  const html = await page({
    profile: organizationProfile(),
    pending: new Set([`org.zone.${ORG}`]),
  });
  assert.ok(tagOf(html, 'organization-zone').includes('disabled'));
  const plain = text(html);
  assert.ok(plain.includes('Не знаем, сохранился ли часовой пояс'));
  assert.ok(plain.includes('Проверить результат'));
});
