import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { ApiError, localFailure } from '../../src/application/api.ts';
import { createCommandRunner } from '../../src/application/commands.ts';
import { createEpochRegistry } from '../../src/application/epochs.ts';
import {
  createOrganizationCommands,
  orgKeys,
  planAssignments,
} from '../../src/application/organization-commands.ts';

const ORG = '11111111-1111-4111-8111-111111111111';
const MEMBERSHIP = '33333333-3333-4333-8333-333333333333';
const R1 = '44444444-4444-4444-8444-444444444441';
const R2 = '44444444-4444-4444-8444-444444444442';
const R3 = '44444444-4444-4444-8444-444444444443';
const A1 = '55555555-5555-4555-8555-555555555551';
const A2 = '55555555-5555-4555-8555-555555555552';
const INVITATION = '66666666-6666-4666-8666-666666666666';

const assignment = (
  restaurantID,
  assignmentID,
  roles,
  assignmentVersion = '2',
) => ({
  restaurantID,
  assignmentID,
  assignmentVersion,
  roles,
});

function membership(changes = {}) {
  return {
    membershipID: MEMBERSHIP,
    membershipVersion: '4',
    userID: '22222222-2222-4222-8222-222222222222',
    orgID: ORG,
    orgRoles: [],
    assignments: [
      assignment(R1, A1, ['Warehouse'], '7'),
      assignment(R2, A2, ['Waiter'], '8'),
    ],
    state: 'active',
    ...changes,
  };
}

const memberOf = (changes) => ({
  membership: membership(changes),
  displayName: 'Марина Белова',
  email: 'm@x.ru',
});

const refusal = (status, code, outcome = 'not_committed', retryAfterSeconds) =>
  new ApiError({
    ...localFailure(code, outcome, status),
    retryable: false,
    retryAfterSeconds,
  });

const lifecycle = { operationID: 'op-1', lifecycle: 'registering' };

// An API whose every method records its call and settles with the next
// scripted answer: a value or an error.
function setup(...script) {
  const calls = [];
  const events = [];
  let id = 0;
  const answers = [...script];
  const api = new Proxy(
    {},
    {
      get:
        (_, method) =>
        (...args) => {
          calls.push([method, ...args]);
          const next = answers.shift();
          return next instanceof Error
            ? Promise.reject(next)
            : Promise.resolve(next);
        },
    },
  );
  const commands = createCommandRunner({
    newId: () => `c${String((id += 1))}`,
    now: () => 1000,
    epochs: createEpochRegistry(),
    onReset: () => {},
  });
  const organizations = createOrganizationCommands({
    api,
    commands,
    accessChanged: () => events.push(['access']),
    membersChanged: (orgID) => events.push(['members', orgID]),
    invitationsChanged: (orgID) => events.push(['invitations', orgID]),
    profileChanged: (orgID) => events.push(['profile', orgID]),
    started: (kind, name, started) =>
      events.push(['started', kind, name, started]),
    onUnauthenticated: () => events.push(['unauthenticated']),
  });
  return { organizations, calls, events, commands, answers };
}

const everything = new Set([R1, R2, R3]);

test('planAssignments: no change is none', () => {
  const plan = planAssignments(
    membership(),
    [
      { restaurantID: R1, roles: ['Warehouse'] },
      { restaurantID: R2, roles: ['Waiter'] },
    ],
    everything,
  );
  assert.deepEqual(plan, { kind: 'none' });
});

test('planAssignments: a restaurant left without roles revokes only that assignment', () => {
  const plan = planAssignments(
    membership(),
    [
      { restaurantID: R1, roles: ['Warehouse'] },
      { restaurantID: R2, roles: [] },
    ],
    everything,
  );
  assert.deepEqual(plan, {
    kind: 'revoke',
    assignments: [assignment(R2, A2, ['Waiter'], '8')],
  });
});

test('planAssignments: a changed role set replaces the assignments, roles in contract order', () => {
  const plan = planAssignments(
    membership(),
    [
      { restaurantID: R1, roles: ['Waiter', 'Warehouse'] },
      { restaurantID: R2, roles: ['Waiter'] },
      { restaurantID: R3, roles: [] },
    ],
    everything,
  );
  assert.deepEqual(plan, {
    kind: 'replace',
    grants: [
      { restaurantID: R1, roles: ['Warehouse', 'Waiter'] },
      { restaurantID: R2, roles: ['Waiter'] },
    ],
  });
});

