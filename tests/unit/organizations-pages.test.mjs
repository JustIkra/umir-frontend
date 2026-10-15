import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { localFailure } from '../../src/application/api.ts';
import {
  ORG,
  R,
  hrefs,
  h1,
  readyAccess,
  renderRoute,
  sampleRestaurant,
  text,
} from './support/render-route.mjs';

const ASIA = '66666666-6666-4666-8666-666666666666';
const PREPARING = '99999999-9999-4999-8999-999999999999';
const OPERATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const notFound = 'Страница не найдена';

// The account menu of the shell lists workplaces with their own status.
const main = (html) => /<main[^>]*>([\s\S]*?)<\/main>/.exec(html)?.[1] ?? '';

const adminRestaurants = [
  sampleRestaurant({ name: 'На Береговой', roles: ['Admin'] }),
  sampleRestaurant({
    restaurantID: PREPARING,
    name: 'На Чехова',
    lifecycle: 'registering',
    roles: [],
  }),
];

const adminAccess = readyAccess(adminRestaurants, { admin: true });

// «Азия Групп» sorts before «Восток Фуд», as access does.
const twoOrganizations = {
  status: 'ready',
  organizations: [
    {
      orgID: ASIA,
      name: 'Азия Групп',
      settings: { timeZone: 'Asia/Yekaterinburg', settingsVersion: '1' },
      admin: true,
      restaurants: [
        sampleRestaurant({
          orgID: ASIA,
          orgName: 'Азия Групп',
          roles: ['Admin'],
        }),
        sampleRestaurant({
          restaurantID: PREPARING,
          orgID: ASIA,
          name: 'На Тургеневской',
          roles: ['Admin'],
        }),
      ],
    },
    ...readyAccess().organizations,
  ],
};

const unverified = (previous) => ({
  status: 'unverified',
  failure: localFailure('Transport', 'unavailable', 0),
  ...(previous === undefined ? {} : { previous }),
});

const stalledPreparation = {
  kind: 'create-restaurant',
  name: 'На Чехова',
  orgID: ORG,
  operationID: OPERATION,
  lifecycle: {
    operationID: OPERATION,
    commandID: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    orgID: ORG,
    restaurantIDs: [PREPARING],
    lifecycle: 'registering',
    lifecycleVersion: '1',
    cleanup: 'not_required',
    services: [],
  },
  status: 'stalled',
  startedAt: 0,
};

test('OG01 lists the organizations of access with the role and the count', async () => {
  const html = await renderRoute('/app/organizations', {
    access: twoOrganizations,
  });
  const page = text(html);
  assert.equal(h1(html), 'Организации и рестораны');
  assert.match(page, /Азия Групп/);
  assert.match(page, /Восток Фуд/);
  assert.match(page, /Администратор/);
  assert.match(page, /Сотрудник/);
  assert.equal(page.match(/2 ресторана/g)?.length, 1);
  assert.match(page, /1 ресторан(?!а)/);
  assert.match(page, /Часовой пояс: Екатеринбург/);
  assert.ok(!page.includes('Asia/Yekaterinburg'));
  assert.ok(!page.includes('UTC'));
  assert.ok(!page.includes('Часовой пояс: Москва'));
  const links = hrefs(html);
  assert.ok(links.includes(`/app/organizations/${ASIA}`));
  assert.ok(links.includes(`/app/organizations/${ORG}`));
  assert.ok(links.includes('/app/organizations/new'));
});

test('OG04 explains that the account is in no organization', async () => {
  const html = await renderRoute('/app/organizations', {
    access: readyAccess([]),
  });
  assert.match(text(html), /Нет организаций/);
  assert.match(
    text(html),
    /Вы пока не состоите ни в одной организации\. Попросите администратора прислать приглашение — или создайте свою\./,
  );
  assert.match(text(html), /Создать организацию/);
  assert.ok(hrefs(html).includes('/app/organizations/new'));
});

test('OG06 says the list was not received when access is unverified', async () => {
  const page = text(
    await renderRoute('/app/organizations', { access: unverified() }),
  );
  assert.match(page, /Не удалось загрузить список организаций/);
  assert.match(page, /Попробуйте ещё раз\./);
  assert.match(page, /Попробовать ещё раз/);
  assert.ok(!page.includes('Нет организаций'));
});

test('OG05 shows skeletons while access is read', async () => {
  const ariaHidden = (html) => html.match(/aria-hidden="true"/g)?.length ?? 0;
  const loading = await renderRoute('/app/organizations', {
    access: { status: 'loading' },
  });
  const lost = await renderRoute('/app/organizations', {
    access: unverified(),
  });
  assert.equal(h1(loading), 'Организации и рестораны');
  assert.equal(ariaHidden(loading), ariaHidden(lost) + 1);
  assert.ok(!text(loading).includes('Нет организаций'));
  assert.ok(!text(loading).includes('Не удалось загрузить список организаций'));
});

