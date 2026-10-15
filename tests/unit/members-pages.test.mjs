import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createElement as h } from 'react';
import { orgKeys } from '../../src/application/organization-commands.ts';
import { AssignmentMatrix } from '../../src/presentation/organizations/assignment-matrix.tsx';
import {
  assignmentLines,
  assignmentsMessage,
  assignmentsOutcomeState,
  changedRestaurants,
  editableRestaurants,
  filterMembers,
  grantsOf,
  offeredRestaurants,
  readyRestaurants,
  revokeMessage,
  revokeOutcomeState,
  revokedNotice,
  toggleRole,
} from '../../src/presentation/organizations/members.ts';
import {
  MEMBERSHIP,
  ORG,
  R,
  failedRead,
  h1,
  hrefs,
  loadingRead,
  memberList,
  readyAccess,
  renderElement,
  renderRoute,
  sampleMember,
  sampleRestaurant,
  text,
} from './support/render-route.mjs';

const BEREGOVAYA = '99999999-9999-4999-8999-999999999999';
const CHEKHOVA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GONE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OTHER_MEMBERSHIP = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const OWN_MEMBERSHIP = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const notFound = 'Страница не найдена';
// The role card of the page has a dialog as well as the revoke dialog.
const revokeDialog = (html) =>
  [...html.matchAll(/<dialog[\s\S]*?<\/dialog>/g)]
    .map((match) => match[0])
    .find((dialog) => /Отозвать доступ|отозван ли доступ/.test(text(dialog))) ??
  '';
const main = (html) => /<main[^>]*>([\s\S]*?)<\/main>/.exec(html)?.[1] ?? '';

const turgenev = sampleRestaurant({
  name: 'Ресторан „Тургеневский дворик“',
  roles: ['Admin'],
});
const beregovaya = sampleRestaurant({
  restaurantID: BEREGOVAYA,
  name: 'На Береговой',
  roles: ['Admin'],
});
const chekhova = sampleRestaurant({
  restaurantID: CHEKHOVA,
  name: 'На Чехова',
  lifecycle: 'registering',
  roles: [],
});
const deleting = sampleRestaurant({
  restaurantID: GONE,
  name: 'На Садовой',
  lifecycle: 'deleting',
  roles: [],
});
const restaurants = [turgenev, beregovaya, chekhova, deleting];
const access = readyAccess(restaurants, { admin: true });

const assignment = (restaurantID, roles, id = restaurantID) => ({
  restaurantID,
  assignmentID: id,
  assignmentVersion: '1',
  roles,
});

const irina = sampleMember({
  displayName: 'Ирина Ковалёва',
  email: 'i.kovaleva@restoran.example',
  membership: {
    assignments: [
      assignment(R, ['Waiter']),
      assignment(BEREGOVAYA, ['Warehouse', 'Waiter']),
    ],
  },
});
const marina = sampleMember({
  displayName: 'Марина Белова',
  email: 'm.belova@restoran.example',
  membership: {
    membershipID: OWN_MEMBERSHIP,
    userID: 'u',
    orgRoles: ['Admin'],
    assignments: [],
  },
});
const alexey = sampleMember({
  displayName: 'Алексей Смирнов',
  email: undefined,
  membership: {
    membershipID: OTHER_MEMBERSHIP,
    userID: OTHER,
    assignments: [assignment(GONE, ['Warehouse'])],
  },
});

const members = [marina, irina, alexey];
const withMembers = (items = members, extra = {}) => ({
  access,
  organizations: { members: memberList(items), ...extra },
});
const listPath = `/app/organizations/${ORG}/members`;
const cardPath = `${listPath}/${MEMBERSHIP}`;

test('assignmentLines name the roles of each restaurant or the administrator', () => {
  assert.deepEqual(
    assignmentLines(
      irina,
      restaurants.map((r) => ({ ...r })),
    ),
    [
      'Ресторан „Тургеневский дворик“ — Официант',
      'На Береговой — Склад, Официант',
    ],
  );
  assert.deepEqual(assignmentLines(marina, restaurants), [
    'Администратор организации · все рестораны',
  ]);
});

test('assignmentLines skip restaurants that are not in the list', () => {
  assert.deepEqual(assignmentLines(alexey, [turgenev, beregovaya]), []);
  assert.deepEqual(assignmentLines(alexey, restaurants), [
    'На Садовой — Склад',
  ]);
});