test('planAssignments: a restaurant outside editable is neither compared nor sent', () => {
  const only = new Set([R1]);
  assert.deepEqual(
    planAssignments(
      membership(),
      [
        { restaurantID: R1, roles: ['Warehouse'] },
        { restaurantID: R2, roles: [] },
        { restaurantID: R3, roles: ['Waiter'] },
      ],
      only,
    ),
    { kind: 'none' },
  );
  const plan = planAssignments(
    membership(),
    [
      { restaurantID: R1, roles: ['Waiter'] },
      { restaurantID: R3, roles: ['Waiter'] },
    ],
    only,
  );
  assert.deepEqual(plan, {
    kind: 'replace',
    grants: [{ restaurantID: R1, roles: ['Waiter'] }],
  });
});

test('saveAssignments: a member left without any role is not sent', async () => {
  const { organizations, calls, events } = setup();
  const result = await organizations.saveAssignments(
    memberOf(),
    [
      { restaurantID: R1, roles: [] },
      { restaurantID: R2, roles: [] },
    ],
    everything,
  );
  assert.deepEqual(result, { kind: 'no-roles' });
  assert.deepEqual(calls, []);
  assert.deepEqual(events, []);
});

test('saveAssignments: roles in restaurants outside editable do not count', async () => {
  const { organizations, calls } = setup();
  const result = await organizations.saveAssignments(
    memberOf(),
    [{ restaurantID: R3, roles: ['Waiter'] }],
    new Set([R1, R2]),
  );
  assert.deepEqual(result, { kind: 'no-roles' });
  assert.deepEqual(calls, []);
});

test('saveAssignments: an administrator may keep no restaurant roles', async () => {
  const { organizations, calls, events } = setup({}, {});
  const result = await organizations.saveAssignments(
    memberOf({ orgRoles: ['Admin'] }),
    [
      { restaurantID: R1, roles: [] },
      { restaurantID: R2, roles: [] },
    ],
    everything,
  );
  assert.deepEqual(result, { kind: 'saved' });
  assert.deepEqual(calls, [
    ['revokeAssignment', ORG, MEMBERSHIP, A1, '7', 'c1'],
    ['revokeAssignment', ORG, MEMBERSHIP, A2, '8', 'c2'],
  ]);
  assert.deepEqual(events, [['members', ORG]]);
});

test('saveAssignments: a replacement carries the membership version and keeps Admin', async () => {
  const { organizations, calls } = setup({});
  await organizations.saveAssignments(
    memberOf({ orgRoles: ['Admin'] }),
    [{ restaurantID: R1, roles: ['Waiter'] }],
    everything,
  );
  assert.deepEqual(calls, [
    [
      'updateMembership',
      ORG,
      MEMBERSHIP,
      {
        expectedMembershipVersion: '4',
        orgRoles: ['Admin'],
        assignments: [{ restaurantID: R1, roles: ['Waiter'] }],
      },
      'c1',
    ],
  ]);
});

test('saveAssignments: unchanged sends nothing', async () => {
  const { organizations, calls } = setup();
  const result = await organizations.saveAssignments(
    memberOf(),
    [
      { restaurantID: R1, roles: ['Warehouse'] },
      { restaurantID: R2, roles: ['Waiter'] },
    ],
    everything,
  );
  assert.deepEqual(result, { kind: 'unchanged' });
  assert.deepEqual(calls, []);
});

test('revoking assignments stops at the first refusal', async () => {
  const { organizations, calls } = setup(refusal(409, 'CommandConflict'));
  const result = await organizations.saveAssignments(
    memberOf({ orgRoles: ['Admin'] }),
    [],
    everything,
  );
  assert.deepEqual(result, { kind: 'conflict' });
  assert.equal(calls.length, 1);
});

