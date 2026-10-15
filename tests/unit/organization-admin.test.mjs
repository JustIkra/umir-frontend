import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { buttonRecipe } from '../../src/presentation/theme/recipes.ts';
import { orgKeys } from '../../src/application/organization-commands.ts';
import {
  canConfirmDeletion,
  deletionMessage,
  deletionOutcomeState,
  organizationDeletionNotice,
} from '../../src/presentation/organizations/deletion.ts';
import {
  adminMessage,
  adminOutcomeState,
} from '../../src/presentation/organizations/members.ts';
import {
  MEMBERSHIP,
  ORG,
  R,
  hrefs,
  memberList,
  organizationProfile,
  readyAccess,
  renderRoute,
  sampleMember,
  sampleRestaurant,
  text,
} from './support/render-route.mjs';

const BEREGOVAYA = '99999999-9999-4999-8999-999999999999';
const OTHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OTHER_MEMBERSHIP = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const OPERATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const access = readyAccess(
  [
    sampleRestaurant({ roles: ['Admin'] }),
    sampleRestaurant({
      restaurantID: BEREGOVAYA,
      name: 'На Береговой',
      roles: ['Admin'],
    }),
  ],
  { admin: true },
);
const staffAccess = readyAccess([sampleRestaurant()]);
const cardPath = `/app/organizations/${ORG}/members/${MEMBERSHIP}`;
const listPath = `/app/organizations/${ORG}/members`;
const restaurantsPath = `/app/organizations/${ORG}`;
const profilePath = `/app/organizations/${ORG}/profile`;

const staff = sampleMember({ displayName: 'Анна Смирнова' });
const admin = sampleMember({
  displayName: 'Анна Смирнова',
  membership: { orgRoles: ['Admin'], assignments: [] },
});
const card = (member, extra = {}) =>
  renderRoute(cardPath, {
    access,
    organizations: { members: memberList([member]), ...extra },
  });

test('the button recipe has a danger variant on the error tokens', () => {
  const danger = buttonRecipe.variants.variant.danger;
  assert.equal(danger.bg, 'text.error');
  assert.equal(danger.color, 'text.onAction');
});

test('canConfirmDeletion wants the exact name, trimmed', () => {
  assert.equal(canConfirmDeletion('Северная сеть', 'Северная сеть'), true);
  assert.equal(canConfirmDeletion('  Северная сеть ', 'Северная сеть'), true);
  assert.equal(canConfirmDeletion('северная сеть', 'Северная сеть'), false);
  assert.equal(canConfirmDeletion('Северная', 'Северная сеть'), false);
  assert.equal(canConfirmDeletion('', 'Северная сеть'), false);
  assert.equal(canConfirmDeletion('', ''), false);
});

test('adminMessage says what the role card says', () => {
  assert.equal(adminMessage({ kind: 'view' }), undefined);
  assert.equal(adminMessage({ kind: 'saving' })?.text, 'Сохраняем…');
  assert.deepEqual(adminMessage({ kind: 'done', admin: true }), {
    title: 'Роль администратора назначена',
    text: 'Участник управляет участниками, приглашениями, ресторанами и настройками организации.',
    tone: 'success',
  });
  assert.equal(
    adminMessage({ kind: 'done', admin: false })?.title,
    'Роль администратора снята',
  );
  assert.deepEqual(adminMessage({ kind: 'last-admin' }), {
    title: 'Роль не снята',
    text: 'В организации должен остаться хотя бы один администратор.',
    tone: 'error',
  });
  assert.equal(adminMessage({ kind: 'conflict' })?.tone, 'error');
  assert.match(adminMessage({ kind: 'conflict' })?.text ?? '', /изменились/);
  assert.match(
    adminMessage({ kind: 'unavailable' })?.text ?? '',
    /Сервис авторизации не отвечает/,
  );
  assert.equal(
    adminMessage({ kind: 'unknown' })?.title,
    'Результат изменения роли неизвестен',
  );
  assert.equal(adminMessage({ kind: 'forbidden' })?.tone, 'error');
});

test('adminOutcomeState maps the answer of Auth to a state', () => {
  const state = (outcome, flag = true) => adminOutcomeState(outcome, flag);
  assert.deepEqual(state({ kind: 'done', value: {} }), {
    kind: 'done',
    admin: true,
  });
  assert.deepEqual(state({ kind: 'done', value: {} }, false), {
    kind: 'done',
    admin: false,
  });
  assert.equal(state({ kind: 'last-admin' }).kind, 'last-admin');
  assert.equal(state({ kind: 'conflict' }).kind, 'conflict');
  assert.equal(state({ kind: 'gone' }).kind, 'conflict');
  assert.equal(state({ kind: 'forbidden' }).kind, 'forbidden');
  assert.equal(state({ kind: 'unknown', code: 'X' }).kind, 'unknown');
  assert.equal(state({ kind: 'ended' }).kind, 'view');
  assert.equal(
    state({ kind: 'unavailable', code: 'AuthUnavailable' }).kind,
    'unavailable',
  );
  assert.equal(state({ kind: 'limited', seconds: 5 }).kind, 'unavailable');
});