test('an earlier answer stays shown when the check failed', async () => {
  const page = text(
    await renderRoute('/app/organizations', {
      access: unverified(twoOrganizations.organizations),
    }),
  );
  assert.match(page, /Азия Групп/);
  assert.ok(!page.includes('Не удалось загрузить список организаций'));
});

test('OG02 shows the administrator tabs and the restaurants', async () => {
  const html = await renderRoute(`/app/organizations/${ORG}`, {
    access: adminAccess,
  });
  const page = text(main(html));
  assert.equal(h1(html), 'Восток Фуд');
  assert.match(page, /Администратор · 2 ресторана · Москва/);
  for (const tab of [
    'Рестораны',
    'Участники',
    'Приглашения',
    'Профиль организации',
  ])
    assert.ok(page.includes(tab), tab);
  const links = hrefs(html);
  for (const tab of ['', '/members', '/invitations', '/profile'])
    assert.ok(links.includes(`/app/organizations/${ORG}${tab}`), tab);
  assert.match(page, /Добавить ресторан/);
  assert.match(page, /Готов к работе/);
  assert.ok(links.includes(`/app/r/${R}`));
  assert.match(page, /Настраивается/);
  assert.ok(!links.includes(`/app/r/${PREPARING}`));
  assert.match(page, /Ваша роль: Администратор/);
});

test('RS07 marks a stalled preparation and offers to watch it again', async () => {
  const html = await renderRoute(`/app/organizations/${ORG}`, {
    access: adminAccess,
    organizations: { operations: [stalledPreparation] },
  });
  const page = text(html);
  assert.match(page, /Не настроен/);
  assert.match(page, /Ресторан не настроился\./);
  assert.match(page, /Попробовать снова/);
  assert.ok(!hrefs(html).includes(`/app/r/${PREPARING}`));
  assert.ok(!text(main(html)).includes('Настраивается'));
});

test('a preparation still followed shows no retry', async () => {
  const page = text(
    main(
      await renderRoute(`/app/organizations/${ORG}`, {
        access: adminAccess,
        organizations: {
          operations: [{ ...stalledPreparation, status: 'following' }],
        },
      }),
    ),
  );
  assert.match(page, /Настраивается/);
  assert.ok(!page.includes('Попробовать снова'));
});

test('OG03 shows a staff member own restaurants and the read-only zone', async () => {
  const html = await renderRoute(`/app/organizations/${ORG}`);
  const page = text(main(html));
  assert.match(page, /Ваши рестораны и роли/);
  assert.match(page, /Ваши роли: Склад, Официант/);
  assert.match(page, /Москва \(UTC\+3\)/);
  assert.match(page, /Изменить его может только администратор организации/);
  assert.match(page, /Сотрудник · 1 ресторан/);
  assert.ok(!hrefs(html).includes(`/app/organizations/${ORG}/members`));
  assert.ok(!page.includes('Участники'));
  assert.ok(hrefs(html).includes('/app/organizations/new'));
});

test('the organization page without an answer shows OG06, not a 404', async () => {
  const page = text(
    await renderRoute(`/app/organizations/${ORG}`, { access: unverified() }),
  );
  assert.match(page, /Не удалось загрузить список организаций/);
  assert.match(page, /Попробовать ещё раз/);
});

test('unknown and malformed organizations show the 404 page', async () => {
  for (const path of [
    `/app/organizations/${ASIA}`,
    '/app/organizations/nobody',
    `/app/organizations/${ASIA}/members`,
    `/app/organizations/nobody/profile`,
    // A staff member does not open the administrator pages.
    `/app/organizations/${ORG}/members`,
    `/app/organizations/${ORG}/invitations`,
    `/app/organizations/${ORG}/invitations/new`,
    `/app/organizations/${ORG}/profile`,
  ])
    assert.equal(h1(await renderRoute(path)), notFound, path);
});

test('a malformed member id shows the 404 page', async () => {
  const path = (member) => `/app/organizations/${ORG}/members/${member}`;
  assert.equal(
    h1(await renderRoute(path('nobody'), { access: adminAccess })),
    notFound,
  );
  assert.equal(
    h1(
      await renderRoute(path('a2222222-2222-4222-8222-222222222222'), {
        access: readyAccess(adminRestaurants),
      }),
    ),
    notFound,
  );
});

test('the administrator pages open for the administrator', async () => {
  for (const tab of ['members', 'invitations', 'profile']) {
    const html = await renderRoute(`/app/organizations/${ORG}/${tab}`, {
      access: adminAccess,
    });
    assert.equal(h1(html), 'Восток Фуд', tab);
    assert.ok(text(html).includes('Профиль организации'), tab);
  }
});