test('a revoke that committed refreshes the members although a later one fails', async () => {
  const cases = [
    [
      refusal(503, 'AuthUnavailable', 'unavailable'),
      { kind: 'unavailable', code: 'AuthUnavailable' },
    ],
    [
      refusal(504, 'UpstreamTimeout', 'unknown'),
      { kind: 'unknown', code: 'UpstreamTimeout' },
    ],
    [refusal(403, 'Forbidden'), { kind: 'forbidden' }],
  ];
  for (const [failure, expected] of cases) {
    const { organizations, calls, events } = setup({}, failure);
    const result = await organizations.saveAssignments(
      memberOf({ orgRoles: ['Admin'] }),
      [],
      everything,
    );
    assert.deepEqual(result, expected);
    assert.equal(calls.length, 2);
    assert.deepEqual(events, [['members', ORG]]);
  }
});

test('a first revoke that fails does not refresh the members unless it conflicts', async () => {
  const { organizations, events } = setup(refusal(403, 'Forbidden'));
  await organizations.saveAssignments(
    memberOf({ orgRoles: ['Admin'] }),
    [],
    everything,
  );
  assert.deepEqual(events, []);
});

test('setAdmin sends the roles with the editable assignments only', async () => {
  const { organizations, calls } = setup({});
  const result = await organizations.setAdmin(memberOf(), true, new Set([R1]));
  assert.equal(result.kind, 'done');
  assert.deepEqual(calls, [
    [
      'updateMembership',
      ORG,
      MEMBERSHIP,
      {
        expectedMembershipVersion: '4',
        orgRoles: ['Admin'],
        assignments: [{ restaurantID: R1, roles: ['Warehouse'] }],
      },
      'c1',
    ],
  ]);
});

test('a lost invitation answer is checked with the same commandID', async () => {
  const { organizations, calls, commands } = setup(
    refusal(504, 'UpstreamTimeout', 'unknown'),
    { invitationID: INVITATION },
  );
  const first = await organizations.invite(ORG, 'a@x.ru', [
    { restaurantID: R1, roles: ['Waiter', 'Warehouse'] },
  ]);
  assert.equal(first.kind, 'unknown');
  assert.equal(organizations.isPending(orgKeys.invite(ORG)), true);
  assert.equal(commands.getSnapshot()[0].commandID, 'c1');

  const second = await organizations.invite(ORG, 'other@x.ru', [
    { restaurantID: R2, roles: ['Waiter'] },
  ]);
  assert.equal(second.kind, 'done');
  assert.equal(organizations.isPending(orgKeys.invite(ORG)), false);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].at(-1), 'c1');
  assert.equal(calls[1].at(-1), 'c1');
  assert.deepEqual(calls[0][2], calls[1][2]);
  assert.deepEqual(calls[0][2].assignments, [
    { restaurantID: R1, roles: ['Warehouse', 'Waiter'] },
  ]);
});

test('every command keeps an unknown outcome as unknown', async () => {
  const run = [
    (o) =>
      o.createOrganization({
        name: 'a',
        timeZone: 'z',
        firstRestaurantName: 'b',
      }),
    (o) => o.addRestaurant(ORG, 'a'),
    (o) => o.deleteRestaurant(ORG, R1, 'a'),
    (o) => o.deleteOrganization(ORG, 'a'),
    (o) => o.setTimeZone(ORG, 'Asia/Omsk', '3'),
    (o) => o.revokeMember(memberOf()),
    (o) => o.resendLink(ORG, INVITATION),
    (o) => o.cancelInvitation(ORG, INVITATION),
    (o) => o.setAdmin(memberOf(), true, everything),
  ];
  for (const command of run) {
    const { organizations, events } = setup(
      refusal(504, 'UpstreamTimeout', 'unknown'),
    );
    const result = await command(organizations);
    assert.deepEqual(result, { kind: 'unknown', code: 'UpstreamTimeout' });
    assert.deepEqual(events, []);
  }
});

