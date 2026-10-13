import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { ApiError, localFailure } from '../../src/application/api.ts';
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

function setup(api) {
  const commands = createCommandRunner({
    newId: () => 'cmd-1',
    now: () => 0,
    epochs: createEpochRegistry(),
    onReset: () => {},
  });
  const scheduler = manualScheduler();
  const visibility = manualVisibility();
  const events = { tokens: [], signedOut: 0, expired: 0 };
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
