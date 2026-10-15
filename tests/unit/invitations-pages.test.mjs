import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { orgKeys } from '../../src/application/organization-commands.ts';
import {
  cancelMessage,
  cancelOutcomeState,
  cancelledNotice,
  emailKey,
  grantsLine,
  inviteFieldErrors,
  inviteMessage,
  inviteOutcomeState,
  invitationDates,
  invitationLifetimeMs,
  invitationStatus,
  invitedEmail,
  invitedNotice,
  newestFirst,
  pendingExpiry,
  reinviteNotice,
  resendResult,
  validateInvite,
} from '../../src/presentation/organizations/invitations.ts';
import {
  INVITATION,
  ORG,
  R,
  failedRead,
  hrefs,
  instantOf,
  invitationList,
  loadingRead,
  readyAccess,
  renderRoute,
  sampleInvitationRow,
  sampleMember,
  sampleRestaurant,
  text,
} from './support/render-route.mjs';

const BEREGOVAYA = '99999999-9999-4999-8999-999999999999';
const CHEKHOVA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER = '12121212-1212-4212-8212-121212121212';
const THIRD = '13131313-1313-4313-8313-131313131313';

const sadovaya = sampleRestaurant({ name: 'На Садовой', roles: ['Admin'] });
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
const restaurants = [sadovaya, beregovaya, chekhova];
const access = readyAccess(restaurants, { admin: true });

const row = (state, delivery, overrides = {}) => {
  const { invitation, ...rest } = overrides;
  return {
    ...sampleInvitationRow({ invitation: { ...invitation, state }, ...rest }),
    linkDelivery:
      delivery === undefined
        ? undefined
        : {
            jobID: 'j',
            state: delivery,
            attempts: 1,
            acceptedAt: instantOf('2026-10-14T10:00:00+03:00'),
            nextAttemptAt: undefined,
          },
  };
};

const status = (state, delivery, resendAllowed = true) => {
  const { label, tone, actions } = invitationStatus(
    row(state, delivery, { resendAllowed }),
  );
  return [label, tone, actions];
};

test('invitationStatus names the delivery of a pending invitation', () => {
  const both = ['cancel', 'resend'];
  assert.deepEqual(status('pending', 'pending'), [
    'Отправляется',
    'neutral',
    both,
  ]);
  assert.deepEqual(status('pending', 'retry'), [
    'Отправляется',
    'neutral',
    both,
  ]);
  assert.deepEqual(status('pending', 'sending'), [
    'Отправляется',
    'neutral',
    both,
  ]);
  assert.deepEqual(status('pending', 'sent'), ['Отправлено', 'neutral', both]);
  assert.deepEqual(status('pending', 'unknown'), [
    'Письмо могло не дойти',
    'neutral',
    both,
  ]);
  assert.deepEqual(status('pending', 'failed'), [
    'Не получилось отправить',
    'error',
    both,
  ]);
  assert.deepEqual(status('pending', 'suppressed'), [
    'Не отправлено',
    'neutral',
    both,
  ]);
  assert.deepEqual(status('pending', undefined), [
    'Не отправлено',
    'neutral',
    both,
  ]);
});

test('invitationStatus offers a new link only while Auth allows it', () => {
  assert.deepEqual(status('pending', 'sent', false)[2], ['cancel']);
});

test('invitationStatus of a closed invitation ignores its delivery', () => {
  for (const delivery of [undefined, 'sent', 'failed']) {
    assert.deepEqual(status('accepted', delivery), ['Принято', 'success', []]);
    assert.deepEqual(status('expired', delivery), [
      'Истекло',
      'neutral',
      ['reinvite'],
    ]);
    assert.deepEqual(status('revoked', delivery), [
      'Отменено',
      'neutral',
      ['reinvite'],
    ]);
    assert.deepEqual(status('suppressed', delivery), [
      'Недействительно',
      'neutral',
      ['reinvite'],
    ]);
  }
  // A closed invitation offers no link even when the flag says so.
  assert.ok(!status('expired', 'sent', true)[2].includes('resend'));
});

