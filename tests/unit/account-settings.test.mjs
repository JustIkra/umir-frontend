import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { ApiError, localFailure } from '../../src/application/api.ts';
import {
  createAccountSettings,
  passwordKey,
  renameKey,
} from '../../src/application/account-settings.ts';
import { createCommandRunner } from '../../src/application/commands.ts';
import { createEpochRegistry } from '../../src/application/epochs.ts';

const user = {
  userID: '11111111-1111-4111-8111-111111111111',
  login: 'm.belova',
  displayName: 'Марина Белова',
  email: 'm.belova@restoran.example',
};
const refused = (status, code, outcome, extra = {}) =>
  new ApiError({
    ...localFailure(code, outcome, status),
    retryable: false,
    ...extra,
  });
const lost = () => refused(0, 'Transport', 'unknown');
const recovering = () => refused(503, 'AuthUpdateOutcomeUnknown', 'unknown');

function setup() {
  const calls = [];
  const answers = { me: [], changeDisplayName: [], changePassword: [] };
  const take = (name, args) => {
    calls.push([name, ...args]);
    // An empty queue is a test mistake; undefined is a real 204 answer.
    if (answers[name].length === 0) {
      return Promise.reject(new Error(`no ${name} answer`));
    }
    const next = answers[name].shift();
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };
  const api = {
    me: (...args) => take('me', args),
    changeDisplayName: (...args) => take('changeDisplayName', args),
    changePassword: (...args) => take('changePassword', args),
  };
  let n = 0;
  const commands = createCommandRunner({
    newId: () => `cmd-${String((n += 1))}`,
    now: () => 0,
    epochs: createEpochRegistry(),
    onReset: () => {},
  });
  const events = [];
  let state = { status: 'active', user, session: {} };
  const session = {
    getSnapshot: () => state,
    check: () => {
      events.push(['check']);
      return Promise.resolve('ended');
    },
    updateUser: (next) => {
      events.push(['updateUser', next.displayName]);
      state = { ...state, user: next };
    },
    forget: (notice) => {
      events.push(['forget', notice]);
    },
    signOut: (notice) => {
      events.push(['signOut', notice]);
      return Promise.resolve('done');
    },
  };
  const settings = createAccountSettings({ api, commands, session });
  return { settings, answers, calls, events, commands };
}

const named = (displayName) => ({ ...user, displayName });

test('rename() trims the name, saves it and updates the session', async () => {
  const { settings, answers, calls, events } = setup();
  answers.changeDisplayName.push(named('Марина Белова-Орлова'));
  const outcome = await settings.rename('  Марина Белова-Орлова ');
  assert.equal(outcome.kind, 'saved');
  assert.deepEqual(calls, [
    ['changeDisplayName', 'Марина Белова-Орлова', 'cmd-1'],
  ]);
  assert.deepEqual(events, [['updateUser', 'Марина Белова-Орлова']]);
});

test('a name outside 2–80 code points is invalid without a request', async () => {
  const { settings, answers, calls } = setup();
  assert.deepEqual(await settings.rename(' М '), { kind: 'invalid' });
  assert.deepEqual(await settings.rename('я'.repeat(81)), { kind: 'invalid' });
  assert.equal(calls.length, 0);
  answers.changeDisplayName.push(named('😀😀'));
  assert.equal(
    (await settings.rename('😀😀')).kind,
    'saved',
    'two code points',
  );
});

test('refusals of the name: invalid, storage, ended session, recovering, lost', async () => {
  const cases = [
    [refused(400, 'InvalidDisplayName', 'not_committed'), { kind: 'invalid' }],
    [
      refused(503, 'AuthStorageUnavailable', 'not_committed'),
      { kind: 'storage', code: 'AuthStorageUnavailable' },
    ],
    [refused(401, 'Unauthenticated', 'not_committed'), { kind: 'ended' }],
    [recovering(), { kind: 'recovering', code: 'AuthUpdateOutcomeUnknown' }],
    [lost(), { kind: 'lost' }],
  ];
  for (const [answer, outcome] of cases) {
    const { settings, answers, events } = setup();
    answers.changeDisplayName.push(answer);
    assert.deepEqual(
      await settings.rename('Новое имя'),
      outcome,
      answer.message,
    );
    assert.equal(
      events.some(([name]) => name === 'check'),
      outcome.kind === 'ended',
    );
  }
});

test('checkRename() compares the profile with the draft and settles the attempt', async () => {
  const { settings, answers, commands } = setup();
  answers.changeDisplayName.push(lost());
  await settings.rename('Новое имя');
  assert.equal(commands.getSnapshot()[0].key, renameKey);
  answers.me.push(refused(503, 'AuthUnavailable', 'unavailable'));
  assert.deepEqual(await settings.checkRename('Новое имя'), {
    kind: 'unreadable',
    code: 'AuthUnavailable',
  });
  assert.equal(commands.getSnapshot().length, 1, 'still unknown');
  answers.me.push({ user: named('Марина Белова') });
  assert.deepEqual(await settings.checkRename('Новое имя'), {
    kind: 'unchanged',
    user: named('Марина Белова'),
  });
  assert.deepEqual(commands.getSnapshot(), []);
  answers.me.push({ user: named('Новое имя') });
  assert.equal((await settings.checkRename(' Новое имя ')).kind, 'saved');
});

test('changePassword() checks the fields first', async () => {
  const { settings, calls } = setup();
  assert.deepEqual(
    await settings.changePassword({
      currentPassword: '',
      newPassword: 'short',
      repeat: 'other',
    }),
    {
      kind: 'invalid',
      errors: {
        currentPassword: 'current-required',
        newPassword: 'new-length',
        repeat: 'mismatch',
      },
    },
  );
  assert.equal(calls.length, 0);
});

