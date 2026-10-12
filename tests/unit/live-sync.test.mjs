import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  createLiveSync,
  reconnectDelayMs,
  staleAfterMs,
} from '../../src/application/live-sync.ts';

// Virtual time: advance() runs due callbacks in order.
function manualScheduler() {
  let now = 0;
  const tasks = [];
  return {
    schedule(delayMs, callback) {
      const task = { at: now + delayMs, callback, done: false };
      tasks.push(task);
      return () => {
        task.done = true;
      };
    },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = tasks
          .filter((task) => !task.done && task.at <= until)
          .sort((left, right) => left.at - right.at)[0];
        if (!due) break;
        now = due.at;
        due.done = true;
        due.callback();
      }
      now = until;
    },
    pending: () => tasks.filter((task) => !task.done).length,
  };
}

function manualFeed() {
  const feed = {
    subscriptions: 0,
    active: undefined,
    subscribe(onEvent, onStatus) {
      feed.subscriptions += 1;
      const subscription = { onEvent, onStatus };
      feed.active = subscription;
      return () => {
        if (feed.active === subscription) feed.active = undefined;
      };
    },
    status: (status) => feed.active.onStatus(status),
    emit: (event) => feed.active.onEvent(event),
  };
  return feed;
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
    set(visible) {
      visibility.visible = visible;
      for (const listener of listeners) listener();
    },
  };
  return visibility;
}

function recordingTarget() {
  const marks = [];
  return { marks, markStale: (scope) => marks.push(scope) };
}

// Answers every check with the given state.
const sessionIs = (status) => ({ check: () => Promise.resolve(status) });