test('invitationDates count the creation from the end of the term', () => {
  const pending = row('pending', 'sent', {
    invitation: { expiresAt: instantOf('2026-10-20T14:30:00+03:00') },
  });
  assert.equal(invitationLifetimeMs, 7 * 24 * 3600 * 1000);
  assert.equal(
    invitationDates(pending, 'Europe/Moscow'),
    'Создано 13.10.2026, 14:30 · действует до 20.10.2026, 14:30',
  );
  // In another zone the same moments read differently.
  assert.equal(
    invitationDates(pending, 'Asia/Yekaterinburg'),
    'Создано 13.10.2026, 16:30 · действует до 20.10.2026, 16:30',
  );
  assert.equal(
    invitationDates(
      row('expired', 'sent', {
        invitation: { expiresAt: instantOf('2026-10-05T10:00:00+03:00') },
      }),
      'Europe/Moscow',
    ),
    'Истекло 05.10.2026, 10:00',
  );
  for (const state of ['accepted', 'revoked', 'suppressed']) {
    assert.equal(
      invitationDates(
        row(state, 'sent', {
          invitation: { expiresAt: instantOf('2026-10-17T09:12:00+03:00') },
        }),
        'Europe/Moscow',
      ),
      'Создано 10.10.2026, 09:12',
    );
  }
  assert.equal(
    invitationDates(row('pending', 'failed'), 'Europe/Moscow'),
    'Письмо не отправлено. Проверьте адрес и пригласите повторно.',
  );
});

test('grantsLine groups restaurants with the same roles', () => {
  assert.equal(
    grantsLine(
      [{ restaurantID: R, roles: ['Warehouse', 'Waiter'] }],
      restaurants,
    ),
    'Склад и Официант: На Садовой',
  );
  assert.equal(
    grantsLine(
      [
        { restaurantID: BEREGOVAYA, roles: ['Waiter'] },
        { restaurantID: R, roles: ['Waiter'] },
      ],
      restaurants,
    ),
    'Официант: На Садовой; На Береговой',
  );
  assert.equal(
    grantsLine(
      [
        { restaurantID: R, roles: ['Waiter', 'Warehouse'] },
        { restaurantID: BEREGOVAYA, roles: ['Warehouse'] },
      ],
      restaurants,
    ),
    'Склад и Официант: На Садовой. Склад: На Береговой',
  );
});

test('grantsLine marks a restaurant that access does not list', () => {
  assert.equal(
    grantsLine([{ restaurantID: OTHER, roles: ['Waiter'] }], restaurants),
    'Официант: ресторан удалён',
  );
  assert.equal(
    grantsLine(
      [
        { restaurantID: OTHER, roles: ['Waiter'] },
        { restaurantID: R, roles: ['Waiter'] },
      ],
      restaurants,
    ),
    'Официант: На Садовой; ресторан удалён',
  );
  assert.equal(grantsLine([{ restaurantID: R, roles: [] }], restaurants), '');
});

test('newestFirst orders the rows by the end of their term', () => {
  const at = (id, iso) =>
    sampleInvitationRow({
      invitation: { invitationID: id, expiresAt: instantOf(iso) },
    });
  const old = at(OTHER, '2026-10-05T10:00:00+03:00');
  const fresh = at(THIRD, '2026-10-20T10:00:00+03:00');
  const middle = at(INVITATION, '2026-10-12T10:00:00+03:00');
  assert.deepEqual(newestFirst([old, fresh, middle]), [fresh, middle, old]);
});

const members = [
  sampleMember({ email: 'a.smirnova@example.test' }),
  sampleMember({ email: undefined, displayName: 'Без почты' }),
];
const waiter = [{ restaurantID: R, roles: ['Waiter'] }];

test('emailKey ignores case and the spaces round the address', () => {
  assert.equal(
    emailKey('  A.Smirnova@Example.TEST '),
    'a.smirnova@example.test',
  );
});

