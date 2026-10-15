import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createOrganizationsApi } from '../../src/adapters/api/organizations-api.ts';
import { ApiError } from '../../src/application/api.ts';

const ORG = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const MEMBERSHIP = '33333333-3333-4333-8333-333333333333';
const RESTAURANT = '44444444-4444-4444-8444-444444444444';
const ASSIGNMENT = '55555555-5555-4555-8555-555555555555';
const INVITATION = '66666666-6666-4666-8666-666666666666';
const OPERATION = '77777777-7777-4777-8777-777777777777';
const JOB = '88888888-8888-4888-8888-888888888888';

const context = {
  orgID: ORG,
  readerEpoch: '99999999-9999-4999-8999-999999999999',
  aggregateRevision: '12',
  evaluatedAt: '2026-10-15T10:00:00+03:00',
};

const membership = {
  membershipID: MEMBERSHIP,
  membershipVersion: '4',
  userID: USER,
  orgID: ORG,
  orgRoles: ['Admin'],
  assignments: [
    {
      restaurantID: RESTAURANT,
      assignmentID: ASSIGNMENT,
      assignmentVersion: '2',
      roles: ['Warehouse', 'Waiter'],
    },
  ],
  state: 'active',
};

const member = { membership, displayName: 'Марина Белова', email: 'm@x.ru' };

const invitation = {
  invitationID: INVITATION,
  orgID: ORG,
  email: 'new@x.ru',
  comparisonEmail: 'new@x.ru',
  assignments: [{ restaurantID: RESTAURANT, roles: ['Waiter'] }],
  expiresAt: '2026-10-22T10:00:00+03:00',
  resendAvailableAt: '2026-10-15T10:01:00+03:00',
  state: 'pending',
  version: '1',
};

const job = {
  jobID: JOB,
  state: 'sent',
  attempts: 1,
  acceptedAt: '2026-10-15T10:00:00+03:00',
};

const durable = {
  commandID: 'cmd-1',
  outcome: 'committed',
  aggregateRevision: '13',
  resourceID: MEMBERSHIP,
  mailJobs: [job],
};

const lifecycle = {
  operationID: OPERATION,
  commandID: 'cmd-1',
  orgID: ORG,
  restaurantIDs: [RESTAURANT],
  lifecycle: 'registering',
  lifecycleVersion: '1',
  cleanup: 'not_required',
  services: [
    { restaurantID: RESTAURANT, service: 'gateway', state: 'pending' },
  ],
};

const organization = {
  orgID: ORG,
  name: 'Сеть «Север»',
  settings: { timeZone: 'Europe/Moscow', settingsVersion: '3' },
  lifecycle: 'active',
  lifecycleVersion: '1',
};

function client(answer) {
  const calls = [];
  return {
    calls,
    read: (path, options) => {
      calls.push(['read', path, options]);
      return Promise.resolve(answer);
    },
    send: (method, path, options) => {
      calls.push(['send', method, path, options]);
      return Promise.resolve(answer);
    },
  };
}

const failsWith = (code, outcome) => (error) =>
  error instanceof ApiError &&
  error.failure.code === code &&
  error.failure.outcome === outcome;

test('members() reads the active list by pages of 200', async () => {
  const fake = client({ context, items: [member] });
  const page = await createOrganizationsApi(fake).members(ORG, 'active', {
    cursor: undefined,
    background: false,
  });
  assert.deepEqual(fake.calls, [
    [
      'read',
      `/api/v2/orgs/${ORG}/members?state=active&limit=200`,
      { background: false },
    ],
  ]);
  assert.equal(page.items[0].displayName, 'Марина Белова');
  assert.equal(page.items[0].membership.assignments[0].assignmentVersion, '2');
  assert.equal(page.context.aggregateRevision, '12');
});

test('members() passes the cursor and the activity flag', async () => {
  const fake = client({ context, items: [] });
  await createOrganizationsApi(fake).members(ORG, 'active', {
    cursor: 'c1',
    background: true,
  });
  assert.deepEqual(fake.calls, [
    [
      'read',
      `/api/v2/orgs/${ORG}/members?state=active&cursor=c1&limit=200`,
      { background: true },
    ],
  ]);
});