test('the role card offers to appoint a member who is not an administrator', async () => {
  const page = text(await card(staff));
  assert.match(page, /Администратор организации/);
  assert.match(
    page,
    /Администратор управляет участниками, приглашениями, ресторанами и настройками организации и работает во всех её ресторанах\./,
  );
  assert.match(page, /Назначить администратором/);
  assert.ok(!page.includes('Снять роль администратора'));
  assert.match(page, /Назначить администратором\?/);
});

test('the role card offers to take the role from an administrator', async () => {
  const page = text(await card(admin));
  assert.match(page, /Участник — администратор организации\./);
  assert.match(page, /Снять роль администратора/);
  assert.ok(!page.includes('Назначить администратором'));
});

test('the role card is locked while another change has no known outcome', async () => {
  const html = await card(staff, {
    pendingMembership: { kind: 'assignments', grants: [] },
  });
  const button = /<button[^>]*>\s*Назначить администратором\s*<\/button>/.exec(
    html,
  )?.[0];
  assert.ok(button?.includes('disabled'));
});

test('an unsettled role change offers «Проверить результат»', async () => {
  const html = await card(staff, {
    pendingMembership: { kind: 'admin', admin: true },
    pending: new Set([orgKeys.updateMembership(MEMBERSHIP)]),
  });
  const page = text(html);
  assert.match(page, /Результат изменения роли неизвестен/);
  assert.match(page, /Проверить результат/);
  const button = /<button[^>]*>\s*Назначить администратором\s*<\/button>/.exec(
    html,
  )?.[0];
  assert.ok(button?.includes('disabled'));
});

test('another administrator opens from the list, the current user does not', async () => {
  const own = sampleMember({
    displayName: 'Марина Белова',
    membership: {
      membershipID: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      userID: 'u',
      orgRoles: ['Admin'],
      assignments: [],
    },
  });
  const colleague = sampleMember({
    displayName: 'Олег Иванов',
    membership: {
      membershipID: OTHER_MEMBERSHIP,
      userID: OTHER,
      orgRoles: ['Admin'],
      assignments: [],
    },
  });
  const html = await renderRoute(listPath, {
    access,
    organizations: { members: memberList([own, colleague]) },
  });
  const links = hrefs(html);
  assert.ok(links.includes(`${listPath}/${OTHER_MEMBERSHIP}`));
  assert.ok(
    !links.some((href) =>
      href.endsWith('ffffffff-ffff-4fff-8fff-ffffffffffff'),
    ),
  );
  assert.equal(
    text(html).match(/Администратор организации · все рестораны/g)?.length,
    2,
  );
  assert.equal(text(html).match(/Это вы/g)?.length, 1);
});

test('deletionOutcomeState maps the answer of Auth to a state', () => {
  const state = (outcome) => deletionOutcomeState(outcome).kind;
  assert.equal(state({ kind: 'done', value: {} }), 'done');
  assert.equal(state({ kind: 'gone' }), 'gone');
  assert.equal(state({ kind: 'forbidden' }), 'forbidden');
  assert.equal(state({ kind: 'unknown', code: 'X' }), 'unknown');
  assert.equal(state({ kind: 'ended' }), 'confirm');
  assert.equal(state({ kind: 'unavailable', code: 'X' }), 'unavailable');
  assert.equal(state({ kind: 'limited', seconds: 5 }), 'unavailable');
  assert.equal(state({ kind: 'conflict' }), 'unavailable');
});

test('deletionMessage names the restaurant or the organization', () => {
  assert.equal(
    deletionMessage('restaurant', { kind: 'gone' }, 'На Береговой')?.title,
    'Ресторан уже удалён',
  );
  assert.equal(
    deletionMessage('organization', { kind: 'gone' }, 'Северная сеть')?.title,
    'Организация уже удалена',
  );
  assert.equal(
    deletionMessage('restaurant', { kind: 'confirm' }, 'X'),
    undefined,
  );
  assert.equal(
    deletionMessage('restaurant', { kind: 'unknown' }, 'X')?.title,
    'Результат удаления неизвестен',
  );
  assert.equal(
    deletionMessage('restaurant', { kind: 'forbidden' }, 'X')?.title,
    'Ресторан не удалён',
  );
  assert.equal(
    deletionMessage('organization', { kind: 'unavailable' }, 'X')?.title,
    'Организация не удалена',
  );
});

test('the administrator deletes a restaurant from its row, staff cannot', async () => {
  const html = await renderRoute(restaurantsPath, { access });
  const page = text(html);
  assert.match(html, /aria-label="Удалить: На Береговой"/);
  assert.match(page, /Удалить ресторан «На Береговой»\?/);
  assert.match(
    page,
    /Ресторан станет недоступен всем участникам, его назначения будут закрыты\. Восстановить ресторан нельзя\./,
  );
  assert.match(page, /Удалить ресторан(?!\s*«)/);
  assert.match(page, /Отмена/);
  const staffPage = await renderRoute(restaurantsPath, { access: staffAccess });
  assert.ok(!staffPage.includes('aria-label="Удалить:'));
});