test('validateInvite finds what is wrong before anything is sent', () => {
  assert.deepEqual(validateInvite({ email: '', grants: [] }, members), {
    kind: 'invalid',
    email: 'required',
    roles: true,
  });
  assert.deepEqual(validateInvite({ email: '  ', grants: waiter }, members), {
    kind: 'invalid',
    email: 'required',
  });
  assert.deepEqual(
    validateInvite({ email: 'не-почта', grants: waiter }, members),
    { kind: 'invalid', email: 'format' },
  );
  assert.deepEqual(validateInvite({ email: 'a@b', grants: waiter }, members), {
    kind: 'invalid',
    email: 'format',
  });
  assert.deepEqual(
    validateInvite({ email: 'e.titova@restoran.example', grants: [] }, members),
    { kind: 'invalid', roles: true },
  );
  // A grant without roles is no role.
  assert.deepEqual(
    validateInvite(
      {
        email: 'e.titova@restoran.example',
        grants: [{ restaurantID: R, roles: [] }],
      },
      members,
    ),
    { kind: 'invalid', roles: true },
  );
  assert.equal(
    validateInvite(
      { email: 'e.titova@restoran.example', grants: waiter },
      members,
    ),
    undefined,
  );
});

test('validateInvite sends no command for a member (D14), ignoring case', () => {
  assert.deepEqual(
    validateInvite(
      { email: ' A.Smirnova@EXAMPLE.test', grants: waiter },
      members,
    ),
    { kind: 'member', membershipID: members[0].membership.membershipID },
  );
  // The list is not read yet: Auth decides.
  assert.equal(
    validateInvite(
      { email: 'a.smirnova@example.test', grants: waiter },
      undefined,
    ),
    undefined,
  );
});

test('inviteFieldErrors name the fields of IV02', () => {
  assert.deepEqual(
    inviteFieldErrors({ kind: 'invalid', email: 'required', roles: true }),
    {
      email: 'Укажите почту',
      roles: 'Выберите хотя бы одну роль хотя бы в одном ресторане',
    },
  );
  assert.deepEqual(inviteFieldErrors({ kind: 'invalid', email: 'format' }), {
    email: 'Проверьте адрес почты',
  });
  assert.deepEqual(inviteFieldErrors({ kind: 'invalid' }), {});
  assert.deepEqual(inviteFieldErrors({ kind: 'editing' }), {});
});

test('inviteMessage says what the frames IV02 to IV09 say', () => {
  const message = (state) => inviteMessage(state, 'Europe/Moscow');
  assert.equal(message({ kind: 'editing' }), undefined);
  assert.deepEqual(message({ kind: 'invalid', email: 'required' }), {
    title: 'Приглашение не отправлено',
    text: 'Проверьте отмеченные поля.',
  });
  assert.deepEqual(message({ kind: 'invalid' }), {
    title: 'Приглашение не отправлено',
    text: 'Проверьте почту и роли и отправьте ещё раз.',
  });
  assert.deepEqual(message({ kind: 'member', membershipID: 'm' }), {
    text: 'Этот человек уже в организации. Роли можно поменять во вкладке «Участники».',
  });
  assert.deepEqual(
    message({
      kind: 'invited',
      expiresAt: Date.parse('2026-10-17T09:12:00+03:00'),
    }),
    {
      text: 'На эту почту уже отправили приглашение, оно действует до 17.10.2026, 09:12 (Москва). Отмените его, чтобы отправить новое.',
    },
  );
  assert.deepEqual(message({ kind: 'invited', expiresAt: undefined }), {
    text: 'На эту почту уже отправили приглашение. Отмените его, чтобы отправить новое.',
  });
  assert.deepEqual(message({ kind: 'sending' }), { text: 'Отправляем…' });
  assert.deepEqual(message({ kind: 'unavailable' }), {
    title: 'Приглашение не отправлено',
    text: 'Не получилось. Попробуйте через пару минут. Данные остались в форме.',
  });
  assert.deepEqual(message({ kind: 'unknown' }), {
    title: 'Не знаем, отправлено ли приглашение',
    text: 'Связь прервалась. Нажмите «Проверить результат» — повторно ничего не отправится.',
  });
  assert.deepEqual(message({ kind: 'limited', seconds: 600 }), {
    title: 'Приглашение не отправлено',
    text: 'На этот адрес уже отправили много приглашений. Попробуйте через 10 минут.',
  });
  assert.equal(
    message({ kind: 'limited', seconds: 61 }).text,
    'На этот адрес уже отправили много приглашений. Попробуйте через 2 минуты.',
  );
  assert.equal(
    message({ kind: 'limited', seconds: 60 }).text,
    'На этот адрес уже отправили много приглашений. Попробуйте через 1 минуту.',
  );
  assert.deepEqual(message({ kind: 'delivery' }), {
    title: 'Приглашение не отправлено',
    text: 'Сейчас не получается отправлять письма. Напишите в поддержку.',
  });
  assert.deepEqual(message({ kind: 'forbidden' }), {
    title: 'Приглашение не отправлено',
    text: 'Ресторан ещё настраивается, или у вас больше нет роли администратора.',
  });
});