test('filterMembers matches a part of the name or the address, ignoring case', () => {
  assert.deepEqual(filterMembers(members, 'КОВАЛ'), [irina]);
  assert.deepEqual(filterMembers(members, 'M.BELOVA@'), [marina]);
  assert.deepEqual(filterMembers(members, 'Сидоров'), []);
  assert.deepEqual(filterMembers(members, '  '), members);
  // A member without an address is still found by name.
  assert.deepEqual(filterMembers(members, 'смирнов'), [alexey]);
});

test('grantsOf lists the roles of each assignment in the contract order', () => {
  assert.deepEqual(grantsOf(irina), [
    { restaurantID: R, roles: ['Waiter'] },
    { restaurantID: BEREGOVAYA, roles: ['Warehouse', 'Waiter'] },
  ]);
  assert.deepEqual(grantsOf(marina), []);
});

test('editableRestaurants are the ready and the preparing ones', () => {
  assert.deepEqual(
    [...editableRestaurants(restaurants)].sort(),
    [R, BEREGOVAYA, CHEKHOVA].sort(),
  );
});

test('offeredRestaurants and readyRestaurants keep the rule in one place', () => {
  assert.deepEqual(offeredRestaurants(restaurants), [
    turgenev,
    beregovaya,
    chekhova,
  ]);
  assert.deepEqual(
    [...readyRestaurants(restaurants)].sort(),
    [R, BEREGOVAYA].sort(),
  );
});

test('toggleRole adds and removes a role and drops an empty grant', () => {
  const start = grantsOf(irina);
  const added = toggleRole(start, R, 'Warehouse', true);
  assert.deepEqual(
    added.find((grant) => grant.restaurantID === R),
    { restaurantID: R, roles: ['Warehouse', 'Waiter'] },
  );
  const removed = toggleRole(start, R, 'Waiter', false);
  assert.ok(!removed.some((grant) => grant.restaurantID === R));
  const created = toggleRole(start, CHEKHOVA, 'Waiter', true);
  assert.deepEqual(created.at(-1), {
    restaurantID: CHEKHOVA,
    roles: ['Waiter'],
  });
  assert.deepEqual(start, grantsOf(irina));
});

test('changedRestaurants names the restaurants whose roles differ', () => {
  const start = grantsOf(irina);
  assert.equal(changedRestaurants(start, start).size, 0);
  const draft = toggleRole(
    toggleRole(start, BEREGOVAYA, 'Warehouse', false),
    CHEKHOVA,
    'Waiter',
    true,
  );
  assert.deepEqual(
    [...changedRestaurants(start, draft)].sort(),
    [BEREGOVAYA, CHEKHOVA].sort(),
  );
  // The same roles in another order are not a change.
  assert.equal(
    changedRestaurants(
      [{ restaurantID: R, roles: ['Warehouse', 'Waiter'] }],
      [{ restaurantID: R, roles: ['Waiter', 'Warehouse'] }],
    ).size,
    0,
  );
});

test('assignmentsMessage says what the frames MM02 to MM08 say', () => {
  assert.equal(assignmentsMessage({ kind: 'view' }), undefined);
  assert.deepEqual(assignmentsMessage({ kind: 'changed' }), {
    text: 'Есть несохранённые изменения.',
    tone: 'info',
  });
  assert.deepEqual(assignmentsMessage({ kind: 'saving' }), {
    text: 'Сохраняем…',
    tone: 'info',
  });
  assert.deepEqual(assignmentsMessage({ kind: 'saved' }), {
    title: 'Роли сохранены',
    text: 'Участник увидит изменения после обновления страницы.',
    tone: 'success',
  });
  assert.deepEqual(assignmentsMessage({ kind: 'no-roles' }), {
    title: 'Роли не сохранены',
    text: 'Не выбрано ни одной роли. Отметьте хотя бы одну или нажмите «Отозвать доступ», чтобы закрыть доступ полностью.',
    tone: 'error',
  });
  assert.deepEqual(assignmentsMessage({ kind: 'conflict' }), {
    title: 'Роли не сохранены',
    text: 'Пока форма была открыта, роли участника изменились — например, в другой вкладке. Обновите форму и внесите изменения заново.',
    tone: 'error',
  });
  assert.deepEqual(assignmentsMessage({ kind: 'unavailable' }), {
    title: 'Роли не сохранены',
    text: 'Не получилось. Попробуйте через пару минут. Данные остались в форме.',
    tone: 'error',
  });
  assert.deepEqual(assignmentsMessage({ kind: 'unknown' }), {
    title: 'Не знаем, сохранились ли роли',
    text: 'Связь прервалась. Нажмите «Проверить результат» — повторно ничего не отправится.',
    tone: 'info',
  });
  assert.deepEqual(assignmentsMessage({ kind: 'last-admin' }), {
    title: 'Роли не сохранены',
    text: 'В организации должен остаться хотя бы один администратор.',
    tone: 'error',
  });
  assert.deepEqual(assignmentsMessage({ kind: 'forbidden' }), {
    title: 'Роли не сохранены',
    text: 'Менять роли может только администратор организации.',
    tone: 'error',
  });
});