// The table «Коды Auth» of the plan: scope, status, code, retry, refusal.
const table = [
  // Organization.
  [
    'organization',
    400,
    'InvalidArgument',
    undefined,
    { kind: 'invalid', code: 'InvalidArgument', fields: {} },
  ],
  [
    'organization',
    422,
    'UnknownTimeZone',
    undefined,
    { kind: 'invalid', code: 'UnknownTimeZone', fields: {} },
  ],
  ['organization', 403, 'Forbidden', undefined, { kind: 'forbidden' }],
  ['organization', 409, 'ScopeDeleted', undefined, { kind: 'gone' }],
  ['organization', 410, 'ScopeDeleted', undefined, { kind: 'gone' }],
  ['organization', 409, 'SettingsChanged', undefined, { kind: 'conflict' }],
  ['organization', 409, 'CommandConflict', undefined, { kind: 'conflict' }],
  [
    'organization',
    503,
    'TimeZoneDataUnavailable',
    undefined,
    { kind: 'unavailable', code: 'TimeZoneDataUnavailable' },
  ],
  [
    'organization',
    503,
    'AuthUnavailable',
    undefined,
    { kind: 'unavailable', code: 'AuthUnavailable' },
  ],
  // Membership.
  ['membership', 409, 'CommandConflict', undefined, { kind: 'conflict' }],
  ['membership', 409, 'LastAdmin', undefined, { kind: 'last-admin' }],
  ['membership', 403, 'Forbidden', undefined, { kind: 'forbidden' }],
  [
    'membership',
    400,
    'InvalidArgument',
    undefined,
    { kind: 'invalid', code: 'InvalidArgument', fields: {} },
  ],
  ['membership', 409, 'ScopeDeleted', undefined, { kind: 'gone' }],
  ['membership', 404, 'NotFound', undefined, { kind: 'gone' }],
  // Invite.
  ['invite', 409, 'CommandConflict', undefined, { kind: 'invited' }],
  ['invite', 403, 'Forbidden', undefined, { kind: 'forbidden' }],
  ['invite', 429, 'RateLimited', undefined, { kind: 'limited', seconds: 60 }],
  ['invite', 429, 'RateLimited', 17, { kind: 'limited', seconds: 17 }],
  ['invite', 503, 'DeliveryUnavailable', undefined, { kind: 'delivery' }],
  [
    'invite',
    400,
    'InvalidArgument',
    undefined,
    { kind: 'invalid', code: 'InvalidArgument', fields: {} },
  ],
  ['invite', 409, 'ScopeDeleted', undefined, { kind: 'gone' }],
  // Invitation.
  ['invitation', 404, 'NotFound', undefined, { kind: 'closed' }],
  ['invitation', 429, 'RateLimited', 30, { kind: 'limited', seconds: 30 }],
  [
    'invitation',
    429,
    'RateLimited',
    undefined,
    { kind: 'limited', seconds: 60 },
  ],
  ['invitation', 403, 'Forbidden', undefined, { kind: 'forbidden' }],
  ['invitation', 409, 'ScopeDeleted', undefined, { kind: 'gone' }],
  ['invitation', 409, 'CommandConflict', undefined, { kind: 'conflict' }],
];

// One command of each scope; each settles with the scripted error.
const bySope = {
  organization: [
    (o) =>
      o.createOrganization({
        name: 'a',
        timeZone: 'z',
        firstRestaurantName: 'b',
      }),
    (o) => o.addRestaurant(ORG, 'a'),
    (o) => o.deleteRestaurant(ORG, R1, 'a'),
    (o) => o.deleteOrganization(ORG, 'a'),
    (o) => o.setTimeZone(ORG, 'Asia/Omsk', '3'),
  ],
  membership: [
    (o) =>
      o.saveAssignments(
        memberOf(),
        [{ restaurantID: R1, roles: ['Waiter'] }],
        everything,
      ),
    (o) => o.saveAssignments(memberOf({ orgRoles: ['Admin'] }), [], everything),
    (o) => o.setAdmin(memberOf(), true, everything),
    (o) => o.revokeMember(memberOf()),
  ],
  invite: [
    (o) => o.invite(ORG, 'a@x.ru', [{ restaurantID: R1, roles: ['Waiter'] }]),
  ],
  invitation: [
    (o) => o.resendLink(ORG, INVITATION),
    (o) => o.cancelInvitation(ORG, INVITATION),
  ],
};