test('inviteOutcomeState maps the answer of Auth to a frame', () => {
  const state = (outcome) => inviteOutcomeState(outcome);
  assert.equal(state({ kind: 'done', value: {} }), 'done');
  assert.deepEqual(state({ kind: 'invited' }), {
    kind: 'invited',
    expiresAt: undefined,
  });
  assert.deepEqual(state({ kind: 'limited', seconds: 600 }), {
    kind: 'limited',
    seconds: 600,
  });
  assert.equal(state({ kind: 'delivery' }).kind, 'delivery');
  assert.equal(state({ kind: 'forbidden' }).kind, 'forbidden');
  assert.equal(state({ kind: 'unknown', code: 'X' }).kind, 'unknown');
  assert.equal(state({ kind: 'ended' }).kind, 'editing');
  assert.equal(state({ kind: 'unavailable', code: 'X' }).kind, 'unavailable');
  assert.deepEqual(
    state({ kind: 'invalid', code: 'InvalidArgument', fields: {} }),
    { kind: 'invalid' },
  );
});

test('pendingExpiry finds the pending invitation of the address', () => {
  const rows = [
    sampleInvitationRow({
      invitation: {
        email: 'O.Lebedeva@restoran.example',
        expiresAt: instantOf('2026-10-17T09:12:00+03:00'),
      },
    }),
    sampleInvitationRow({
      invitation: {
        email: 'o.lebedeva@restoran.example',
        state: 'expired',
        expiresAt: instantOf('2026-10-30T09:12:00+03:00'),
      },
    }),
  ];
  assert.equal(
    pendingExpiry(' o.lebedeva@restoran.example', rows),
    Date.parse('2026-10-17T09:12:00+03:00'),
  );
  assert.equal(pendingExpiry('x@restoran.example', rows), undefined);
});

test('the notices of the invitations name the address', () => {
  assert.deepEqual(invitedNotice('e.titova@restoran.example'), {
    title: 'Приглашение для e.titova@restoran.example готовим к отправке',
    text: 'Статус отправки появится в списке.',
  });
  assert.deepEqual(cancelledNotice('o.lebedeva@restoran.example'), {
    title: 'Приглашение для o.lebedeva@restoran.example отменено',
    text: 'Ссылка из письма больше не действует.',
  });
  assert.deepEqual(
    reinviteNotice(
      row('expired', 'sent', {
        invitation: { expiresAt: instantOf('2026-10-05T10:00:00+03:00') },
      }),
      'Europe/Moscow',
    ),
    {
      title: 'Повторное приглашение',
      text: 'Мы подставили почту, рестораны и роли из приглашения от 28.09.2026. Проверьте их перед отправкой.',
    },
  );
});

test('invitedEmail reads the router state the form leaves', () => {
  assert.equal(invitedEmail({ invited: 'a@x.ru' }), 'a@x.ru');
  assert.equal(invitedEmail(null), undefined);
  assert.equal(invitedEmail({ invited: 5 }), undefined);
  assert.equal(invitedEmail({ revoked: 'Ирина' }), undefined);
});

test('resendResult says what the link did', () => {
  const result = (outcome) => resendResult(outcome, 'a@x.ru');
  assert.deepEqual(result({ kind: 'done', value: {} }), {
    tone: 'success',
    notice: {
      title: 'Ссылку для a@x.ru готовим к повторной отправке',
      text: 'Статус отправки появится в списке.',
    },
  });
  assert.equal(
    result({ kind: 'limited', seconds: 42 }).notice.text,
    'Отправить ещё раз можно будет через 42 секунды.',
  );
  assert.equal(
    result({ kind: 'closed' }).notice.title,
    'Приглашение уже недействительно',
  );
  assert.equal(result({ kind: 'unknown', code: 'X' }), undefined);
  assert.equal(result({ kind: 'ended' }), undefined);
  assert.deepEqual(result({ kind: 'unavailable', code: 'X' }), {
    tone: 'error',
    notice: {
      title: 'Ссылка не отправлена',
      text: 'Не получилось. Попробуйте через пару минут.',
    },
  });
  assert.equal(
    result({ kind: 'delivery' }).notice.text,
    'Сейчас не получается отправлять письма. Напишите в поддержку.',
  );
});