test('assignmentsOutcomeState maps the answer of Auth to a frame', () => {
  const state = (outcome) => assignmentsOutcomeState(outcome).kind;
  assert.equal(state({ kind: 'unchanged' }), 'view');
  assert.equal(state({ kind: 'saved' }), 'saved');
  assert.equal(state({ kind: 'no-roles' }), 'no-roles');
  assert.equal(state({ kind: 'conflict' }), 'conflict');
  assert.equal(state({ kind: 'gone' }), 'conflict');
  assert.equal(state({ kind: 'last-admin' }), 'last-admin');
  assert.equal(state({ kind: 'forbidden' }), 'forbidden');
  assert.equal(state({ kind: 'unknown', code: 'X' }), 'unknown');
  assert.equal(
    state({ kind: 'unavailable', code: 'AuthUnavailable' }),
    'unavailable',
  );
  assert.equal(state({ kind: 'limited', seconds: 60 }), 'unavailable');
  assert.equal(
    state({ kind: 'invalid', code: 'InvalidArgument', fields: {} }),
    'unavailable',
  );
});

test('revokeMessage says what the frames RV03 to RV06 say', () => {
  assert.equal(revokeMessage({ kind: 'confirm' }, 'Ирина Ковалёва'), undefined);
  assert.equal(
    revokeMessage({ kind: 'revoking' }, 'Ирина Ковалёва'),
    undefined,
  );
  assert.deepEqual(revokedNotice('Ирина Ковалёва'), {
    title: 'Доступ участника Ирина Ковалёва отозван',
    text: 'Участник больше не видит рестораны организации. Его аккаунт остался.',
  });
  assert.deepEqual(revokeMessage({ kind: 'unavailable' }, 'Ирина Ковалёва'), {
    title: 'Доступ не отозван',
    text: 'Не получилось. Попробуйте через пару минут.',
  });
  assert.deepEqual(revokeMessage({ kind: 'unknown' }, 'Ирина Ковалёва'), {
    title: 'Не знаем, отозван ли доступ',
    text: 'Связь прервалась. Нажмите «Проверить результат» — повторно ничего не отправится.',
  });
  assert.deepEqual(revokeMessage({ kind: 'already' }, 'Ирина Ковалёва'), {
    title: 'Доступ уже отозван',
    text: 'Доступ участника Ирина Ковалёва к организации уже отозвали — например, в другой вкладке.',
  });
  assert.deepEqual(revokeMessage({ kind: 'changed' }, 'Ирина Ковалёва'), {
    title: 'Доступ не отозван',
    text: 'Данные участника изменились. Закройте окно и попробуйте ещё раз.',
  });
  assert.deepEqual(revokeMessage({ kind: 'last-admin' }, 'Ирина Ковалёва'), {
    title: 'Доступ не отозван',
    text: 'В организации должен остаться хотя бы один администратор.',
  });
});

test('revokeOutcomeState maps the answer of Auth to a frame', () => {
  const state = (outcome) => revokeOutcomeState(outcome);
  assert.equal(state({ kind: 'done', value: {} }), 'done');
  assert.equal(state({ kind: 'conflict' }).kind, 'changed');
  assert.equal(state({ kind: 'last-admin' }).kind, 'last-admin');
  assert.equal(state({ kind: 'forbidden' }).kind, 'forbidden');
  assert.equal(state({ kind: 'unknown', code: 'X' }).kind, 'unknown');
  assert.equal(state({ kind: 'unavailable', code: 'X' }).kind, 'unavailable');
  assert.equal(state({ kind: 'limited', seconds: 5 }).kind, 'unavailable');
});

