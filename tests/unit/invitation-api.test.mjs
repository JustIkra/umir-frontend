import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createInvitationApi } from '../../src/adapters/api/invitation-api.ts';

const I = '22222222-2222-4222-8222-222222222222';
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
    login: 'i.kovaleva',
    displayName: 'Ирина Ковалёва',
    credentialVersion: '1',
  },
  session: {
    expiresAt: '2026-10-14T18:00:00+03:00',
    idleExpiresAt: '2026-10-14T10:30:00+03:00',
    absoluteExpiresAt: '2026-10-14T18:00:00+03:00',
    rememberMe: false,
    csrfToken: 'csrf-2',
  },
};
const membership = {
  membershipID: '66666666-6666-4666-8666-666666666666',
  membershipVersion: '1',
  userID: '11111111-1111-4111-8111-111111111111',
  orgID: '33333333-3333-4333-8333-333333333333',
  orgRoles: [],
  assignments: [
    {
      restaurantID: '77777777-7777-4777-8777-777777777777',
      assignmentID: '88888888-8888-4888-8888-888888888888',
      assignmentVersion: '1',
      roles: ['Waiter'],
    },
  ],
  state: 'active',
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

test('begin() asks for a code of the invitation', async () => {
  const fake = client(challenge);
  const result = await createInvitationApi(fake).begin(I, 'cmd-1');
  assert.equal(result.challengeID, C);
  assert.equal(
    result.expiresAt.epochMs,
    Date.parse('2026-10-14T10:10:00+03:00'),
  );
  assert.deepEqual(fake.calls, [
    [
      'POST',
      `/api/v2/invitations/${I}/challenges`,
      { commandID: 'cmd-1', invitationID: I },
    ],
  ]);
});

test('verify() and resend() address the challenge', async () => {
  const verified = client({
    challenge: { ...challenge, state: 'verified' },
    proof: 'proof-1',
    retainUntil: '2026-10-15T10:00:00+03:00',
  });
  const result = await createInvitationApi(verified).verify(
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
  await createInvitationApi(resent).resend(C, 'cmd-3');
  assert.deepEqual(resent.calls, [
    ['POST', `/api/v2/challenges/${C}/resend`, { commandID: 'cmd-3' }],
  ]);
});

test('complete() sends the name and the password untouched and returns the new session', async () => {
  const fake = client(userView);
  const view = await createInvitationApi(fake).complete(
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
      `/api/v2/challenges/${C}/complete`,
      {
        commandID: 'cmd-4',
        challengeID: C,
        proof: 'proof-1',
        password: ' pass word ',
        displayName: 'Ирина Ковалёва',
      },
    ],
  ]);
});

test('accept() sends the proof to the invitation and returns the membership', async () => {
  const fake = client(membership);
  const result = await createInvitationApi(fake).accept(
    I,
    { challengeID: C, proof: 'proof-1' },
    'cmd-5',
  );
  assert.equal(result.membershipVersion, '1');
  assert.equal(result.assignments[0].roles[0], 'Waiter');
  assert.deepEqual(fake.calls, [
    [
      'POST',
      `/api/v2/invitations/${I}/accept`,
      { commandID: 'cmd-5', challengeID: C, proof: 'proof-1' },
    ],
  ]);
});

test('an invitation id is percent-encoded in the path', async () => {
  const fake = client(challenge);
  await createInvitationApi(fake).begin('a/b c', 'cmd-1');
  assert.equal(fake.calls[0][1], '/api/v2/invitations/a%2Fb%20c/challenges');
});

test('an answer that is not the contract is malformed and its outcome unknown', async () => {
  const bad = (answer) => createInvitationApi(client(answer));
  await assert.rejects(
    bad({ ...challenge, state: 'sent' }).begin(I, 'c'),
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
  await assert.rejects(
    bad({ ...membership, state: 'gone' }).accept(
      I,
      { challengeID: C, proof: 'p' },
      'c',
    ),
    unknownOutcome,
  );
});