test('cancelMessage says what the frames CX03 to CX05 say', () => {
  const email = 'o.lebedeva@restoran.example';
  assert.equal(cancelMessage({ kind: 'confirm' }, email), undefined);
  assert.equal(cancelMessage({ kind: 'cancelling' }, email), undefined);
  assert.deepEqual(cancelMessage({ kind: 'accepted' }, email), {
    title: 'Приглашение уже принято',
    text: 'Человек с почтой o.lebedeva@restoran.example уже в организации. Закрыть ему доступ можно во вкладке «Участники».',
  });
  assert.deepEqual(cancelMessage({ kind: 'closed' }, email), {
    title: 'Приглашение уже недействительно',
    text: 'Приглашение для o.lebedeva@restoran.example уже отменено или истекло.',
  });
  assert.deepEqual(cancelMessage({ kind: 'unavailable' }, email), {
    title: 'Приглашение не отменено',
    text: 'Не получилось. Попробуйте через пару минут.',
  });
  assert.deepEqual(cancelMessage({ kind: 'unknown' }, email), {
    title: 'Не знаем, отменено ли приглашение',
    text: 'Связь прервалась. Нажмите «Проверить результат» — повторно ничего не отправится.',
  });
  assert.deepEqual(cancelMessage({ kind: 'limited', seconds: 21 }, email), {
    title: 'Приглашение не отменено',
    text: 'Слишком много попыток. Попробуйте через 21 секунду.',
  });
});

test('cancelOutcomeState maps the answer of Auth to a frame', () => {
  const state = (outcome) => cancelOutcomeState(outcome);
  assert.equal(state({ kind: 'done', value: {} }), 'done');
  assert.equal(state({ kind: 'closed' }).kind, 'closed');
  assert.equal(state({ kind: 'unknown', code: 'X' }).kind, 'unknown');
  assert.equal(state({ kind: 'forbidden' }).kind, 'forbidden');
  assert.equal(state({ kind: 'unavailable', code: 'X' }).kind, 'unavailable');
  assert.equal(state({ kind: 'ended' }).kind, 'confirm');
});

// Pages.

const listPath = `/app/organizations/${ORG}/invitations`;
const newPath = `${listPath}/new`;
const lebedeva = sampleInvitationRow({
  invitation: {
    email: 'o.lebedeva@restoran.example',
    assignments: [{ restaurantID: R, roles: ['Warehouse', 'Waiter'] }],
    expiresAt: instantOf('2026-10-17T09:12:00+03:00'),
  },
  linkDelivery: {
    jobID: 'j1',
    state: 'sent',
    attempts: 1,
    acceptedAt: instantOf('2026-10-10T09:12:00+03:00'),
    nextAttemptAt: undefined,
  },
});
const fedorov = sampleInvitationRow({
  invitation: {
    invitationID: OTHER,
    email: 's.fedorov@restoran.example',
    assignments: [
      { restaurantID: R, roles: ['Waiter'] },
      { restaurantID: CHEKHOVA, roles: ['Waiter'] },
    ],
    state: 'expired',
    expiresAt: instantOf('2026-10-05T10:00:00+03:00'),
  },
  resendAllowed: false,
});
const withInvitations = (rows, extra = {}) => ({
  access,
  organizations: { invitations: invitationList(rows), ...extra },
});

test('IN01 lists the invitations of Auth, the newest first', async () => {
  const html = await renderRoute(
    listPath,
    withInvitations([fedorov, lebedeva]),
  );
  const page = text(html);
  assert.ok(
    page.indexOf('o.lebedeva@restoran.example') <
      page.indexOf('s.fedorov@restoran.example'),
  );
  assert.match(page, /Склад и Официант: На Садовой/);
  assert.match(page, /Отправлено/);
  assert.match(
    page,
    /Создано 10\.10\.2026, 09:12 · действует до 17\.10\.2026, 09:12/,
  );
  assert.match(page, /Истекло 05\.10\.2026, 10:00/);
  // Of the two roles of the old invitation, the preparing restaurant is named.
  assert.match(page, /Официант: На Садовой; На Чехова/);
  assert.match(page, /Время указано по часовому поясу организации: Москва\./);
  assert.ok(!page.includes('UTC'));
  assert.ok(hrefs(html).includes(newPath));
  assert.ok(!page.includes('Ирина'));
});