test('MB01 lists the members, the current user without a link', async () => {
  const html = await renderRoute(listPath, withMembers());
  const page = text(html);
  assert.match(page, /Марина Белова/);
  assert.match(page, /Ирина Ковалёва/);
  assert.match(page, /i\.kovaleva@restoran\.example/);
  assert.match(page, /Администратор организации · все рестораны/);
  assert.match(page, /Ресторан „Тургеневский дворик“ — Официант/);
  assert.match(page, /На Береговой — Склад, Официант/);
  // The current user: «Это вы» instead of «Открыть».
  assert.equal(page.match(/Это вы/g)?.length, 1);
  const links = hrefs(html);
  assert.ok(!links.some((href) => href.endsWith(OWN_MEMBERSHIP)));
  assert.ok(links.includes(`${listPath}/${MEMBERSHIP}`));
  assert.ok(links.includes(`${listPath}/${OTHER_MEMBERSHIP}`));
  assert.ok(links.includes(`/app/organizations/${ORG}/invitations/new`));
});

test('the members page offers «Обновить» once the list is read', async () => {
  assert.match(text(await renderRoute(listPath, withMembers())), /Обновить/);
  const reading = text(
    await renderRoute(listPath, { access, organizations: {} }),
  );
  assert.ok(!reading.includes('Обновить'));
});

test('a member without an address says so', async () => {
  const page = text(await renderRoute(listPath, withMembers()));
  assert.match(page, /Почта не указана/);
});

test('MB05 shows no names while the list is read', async () => {
  const page = text(
    await renderRoute(listPath, {
      access,
      organizations: { members: loadingRead },
    }),
  );
  assert.ok(!page.includes('Ирина Ковалёва'));
  assert.ok(!page.includes('Не удалось загрузить список участников'));
});

test('MB06 says the list was not received, not that it is empty', async () => {
  const page = text(
    await renderRoute(listPath, {
      access,
      organizations: { members: failedRead('AuthUnavailable', 503) },
    }),
  );
  assert.match(page, /Не удалось загрузить список участников/);
  assert.match(page, /Попробуйте ещё раз\./);
  assert.match(page, /Попробовать ещё раз/);
  assert.ok(!page.includes('Других участников нет'));
});

test('MB04 invites when only the current user is a member', async () => {
  const html = await renderRoute(listPath, withMembers([marina]));
  const page = text(html);
  assert.match(page, /Других участников нет/);
  assert.match(
    page,
    /Пригласите сотрудников по почте и выберите им рестораны и роли\./,
  );
  assert.ok(hrefs(html).includes(`/app/organizations/${ORG}/invitations/new`));
});

test('the members page leads to every tab of the organization', async () => {
  const links = hrefs(await renderRoute(listPath, withMembers()));
  for (const tab of ['', '/members', '/invitations', '/profile'])
    assert.ok(links.includes(`/app/organizations/${ORG}${tab}`), tab);
});

const checkedBoxes = (html) =>
  html.match(/<input[^>]*type="checkbox"[^>]*checked/g)?.length ?? 0;
const saveButton = (html) =>
  /<button[^>]*>(?:(?!<\/button>)[\s\S])*?Сохранить роли/.exec(html)?.[0];

test('MM01 shows the member with the boxes set by the assignments', async () => {
  const html = await renderRoute(cardPath, withMembers());
  assert.equal(h1(html), 'Ирина Ковалёва');
  assert.match(text(html), /i\.kovaleva@restoran\.example/);
  // Waiter on the first, both roles on the second; none on the others.
  assert.equal(checkedBoxes(html), 3);
  assert.match(text(html), /Роли в ресторанах/);
  assert.match(
    text(html),
    /Настраивается — доступ откроется, когда ресторан будет готов/,
  );
  assert.match(
    text(html),
    /Участник потеряет доступ ко всем ресторанам организации\. Его аккаунт останется\./,
  );
  // A deleted restaurant is not offered (the shell menu may still name it).
  assert.ok(!text(main(html)).includes('На Садовой'));
  assert.match(saveButton(html) ?? '', /disabled/);
  assert.ok(!text(html).includes('Отменить изменения'));
  assert.ok(hrefs(html).includes(listPath));
});

test('MM09 says the member is no longer in the organization', async () => {
  const page = text(await renderRoute(cardPath, withMembers([marina, alexey])));
  assert.match(page, /Участника больше нет в организации/);
  assert.match(
    page,
    /Доступ этого участника к организации отозвали, поэтому роли изменить нельзя\./,
  );
  assert.match(page, /Вернуться к участникам/);
  assert.ok(!page.includes('Сохранить роли'));
});

test('the card of the current user is a 404', async () => {
  const html = await renderRoute(
    `${listPath}/${OWN_MEMBERSHIP}`,
    withMembers(),
  );
  assert.equal(h1(html), notFound);
});

