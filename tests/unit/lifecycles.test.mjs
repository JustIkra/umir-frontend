import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { ApiError, localFailure } from '../../src/application/api.ts';
import {
  createLifecycleTracker,
  isFinished,
  pollDelaysMs,
  stallAfterMs,
} from '../../src/application/lifecycles.ts';

const ORG = '11111111-1111-4111-8111-111111111111';
const OP = '22222222-2222-4222-8222-222222222222';
const OP2 = '22222222-2222-4222-8222-222222222223';

const observation = (changes = {}) => ({
  operationID: OP,
  commandID: '33333333-3333-4333-8333-333333333333',
  orgID: ORG,
  restaurantIDs: ['44444444-4444-4444-8444-444444444444'],
  lifecycle: 'registering',
  lifecycleVersion: '1',
  cleanup: 'not_required',
  services: [],
  ...changes,
});

const ready = (changes) => observation({ lifecycle: 'ready', ...changes });
const failure = (status) =>
  new ApiError({ ...localFailure('Failure', 'unavailable', status) });

// Yields until the promises of the polled answers settled.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// The scheduler keeps callbacks; the test runs them itself.
function setup(...script) {
  const timers = [];
  const calls = [];
  const settled = [];
  const clock = { now: 1_000_000 };
  const answers = [...script];
  const tracker = createLifecycleTracker({
    api: {
      lifecycle: (orgID, operationID) => {
        calls.push([orgID, operationID]);
        const next = answers.shift();
        return next instanceof Error
          ? Promise.reject(next)
          : Promise.resolve(next);
      },
    },
    scheduler: {
      schedule(delayMs, callback) {
        const timer = { delayMs, callback, cancelled: false, fired: false };
        timers.push(timer);
        return () => {
          timer.cancelled = true;
        };
      },
    },
    now: () => clock.now,
    onSettled: () => {
      settled.push(clock.now);
    },
  });
  const active = () => timers.filter((t) => !t.cancelled && !t.fired);
  // Runs the only waiting timer and lets the poll answer.
  async function fire() {
    const [timer] = active();
    assert.ok(timer, 'a timer waits');
    timer.fired = true;
    timer.callback();
    await flush();
    return timer;
  }
  return { tracker, timers, calls, settled, clock, active, fire };
}

test('isFinished: creation is ready, deletion is deleted with cleanup', () => {
  for (const kind of ['create-organization', 'create-restaurant']) {
    assert.equal(isFinished(kind, observation()), false);
    assert.equal(isFinished(kind, ready()), true);
  }
  for (const kind of ['delete-restaurant', 'delete-organization']) {
    assert.equal(
      isFinished(
        kind,
        observation({ lifecycle: 'deleting', cleanup: 'pending' }),
      ),
      false,
    );
    assert.equal(
      isFinished(
        kind,
        observation({ lifecycle: 'deleted', cleanup: 'pending' }),
      ),
      false,
    );
    assert.equal(
      isFinished(
        kind,
        observation({ lifecycle: 'deleted', cleanup: 'complete' }),
      ),
      true,
    );
  }
});

test('a registering restaurant is polled until it is ready', async () => {
  const t = setup(observation({ lifecycleVersion: '2' }), ready());
  t.tracker.follow('create-restaurant', 'Центр', observation());
  assert.equal(t.tracker.getSnapshot().length, 1);
  assert.equal(t.tracker.getSnapshot()[0].status, 'following');
  assert.equal(t.tracker.getSnapshot()[0].startedAt, t.clock.now);
  assert.equal(t.active().length, 1);
  assert.equal(t.active()[0].delayMs, 1000);

  await t.fire();
  assert.deepEqual(t.calls, [[ORG, OP]]);
  assert.equal(t.tracker.getSnapshot()[0].status, 'following');
  assert.equal(t.tracker.getSnapshot()[0].lifecycle.lifecycleVersion, '2');
  assert.equal(t.settled.length, 0);

  await t.fire();
  const [operation] = t.tracker.getSnapshot();
  assert.equal(operation.status, 'finished');
  assert.equal(operation.lifecycle.lifecycle, 'ready');
  assert.equal(operation.kind, 'create-restaurant');
  assert.equal(operation.name, 'Центр');
  assert.equal(operation.orgID, ORG);
  assert.equal(operation.operationID, OP);
  assert.equal(t.settled.length, 1);
  assert.equal(t.active().length, 0);
});

test('delays back off and stay at the last one', async () => {
  assert.deepEqual(pollDelaysMs, [1000, 2000, 4000, 8000, 16000, 30000]);
  const t = setup(...Array.from({ length: 9 }, () => observation()));
  t.tracker.follow('create-restaurant', 'Центр', observation());
  const delays = [t.active()[0].delayMs];
  for (let poll = 0; poll < 8; poll += 1) {
    // The time stays below the stall limit: only the delays are checked.
    await t.fire();
    delays.push(t.active()[0].delayMs);
  }
  assert.deepEqual(
    delays,
    [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000],
  );
});

test('a deletion finishes when the data is deleted and cleaned up', async () => {
  const t = setup(
    observation({ lifecycle: 'deleted', cleanup: 'pending' }),
    observation({ lifecycle: 'deleted', cleanup: 'complete' }),
  );
  t.tracker.follow(
    'delete-restaurant',
    'Центр',
    observation({ lifecycle: 'deleting', cleanup: 'pending' }),
  );
  await t.fire();
  assert.equal(t.tracker.getSnapshot()[0].status, 'following');
  assert.equal(t.settled.length, 0);
  await t.fire();
  assert.equal(t.tracker.getSnapshot()[0].status, 'finished');
  assert.equal(t.settled.length, 1);
  assert.equal(t.active().length, 0);
});