const input = {
  currentPassword: 'old pass 1',
  newPassword: 'new pass 1',
  repeat: 'new pass 1',
};

test('a changed password ends the session with L11', async () => {
  const { settings, answers, calls, events } = setup();
  answers.changePassword.push(undefined);
  assert.deepEqual(await settings.changePassword(input), { kind: 'changed' });
  assert.deepEqual(calls, [
    [
      'changePassword',
      { currentPassword: 'old pass 1', newPassword: 'new pass 1' },
      'cmd-1',
    ],
  ]);
  assert.deepEqual(events, [
    ['forget', { kind: 'password-changed', login: 'm.belova' }],
  ]);
});

test('refusals of the password', async () => {
  const cases = [
    [
      refused(400, 'CurrentPasswordIncorrect', 'not_committed'),
      { kind: 'invalid', errors: { currentPassword: 'current-wrong' } },
    ],
    [
      refused(400, 'PasswordRejected', 'not_committed'),
      { kind: 'invalid', errors: { newPassword: 'new-rejected' } },
    ],
    [
      refused(429, 'PasswordChangeRateLimited', 'not_committed', {
        sessionRevoked: true,
      }),
      { kind: 'revoked' },
    ],
    [
      refused(429, 'PasswordChangeRateLimited', 'not_committed', {
        retryAfterSeconds: 30,
      }),
      { kind: 'limited', seconds: 30 },
    ],
    [
      refused(503, 'AuthStorageUnavailable', 'not_committed'),
      { kind: 'storage', code: 'AuthStorageUnavailable' },
    ],
    [lost(), { kind: 'unknown' }],
    [recovering(), { kind: 'recovering', code: 'AuthUpdateOutcomeUnknown' }],
    [refused(401, 'Unauthenticated', 'not_committed'), { kind: 'ended' }],
  ];
  for (const [answer, outcome] of cases) {
    const { settings, answers, events } = setup();
    answers.changePassword.push(answer);
    assert.deepEqual(
      await settings.changePassword(input),
      outcome,
      answer.message,
    );
    if (outcome.kind === 'revoked') {
      assert.deepEqual(events, [['forget', { kind: 'password-limit' }]]);
    }
  }
});

test('checkPassword reads 401 as changed and keeps the notice', async () => {
  const { settings, answers, events } = setup();
  answers.changePassword.push(recovering());
  await settings.changePassword(input);
  answers.me.push(refused(401, 'Unauthenticated', 'not_committed'));
  assert.equal(await settings.checkPassword(), 'changed');
  assert.deepEqual(events, [
    ['forget', { kind: 'password-changed', login: 'm.belova' }],
  ]);
});

test('checkPassword: 200 means unchanged and settles the attempt; 503 keeps recovering', async () => {
  const { settings, answers, commands } = setup();
  answers.changePassword.push(recovering());
  await settings.changePassword(input);
  answers.me.push(refused(503, 'AuthUnavailable', 'unavailable'));
  assert.equal(await settings.checkPassword(), 'recovering');
  assert.equal(commands.getSnapshot()[0].key, passwordKey);
  answers.me.push({ user });
  assert.equal(await settings.checkPassword(), 'unchanged');
  assert.deepEqual(commands.getSnapshot(), []);
});

test('signInToCheck() signs out with the L13 notice', async () => {
  const { settings, events } = setup();
  assert.equal(await settings.signInToCheck(), 'done');
  assert.deepEqual(events, [
    ['signOut', { kind: 'password-unknown', login: 'm.belova' }],
  ]);
});

test('refreshProfile() updates the user; 401 asks the session', async () => {
  const { settings, answers, events } = setup();
  answers.me.push({ user: named('С сервера') });
  assert.equal(await settings.refreshProfile(), true);
  answers.me.push(refused(401, 'Unauthenticated', 'not_committed'));
  assert.equal(await settings.refreshProfile(), false);
  assert.deepEqual(events, [['updateUser', 'С сервера'], ['check']]);
});

test('pending() reports a lost rename until the profile read settles it', async () => {
  const { settings, answers, commands } = setup();
  assert.deepEqual(settings.pending(), {
    name: undefined,
    password: undefined,
  });
  answers.changeDisplayName.push(lost());
  await settings.rename(' Новое имя ');
  assert.equal(settings.pending().name, 'Новое имя');
  answers.me.push({ user: named('Новое имя') });
  await settings.checkRename('Новое имя');
  assert.equal(settings.pending().name, undefined);
  answers.changeDisplayName.push(recovering());
  await settings.rename('Другое имя');
  assert.equal(settings.pending().name, 'Другое имя');
  answers.me.push({ user: named('Марина Белова') });
  assert.equal((await settings.checkRename('Другое имя')).kind, 'unchanged');
  assert.equal(settings.pending().name, undefined);
  answers.changeDisplayName.push(lost());
  await settings.rename('Третье имя');
  commands.clear();
  assert.equal(settings.pending().name, undefined);
});

test('pending() reports an unknown or recovering password change', async () => {
  const { settings, answers, commands } = setup();
  answers.changePassword.push(lost());
  await settings.changePassword(input);
  assert.equal(settings.pending().password, 'unknown');
  commands.clear();
  assert.equal(settings.pending().password, undefined);
  answers.changePassword.push(recovering());
  await settings.changePassword(input);
  assert.equal(settings.pending().password, 'recovering');
  answers.me.push({ user });
  assert.equal(await settings.checkPassword(), 'unchanged');
  assert.equal(settings.pending().password, undefined);
});