test('a member card read in progress shows no roles yet', async () => {
  const page = text(
    await renderRoute(cardPath, {
      access,
      organizations: { members: loadingRead },
    }),
  );
  assert.ok(!page.includes('Сохранить роли'));
  assert.ok(!page.includes('Участника больше нет'));
});

test('a failed read of the card is not a revoked member', async () => {
  const page = text(
    await renderRoute(cardPath, {
      access,
      organizations: { members: failedRead('AuthUnavailable', 503) },
    }),
  );
  assert.match(page, /Не удалось загрузить данные участника/);
  assert.match(page, /Попробовать ещё раз/);
  assert.ok(!page.includes('Участника больше нет'));
});

test('a membership action without a known outcome locks the whole card', async () => {
  const html = await renderRoute(
    cardPath,
    withMembers(members, {
      pending: new Set([orgKeys.updateMembership(MEMBERSHIP)]),
      pendingMembership: { kind: 'admin', admin: true },
    }),
  );
  const boxes = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
  assert.ok(boxes.length > 0);
  for (const box of boxes) assert.match(box, /disabled/);
  // Revoking is locked with the other membership actions.
  assert.match(
    /<button[^>]*>(?:(?!<\/button>)[\s\S])*?Отозвать доступ<\/button>/.exec(
      html.replace(/<dialog[\s\S]*?<\/dialog>/, ''),
    )?.[0] ?? '',
    /disabled/,
  );
});

test('RV01 names the member, the organization and the assignments', async () => {
  const html = await renderRoute(cardPath, withMembers());
  const dialog = text(revokeDialog(html));
  assert.match(dialog, /Отозвать доступ участника\?/);
  assert.match(
    dialog,
    /Ирина Ковалёва потеряет доступ к организации «Восток Фуд» и все роли:/,
  );
  assert.match(dialog, /На Береговой — Склад, Официант/);
  assert.match(
    dialog,
    /Аккаунт участника останется, а его неотправленные данные пропадут\./,
  );
  assert.ok(dialog.indexOf('Отмена') < dialog.indexOf('Отозвать доступ', 30));
});

const matrix = (props) =>
  renderElement(
    h(AssignmentMatrix, {
      id: 'matrix',
      restaurants: [turgenev, chekhova],
      value: [{ restaurantID: R, roles: ['Waiter'] }],
      onChange: () => {},
      ...props,
    }),
  );

test('the matrix is controlled by value and marks changed rows', () => {
  const html = matrix({ changed: new Set([R]) });
  assert.equal(checkedBoxes(html), 1);
  assert.equal(text(html).match(/Изменено/g)?.length, 1);
  assert.match(
    text(html),
    /Настраивается — доступ откроется, когда ресторан будет готов/,
  );
  assert.ok(!/<input[^>]*type="checkbox"[^>]*disabled/.test(html));
});

test('readyOnly leaves the preparing restaurants unavailable', () => {
  const html = matrix({ readyOnly: true });
  const boxes = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
  assert.equal(boxes.length, 4);
  assert.equal(boxes.filter((box) => /disabled/.test(box)).length, 2);
  const all = matrix({ disabled: true });
  const every = all.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
  assert.ok(every.every((box) => /disabled/.test(box)));
});

test('a remembered save locks the matrix and offers the check', async () => {
  const html = await renderRoute(
    cardPath,
    withMembers(members, {
      pending: new Set([orgKeys.updateMembership(MEMBERSHIP)]),
      pendingMembership: {
        kind: 'assignments',
        grants: [{ restaurantID: R, roles: ['Warehouse', 'Waiter'] }],
      },
    }),
  );
  assert.match(text(html), /Не знаем, сохранились ли роли/);
  assert.match(text(html), /Проверить результат/);
  const boxes = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
  assert.ok(boxes.length > 0);
  for (const box of boxes) assert.match(box, /disabled/);
  // The boxes show what was sent: both roles in the first restaurant.
  assert.equal(
    boxes.filter((box) => /checked/.test(box) && /-0-/.test(box)).length,
    2,
  );
});

test('a remembered revoke keeps «Отозвать доступ» open for the check', async () => {
  const html = await renderRoute(
    cardPath,
    withMembers(members, {
      pending: new Set([orgKeys.revokeMembership(MEMBERSHIP)]),
      pendingMembership: { kind: 'revoke' },
    }),
  );
  const dialog = text(revokeDialog(html));
  assert.match(dialog, /Не знаем, отозван ли доступ/);
  assert.match(dialog, /Проверить результат/);
});