test('an operation finished when accepted settles at once', () => {
  const t = setup();
  t.tracker.follow('create-organization', 'Сеть', ready());
  assert.equal(t.tracker.getSnapshot()[0].status, 'finished');
  assert.equal(t.settled.length, 1);
  assert.equal(t.timers.length, 0);
});

test('without finishing in 90 seconds the operation stalls and retry resumes', async () => {
  assert.equal(stallAfterMs, 90_000);
  const t = setup(observation(), observation(), ready());
  t.tracker.follow('create-restaurant', 'Центр', observation());
  const startedAt = t.clock.now;
  t.clock.now = startedAt + 89_000;
  await t.fire();
  assert.equal(t.tracker.getSnapshot()[0].status, 'following');
  t.clock.now = startedAt + 90_000;
  await t.fire();
  assert.equal(t.tracker.getSnapshot()[0].status, 'stalled');
  assert.equal(t.active().length, 0);
  assert.equal(t.settled.length, 0);

  t.tracker.retry(OP);
  const [operation] = t.tracker.getSnapshot();
  assert.equal(operation.status, 'following');
  assert.equal(operation.startedAt, startedAt + 90_000);
  assert.equal(t.active().length, 1);
  assert.equal(t.active()[0].delayMs, 1000);

  await t.fire();
  assert.equal(t.tracker.getSnapshot()[0].status, 'finished');
  assert.equal(t.settled.length, 1);
});

test('retry does nothing for an operation that is not stalled', async () => {
  const t = setup();
  t.tracker.follow('create-restaurant', 'Центр', observation());
  t.tracker.retry(OP);
  t.tracker.retry(OP2);
  assert.equal(t.timers.length, 1);
  assert.equal(t.tracker.getSnapshot().length, 1);
});

test('410, 404 and 403 lose the operation and settle', async () => {
  for (const status of [410, 404, 403]) {
    const t = setup(failure(status));
    t.tracker.follow('delete-restaurant', 'Центр', observation());
    await t.fire();
    assert.equal(t.tracker.getSnapshot()[0].status, 'lost');
    assert.equal(t.settled.length, 1);
    assert.equal(t.active().length, 0);
  }
});

test('other failures keep polling on schedule', async () => {
  const t = setup(failure(503), new Error('network'), ready());
  t.tracker.follow('create-restaurant', 'Центр', observation());
  await t.fire();
  assert.equal(t.tracker.getSnapshot()[0].status, 'following');
  assert.equal(t.active()[0].delayMs, 2000);
  await t.fire();
  assert.equal(t.tracker.getSnapshot()[0].status, 'following');
  assert.equal(t.active()[0].delayMs, 4000);
  assert.equal(t.settled.length, 0);
  await t.fire();
  assert.equal(t.tracker.getSnapshot()[0].status, 'finished');
});

test('following the same operation again adds nothing', async () => {
  const t = setup();
  t.tracker.follow('create-restaurant', 'Центр', observation());
  t.tracker.follow('create-restaurant', 'Центр', observation());
  t.tracker.follow('create-restaurant', 'Другой', observation());
  assert.equal(t.tracker.getSnapshot().length, 1);
  assert.equal(t.tracker.getSnapshot()[0].name, 'Центр');
  assert.equal(t.timers.length, 1);
  t.tracker.follow(
    'create-restaurant',
    'Другой',
    observation({ operationID: OP2 }),
  );
  assert.equal(t.tracker.getSnapshot().length, 2);
});

test('forget cancels the timer and drops the operation', async () => {
  const t = setup(ready());
  t.tracker.follow('create-restaurant', 'Центр', observation());
  t.tracker.forget(OP);
  assert.equal(t.tracker.getSnapshot().length, 0);
  assert.equal(t.timers.filter((x) => x.cancelled).length, 1);
});

test('clear cancels every timer and an answer in flight is dropped', async () => {
  const t = setup(ready());
  t.tracker.follow('create-restaurant', 'Центр', observation());
  t.tracker.follow(
    'delete-organization',
    'Сеть',
    observation({
      operationID: OP2,
      lifecycle: 'deleting',
      cleanup: 'pending',
    }),
  );
  const [first] = t.active();
  first.fired = true;
  first.callback();
  t.tracker.clear();
  await flush();
  assert.equal(t.tracker.getSnapshot().length, 0);
  assert.equal(t.settled.length, 0);
  assert.equal(t.active().length, 0);
  assert.equal(t.timers.filter((x) => x.cancelled).length, 1);
});

test('subscribers hear about every change and the snapshot is stable between', async () => {
  const t = setup(ready());
  let heard = 0;
  const stop = t.tracker.subscribe(() => {
    heard += 1;
  });
  const empty = t.tracker.getSnapshot();
  assert.equal(t.tracker.getSnapshot(), empty);
  t.tracker.follow('create-restaurant', 'Центр', observation());
  const one = t.tracker.getSnapshot();
  assert.equal(t.tracker.getSnapshot(), one);
  assert.equal(heard, 1);
  await t.fire();
  assert.equal(heard, 2);
  stop();
  t.tracker.clear();
  assert.equal(heard, 2);
});