for (const [scope, status, code, retryAfter, expected] of table) {
  test(`${scope}: ${String(status)} ${code}${retryAfter === undefined ? '' : ` (retry ${String(retryAfter)})`} is ${expected.kind}`, async () => {
    for (const command of bySope[scope]) {
      const { organizations } = setup(
        refusal(status, code, 'not_committed', retryAfter),
      );
      assert.deepEqual(await command(organizations), expected);
    }
  });
}

test('an invitation NotFound is closed, anywhere else it is gone', async () => {
  const { organizations } = setup(
    refusal(404, 'NotFound'),
    refusal(404, 'NotFound'),
  );
  assert.deepEqual(await organizations.cancelInvitation(ORG, INVITATION), {
    kind: 'closed',
  });
  assert.deepEqual(await organizations.addRestaurant(ORG, 'a'), {
    kind: 'gone',
  });
});

test('401 ends the session once per refusal', async () => {
  for (const scope of Object.keys(bySope)) {
    for (const command of bySope[scope]) {
      const { organizations, events } = setup(refusal(401, 'Unauthenticated'));
      assert.deepEqual(await command(organizations), { kind: 'ended' });
      assert.deepEqual(
        events.filter(([name]) => name === 'unauthenticated'),
        [['unauthenticated']],
      );
    }
  }
  const { organizations, events } = setup(refusal(401, 'SessionExpired'));
  assert.deepEqual(await organizations.addRestaurant(ORG, 'a'), {
    kind: 'ended',
  });
  assert.equal(events[0][0], 'unauthenticated');
});

test('a refusal does not start an operation or change the access', async () => {
  const { organizations, events } = setup(refusal(403, 'Forbidden'));
  await organizations.addRestaurant(ORG, 'a');
  assert.deepEqual(events, []);
});

test('invite refreshes the invitations when it is done', async () => {
  const { organizations, events } = setup({ invitationID: INVITATION });
  const result = await organizations.invite(ORG, 'a@x.ru', [
    { restaurantID: R1, roles: ['Waiter'] },
  ]);
  assert.equal(result.kind, 'done');
  assert.deepEqual(events, [['invitations', ORG]]);
});

test('an invitation that is already present leaves the list as it was', async () => {
  const { organizations, events } = setup(refusal(409, 'CommandConflict'));
  await organizations.invite(ORG, 'a@x.ru', [
    { restaurantID: R1, roles: ['Waiter'] },
  ]);
  assert.deepEqual(events, []);
});

test('revokeMember refreshes the members when it is done or conflicts', async () => {
  const done = setup({ resourceID: MEMBERSHIP });
  await done.organizations.revokeMember(memberOf());
  assert.deepEqual(done.events, [['members', ORG]]);
  assert.deepEqual(done.calls, [
    ['revokeMembership', ORG, MEMBERSHIP, '4', 'c1'],
  ]);

  const conflict = setup(refusal(409, 'CommandConflict'));
  await conflict.organizations.revokeMember(memberOf());
  assert.deepEqual(conflict.events, [['members', ORG]]);

  const last = setup(refusal(409, 'LastAdmin'));
  assert.deepEqual(await last.organizations.revokeMember(memberOf()), {
    kind: 'last-admin',
  });
  assert.deepEqual(last.events, []);
});

test('resendLink and cancelInvitation refresh the list after an answer', async () => {
  const done = setup({}, refusal(404, 'NotFound'));
  await done.organizations.resendLink(ORG, INVITATION);
  await done.organizations.cancelInvitation(ORG, INVITATION);
  assert.deepEqual(done.events, [
    ['invitations', ORG],
    ['invitations', ORG],
  ]);
});

test('setTimeZone refreshes the access and the profile when it is done or conflicts', async () => {
  const done = setup({ settings: {} });
  const result = await done.organizations.setTimeZone(ORG, 'Asia/Omsk', '3');
  assert.equal(result.kind, 'done');
  assert.deepEqual(done.events, [['access'], ['profile', ORG]]);
  assert.deepEqual(done.calls, [
    [
      'updateSettings',
      ORG,
      { timeZone: 'Asia/Omsk', expectedVersion: '3' },
      'c1',
    ],
  ]);

  const conflict = setup(refusal(409, 'SettingsChanged'));
  assert.deepEqual(
    await conflict.organizations.setTimeZone(ORG, 'Asia/Omsk', '3'),
    {
      kind: 'conflict',
    },
  );
  assert.deepEqual(conflict.events, [['access'], ['profile', ORG]]);

  const invalid = setup(refusal(422, 'UnknownTimeZone'));
  await invalid.organizations.setTimeZone(ORG, 'Nowhere', '3');
  assert.deepEqual(invalid.events, []);
});