test('IN01 offers the actions of each row', async () => {
  const html = await renderRoute(
    listPath,
    withInvitations([fedorov, lebedeva]),
  );
  // The dialog of the cancellation repeats the words.
  const page = text(html.replace(/<dialog[\s\S]*?<\/dialog>/g, ''));
  assert.equal(page.match(/Отменить приглашение/g)?.length, 1);
  assert.equal(page.match(/Отправить ссылку повторно/g)?.length, 1);
  assert.equal(page.match(/Пригласить повторно/g)?.length, 1);
  assert.ok(
    hrefs(html).includes(`${newPath}?from=${OTHER}`.replace('&', '&amp;')),
  );
});

test('a pending invitation that may not get a new link has no such button', async () => {
  const page = text(
    await renderRoute(
      listPath,
      withInvitations([{ ...lebedeva, resendAllowed: false }]),
    ),
  );
  assert.match(page, /Отменить приглашение/);
  assert.ok(!page.includes('Отправить ссылку повторно'));
});

test('the invitations page offers «Обновить» once the list is read', async () => {
  const page = text(await renderRoute(listPath, withInvitations([lebedeva])));
  assert.match(page, /Обновить/);
  const reading = text(
    await renderRoute(listPath, { access, organizations: {} }),
  );
  assert.ok(!reading.includes('Обновить'));
});

test('IN02 invites when there is no invitation', async () => {
  const html = await renderRoute(listPath, withInvitations([]));
  const page = text(html);
  assert.match(page, /Приглашений нет/);
  assert.match(
    page,
    /Пригласите сотрудников по почте: укажите рестораны и роли\./,
  );
  assert.ok(hrefs(html).includes(newPath));
});

test('IN03 shows no rows while the list is read', async () => {
  const page = text(
    await renderRoute(listPath, {
      access,
      organizations: { invitations: loadingRead },
    }),
  );
  assert.ok(!page.includes('Приглашений нет'));
  assert.ok(!page.includes('Не удалось загрузить приглашения'));
});

test('IN04 says the list was not received, not that it is empty', async () => {
  const page = text(
    await renderRoute(listPath, {
      access,
      organizations: { invitations: failedRead('AuthUnavailable', 503) },
    }),
  );
  assert.match(page, /Не удалось загрузить приглашения/);
  assert.match(page, /Попробуйте ещё раз\./);
  assert.match(page, /Попробовать ещё раз/);
  assert.ok(!page.includes('Приглашений нет'));
});

test('a resend without a known outcome is checked from the list', async () => {
  const page = text(
    await renderRoute(
      listPath,
      withInvitations([lebedeva], {
        pending: new Set([orgKeys.resendLink(INVITATION)]),
      }),
    ),
  );
  assert.match(
    page,
    /Не знаем, отправлена ли ссылка для o\.lebedeva@restoran\.example/,
  );
  assert.match(page, /Связь прервалась\./);
  assert.match(page, /Проверить результат/);
});

test('a resend that is merely in flight does not show the unknown outcome', async () => {
  const html = await renderRoute(
    listPath,
    withInvitations([lebedeva], {
      inFlight: new Set([orgKeys.resendLink(INVITATION)]),
    }),
  );
  const page = text(html);
  assert.ok(!page.includes('Не знаем, отправлена ли ссылка'));
  assert.ok(!html.includes('role="alert"'));
  // The row stays locked while the request is on its way.
  assert.match(
    /<button[^>]*disabled[^>]*>\s*Отправить ссылку повторно/.exec(html)?.[0] ??
      '',
    /disabled/,
  );
});

test('a cancellation that is merely in flight does not show the unknown outcome', async () => {
  const page = text(
    await renderRoute(
      listPath,
      withInvitations([lebedeva], {
        inFlight: new Set([orgKeys.cancelInvitation(INVITATION)]),
      }),
    ),
  );
  assert.ok(!page.includes('Не знаем, отменено ли приглашение'));
});

