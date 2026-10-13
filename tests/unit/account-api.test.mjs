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
