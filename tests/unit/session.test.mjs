import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { ApiError, localFailure } from '../../src/application/api.ts';
import { createAccessStore } from '../../src/application/access.ts';
import { createCommandRunner } from '../../src/application/commands.ts';
import { createEpochRegistry } from '../../src/application/epochs.ts';
import {
  createSessionStore,
  idleGraceMs,
  returnPath,
} from '../../src/application/session.ts';

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
const refused = (status, code, outcome) =>
  new ApiError({ ...localFailure(code, outcome, status), retryable: false });

const instant = (epochMs) => ({
  iso: new Date(epochMs).toISOString(),
  epochMs,
});
const view = (idleAt = 60_000) => ({
  user: {
    userID: 'u',
    login: 'm.belova',
    displayName: 'Марина Белова',
    email: undefined,
  },
  session: {
    expiresAt: instant(idleAt),
    idleExpiresAt: instant(idleAt),
    absoluteExpiresAt: instant(idleAt),
    rememberMe: false,
  },
  csrfToken: 'csrf-session',
});

function manualScheduler() {
  const tasks = [];
  return {
    schedule(delayMs, callback) {
      const task = { delayMs, callback, done: false };
      tasks.push(task);
      return () => {
        task.done = true;
      };
    },
    runDue() {
      for (const task of tasks.filter((item) => !item.done)) {
        task.done = true;
        task.callback();
      }
    },
    delays: () =>
      tasks.filter((task) => !task.done).map((task) => task.delayMs),
  };
}

function manualVisibility() {
  const listeners = new Set();
  const visibility = {
    visible: true,
    isVisible: () => visibility.visible,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    show() {
      visibility.visible = true;
      for (const listener of listeners) listener();
    },
  };
  return visibility;
}

// overrides replace session options, as main.tsx wires them.
function setup(api, overrides = {}) {
  const commands = createCommandRunner({
    newId: () => 'cmd-1',
    now: () => 0,
    epochs: createEpochRegistry(),
    onReset: () => {},
  });
  const scheduler = manualScheduler();
  const visibility = manualVisibility();
  const events = { tokens: [], signedOut: 0, expired: 0, userChanged: 0 };
  const session = createSessionStore({
    api,
    commands,
    scheduler,
    visibility,
    now: () => 0,
    setCsrfToken: (token) => events.tokens.push(token),
    onSignedOut: () => {
      events.signedOut += 1;
      commands.clear();
    },
    onExpired: () => {
      events.expired += 1;
    },
    onUserChanged: () => {
      events.userChanged += 1;
      commands.clear();
    },
    ...overrides,
  });
  return { session, commands, scheduler, visibility, events };
}

function account(overrides = {}) {
  const calls = [];
  const api = {
    me: (options) => {
      calls.push(['me', options.background]);
      return Promise.resolve(view());
    },
    signIn: (input, commandID) => {
      calls.push(['signIn', input.login, commandID]);
      return Promise.resolve(view());
    },
    signOut: () => {
      calls.push(['signOut']);
      return Promise.resolve();
    },
    ...overrides,
  };
  return { api, calls };
}

test('ensure() reads /me once in the foreground and keeps the user', async () => {
  const { api, calls } = account();
  const { session, events } = setup(api);
  assert.equal(session.getSnapshot().status, 'unknown');
  const state = await session.ensure();
  assert.equal(state.status, 'active');
  assert.equal(state.user.displayName, 'Марина Белова');
  await session.ensure();
  assert.deepEqual(calls, [['me', false]]);
  assert.deepEqual(events.tokens, ['csrf-session']);
});

test('401 on /me is a guest, not an expired session', async () => {
  const { api, calls } = account({
    me: () => Promise.reject(refused(401, 'Unauthenticated', 'not_committed')),
  });
  const { session, events } = setup(api);
  assert.deepEqual(await session.ensure(), {
    status: 'anonymous',
    expired: false,
  });
  await session.ensure();
  assert.equal(calls.length, 0);
  assert.equal(events.expired, 0);
});

test('a lost /me answer is unavailable and ensure() asks again', async () => {
  let attempts = 0;
  const { api } = account({
    me: () => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(refused(0, 'Transport', 'unavailable'))
        : Promise.resolve(view());
    },
  });
  const { session } = setup(api);
  assert.equal((await session.ensure()).status, 'unavailable');
  assert.equal((await session.ensure()).status, 'active');
});