test('a cancellation without a known outcome is checked from the list', async () => {
  const page = text(
    await renderRoute(
      listPath,
      withInvitations([lebedeva], {
        pending: new Set([orgKeys.cancelInvitation(INVITATION)]),
      }),
    ),
  );
  assert.match(
    page,
    /Не знаем, отменено ли приглашение для o\.lebedeva@restoran\.example/,
  );
  assert.match(page, /Проверить результат/);
});

test('the list has the dialog of the cancellation closed', async () => {
  const html = await renderRoute(listPath, withInvitations([lebedeva]));
  assert.match(html, /<dialog/);
  assert.match(text(html), /Не отменять/);
});

const field = (html, name) =>
  new RegExp(`<input[^>]*name="${name}"[^>]*>`).exec(html)?.[0] ?? '';
const checkedBoxes = (html) =>
  html.match(/<input[^>]*type="checkbox"[^>]*checked/g)?.length ?? 0;

test('IV01 is an empty form with the term of seven days', async () => {
  const html = await renderRoute(newPath, withInvitations([]));
  const page = text(html);
  assert.match(page, /Пригласить участника/);
  assert.match(page, /Все приглашения/);
  assert.match(field(html, 'email'), /placeholder="name@example\.ru"/);
  assert.equal(checkedBoxes(html), 0);
  assert.match(
    page,
    /Приглашение действует 7 дней: до 21\.10\.2026, 10:00 \(Москва\)\./,
  );
  assert.match(page, /Если аккаунт уже есть, человек просто войдёт в него\./);
  assert.match(page, /Отправить приглашение/);
  assert.ok(hrefs(html).includes(listPath));
});

test('the matrix of the invitation leaves out the restaurants that are not ready', async () => {
  const html = await renderRoute(newPath, withInvitations([]));
  assert.match(
    text(html),
    /Настраивается — доступ откроется, когда ресторан будет готов/,
  );
  const boxes = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
  assert.equal(boxes.length, 6);
  // The two boxes of «На Чехова» are not available.
  assert.equal(boxes.filter((box) => /disabled/.test(box)).length, 2);
});

test('IV10 fills the form from the old invitation, ready restaurants only', async () => {
  const html = await renderRoute(
    `${newPath}?from=${OTHER}`,
    withInvitations([fedorov, lebedeva]),
  );
  const page = text(html);
  assert.match(field(html, 'email'), /value="s\.fedorov@restoran\.example"/);
  // «Официант» in «На Садовой»; «На Чехова» is preparing and left out.
  assert.equal(checkedBoxes(html), 1);
  assert.match(page, /Повторное приглашение/);
  assert.match(
    page,
    /Мы подставили почту, рестораны и роли из приглашения от 28\.09\.2026\. Проверьте их перед отправкой\./,
  );
});

test('a form that did not find the old invitation is empty', async () => {
  const html = await renderRoute(
    `${newPath}?from=${THIRD}`,
    withInvitations([fedorov]),
  );
  assert.ok(!field(html, 'email').includes('value="s.fedorov'));
  assert.equal(checkedBoxes(html), 0);
  assert.ok(!text(html).includes('Повторное приглашение'));
});

test('IV09 shows the invitation that has no known outcome as it was sent', async () => {
  const html = await renderRoute(
    newPath,
    withInvitations([], {
      pending: new Set([orgKeys.invite(ORG)]),
      pendingInvite: {
        email: 'e.titova@restoran.example',
        grants: [{ restaurantID: BEREGOVAYA, roles: ['Waiter'] }],
      },
    }),
  );
  const page = text(html);
  assert.match(page, /Не знаем, отправлено ли приглашение/);
  assert.match(
    page,
    /Связь прервалась\. Нажмите «Проверить результат» — повторно ничего не отправится\./,
  );
  assert.match(page, /Проверить результат/);
  const email = field(html, 'email');
  assert.match(email, /value="e\.titova@restoran\.example"/);
  assert.match(email, /disabled/);
  assert.equal(checkedBoxes(html), 1);
  const boxes = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
  assert.ok(boxes.every((box) => /disabled/.test(box)));
});

test('the invitation form is for the administrator of the organization', async () => {
  const html = await renderRoute(newPath, {
    access: readyAccess(restaurants),
  });
  assert.match(text(html), /Страница не найдена/);
});
