import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createRecoveryApi } from '../../src/adapters/api/recovery-api.ts';

const C = '44444444-4444-4444-8444-444444444444';
const challenge = {
  challengeID: C,
  expiresAt: '2026-10-14T10:10:00+03:00',
  resendAvailableAt: '2026-10-14T10:01:00+03:00',
  state: 'pending',
};
const userView = {
  user: {
    userID: '11111111-1111-4111-8111-111111111111',
    login: 'm.belova',
    displayName: 'Марина Белова',
    credentialVersion: '2',
  },
  session: {
    expiresAt: '2026-10-14T18:00:00+03:00',
    idleExpiresAt: '2026-10-14T10:30:00+03:00',
    absoluteExpiresAt: '2026-10-14T18:00:00+03:00',
    rememberMe: false,
    csrfToken: 'csrf-2',
  },
};

function client(answer) {
  const calls = [];
  return {
    calls,
    send: (method, path, options) => {
      calls.push([method, path, options.body]);
      return Promise.resolve(answer);
    },
  };
}

test('begin() asks for a password reset code with the email as given', async () => {
  const fake = client(challenge);
  const result = await createRecoveryApi(fake).begin(
    'm.belova@restoran.example',
    'cmd-1',
  );
  assert.equal(result.challengeID, C);
  assert.equal(result.state, 'pending');
  assert.equal(
    result.resendAvailableAt.epochMs,
    Date.parse('2026-10-14T10:01:00+03:00'),
  );
  assert.deepEqual(fake.calls, [
    [
      'POST',
      '/api/v2/email-challenges',
      {
        commandID: 'cmd-1',
        email: 'm.belova@restoran.example',
        purpose: 'password_reset',
      },
    ],
  ]);
});

test('verify() and resend() address the challenge', async () => {
  const verified = client({
    challenge: { ...challenge, state: 'verified' },
    proof: 'proof-1',
    retainUntil: '2026-10-15T10:00:00+03:00',
  });
  const result = await createRecoveryApi(verified).verify(C, '482913', 'cmd-2');
  assert.equal(result.proof, 'proof-1');
  assert.equal(result.challenge.state, 'verified');
  assert.deepEqual(verified.calls, [
    [
      'POST',
      `/api/v2/challenges/${C}/verify`,
      { commandID: 'cmd-2', challengeID: C, code: '482913' },
    ],
  ]);
  const resent = client(challenge);
  await createRecoveryApi(resent).resend(C, 'cmd-3');
  assert.deepEqual(resent.calls, [
    ['POST', `/api/v2/challenges/${C}/resend`, { commandID: 'cmd-3' }],
  ]);
});

test('complete() sends the new password untouched and returns the new session', async () => {
  const fake = client(userView);
  const view = await createRecoveryApi(fake).complete(
    { challengeID: C, proof: 'proof-1', newPassword: ' new pass ' },
    'cmd-4',
  );
  assert.equal(view.csrfToken, 'csrf-2');
  assert.deepEqual(fake.calls, [
    [
      'POST',
      `/api/v2/email-challenges/${C}/complete`,
      {
        commandID: 'cmd-4',
        challengeID: C,
        proof: 'proof-1',
        purpose: 'password_reset',
        newPassword: ' new pass ',
      },
    ],
  ]);
});

test('a challenge with an unknown state or a verification without proof is malformed and unknown', async () => {
  await assert.rejects(
    createRecoveryApi(client({ ...challenge, state: 'sent' })).begin(
      'a@b.ru',
      'c',
    ),
    (error) =>
      error.failure.code === 'Malformed' && error.failure.outcome === 'unknown',
  );
  await assert.rejects(
    createRecoveryApi(
      client({ challenge, retainUntil: challenge.expiresAt }),
    ).verify(C, '482913', 'c'),
    (error) => error.failure.code === 'Malformed',
  );
});