test('invitations() reads every state', async () => {
  const fake = client({ context, items: [] });
  await createOrganizationsApi(fake).invitations(ORG, 'all', {
    cursor: undefined,
    background: false,
  });
  assert.deepEqual(fake.calls, [
    [
      'read',
      `/api/v2/orgs/${ORG}/invitations?state=all&limit=200`,
      { background: false },
    ],
  ]);
});

test('organization() reads the profile with its settings version', async () => {
  const fake = client(organization);
  const profile = await createOrganizationsApi(fake).organization(ORG, {
    background: true,
  });
  assert.deepEqual(fake.calls, [
    ['read', `/api/v2/orgs/${ORG}`, { background: true }],
  ]);
  assert.deepEqual(profile, {
    orgID: ORG,
    name: 'Сеть «Север»',
    settings: { timeZone: 'Europe/Moscow', settingsVersion: '3' },
    lifecycle: 'active',
    lifecycleVersion: '1',
  });
});

test('identifiers in a path are encoded', async () => {
  const fake = client(organization);
  await createOrganizationsApi(fake).organization('a/b c', {
    background: false,
  });
  assert.equal(fake.calls[0][1], '/api/v2/orgs/a%2Fb%20c');
});

test('a null address and a null link delivery become undefined', async () => {
  const members = await createOrganizationsApi(
    client({ context, items: [{ ...member, email: null }] }),
  ).members(ORG, 'active', { cursor: undefined, background: false });
  assert.equal(members.items[0].email, undefined);

  const rows = await createOrganizationsApi(
    client({
      context,
      items: [
        { invitation, linkDelivery: null, resendAllowed: false },
        { invitation, linkDelivery: job, resendAllowed: true },
      ],
    }),
  ).invitations(ORG, 'all', { cursor: undefined, background: false });
  assert.equal(rows.items[0].linkDelivery, undefined);
  assert.equal(rows.items[0].resendAllowed, false);
  assert.equal(rows.items[1].linkDelivery.attempts, 1);
  assert.equal(rows.items[1].linkDelivery.nextAttemptAt, undefined);
  assert.equal(rows.items[1].invitation.assignments[0].roles[0], 'Waiter');
});

test('the last page has no cursor; an empty, null or long one is malformed', async () => {
  const read = (extra) =>
    createOrganizationsApi(client({ context, items: [], ...extra })).members(
      ORG,
      'active',
      { cursor: undefined, background: false },
    );
  assert.equal((await read({})).nextCursor, undefined);
  assert.equal((await read({ nextCursor: 'c2' })).nextCursor, 'c2');
  await assert.rejects(
    read({ nextCursor: '' }),
    failsWith('Malformed', 'unavailable'),
  );
  await assert.rejects(
    read({ nextCursor: null }),
    failsWith('Malformed', 'unavailable'),
  );
  await assert.rejects(
    read({ nextCursor: 'x'.repeat(129) }),
    failsWith('Malformed', 'unavailable'),
  );
  assert.equal(
    (await read({ nextCursor: 'x'.repeat(128) })).nextCursor?.length,
    128,
  );
});

test('a mail job outside 0..3 attempts is malformed', async () => {
  const read = (attempts) =>
    createOrganizationsApi(
      client({
        context,
        items: [
          {
            invitation,
            linkDelivery: { ...job, attempts },
            resendAllowed: true,
          },
        ],
      }),
    ).invitations(ORG, 'all', { cursor: undefined, background: false });
  await read(3);
  await assert.rejects(read(4), failsWith('Malformed', 'unavailable'));
  await assert.rejects(read(-1), failsWith('Malformed', 'unavailable'));
  await assert.rejects(read(1.5), failsWith('Malformed', 'unavailable'));
});