test('addRestaurant refreshes the access and starts following the operation', async () => {
  const { organizations, events, calls } = setup(lifecycle);
  const result = await organizations.addRestaurant(ORG, 'Север');
  assert.deepEqual(result, { kind: 'done', value: lifecycle });
  assert.deepEqual(calls, [['createRestaurant', ORG, 'Север', 'c1']]);
  assert.deepEqual(events, [
    ['access'],
    ['started', 'create-restaurant', 'Север', lifecycle],
  ]);
});

test('the other lifecycle commands name their kind', async () => {
  const created = setup(lifecycle);
  await created.organizations.createOrganization({
    name: 'Сеть',
    timeZone: 'Europe/Moscow',
    firstRestaurantName: 'Центр',
  });
  assert.deepEqual(created.events[1].slice(0, 3), [
    'started',
    'create-organization',
    'Сеть',
  ]);

  const restaurant = setup(lifecycle);
  await restaurant.organizations.deleteRestaurant(ORG, R1, 'Центр');
  assert.deepEqual(restaurant.events[1].slice(0, 3), [
    'started',
    'delete-restaurant',
    'Центр',
  ]);
  assert.deepEqual(restaurant.calls, [['deleteRestaurant', ORG, R1, 'c1']]);

  const organization = setup(lifecycle);
  await organization.organizations.deleteOrganization(ORG, 'Сеть');
  assert.deepEqual(organization.events[1].slice(0, 3), [
    'started',
    'delete-organization',
    'Сеть',
  ]);
});

test('a creation without a known outcome keeps the input it was sent with', async () => {
  const { organizations, calls, events } = setup(
    refusal(504, 'UpstreamTimeout', 'unknown'),
    lifecycle,
  );
  const sent = {
    name: 'Северная кухня',
    timeZone: 'Asia/Omsk',
    firstRestaurantName: 'На Невском',
  };
  assert.equal(organizations.pendingOrganization(), undefined);
  assert.equal((await organizations.createOrganization(sent)).kind, 'unknown');
  assert.deepEqual(organizations.pendingOrganization(), sent);
  // The screen came back with empty fields and checks the attempt.
  const checked = await organizations.createOrganization({
    name: '',
    timeZone: 'Europe/Moscow',
    firstRestaurantName: '',
  });
  assert.deepEqual(checked, { kind: 'done', value: lifecycle });
  assert.deepEqual(events, [
    ['access'],
    ['started', 'create-organization', 'Северная кухня', lifecycle],
  ]);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], calls[0]);
  assert.equal(calls[1][1].name, 'Северная кухня');
  assert.equal(organizations.pendingOrganization(), undefined);
});

test('a restaurant without a known outcome keeps its name per organization', async () => {
  const { organizations, events } = setup(
    refusal(504, 'UpstreamTimeout', 'unknown'),
    lifecycle,
  );
  await organizations.addRestaurant(ORG, 'На Ленина');
  assert.equal(organizations.pendingRestaurantName(ORG), 'На Ленина');
  assert.equal(organizations.pendingRestaurantName(R1), undefined);
  await organizations.addRestaurant(ORG, '');
  assert.deepEqual(events, [
    ['access'],
    ['started', 'create-restaurant', 'На Ленина', lifecycle],
  ]);
  assert.equal(organizations.pendingRestaurantName(ORG), undefined);
});

test('a refusal after the check clears the remembered input', async () => {
  const { organizations } = setup(
    refusal(504, 'UpstreamTimeout', 'unknown'),
    refusal(403, 'Forbidden'),
  );
  const input = {
    name: 'Север',
    timeZone: 'Europe/Moscow',
    firstRestaurantName: 'Юг',
  };
  await organizations.createOrganization(input);
  assert.deepEqual(await organizations.createOrganization(input), {
    kind: 'forbidden',
  });
  assert.equal(organizations.pendingOrganization(), undefined);
});