// Holds each check until the test answers it.
function heldSessionCheck() {
  const answers = [];
  return {
    answers,
    check: () =>
      new Promise((resolve) => {
        answers.push(resolve);
      }),
  };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup({
  resolvePending = () => Promise.resolve(),
  session = sessionIs('active'),
} = {}) {
  const feed = manualFeed();
  const scheduler = manualScheduler();
  const visibility = manualVisibility();
  const sync = createLiveSync({
    feed,
    scheduler,
    visibility,
    sessionCheck: session,
    resolvePending,
  });
  const target = recordingTarget();
  sync.track(target);
  sync.start();
  feed.status('open');
  return { feed, scheduler, visibility, sync, target };
}

const change = (seq, epoch = 'e1') => ({
  type: 'change',
  epoch,
  seq: BigInt(seq),
});

test('the first change and every larger seq mark all models stale', () => {
  const { feed, target } = setup();
  feed.emit(change('9007199254740992'));
  feed.emit(change('9007199254740993'));
  feed.emit(change('9007199254740993'));
  feed.emit(change('9007199254740991'));
  assert.deepEqual(target.marks, ['all', 'all']);
});

test('a new epoch re-reads everything and restarts the comparison', () => {
  const { feed, target } = setup();
  feed.emit(change('40'));
  feed.emit(change('1', 'e2'));
  feed.emit(change('1', 'e2'));
  feed.emit(change('2', 'e2'));
  assert.deepEqual(target.marks, ['all', 'all', 'all']);
});

test('a tick updates the server time and marks time models stale', () => {
  const { feed, sync, target } = setup();
  feed.emit({ type: 'tick', serverTime: '2026-10-12T12:01:00+03:00' });
  assert.equal(sync.getSnapshot().serverTime, '2026-10-12T12:01:00+03:00');
  assert.deepEqual(target.marks, ['time']);
});

test('session deadlines are stored', () => {
  const { feed, sync } = setup();
  feed.emit({
    type: 'session',
    idleExpiresAt: '2026-10-12T12:30:00+03:00',
    absoluteExpiresAt: '2026-10-12T20:00:00+03:00',
  });
  assert.deepEqual(sync.getSnapshot().session, {
    idleExpiresAt: '2026-10-12T12:30:00+03:00',
    absoluteExpiresAt: '2026-10-12T20:00:00+03:00',
  });
});

test('a hidden tab waits and re-reads once when shown', () => {
  const { feed, visibility, target } = setup();
  visibility.set(false);
  feed.emit(change('1'));
  feed.emit({ type: 'tick', serverTime: '2026-10-12T12:01:00+03:00' });
  feed.emit(change('2'));
  assert.deepEqual(target.marks, []);
  visibility.set(true);
  visibility.set(true);
  assert.deepEqual(target.marks, ['all']);
});

test('a hidden tab that only saw ticks re-reads time models', () => {
  const { feed, visibility, target } = setup();
  feed.emit(change('1'));
  visibility.set(false);
  feed.emit({ type: 'tick', serverTime: '2026-10-12T12:01:00+03:00' });
  visibility.set(true);
  assert.deepEqual(target.marks, ['all', 'time']);
});

test('data turns stale after 10 s without an open stream', () => {
  const { feed, scheduler, sync } = setup();
  feed.status('connecting');
  scheduler.advance(staleAfterMs - 1);
  assert.equal(sync.getSnapshot().stale, false);
  scheduler.advance(1);
  assert.equal(sync.getSnapshot().stale, true);
  feed.status('open');
  assert.equal(sync.getSnapshot().stale, false);
});

test('reconnect attempts do not restart the 10 s count', async () => {
  const { feed, scheduler, sync } = setup();
  feed.status('connecting');
  scheduler.advance(6000);
  feed.status('closed');
  await settled();
  scheduler.advance(reconnectDelayMs);
  assert.equal(feed.subscriptions, 2);
  scheduler.advance(staleAfterMs - 6000 - reconnectDelayMs);
  assert.equal(sync.getSnapshot().stale, true);
});

test('the stream counts as not open from start', () => {
  const feed = manualFeed();
  const scheduler = manualScheduler();
  const sync = createLiveSync({
    feed,
    scheduler,
    visibility: manualVisibility(),
    sessionCheck: sessionIs('active'),
    resolvePending: () => Promise.resolve(),
  });
  sync.start();
  assert.equal(sync.getSnapshot().connection, 'connecting');
  scheduler.advance(staleAfterMs);
  assert.equal(sync.getSnapshot().stale, true);
});

test('an unavailable warehouse makes data stale while the stream is open', () => {
  const { feed, sync } = setup();
  feed.emit({ type: 'upstream', available: false });
  assert.equal(sync.getSnapshot().stale, true);
  feed.emit({ type: 'upstream', available: true });
  assert.equal(sync.getSnapshot().stale, false);
});

test('a closed feed of an active session is subscribed again after the retry delay', async () => {
  const { feed, scheduler } = setup();
  feed.status('closed');
  assert.equal(feed.active, undefined);
  await settled();
  scheduler.advance(reconnectDelayMs - 1);
  assert.equal(feed.subscriptions, 1);
  scheduler.advance(1);
  assert.equal(feed.subscriptions, 2);
});

test('a closed feed of an ended session stops for good', async () => {
  const { feed, scheduler, sync } = setup({ session: sessionIs('ended') });
  feed.status('closed');
  await settled();
  assert.equal(scheduler.pending(), 0);
  scheduler.advance(60_000);
  assert.equal(feed.subscriptions, 1);
  assert.deepEqual(sync.getSnapshot(), {
    connection: 'closed',
    stale: false,
    serverTime: undefined,
    session: undefined,
    sessionEnded: 'expired',
  });
});

test('an unknown or failed session check subscribes again', async () => {
  for (const session of [
    sessionIs('unknown'),
    { check: () => Promise.reject(new Error('offline')) },
  ]) {
    const { feed, scheduler, sync } = setup({ session });
    feed.status('closed');
    await settled();
    scheduler.advance(reconnectDelayMs);
    assert.equal(feed.subscriptions, 2);
    assert.equal(sync.getSnapshot().sessionEnded, undefined);
  }
});

test('the 10 s count runs while the session is checked', () => {
  const session = heldSessionCheck();
  const { feed, scheduler, sync } = setup({ session });
  feed.status('closed');
  scheduler.advance(staleAfterMs);
  assert.equal(session.answers.length, 1);
  assert.equal(sync.getSnapshot().stale, true);
});

test('stop during a session check does not subscribe again', async () => {
  const session = heldSessionCheck();
  const { feed, scheduler, sync } = setup({ session });
  feed.status('closed');
  sync.stop();
  session.answers[0]('active');
  await settled();
  assert.equal(scheduler.pending(), 0);
  scheduler.advance(60_000);
  assert.equal(feed.subscriptions, 1);
});

test('a restart ignores the answer of the check it replaced', async () => {
  const session = heldSessionCheck();
  const { feed, sync } = setup({ session });
  feed.status('closed');
  sync.stop();
  sync.start();
  session.answers[0]('ended');
  await settled();
  assert.equal(sync.getSnapshot().sessionEnded, undefined);
  assert.notEqual(feed.active, undefined);
});

function countingResolver() {
  const calls = [];
  const resolvePending = () =>
    new Promise((resolve) => {
      calls.push(resolve);
    });
  return { calls, resolvePending };
}

test('pending attempts are resolved once per change signal', async () => {
  const resolver = countingResolver();
  const { feed } = setup(resolver);
  feed.emit(change('1'));
  assert.equal(resolver.calls.length, 1);
  resolver.calls[0]();
  await settled();
  feed.emit(change('1'));
  assert.equal(resolver.calls.length, 1);
  feed.emit(change('2'));
  assert.equal(resolver.calls.length, 2);
});

test('a reconnect without new changes resolves attempts but re-reads nothing', async () => {
  const resolver = countingResolver();
  const { feed, target } = setup(resolver);
  feed.emit(change('5'));
  resolver.calls[0]();
  await settled();
  feed.status('connecting');
  feed.status('open');
  feed.emit(change('5'));
  assert.equal(resolver.calls.length, 2);
  assert.deepEqual(target.marks, ['all']);
});

test('resolve calls never overlap and signals during a call add one call', async () => {
  const resolver = countingResolver();
  const { feed } = setup(resolver);
  feed.emit(change('1'));
  feed.emit(change('2'));
  feed.emit(change('3'));
  assert.equal(resolver.calls.length, 1);
  resolver.calls[0]();
  await settled();
  assert.equal(resolver.calls.length, 2);
  resolver.calls[1]();
  await settled();
  assert.equal(resolver.calls.length, 2);
});

test('a failed resolve call does not block later signals', async () => {
  let calls = 0;
  const { feed } = setup({
    resolvePending: () => {
      calls += 1;
      return Promise.reject(new Error('UpstreamUnavailable'));
    },
  });
  feed.emit(change('1'));
  await settled();
  feed.emit(change('2'));
  assert.equal(calls, 2);
});

test('session-ended stops the stream for good', () => {
  const { feed, scheduler, sync, target } = setup();
  feed.emit({ type: 'session-ended', reason: 'expired' });
  assert.equal(feed.active, undefined);
  assert.equal(scheduler.pending(), 0);
  scheduler.advance(60_000);
  assert.equal(feed.subscriptions, 1);
  assert.deepEqual(sync.getSnapshot(), {
    connection: 'closed',
    stale: false,
    serverTime: undefined,
    session: undefined,
    sessionEnded: 'expired',
  });
  assert.deepEqual(target.marks, []);
});

test('stop cancels a scheduled reconnect and the stale timer', async () => {
  const { feed, scheduler, sync } = setup();
  feed.status('closed');
  await settled();
  assert.equal(scheduler.pending(), 2);
  sync.stop();
  assert.equal(scheduler.pending(), 0);
  scheduler.advance(60_000);
  assert.equal(feed.subscriptions, 1);
  assert.equal(sync.getSnapshot().connection, 'closed');
});
