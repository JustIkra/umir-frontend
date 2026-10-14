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
import { createSessionStore } from '../../src/application/session.ts';

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
  const listeners = new Set();
  const session = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
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
  // The session store publishes another state, e.g. the server ended it.
  const become = (next) => {
    state = next;
    for (const listener of listeners) listener();
  };
  return { settings, answers, calls, events, commands, become };
}

// An answer the test settles later.
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
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

test('pending() reports a save in flight with the value being sent', async () => {
  const { settings, answers } = setup();
  const name = deferred();
  answers.changeDisplayName.push(name.promise);
  const renaming = settings.rename(' Новое имя ');
  assert.equal(settings.pending().name, 'Новое имя');
  name.resolve(named('Новое имя'));
  assert.equal((await renaming).kind, 'saved');
  assert.equal(settings.pending().name, undefined);
  const password = deferred();
  answers.changePassword.push(password.promise);
  const changing = settings.changePassword(input);
  assert.equal(settings.pending().password, 'unknown');
  password.reject(recovering());
  assert.equal((await changing).kind, 'recovering');
  assert.equal(settings.pending().password, 'recovering');
});

test('an ended session drops the password attempt and keeps the name (X03)', async () => {
  const { settings, answers, commands, become } = setup();
  answers.changeDisplayName.push(lost());
  await settings.rename('Новое имя');
  answers.changePassword.push(recovering());
  await settings.changePassword(input);
  become({ status: 'active', user, session: {} });
  assert.equal(settings.pending().password, 'recovering');
  become({ status: 'anonymous', expired: true });
  assert.deepEqual(settings.pending(), {
    name: 'Новое имя',
    password: undefined,
  });
  assert.deepEqual(
    commands.getSnapshot().map((attempt) => attempt.key),
    [renameKey],
  );
});

// The real session store, command runner and account settings, wired as
// main.tsx wires them: the server ending the session during an unknown
// password change sends the user to sign-in with L13.
function wired(answers) {
  const me = [];
  const api = {
    me: () => {
      const next = me.shift() ?? Promise.reject(new Error('no me answer'));
      return next instanceof Error ? Promise.reject(next) : next;
    },
    signIn: () => Promise.resolve(view),
    signOut: () => Promise.resolve(),
    changeDisplayName: () => Promise.reject(new Error('no rename here')),
    changePassword: () => answers.shift(),
  };
  let n = 0;
  const commands = createCommandRunner({
    newId: () => `cmd-${String((n += 1))}`,
    now: () => 0,
    epochs: createEpochRegistry(),
    onReset: () => {},
  });
  const tasks = [];
  const shown = new Set();
  let settings;
  const session = createSessionStore({
    api,
    commands,
    scheduler: {
      schedule: (delayMs, callback) => {
        const task = { callback, done: false };
        tasks.push(task);
        return () => {
          task.done = true;
        };
      },
    },
    visibility: {
      isVisible: () => true,
      subscribe: (listener) => {
        shown.add(listener);
        return () => shown.delete(listener);
      },
    },
    now: () => 0,
    setCsrfToken: () => {},
    onSignedOut: () => commands.clear(),
    onExpired: () => {},
    onUserChanged: () => commands.clear(),
    expiryNotice: () => {
      const state = session.getSnapshot();
      return state.status === 'active' &&
        settings.pending().password !== undefined
        ? { kind: 'password-unknown', login: state.user.login }
        : undefined;
    },
  });
  settings = createAccountSettings({ api, commands, session });
  return {
    session,
    settings,
    commands,
    // The next /me answers: a value or an ApiError.
    me: (answer) =>
      me.push(answer instanceof Error ? answer : Promise.resolve(answer)),
    // A background /me: the tab is shown again, or the idle deadline passed.
    show: () => {
      for (const listener of shown) listener();
    },
    idle: () => {
      for (const task of tasks.filter((item) => !item.done)) {
        task.done = true;
        task.callback();
      }
    },
  };
}

const instant = { iso: '2026-10-14T10:00:00Z', epochMs: 9e12 };
const view = {
  user,
  session: {
    expiresAt: instant,
    idleExpiresAt: instant,
    absoluteExpiresAt: instant,
    rememberMe: false,
  },
  csrfToken: 'csrf',
};
const settledSoon = () => new Promise((resolve) => setTimeout(resolve, 0));
const signInAgain = (session) =>
  session.signIn({
    login: user.login,
    password: 'new pass 1',
    rememberMe: false,
  });
const unauthenticated = () => refused(401, 'Unauthenticated', 'not_committed');

for (const [frame, answer, outcome, background] of [
  ['S20', recovering, 'recovering', 'show'],
  ['S19', lost, 'unknown', 'idle'],
]) {
  test(`${frame}, then the server ends the session: L13, and after sign-in the change is not pending`, async () => {
    const { session, settings, commands, me, ...checks } = wired([
      Promise.reject(answer()),
    ]);
    await signInAgain(session);
    assert.equal((await settings.changePassword(input)).kind, outcome);
    me(unauthenticated());
    checks[background]();
    await settledSoon();
    assert.deepEqual(session.getSnapshot(), {
      status: 'anonymous',
      expired: true,
      notice: { kind: 'password-unknown', login: user.login },
    });
    await signInAgain(session);
    assert.equal(settings.pending().password, undefined);
    assert.ok(
      !commands.getSnapshot().some((attempt) => attempt.key === passwordKey),
    );
  });
}

test('a password change in flight when the session expires: L13, and its late answer stays unpending', async () => {
  const answer = deferred();
  const { session, settings, commands } = wired([answer.promise]);
  await signInAgain(session);
  const changing = settings.changePassword(input);
  session.expire();
  assert.deepEqual(session.getSnapshot(), {
    status: 'anonymous',
    expired: true,
    notice: { kind: 'password-unknown', login: user.login },
  });
  await signInAgain(session);
  answer.reject(lost());
  assert.equal((await changing).kind, 'unknown');
  assert.equal(settings.pending().password, undefined);
  assert.deepEqual(commands.getSnapshot(), []);
});