const A3 = '55555555-5555-4555-8555-555555555553';
const keepWaiter = [{ restaurantID: R2, roles: ['Waiter'] }];

test('an unknown save is remembered and checked with the same commandID and body', async () => {
  const { organizations, calls, events } = setup(
    refusal(504, 'UpstreamTimeout', 'unknown'),
    {},
  );
  const desired = [
    { restaurantID: R1, roles: ['Waiter', 'Warehouse'] },
    { restaurantID: R2, roles: ['Waiter'] },
  ];
  assert.equal(organizations.pendingMembership(MEMBERSHIP), undefined);
  const first = await organizations.saveAssignments(
    memberOf(),
    desired,
    everything,
  );
  assert.equal(first.kind, 'unknown');
  assert.deepEqual(organizations.pendingMembership(MEMBERSHIP), {
    kind: 'assignments',
    grants: desired,
  });
  assert.deepEqual(events, []);
  // The member was read again meanwhile: the check still sends the attempt.
  const reread = memberOf({ membershipVersion: '9' });
  const checked = await organizations.checkMembership(reread);
  assert.deepEqual(checked, { kind: 'saved' });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], calls[0]);
  assert.equal(calls[1].at(-1), 'c1');
  assert.deepEqual(events, [['members', ORG]]);
  assert.equal(organizations.pendingMembership(MEMBERSHIP), undefined);
});

test('checkMembership is unchanged when nothing is pending', async () => {
  const { organizations, calls } = setup();
  assert.deepEqual(await organizations.checkMembership(memberOf()), {
    kind: 'unchanged',
  });
  assert.deepEqual(calls, []);
});

test('a revoke of assignments with the second step unknown checks only that key', async () => {
  const { organizations, calls, events } = setup(
    {},
    refusal(504, 'UpstreamTimeout', 'unknown'),
    {},
  );
  const member = memberOf({
    assignments: [
      assignment(R1, A1, ['Warehouse'], '7'),
      assignment(R2, A2, ['Waiter'], '8'),
      assignment(R3, A3, ['Waiter'], '9'),
    ],
  });
  const first = await organizations.saveAssignments(
    member,
    [{ restaurantID: R3, roles: ['Waiter'] }],
    everything,
  );
  assert.equal(first.kind, 'unknown');
  assert.deepEqual(organizations.pendingMembership(MEMBERSHIP), {
    kind: 'revoke-assignments',
    assignmentIDs: [A1, A2],
  });
  assert.equal(organizations.isPending(orgKeys.revokeAssignment(A1)), false);
  assert.equal(organizations.isPending(orgKeys.revokeAssignment(A2)), true);
  const checked = await organizations.checkMembership(member);
  assert.deepEqual(checked, { kind: 'saved' });
  assert.deepEqual(
    calls.map((call) => [call[0], call[3], call.at(-1)]),
    [
      ['revokeAssignment', A1, 'c1'],
      ['revokeAssignment', A2, 'c2'],
      ['revokeAssignment', A2, 'c2'],
    ],
  );
  // The committed first step and the check both ask for the list again.
  assert.deepEqual(events, [
    ['members', ORG],
    ['members', ORG],
  ]);
  assert.equal(organizations.pendingMembership(MEMBERSHIP), undefined);
});

test('a refusal on the check ends the pending change', async () => {
  const { organizations } = setup(
    refusal(504, 'UpstreamTimeout', 'unknown'),
    refusal(409, 'CommandConflict'),
  );
  await organizations.saveAssignments(memberOf(), keepWaiter, everything);
  assert.equal(
    organizations.pendingMembership(MEMBERSHIP)?.kind,
    'revoke-assignments',
  );
  assert.deepEqual(await organizations.checkMembership(memberOf()), {
    kind: 'conflict',
  });
  assert.equal(organizations.pendingMembership(MEMBERSHIP), undefined);
});

