import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createRegistrationApi } from '../../src/adapters/api/registration-api.ts';

const C = '44444444-4444-4444-8444-444444444444';
const challenge = {
  challengeID: C,
  expiresAt: '2026-10-15T10:10:00+03:00',
  resendAvailableAt: '2026-10-15T10:01:00+03:00',
  state: 'pending',
};
const userView = {
  user: {
    userID: '11111111-1111-4111-8111-111111111111',
    login: 'i.kovaleva',
    displayName: 'Ирина Ковалёва',
    credentialVersion: '1',
  },
  session: {
    expiresAt: '2026-10-15T18:00:00+03:00',
    idleExpiresAt: '2026-10-15T10:30:00+03:00',
    absoluteExpiresAt: '2026-10-15T18:00:00+03:00',
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

const unknownOutcome = (error) =>
  error.failure.code === 'Malformed' && error.failure.outcome === 'unknown';

test('begin() asks for a code with the registration purpose', async () => {
  const fake = client(challenge);
  const result = await createRegistrationApi(fake).begin(
    'i.kovaleva@example.test',
    'cmd-1',
  );
  assert.equal(result.challengeID, C);
  assert.equal(
    result.expiresAt.epochMs,
    Date.parse('2026-10-15T10:10:00+03:00'),
  );
  assert.deepEqual(fake.calls, [
    [
      'POST',
      '/api/v2/email-challenges',
      {
        commandID: 'cmd-1',
        email: 'i.kovaleva@example.test',
        purpose: 'registration',
      },
    ],
  ]);
});

test('verify() and resend() address the challenge', async () => {
  const verified = client({
    challenge: { ...challenge, state: 'verified' },
    proof: 'proof-1',
    retainUntil: '2026-10-16T10:00:00+03:00',
  });
  const result = await createRegistrationApi(verified).verify(
    C,
    '482913',
    'cmd-2',
  );
  assert.equal(result.proof, 'proof-1');
  assert.deepEqual(verified.calls, [
    [
      'POST',
      `/api/v2/challenges/${C}/verify`,
      { commandID: 'cmd-2', challengeID: C, code: '482913' },
    ],
  ]);
  const resent = client(challenge);
  await createRegistrationApi(resent).resend(C, 'cmd-3');
  assert.deepEqual(resent.calls, [
    ['POST', `/api/v2/challenges/${C}/resend`, { commandID: 'cmd-3' }],
  ]);
});

test('complete() sends the name and the password untouched and returns the new session', async () => {
  const fake = client(userView);
  const view = await createRegistrationApi(fake).complete(
    {
      challengeID: C,
      proof: 'proof-1',
      password: ' pass word ',
      displayName: 'Ирина Ковалёва',
    },
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
        purpose: 'registration',
        displayName: 'Ирина Ковалёва',
        password: ' pass word ',
      },
    ],
  ]);
});

test('a challenge id is percent-encoded in the paths', async () => {
  const fake = client(userView);
  await createRegistrationApi(fake).complete(
    { challengeID: 'a/b c', proof: 'p', password: 'x', displayName: 'y' },
    'cmd-1',
  );
  assert.equal(fake.calls[0][1], '/api/v2/email-challenges/a%2Fb%20c/complete');
});

test('an answer that is not the contract is malformed and its outcome unknown', async () => {
  const bad = (answer) => createRegistrationApi(client(answer));
  await assert.rejects(
    bad({ ...challenge, state: 'sent' }).begin('a@b.c', 'c'),
    unknownOutcome,
  );
  await assert.rejects(
    bad({ challenge, retainUntil: challenge.expiresAt }).verify(C, '1', 'c'),
    unknownOutcome,
  );
  await assert.rejects(bad({}).resend(C, 'c'), unknownOutcome);
  await assert.rejects(
    bad({ user: userView.user }).complete(
      { challengeID: C, proof: 'p', password: 'x', displayName: 'y' },
      'c',
    ),
    unknownOutcome,
  );
});