test('the idle deadline schedules a background check; 401 then expires the session', async () => {
  let answer = Promise.resolve(view(60_000));
  const calls = [];
  const { api } = account({
    me: (options) => {
      calls.push(options.background);
      return answer;
    },
  });
  const { session, scheduler, events } = setup(api);
  await session.ensure();
  assert.deepEqual(scheduler.delays(), [60_000 + idleGraceMs]);
  answer = Promise.reject(refused(401, 'Unauthenticated', 'not_committed'));
  scheduler.runDue();
  await settled();
  assert.deepEqual(calls, [false, true]);
  assert.deepEqual(session.getSnapshot(), {
    status: 'anonymous',
    expired: true,
  });
  assert.equal(events.expired, 1);
});

test('a remember-me session is checked hourly, and the answer does not repeat the check at once', async () => {
  const hour = 3_600_000;
  const inThirtyDays = view(30 * 24 * hour);
  const remembered = {
    ...inThirtyDays,
    session: { ...inThirtyDays.session, rememberMe: true },
  };
  const calls = [];
  const { api } = account({
    me: (options) => {
      calls.push(options.background);
      return Promise.resolve(remembered);
    },
  });
  const { session, scheduler } = setup(api);
  await session.ensure();
  assert.deepEqual(scheduler.delays(), [hour]);
  scheduler.runDue();
  await settled();
  assert.deepEqual(calls, [false, true]);
  assert.deepEqual(scheduler.delays(), [hour]);
});

test('a passed or unchanged idle deadline is checked again after 30 s', async () => {
  let answer = view(-5_000);
  const { api } = account({ me: () => Promise.resolve(answer) });
  const { session, scheduler } = setup(api);
  await session.ensure();
  assert.deepEqual(scheduler.delays(), [30_000]);
  answer = view(10_000);
  scheduler.runDue();
  await settled();
  assert.deepEqual(scheduler.delays(), [10_000 + idleGraceMs]);
  // The deadline did not move: this clock runs ahead of the server's.
  scheduler.runDue();
  await settled();
  assert.deepEqual(scheduler.delays(), [30_000]);
});

test('a background check without an answer is repeated after a minute', async () => {
  let answer = Promise.resolve(view());
  const { api } = account({ me: () => answer });
  const { session, scheduler } = setup(api);
  await session.ensure();
  answer = Promise.reject(refused(0, 'Transport', 'unavailable'));
  scheduler.runDue();
  await settled();
  assert.equal(session.getSnapshot().status, 'active');
  assert.deepEqual(scheduler.delays(), [60_000]);
});

test('an answer that arrives after signing out or expiry keeps the guest', async () => {
  for (const [name, leave] of [
    ['sign-out', (session) => session.signOut()],
    ['expiry', (session) => session.expire()],
  ]) {
    let release;
    let answer = Promise.resolve(view());
    const { api } = account({ me: () => answer });
    const { session, scheduler, visibility, events } = setup(api);
    await session.ensure();
    answer = new Promise((resolve) => {
      release = resolve;
    });
    visibility.show();
    await leave(session);
    release(view());
    await settled();
    assert.equal(session.getSnapshot().status, 'anonymous', name);
    assert.deepEqual(scheduler.delays(), [], name);
    assert.deepEqual(events.tokens, ['csrf-session'], name);
  }
});

test('showing the tab again checks the session in the background', async () => {
  const { api, calls } = account();
  const { session, visibility } = setup(api);
  await session.ensure();
  visibility.show();
  await settled();
  assert.deepEqual(calls, [
    ['me', false],
    ['me', true],
  ]);
});

test('check() answers active, ended or unknown; a lost answer keeps the session', async () => {
  let answer = Promise.resolve(view());
  const { api } = account({ me: () => answer });
  const { session } = setup(api);
  await session.ensure();
  assert.equal(await session.check(), 'active');
  answer = Promise.reject(refused(0, 'Transport', 'unavailable'));
  assert.equal(await session.check(), 'unknown');
  assert.equal(session.getSnapshot().status, 'active');
  answer = Promise.reject(refused(401, 'Unauthenticated', 'not_committed'));
  assert.equal(await session.check(), 'ended');
});

