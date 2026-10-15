import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createAccountApi } from '../../src/adapters/api/account-api.ts';

const body = {
  user: {
    userID: '11111111-1111-4111-8111-111111111111',
    login: 'm.belova',
    displayName: 'Марина Белова',
    credentialVersion: '1',
  },
  session: {
    expiresAt: '2026-10-14T18:00:00+03:00',
    idleExpiresAt: '2026-10-14T10:30:00+03:00',
    absoluteExpiresAt: '2026-10-14T18:00:00+03:00',
    rememberMe: true,
    csrfToken: 'csrf-1',
  },
};

function client(answer = body) {
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

test('me() reads /api/v2/me with the activity flag', async () => {
  const fake = client();
  const view = await createAccountApi(fake).me({ background: true });
  assert.equal(view.user.login, 'm.belova');
  assert.deepEqual(fake.calls, [['read', '/api/v2/me', { background: true }]]);
});

test('signIn() posts the exact login body with the commandID', async () => {
  const fake = client();
  await createAccountApi(fake).signIn(
    { login: 'm.belova', password: ' pass word ', rememberMe: true },
    'cmd-7',
  );
  assert.deepEqual(fake.calls, [
    [
      'send',
      'POST',
      '/api/v2/session',
      {
        body: {
          login: 'm.belova',
          password: ' pass word ',
          rememberMe: true,
          commandID: 'cmd-7',
        },
      },
    ],
  ]);
});

test('signOut() deletes the session without a body', async () => {
  const fake = client(undefined);
  await createAccountApi(fake).signOut();
  assert.deepEqual(fake.calls, [
    ['send', 'DELETE', '/api/v2/session', undefined],
  ]);
});

test('a malformed answer is unavailable for /me and unknown for sign-in', async () => {
  const api = createAccountApi(client({}));
  await assert.rejects(
    api.me({ background: false }),
    (error) => error.failure.outcome === 'unavailable',
  );
  await assert.rejects(
    api.signIn({ login: 'a', password: 'b', rememberMe: false }, 'c'),
    (error) => error.failure.outcome === 'unknown',
  );
});

test('changeDisplayName() patches the name and returns the saved user', async () => {
  const saved = { ...body.user, displayName: 'Марина Белова-Орлова' };
  const fake = client(saved);
  const user = await createAccountApi(fake).changeDisplayName(
    'Марина Белова-Орлова',
    'cmd-8',
  );
  assert.equal(user.displayName, 'Марина Белова-Орлова');
  assert.equal(user.email, undefined);
  assert.deepEqual(fake.calls, [
    [
      'send',
      'PATCH',
      '/api/v2/me/display-name',
      { body: { displayName: 'Марина Белова-Орлова', commandID: 'cmd-8' } },
    ],
  ]);
});

test('changePassword() patches both passwords as typed', async () => {
  const fake = client(undefined);
  await createAccountApi(fake).changePassword(
    { currentPassword: ' old ', newPassword: 'new pass 1' },
    'cmd-9',
  );
  assert.deepEqual(fake.calls, [
    [
      'send',
      'PATCH',
      '/api/v2/me/password',
      {
        body: {
          currentPassword: ' old ',
          newPassword: 'new pass 1',
          commandID: 'cmd-9',
        },
      },
    ],
  ]);
});

test('a malformed saved user is unknown', async () => {
  await assert.rejects(
    createAccountApi(client({ login: 'x' })).changeDisplayName('Имя', 'c'),
    (error) =>
      error.failure.code === 'Malformed' && error.failure.outcome === 'unknown',
  );
});

test('logoutAll() posts the commandID and checks the durable result', async () => {
  const fake = client({
    outcome: 'committed',
    commandID: 'cmd-9',
    aggregateRevision: '4',
    resourceID: '11111111-1111-4111-8111-111111111111',
    mailJobs: [],
  });
  await createAccountApi(fake).logoutAll('cmd-9');
  assert.deepEqual(fake.calls, [
    [
      'send',
      'POST',
      '/api/v2/sessions/logout-all',
      { body: { commandID: 'cmd-9' } },
    ],
  ]);
});

test('logoutAll() leaves the outcome unknown for an answer off the schema', async () => {
  await assert.rejects(
    createAccountApi(client({})).logoutAll('cmd-9'),
    (error) =>
      error.failure.code === 'Malformed' && error.failure.outcome === 'unknown',
  );
});

for (const [input, expected] of [
  ['  Ma\u0301x@GMAIL.COM  ', 'Máx@gmail.com'],
  ['Max@gmail.com', 'Max@gmail.com'],
  ['Max@İ.INVALID', 'Max@i.invalid'],
  ['Max@ΟΣ.INVALID', 'Max@οσ.invalid'],
  ['foo..bar@EXAMPLE.COM', 'foo..bar@example.com'],
  ['admin', 'admin'],
  ['  admin  ', '  admin  '],
  ['not@a-domain', 'not@a-domain'],
]) {
  test(`email-like sign-in canonicalizes ${JSON.stringify(input)} without changing other logins`, async () => {
    const fake = client();
    await createAccountApi(fake).signIn(
      { login: input, password: ' pass word ', rememberMe: false },
      'canonical-login',
    );
    assert.equal(fake.calls[0][3].body.login, expected);
    assert.equal(fake.calls[0][3].body.password, ' pass word ');
  });
}