test('setAdmin and revokeMember remember what they were sent with', async () => {
  const { organizations } = setup(
    refusal(504, 'UpstreamTimeout', 'unknown'),
    refusal(504, 'UpstreamTimeout', 'unknown'),
  );
  await organizations.setAdmin(memberOf(), true, everything);
  assert.deepEqual(organizations.pendingMembership(MEMBERSHIP), {
    kind: 'admin',
    admin: true,
  });
  const other = '77777777-7777-4777-8777-777777777777';
  const second = memberOf({ membershipID: other });
  await organizations.revokeMember(second);
  assert.deepEqual(organizations.pendingMembership(other), { kind: 'revoke' });
});

test('clear forgets the remembered inputs', async () => {
  const { organizations } = setup(
    refusal(504, 'UpstreamTimeout', 'unknown'),
    refusal(504, 'UpstreamTimeout', 'unknown'),
  );
  const input = {
    name: 'Север',
    timeZone: 'Europe/Moscow',
    firstRestaurantName: 'Юг',
  };
  await organizations.createOrganization(input);
  await organizations.saveAssignments(memberOf(), keepWaiter, everything);
  organizations.clear();
  assert.equal(organizations.pendingMembership(MEMBERSHIP), undefined);
  assert.equal(organizations.pendingOrganization(), undefined);
});

const R4 = '44444444-4444-4444-8444-444444444444';
const A4 = '55555555-5555-4555-8555-555555555554';
const fourAssignments = () =>
  memberOf({
    assignments: [
      assignment(R1, A1, ['Warehouse'], '7'),
      assignment(R2, A2, ['Waiter'], '8'),
      assignment(R3, A3, ['Waiter'], '9'),
      assignment(R4, A4, ['Waiter'], '3'),
    ],
  });
const keepFourth = [{ restaurantID: R4, roles: ['Waiter'] }];
const allRestaurants = new Set([R1, R2, R3, R4]);

test('the check of a revoke plan retries the unknown step and then sends the unsent ones', async () => {
  const { organizations, calls, events } = setup(
    {},
    refusal(504, 'UpstreamTimeout', 'unknown'),
    {},
    {},
  );
  const member = fourAssignments();
  const first = await organizations.saveAssignments(
    member,
    keepFourth,
    allRestaurants,
  );
  assert.equal(first.kind, 'unknown');
  // A3 was never sent: only A2 is pending, the whole plan is remembered.
  assert.equal(organizations.isPending(orgKeys.revokeAssignment(A3)), false);
  // The member read again carries other versions; the plan is not made anew.
  const reread = memberOf({
    membershipVersion: '9',
    assignments: [assignment(R4, A4, ['Waiter'], '3')],
  });
  const checked = await organizations.checkMembership(reread);
  assert.deepEqual(checked, { kind: 'saved' });
  assert.deepEqual(
    calls.map((call) => [call[0], call[3], call[4], call.at(-1)]),
    [
      ['revokeAssignment', A1, '7', 'c1'],
      ['revokeAssignment', A2, '8', 'c2'],
      ['revokeAssignment', A2, '8', 'c2'],
      ['revokeAssignment', A3, '9', 'c3'],
    ],
  );
  assert.equal(events.at(-1)[0], 'members');
  assert.equal(organizations.pendingMembership(MEMBERSHIP), undefined);
  assert.deepEqual(await organizations.checkMembership(reread), {
    kind: 'unchanged',
  });
});

test('a refusal of an unsent step on the check is returned and the list is read again', async () => {
  const { organizations, calls, events } = setup(
    {},
    refusal(504, 'UpstreamTimeout', 'unknown'),
    {},
    refusal(409, 'CommandConflict'),
  );
  const member = fourAssignments();
  await organizations.saveAssignments(member, keepFourth, allRestaurants);
  events.length = 0;
  assert.deepEqual(await organizations.checkMembership(member), {
    kind: 'conflict',
  });
  assert.equal(calls.length, 4);
  assert.equal(calls[3][3], A3);
  assert.deepEqual(events, [['members', ORG]]);
  assert.equal(organizations.pendingMembership(MEMBERSHIP), undefined);
  assert.deepEqual(await organizations.checkMembership(member), {
    kind: 'unchanged',
  });
});
