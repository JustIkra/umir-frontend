import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  createLiveSync,
  reconnectDelayMs,
  staleAfterMs,
  timeRefreshMs,
} from '../../src/application/live-sync.ts';

const R = '33333333-3333-4333-8333-333333333333';
const Q = '55555555-5555-4555-8555-555555555555';
const E1 = '44444444-4444-4444-8444-444444444444';
const E2 = '66666666-6666-4666-8666-666666666666';
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

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
  };
}

function manualFeed() {
  const feed = {
    opened: [],
    active: undefined,
    subscribe(restaurantID, onEvent, onStatus) {
      feed.opened.push(restaurantID);
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

function setup({ session = 'active' } = {}) {
  const feed = manualFeed();
  const scheduler = manualScheduler();
  const visibility = manualVisibility();
  const marks = [];
  const ended = [];
  const refused = [];
  let resolves = 0;
  const checks = { count: 0, answer: session };
  const live = createLiveSync({
    feed,
    scheduler,
    visibility,
    sessionCheck: {
      check: () => {
        checks.count += 1;
        return Promise.resolve(checks.answer);
      },
    },
    models: {
      markStale: (restaurantID, topics) => marks.push([restaurantID, topics]),
      markTime: (restaurantID) => marks.push([restaurantID, 'time']),
    },
    onAccessEnded: (restaurantID, reason) => ended.push([restaurantID, reason]),
    onRefused: (restaurantID) => refused.push(restaurantID),
    resolvePending: () => {
      resolves += 1;
      return Promise.resolve();
    },
  });
  return {
    live,
    feed,
    scheduler,
    visibility,
    marks,
    ended,
    refused,
    checks,
    resolves: () => resolves,
  };
}

const change = (sequence, topics, epoch = E1, tenantID = R) => ({
  type: 'change',
  tenantID,
  epoch,
  sequence,
  topics,
});

test('start opens the restaurant stream; stop closes it', () => {
  const { live, feed } = setup();
  live.start(R);
  assert.deepEqual(feed.opened, [R]);
  assert.equal(live.getSnapshot().restaurantID, R);
  assert.equal(live.getSnapshot().connection, 'connecting');
  feed.status('open');
  assert.equal(live.getSnapshot().connection, 'open');
  live.stop();
  assert.equal(feed.active, undefined);
  assert.equal(live.getSnapshot().restaurantID, undefined);
});

test('starting another restaurant switches the stream', () => {
  const { live, feed } = setup();
  live.start(R);
  live.start(R);
  live.start(Q);
  assert.deepEqual(feed.opened, [R, Q]);
});

test('a change marks only its topics; an older sequence changes nothing; a new epoch marks all', () => {
  const { live, feed, marks } = setup();
  live.start(R);
  feed.status('open');
  feed.emit(change(5n, ['stock']));
  feed.emit(change(6n, ['menu', 'orders']));
  feed.emit(change(6n, ['catalog']));
  feed.emit(change(1n, ['catalog'], E2));
  assert.deepEqual(marks, [
    [R, 'all'],
    [R, ['menu', 'orders']],
    [R, 'all'],
  ]);
});

test('refresh-required marks everything; later changes of that epoch mark topics', () => {
  const { live, feed, marks } = setup();
  live.start(R);
  feed.emit({ type: 'refresh-required', tenantID: R, epoch: E1 });
  feed.emit(change(1n, ['stock']));
  assert.deepEqual(marks, [
    [R, 'all'],
    [R, ['stock']],
  ]);
});

test('events of another restaurant are ignored', () => {
  const { live, feed, marks } = setup();
  live.start(R);
  feed.emit(change(1n, ['stock'], E1, Q));
  feed.emit({ type: 'access-ended', tenantID: Q, reason: 'revoked' });
  assert.deepEqual(marks, []);
  assert.equal(live.getSnapshot().restaurantID, R);
});

test('a hidden tab keeps the topics and marks them once when shown', () => {
  const { live, feed, visibility, marks } = setup();
  live.start(R);
  feed.emit({ type: 'refresh-required', tenantID: R, epoch: E1 });
  marks.length = 0;
  visibility.set(false);
  feed.emit(change(1n, ['stock']));
  feed.emit(change(2n, ['menu']));
  assert.deepEqual(marks, []);
  visibility.set(true);
  assert.deepEqual(marks, [[R, ['stock', 'menu']]]);
  visibility.set(false);
  feed.emit(change(3n, ['stock']));
  feed.emit({ type: 'refresh-required', tenantID: R, epoch: E1 });
  visibility.set(true);
  assert.deepEqual(marks.at(-1), [R, 'all']);
});

test('time-dependent models are marked every minute, deferred while hidden', () => {
  const { live, scheduler, visibility, marks } = setup();
  live.start(R);
  scheduler.advance(timeRefreshMs);
  assert.deepEqual(marks, [[R, 'time']]);
  visibility.set(false);
  scheduler.advance(timeRefreshMs);
  assert.equal(marks.length, 1);
  visibility.set(true);
  assert.deepEqual(marks.at(-1), [R, 'time']);
});

test('revoked or deleted access stops the stream for good', () => {
  for (const reason of ['revoked', 'deleted', 'session-expired']) {
    const { live, feed, scheduler, ended } = setup();
    live.start(R);
    feed.emit({ type: 'access-ended', tenantID: R, reason });
    assert.deepEqual(ended, [[R, reason]]);
    assert.equal(live.getSnapshot().restaurantID, undefined);
    scheduler.advance(reconnectDelayMs * 3);
    assert.deepEqual(feed.opened, [R], reason);
  }
});

test('auth-unavailable reconnects after the session check answers', async () => {
  const { live, feed, scheduler, ended, checks } = setup();
  live.start(R);
  feed.emit({ type: 'access-ended', tenantID: R, reason: 'auth-unavailable' });
  assert.deepEqual(ended, [[R, 'auth-unavailable']]);
  await settled();
  assert.equal(checks.count, 1);
  scheduler.advance(reconnectDelayMs);
  assert.deepEqual(feed.opened, [R, R]);
});

test('a refused stream checks the session: ended stops, otherwise reconnect', async () => {
  const active = setup();
  active.live.start(R);
  active.feed.status('closed');
  await settled();
  active.scheduler.advance(reconnectDelayMs);
  assert.deepEqual(active.feed.opened, [R, R]);
  const ended = setup({ session: 'ended' });
  ended.live.start(R);
  ended.feed.status('closed');
  await settled();
  ended.scheduler.advance(reconnectDelayMs);
  assert.deepEqual(ended.feed.opened, [R]);
  assert.equal(ended.live.getSnapshot().restaurantID, undefined);
  assert.deepEqual(ended.refused, []);
});

test('successive refusals wait 3, 6, 12, 24, 48 and then 60 s; an open stream starts again from 3 s', async () => {
  const { live, feed, scheduler } = setup();
  live.start(R);
  const refuseAndWait = async (delayMs) => {
    const opened = feed.opened.length;
    feed.status('closed');
    await settled();
    scheduler.advance(delayMs - 1);
    assert.equal(feed.opened.length, opened, `before ${String(delayMs)} ms`);
    scheduler.advance(1);
    assert.equal(feed.opened.length, opened + 1, `after ${String(delayMs)} ms`);
  };
  for (const delayMs of [3_000, 6_000, 12_000, 24_000, 48_000, 60_000, 60_000])
    await refuseAndWait(delayMs);
  feed.status('open');
  await refuseAndWait(3_000);
  await refuseAndWait(6_000);
});

test('each refusal with a live session re-reads access in the background', async () => {
  const { live, feed, scheduler, refused, checks } = setup();
  live.start(R);
  feed.status('closed');
  await settled();
  assert.deepEqual(refused, [R]);
  scheduler.advance(reconnectDelayMs);
  feed.status('closed');
  await settled();
  assert.deepEqual(refused, [R, R]);
  // Without an answer about the session, access is not re-read.
  checks.answer = 'unknown';
  scheduler.advance(reconnectDelayMs * 2);
  feed.status('closed');
  await settled();
  assert.deepEqual(refused, [R, R]);
  // auth-unavailable is not a refusal of the stream.
  checks.answer = 'active';
  scheduler.advance(reconnectDelayMs * 4);
  feed.emit({ type: 'access-ended', tenantID: R, reason: 'auth-unavailable' });
  await settled();
  assert.deepEqual(refused, [R, R]);
});

test('the data is stale after staleAfterMs without an open stream', () => {
  const { live, feed, scheduler } = setup();
  live.start(R);
  scheduler.advance(staleAfterMs - 1);
  assert.equal(live.getSnapshot().stale, false);
  scheduler.advance(1);
  assert.equal(live.getSnapshot().stale, true);
  feed.status('open');
  assert.equal(live.getSnapshot().stale, false);
});

test('pending attempts are checked once per burst of signals', async () => {
  const { live, feed, resolves } = setup();
  live.start(R);
  feed.status('open');
  feed.emit({ type: 'refresh-required', tenantID: R, epoch: E1 });
  feed.emit(change(1n, ['orders']));
  feed.emit(change(2n, ['orders']));
  await settled();
  assert.equal(resolves(), 2);
});