test('a membership has at most one Admin role and every assignment a role', async () => {
  const read = (changed) =>
    createOrganizationsApi(
      client({
        context,
        items: [{ ...member, membership: { ...membership, ...changed } }],
      }),
    ).members(ORG, 'active', { cursor: undefined, background: false });
  await read({});
  await assert.rejects(
    read({ orgRoles: ['Admin', 'Admin'] }),
    failsWith('Malformed', 'unavailable'),
  );
  await assert.rejects(
    read({ assignments: [{ ...membership.assignments[0], roles: [] }] }),
    failsWith('Malformed', 'unavailable'),
  );
  await assert.rejects(
    read({
      assignments: [
        { ...membership.assignments[0], roles: ['Waiter', 'Waiter'] },
      ],
    }),
    failsWith('Malformed', 'unavailable'),
  );
  await assert.rejects(
    read({ membershipVersion: 4 }),
    failsWith('Malformed', 'unavailable'),
  );
});

test('createOrganization() posts the name, the zone and the first restaurant', async () => {
  const fake = client(lifecycle);
  const result = await createOrganizationsApi(fake).createOrganization(
    { name: 'Сеть', timeZone: 'Europe/Moscow', firstRestaurantName: 'Центр' },
    'cmd-1',
  );
  assert.deepEqual(fake.calls, [
    [
      'send',
      'POST',
      '/api/v2/orgs',
      {
        body: {
          commandID: 'cmd-1',
          name: 'Сеть',
          timeZone: 'Europe/Moscow',
          firstRestaurantName: 'Центр',
        },
      },
    ],
  ]);
  assert.equal(result.operationID, OPERATION);
  assert.equal(result.lifecycle, 'registering');
  assert.equal(result.services[0].state, 'pending');
});

test('restaurant and organization commands', async () => {
  const fake = client(lifecycle);
  const api = createOrganizationsApi(fake);
  await api.createRestaurant(ORG, 'Север', 'cmd-2');
  await api.deleteRestaurant(ORG, RESTAURANT, 'cmd-3');
  await api.deleteOrganization(ORG, 'cmd-4');
  assert.deepEqual(fake.calls, [
    [
      'send',
      'POST',
      `/api/v2/orgs/${ORG}/restaurants`,
      { body: { commandID: 'cmd-2', name: 'Север' } },
    ],
    [
      'send',
      'DELETE',
      `/api/v2/orgs/${ORG}/restaurants/${RESTAURANT}`,
      { body: { commandID: 'cmd-3' } },
    ],
    ['send', 'DELETE', `/api/v2/orgs/${ORG}`, { body: { commandID: 'cmd-4' } }],
  ]);
});

test('lifecycle() polls the operation as a background read', async () => {
  const fake = client(lifecycle);
  await createOrganizationsApi(fake).lifecycle(ORG, OPERATION);
  assert.deepEqual(fake.calls, [
    [
      'read',
      `/api/v2/orgs/${ORG}/lifecycle/${OPERATION}`,
      { background: true },
    ],
  ]);
});

test('updateSettings() patches the zone under the settings version', async () => {
  const fake = client(organization);
  const profile = await createOrganizationsApi(fake).updateSettings(
    ORG,
    { timeZone: 'Asia/Yekaterinburg', expectedVersion: '3' },
    'cmd-5',
  );
  assert.deepEqual(fake.calls, [
    [
      'send',
      'PATCH',
      `/api/v2/orgs/${ORG}/settings`,
      {
        body: {
          commandID: 'cmd-5',
          expectedSettingsVersion: '3',
          timeZone: 'Asia/Yekaterinburg',
        },
      },
    ],
  ]);
  assert.equal(profile.settings.settingsVersion, '3');
});

test('updateMembership() puts the roles and assignments under the version', async () => {
  const fake = client(membership);
  const result = await createOrganizationsApi(fake).updateMembership(
    ORG,
    MEMBERSHIP,
    {
      expectedMembershipVersion: '4',
      orgRoles: [],
      assignments: [{ restaurantID: RESTAURANT, roles: ['Warehouse'] }],
    },
    'cmd-6',
  );
  assert.deepEqual(fake.calls, [
    [
      'send',
      'PUT',
      `/api/v2/orgs/${ORG}/memberships/${MEMBERSHIP}`,
      {
        body: {
          commandID: 'cmd-6',
          expectedMembershipVersion: '4',
          orgRoles: [],
          assignments: [{ restaurantID: RESTAURANT, roles: ['Warehouse'] }],
        },
      },
    ],
  ]);
  assert.equal(result.membershipVersion, '4');
});