test('signing in keeps the user and the session CSRF token', async () => {
  const { api, calls } = account();
  const { session, events } = setup(api);
  const result = await session.signIn({
    login: 'm.belova',
    password: 'secret12',
    rememberMe: false,
  });
  assert.equal(result.kind, 'committed');
  assert.equal(result.value.login, 'm.belova');
  assert.equal(session.getSnapshot().status, 'active');
  assert.deepEqual(calls, [['signIn', 'm.belova', 'cmd-1']]);
  assert.deepEqual(events.tokens, ['csrf-session']);
});

test('a refused sign-in passes the refusal through and stays anonymous', async () => {
  const { api } = account({
    signIn: () =>
      Promise.reject(refused(401, 'InvalidCredentials', 'not_committed')),
  });
  const { session } = setup(api);
  const result = await session.signIn({
    login: 'x',
    password: 'y',
    rememberMe: false,
  });
  assert.equal(result.kind, 'rejected');
  assert.equal(result.failure.code, 'InvalidCredentials');
  assert.equal(session.getSnapshot().status, 'unknown');
});

test('signing out ends the session; 401 counts as done; a lost answer fails', async () => {
  const { api, calls } = account();
  const { session, events } = setup(api);
  await session.ensure();
  assert.equal(await session.signOut(), 'done');
  assert.deepEqual(session.getSnapshot(), {
    status: 'anonymous',
    expired: false,
  });
  assert.equal(events.signedOut, 1);
  assert.deepEqual(calls.at(-1), ['signOut']);
  const gone = setup(
    account({
      signOut: () =>
        Promise.reject(refused(401, 'Unauthenticated', 'not_committed')),
    }).api,
  );
  await gone.session.ensure();
  assert.equal(await gone.session.signOut(), 'done');
  const lost = setup(
    account({
      signOut: () => Promise.reject(refused(0, 'Transport', 'unknown')),
    }).api,
  );
  await lost.session.ensure();
  assert.equal(await lost.session.signOut(), 'failed');
  assert.equal(lost.session.getSnapshot().status, 'active');
  assert.equal(lost.events.signedOut, 0);
});

test('an expired session keeps unknown attempts; signing out clears them', async () => {
  const { api } = account();
  const { session, commands, events } = setup(api);
  await session.ensure();
  await commands.run({
    key: 'orders.confirm',
    label: 'оформления заказа',
    execute: () => Promise.reject(refused(504, 'UpstreamTimeout', 'unknown')),
  });
  session.expire();
  assert.deepEqual(session.getSnapshot(), {
    status: 'anonymous',
    expired: true,
  });
  assert.equal(events.expired, 1);
  assert.deepEqual(
    commands.getSnapshot().map((attempt) => attempt.key),
    ['orders.confirm'],
  );
  await session.signIn({
    login: 'm.belova',
    password: 'secret12',
    rememberMe: false,
  });
  assert.equal(commands.getSnapshot().length, 1);
  await session.signOut();
  assert.deepEqual(commands.getSnapshot(), []);
});

const signedInAs = (userID) => ({
  ...view(),
  user: { ...view().user, userID },
});
const credentials = {
  login: 'm.belova',
  password: 'secret12',
  rememberMe: false,
};

test('another user forgets the previous one; the same user keeps attempts (X03)', async () => {
  let signInUser = 'u';
  let meUser = 'u';
  const { api } = account({
    me: () => Promise.resolve(signedInAs(meUser)),
    signIn: () => Promise.resolve(signedInAs(signInUser)),
  });
  const { session, commands, visibility, events } = setup(api);
  await session.ensure();
  await commands.run({
    key: 'orders.confirm',
    label: 'оформления заказа',
    execute: () => Promise.reject(refused(504, 'UpstreamTimeout', 'unknown')),
  });
  session.expire();
  await session.signIn(credentials);
  assert.equal(events.userChanged, 0);
  assert.equal(commands.getSnapshot().length, 1);
  session.expire();
  signInUser = 'v';
  await session.signIn(credentials);
  assert.equal(events.userChanged, 1);
  assert.deepEqual(commands.getSnapshot(), []);
  // Another tab signed in as someone else: /me brings that user.
  meUser = 'w';
  visibility.show();
  await settled();
  assert.equal(events.userChanged, 2);
  assert.equal(session.getSnapshot().user.userID, 'w');
});

