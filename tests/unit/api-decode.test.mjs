import assert from 'node:assert/strict';
import { test } from 'bun:test';
import examples from '../../api/backend-v2-examples.json' with { type: 'json' };
import { ApiError } from '../../src/application/api.ts';
import { decodeAccessView } from '../../src/adapters/api/decode/access.ts';
import {
  decodeCsrfToken,
  decodeUserView,
} from '../../src/adapters/api/decode/account.ts';
import {
  DecodeError,
  decodeFailure,
  decoded,
  instant,
  nonNegativeInt64,
  object,
  positiveInt64,
} from '../../src/adapters/api/decode/common.ts';
import { decodeEnvelope } from '../../src/adapters/api/decode/context.ts';
import { isEntityId } from '../../src/domain/ids.ts';

const cases = (schema) =>
  examples.schemaCases.filter((item) => item.schema === schema);

const ORG = '22222222-2222-4222-8222-222222222222';
const RESTAURANT = '33333333-3333-4333-8333-333333333333';
const OTHER = '55555555-5555-4555-8555-555555555555';
const EPOCH = '44444444-4444-4444-8444-444444444444';

test('instants follow the contract examples', () => {
  const list = cases('Instant');
  assert.ok(list.length >= 5);
  for (const item of list) {
    if (item.valid) assert.equal(instant(item.value, 'x').iso, item.value);
    else assert.throws(() => instant(item.value, 'x'), DecodeError, item.name);
  }
});

test('an instant keeps its text and names the moment', () => {
  assert.deepEqual(instant('2026-10-13T01:00:00+03:00', 'x'), {
    iso: '2026-10-13T01:00:00+03:00',
    epochMs: Date.UTC(2026, 9, 12, 22),
  });
  assert.equal(
    instant('2026-10-12T22:00:00.123456789Z', 'x').epochMs,
    Date.UTC(2026, 9, 12, 22, 0, 0, 123),
  );
});

test('int64 strings stay strings and respect the range', () => {
  assert.equal(
    nonNegativeInt64('9223372036854775807', 'x'),
    '9223372036854775807',
  );
  assert.throws(
    () => nonNegativeInt64('9223372036854775808', 'x'),
    DecodeError,
  );
  assert.throws(() => nonNegativeInt64('01', 'x'), DecodeError);
  assert.throws(() => nonNegativeInt64(1, 'x'), DecodeError);
  assert.throws(() => positiveInt64('0', 'x'), DecodeError);
});

test('entity ids are canonical lowercase UUIDv4', () => {
  assert.equal(isEntityId(RESTAURANT), true);
  const lettered = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  assert.equal(isEntityId(lettered), true);
  assert.equal(isEntityId(lettered.toUpperCase()), false);
  assert.equal(isEntityId(`${RESTAURANT}x`), false);
  assert.equal(isEntityId('11111111-1111-1111-8111-111111111111'), false);
});

test('errors decode with outcome, details and field errors', () => {
  for (const item of cases('Error').filter((entry) => entry.valid)) {
    const failure = decodeFailure(409, item.value);
    assert.equal(failure.code, item.value.code);
    assert.equal(failure.outcome, item.value.outcome);
  }
  assert.deepEqual(
    decodeFailure(429, {
      code: 'LoginRateLimited',
      outcome: 'not_committed',
      message: 'too many',
      retryable: true,
      details: { retryAfterSeconds: 60, currentEpoch: EPOCH },
      fieldErrors: { login: 'Проверьте логин' },
      sessionRevoked: true,
    }),
    {
      status: 429,
      code: 'LoginRateLimited',
      outcome: 'not_committed',
      retryable: true,
      retryAfterSeconds: 60,
      currentEpoch: EPOCH,
      fieldErrors: { login: 'Проверьте логин' },
      sessionRevoked: true,
    },
  );
});

test('an error without retryable or with an unknown outcome is malformed', () => {
  assert.throws(
    () =>
      decodeFailure(502, {
        code: 'UpstreamUnavailable',
        message: 'gateway did not respond',
        outcome: 'unavailable',
      }),
    DecodeError,
  );
  assert.throws(
    () =>
      decodeFailure(409, {
        code: 'X',
        message: 'm',
        outcome: 'maybe',
        retryable: false,
      }),
    DecodeError,
  );
});

test('decoded() turns a contract mismatch into ApiError Malformed', () => {
  const read = decoded(decodeCsrfToken, 'unavailable');
  assert.equal(read({ csrfToken: 't' }), 't');
  assert.throws(
    () => read({}),
    (error) =>
      error instanceof ApiError &&
      error.failure.code === 'Malformed' &&
      error.failure.outcome === 'unavailable',
  );
});

const userView = {
  user: {
    userID: '11111111-1111-4111-8111-111111111111',
    login: 'm.belova',
    displayName: 'Марина Белова',
    email: 'm.belova@restoran.example',
    credentialVersion: '1',
  },
  session: {
    expiresAt: '2026-10-14T18:00:00+03:00',
    idleExpiresAt: '2026-10-14T10:30:00+03:00',
    absoluteExpiresAt: '2026-10-14T18:00:00+03:00',
    rememberMe: false,
    csrfToken: 'csrf-1',
  },
};

test('a user view gives the user, the session times and the CSRF token', () => {
  const view = decodeUserView(userView);
  assert.equal(view.user.displayName, 'Марина Белова');
  assert.equal(view.user.email, 'm.belova@restoran.example');
  assert.equal(view.csrfToken, 'csrf-1');
  assert.equal(
    view.session.idleExpiresAt.epochMs,
    Date.UTC(2026, 9, 14, 7, 30),
  );
  assert.equal(view.session.rememberMe, false);
  const user = { ...userView.user };
  delete user.email;
  assert.equal(decodeUserView({ ...userView, user }).user.email, undefined);
});