test('revoking a membership and an assignment carry their versions', async () => {
  const fake = client(durable);
  const api = createOrganizationsApi(fake);
  const result = await api.revokeMembership(ORG, MEMBERSHIP, '4', 'cmd-7');
  await api.revokeAssignment(ORG, MEMBERSHIP, ASSIGNMENT, '2', 'cmd-8');
  assert.deepEqual(fake.calls, [
    [
      'send',
      'DELETE',
      `/api/v2/orgs/${ORG}/memberships/${MEMBERSHIP}`,
      { body: { commandID: 'cmd-7', expectedMembershipVersion: '4' } },
    ],
    [
      'send',
      'DELETE',
      `/api/v2/orgs/${ORG}/memberships/${MEMBERSHIP}/assignments/${ASSIGNMENT}`,
      { body: { commandID: 'cmd-8', expectedAssignmentVersion: '2' } },
    ],
  ]);
  assert.equal(result.resourceID, MEMBERSHIP);
  assert.equal(result.mailJobs[0].state, 'sent');
});

test('invitation commands', async () => {
  const create = client(invitation);
  const created = await createOrganizationsApi(create).createInvitation(
    ORG,
    {
      email: 'new@x.ru',
      assignments: [{ restaurantID: RESTAURANT, roles: ['Waiter'] }],
    },
    'cmd-9',
  );
  assert.deepEqual(create.calls, [
    [
      'send',
      'POST',
      `/api/v2/orgs/${ORG}/invitations`,
      {
        body: {
          commandID: 'cmd-9',
          email: 'new@x.ru',
          assignments: [{ restaurantID: RESTAURANT, roles: ['Waiter'] }],
        },
      },
    ],
  ]);
  assert.equal(created.invitationID, INVITATION);

  const fake = client(durable);
  const api = createOrganizationsApi(fake);
  await api.resendLink(ORG, INVITATION, 'cmd-10');
  await api.cancelInvitation(ORG, INVITATION, 'cmd-11');
  assert.deepEqual(fake.calls, [
    [
      'send',
      'POST',
      `/api/v2/orgs/${ORG}/invitations/${INVITATION}/resend-link`,
      { body: { commandID: 'cmd-10' } },
    ],
    [
      'send',
      'DELETE',
      `/api/v2/orgs/${ORG}/invitations/${INVITATION}`,
      { body: { commandID: 'cmd-11' } },
    ],
  ]);
});

test('a command answer that is not the contract leaves the outcome unknown', async () => {
  const api = (answer) => createOrganizationsApi(client(answer));
  await assert.rejects(
    api({}).createOrganization(
      { name: 'a', timeZone: 'z', firstRestaurantName: 'b' },
      'c',
    ),
    failsWith('Malformed', 'unknown'),
  );
  await assert.rejects(
    api({ ...lifecycle, lifecycle: 'weird' }).createRestaurant(ORG, 'a', 'c'),
    failsWith('Malformed', 'unknown'),
  );
  await assert.rejects(
    api({ ...durable, outcome: 'rejected' }).cancelInvitation(
      ORG,
      INVITATION,
      'c',
    ),
    failsWith('Malformed', 'unknown'),
  );
  await assert.rejects(
    api({}).updateSettings(ORG, { timeZone: 'z', expectedVersion: '1' }, 'c'),
    failsWith('Malformed', 'unknown'),
  );
  await assert.rejects(
    api({}).updateMembership(
      ORG,
      MEMBERSHIP,
      { expectedMembershipVersion: '1', orgRoles: [], assignments: [] },
      'c',
    ),
    failsWith('Malformed', 'unknown'),
  );
  await assert.rejects(
    api({}).createInvitation(ORG, { email: 'a@b.ru', assignments: [] }, 'c'),
    failsWith('Malformed', 'unknown'),
  );
});

test('a read answer that is not the contract is unavailable', async () => {
  await assert.rejects(
    createOrganizationsApi(client({})).organization(ORG, { background: false }),
    failsWith('Malformed', 'unavailable'),
  );
  await assert.rejects(
    createOrganizationsApi(client({})).lifecycle(ORG, OPERATION),
    failsWith('Malformed', 'unavailable'),
  );
});