test('a deletion of a restaurant without a known outcome is shown in its row', async () => {
  const html = await renderRoute(restaurantsPath, {
    access,
    organizations: { pending: new Set([orgKeys.deleteRestaurant(BEREGOVAYA)]) },
  });
  const page = text(html);
  assert.equal(page.match(/Результат удаления неизвестен/g)?.length, 1);
  assert.equal(page.match(/Проверить результат/g)?.length, 1);
});

test('a deletion of a restaurant that is merely in flight is not an unknown outcome', async () => {
  const page = text(
    await renderRoute(restaurantsPath, {
      access,
      organizations: {
        inFlight: new Set([orgKeys.deleteRestaurant(BEREGOVAYA)]),
      },
    }),
  );
  assert.ok(!page.includes('Результат удаления неизвестен'));
  assert.ok(!page.includes('Проверить результат'));
});

test('the profile has a section to delete the organization', async () => {
  const html = await renderRoute(profilePath, {
    access,
    organizations: { profile: organizationProfile() },
  });
  const page = text(html);
  assert.match(page, /Удаление организации/);
  assert.match(
    page,
    /Удаление закрывает доступ всем участникам ко всем ресторанам организации\. Учётные записи сохранятся\. Отменить удаление нельзя\./,
  );
  assert.match(page, /Удалить организацию «Северная сеть»\?/);
  assert.match(page, /Введите название организации, чтобы подтвердить/);
  // The submit button of the dialog waits for the exact name.
  const submit = [
    ...html.matchAll(/<button[^>]*>\s*Удалить организацию\s*<\/button>/g),
  ]
    .map((match) => match[0])
    .find((button) => button.includes('type="submit"'));
  assert.ok(submit?.includes('disabled'));
});

test('a deletion of the organization without a known outcome is shown in the profile', async () => {
  const page = text(
    await renderRoute(profilePath, {
      access,
      organizations: {
        profile: organizationProfile(),
        pending: new Set([orgKeys.deleteOrganization(ORG)]),
      },
    }),
  );
  assert.match(page, /Результат удаления неизвестен/);
  assert.match(page, /Проверить результат/);
});

test('a deletion of the organization that is merely in flight is not an unknown outcome', async () => {
  const page = text(
    await renderRoute(profilePath, {
      access,
      organizations: {
        profile: organizationProfile(),
        inFlight: new Set([orgKeys.deleteOrganization(ORG)]),
      },
    }),
  );
  assert.ok(!page.includes('Результат удаления неизвестен'));
});

const deletion = (status, name = 'Северная сеть') => ({
  kind: 'delete-organization',
  name,
  orgID: ORG,
  operationID: OPERATION,
  lifecycle: {
    operationID: OPERATION,
    commandID: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    orgID: ORG,
    restaurantIDs: [R],
    lifecycle: status === 'finished' ? 'deleted' : 'deleting',
    lifecycleVersion: '2',
    cleanup: status === 'finished' ? 'complete' : 'pending',
    services: [],
  },
  status,
  startedAt: 0,
});

test('organizationDeletionNotice follows the status of the operation', () => {
  assert.equal(
    organizationDeletionNotice(deletion('following'))?.title,
    'Организация «Северная сеть» удаляется',
  );
  assert.equal(
    organizationDeletionNotice(deletion('stalled'))?.title,
    'Организация «Северная сеть» удаляется',
  );
  assert.equal(
    organizationDeletionNotice(deletion('finished'))?.title,
    'Организация «Северная сеть» удалена',
  );
  assert.equal(
    organizationDeletionNotice(deletion('lost'))?.title,
    'Организация «Северная сеть» удалена',
  );
  // A lost operation does not say the data is cleaned: that is not known.
  assert.match(
    organizationDeletionNotice(deletion('finished'))?.text ?? '',
    /данные очищены/,
  );
  const lost = organizationDeletionNotice(deletion('lost'))?.text ?? '';
  assert.ok(!lost.includes('данные очищены'));
  assert.match(lost, /Состояние очистки данных получить не удалось/);
  assert.equal(
    organizationDeletionNotice({
      ...deletion('following'),
      kind: 'create-restaurant',
    }),
    undefined,
  );
});

test('the list of organizations says an organization is being deleted', async () => {
  const html = await renderRoute('/app/organizations', {
    access: readyAccess([]),
    organizations: { operations: [deletion('following')] },
  });
  const page = text(html);
  assert.match(page, /Организация «Северная сеть» удаляется/);
  // The deleted organization was the last one: the list says so as well.
  assert.match(page, /Нет организаций/);
  const done = text(
    await renderRoute('/app/organizations', {
      access,
      organizations: { operations: [deletion('finished')] },
    }),
  );
  assert.match(done, /Организация «Северная сеть» удалена/);
  assert.match(done, /Восток Фуд/);
});