test('a user view without a session or with an empty token is refused', () => {
  assert.throws(() => decodeUserView({ user: userView.user }), DecodeError);
  assert.throws(
    () =>
      decodeUserView({
        ...userView,
        session: { ...userView.session, csrfToken: '' },
      }),
    DecodeError,
  );
});

test('fields the contract may add later are ignored', () => {
  const view = decodeUserView({
    ...userView,
    extra: 1,
    user: { ...userView.user, nickname: 'x' },
  });
  assert.equal(view.user.login, 'm.belova');
});

const accessBody = {
  organizations: [
    {
      orgID: ORG,
      name: 'Восток Фуд',
      settings: { timeZone: 'Europe/Moscow', settingsVersion: '1' },
      lifecycle: 'active',
      lifecycleVersion: '1',
    },
  ],
  restaurants: [
    {
      restaurantID: RESTAURANT,
      orgID: ORG,
      name: 'На Пушкинской',
      lifecycle: 'ready',
      lifecycleVersion: '1',
    },
    {
      restaurantID: OTHER,
      orgID: ORG,
      name: 'На Чехова',
      lifecycle: 'registering',
      lifecycleVersion: '1',
    },
  ],
  memberships: [
    {
      membershipID: '66666666-6666-4666-8666-666666666666',
      membershipVersion: '3',
      userID: '11111111-1111-4111-8111-111111111111',
      orgID: ORG,
      orgRoles: [],
      assignments: [
        {
          restaurantID: RESTAURANT,
          assignmentID: '77777777-7777-4777-8777-777777777777',
          assignmentVersion: '1',
          roles: ['Warehouse', 'Waiter'],
        },
      ],
      state: 'active',
    },
  ],
};

test('the access view lists organizations, restaurants and own memberships', () => {
  const view = decodeAccessView(accessBody);
  assert.deepEqual(view.organizations[0], {
    orgID: ORG,
    name: 'Восток Фуд',
    settings: { timeZone: 'Europe/Moscow', settingsVersion: '1' },
    lifecycle: 'active',
  });
  assert.deepEqual(
    view.restaurants.map((item) => [item.name, item.lifecycle]),
    [
      ['На Пушкинской', 'ready'],
      ['На Чехова', 'registering'],
    ],
  );
  assert.deepEqual(view.memberships[0], {
    orgID: ORG,
    orgRoles: [],
    assignments: [{ restaurantID: RESTAURANT, roles: ['Warehouse', 'Waiter'] }],
    state: 'active',
  });
});

test('the contract membership example decodes', () => {
  for (const item of cases('Membership').filter((entry) => entry.valid)) {
    const view = decodeAccessView({
      organizations: [],
      restaurants: [],
      memberships: [item.value],
    });
    assert.equal(view.memberships[0].orgID, item.value.orgID);
  }
});

test('the access view refuses an unknown lifecycle or role', () => {
  assert.throws(
    () =>
      decodeAccessView({
        ...accessBody,
        restaurants: [{ ...accessBody.restaurants[0], lifecycle: 'paused' }],
      }),
    DecodeError,
  );
  const membership = accessBody.memberships[0];
  assert.throws(
    () =>
      decodeAccessView({
        ...accessBody,
        memberships: [
          {
            ...membership,
            assignments: [{ ...membership.assignments[0], roles: ['Admin'] }],
          },
        ],
      }),
    DecodeError,
  );
});

const context = {
  orgID: ORG,
  tenantID: RESTAURANT,
  runtimeEpoch: EPOCH,
  settings: { timeZone: 'Asia/Yekaterinburg', settingsVersion: '3' },
  evaluatedAt: '2026-10-10T15:22:10+05:00',
  stateVersion: '0',
};

test('an envelope gives the business context and the result', () => {
  const envelope = decodeEnvelope({ context, result: { items: [] } }, object);
  assert.equal(envelope.context.runtimeEpoch, EPOCH);
  assert.equal(envelope.context.warehouseEpoch, undefined);
  assert.equal(envelope.context.settings.timeZone, 'Asia/Yekaterinburg');
  assert.equal(envelope.context.stateVersion, '0');
  assert.deepEqual(envelope.result, { items: [] });
  const serving = decodeEnvelope(
    { context: { ...context, warehouseEpoch: OTHER }, result: {} },
    object,
  );
  assert.equal(serving.context.warehouseEpoch, OTHER);
  const broken = { ...context };
  delete broken.runtimeEpoch;
  assert.throws(
    () => decodeEnvelope({ context: broken, result: {} }, object),
    DecodeError,
  );
});

test('DUR1 admission answers keep their outcome and wait', async () => {
  const { default: dur } = await import('../../api/durable-v1-examples.json', {
    with: { type: 'json' },
  });
  const byName = Object.fromEntries(dur.examples.map((e) => [e.name, e]));
  const limited = byName['error-rate-limited'];
  const failure = decodeFailure(
    limited.status,
    limited.value,
    limited.headers['Retry-After'],
  );
  assert.equal(failure.code, 'RateLimited');
  assert.equal(failure.outcome, 'not_committed');
  assert.equal(failure.retryAfterSeconds, 7);
  for (const [name, outcome] of [
    ['error-service-unavailable-write', 'not_committed'],
    ['error-service-unavailable-read', 'unavailable'],
    ['error-service-unavailable-after-dispatch', 'unknown'],
  ]) {
    const item = byName[name];
    const decoded = decodeFailure(item.status, item.value);
    assert.equal(decoded.code, 'ServiceUnavailable');
    assert.equal(decoded.outcome, outcome);
  }
});