test('401 on access ends the session instead of W17', async () => {
  const unauthenticated = () =>
    Promise.reject(refused(401, 'Unauthenticated', 'not_committed'));
  let meAnswer = () => Promise.resolve(view());
  let meCalls = 0;
  const { api } = account({
    me: () => {
      meCalls += 1;
      return meAnswer();
    },
  });
  const access = createAccessStore(
    { access: unauthenticated },
    { onUnauthenticated: () => session.check() },
  );
  const { session } = setup(api, {
    onExpired: () => {
      access.clear();
    },
  });
  await session.ensure();
  meAnswer = unauthenticated;
  const state = await access.ensure();
  assert.equal(meCalls, 2);
  assert.notEqual(state.status, 'unverified');
  assert.equal(access.getSnapshot().status, 'loading');
  assert.deepEqual(session.getSnapshot(), {
    status: 'anonymous',
    expired: true,
  });
  // The session is alive after all: access stays unverified (W17).
  const alive = setup(account().api);
  const aliveAccess = createAccessStore(
    { access: unauthenticated },
    { onUnauthenticated: () => alive.session.check() },
  );
  await alive.session.ensure();
  assert.equal((await aliveAccess.ensure()).status, 'unverified');
  assert.equal(alive.session.getSnapshot().status, 'active');
});

test('returnPath keeps only addresses inside the app', () => {
  const R = '33333333-3333-4333-8333-333333333333';
  assert.equal(
    returnPath(`/app/r/${R}/orders?step=draft`),
    `/app/r/${R}/orders?step=draft`,
  );
  assert.equal(returnPath('/app'), '/app');
  for (const raw of [
    null,
    '',
    '/apple',
    '//evil.example/app',
    'https://evil.example/app',
    '/app\\evil',
    '/login',
  ]) {
    assert.equal(returnPath(raw), '/app', String(raw));
  }
});

test('adopt() activates the new session like a sign-in', async () => {
  const { api } = account();
  const { session, events } = setup(api);
  await session.ensure();
  session.adopt({
    ...view(),
    user: { ...view().user, userID: 'w', login: 'other' },
    csrfToken: 'csrf-reset',
  });
  const state = session.getSnapshot();
  assert.equal(state.status, 'active');
  assert.equal(state.user.login, 'other');
  assert.equal(events.tokens.at(-1), 'csrf-reset');
  assert.equal(events.userChanged, 1);
});

test('updateUser() replaces the name of the signed-in user only', async () => {
  const { api } = account();
  const { session } = setup(api);
  await session.ensure();
  session.updateUser({ ...view().user, displayName: 'Марина Белова-Орлова' });
  assert.equal(session.getSnapshot().user.displayName, 'Марина Белова-Орлова');
  session.updateUser({ ...view().user, userID: 'w', displayName: 'Чужой' });
  assert.equal(session.getSnapshot().user.displayName, 'Марина Белова-Орлова');
});

test('forget() ends the session without DELETE and keeps the notice', async () => {
  const { api, calls } = account();
  const { session, scheduler, events } = setup(api);
  await session.ensure();
  session.forget({ kind: 'password-changed', login: 'm.belova' });
  assert.deepEqual(session.getSnapshot(), {
    status: 'anonymous',
    expired: false,
    notice: { kind: 'password-changed', login: 'm.belova' },
  });
  assert.equal(events.signedOut, 1);
  assert.equal(events.expired, 0);
  assert.deepEqual(scheduler.delays(), []);
  assert.ok(!calls.some(([name]) => name === 'signOut'));
});

test('signOut() with a notice keeps it for the sign-in page', async () => {
  const { api } = account();
  const { session } = setup(api);
  await session.ensure();
  assert.equal(
    await session.signOut({ kind: 'password-unknown', login: 'm.belova' }),
    'done',
  );
  assert.deepEqual(session.getSnapshot().notice, {
    kind: 'password-unknown',
    login: 'm.belova',
  });
});

test('a /me answer that arrives after forget() keeps the guest', async () => {
  let answer;
  const { api } = account({
    me: () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  });
  const { session } = setup(api);
  const pending = session.ensure();
  session.forget();
  answer(view());
  await pending;
  await settled();
  assert.equal(session.getSnapshot().status, 'anonymous');
});
