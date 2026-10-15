import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { ApiError, localFailure } from '../../src/application/api.ts';
import { createChallengeFlow } from '../../src/application/challenge-flow.ts';
import { createCommandRunner } from '../../src/application/commands.ts';
import { createEpochRegistry } from '../../src/application/epochs.ts';

const C1 = '44444444-4444-4444-8444-444444444444';
const C2 = '55555555-5555-4555-8555-555555555555';
const keys = { begin: 'k.begin', verify: 'k.verify', done: 'k.done' };
const labels = { begin: 'a', verify: 'b', done: 'c' };
const instant = { iso: '2026-10-15T10:00:00Z', epochMs: 1 };
const record = (challengeID) => ({
  challenge: {
    challengeID,
    expiresAt: instant,
    resendAvailableAt: instant,
    state: 'pending',
  },
});
const refused = (status, code, extra = {}) =>
  new ApiError({
    ...localFailure(code, 'not_committed', status),
    retryable: false,
    ...extra,
  });

function setup({ initial } = {}) {
  const discarded = [];
  const saved = [];
  let n = 0;
  const runner = createCommandRunner({
    newId: () => `cmd-${String((n += 1))}`,
    now: () => 1000,
    epochs: createEpochRegistry(),
    onReset: () => {},
  });
  const commands = {
    ...runner,
    discard: (key) => {
      discarded.push(key);
      runner.discard(key);
    },
  };
  let abandoned = 0;
  const flow = createChallengeFlow({
    commands,
    now: () => 1000,
    storage: {
      save: (value) => saved.push(value),
      clear: () => saved.push(undefined),
    },
    initial,
    keys,
    labels,
    notices: {
      unknown: (action) => ({ kind: 'unknown', action }),
      limited: (untilMs) => ({ kind: 'limited', untilMs }),
      unavailable: { kind: 'unavailable' },
    },
    view: () => ({ busy: flow.busy, notice: flow.notice, id: flow.record }),
    abandon: () => {
      abandoned += 1;
      flow.reset();
    },
  });
  return { flow, discarded, saved, abandoned: () => abandoned };
}

test('another challenge discards every key but the code request', () => {
  const { flow, discarded, saved } = setup({ initial: record(C1) });
  flow.keep(record(C1));
  assert.deepEqual(discarded, []);
  flow.keep(record(C2));
  assert.deepEqual(discarded.sort(), ['k.done', 'k.verify']);
  assert.equal(saved.length, 2);
});

test('reset() discards every key and finish() keeps the result', () => {
  const { flow, discarded, saved } = setup({ initial: record(C1) });
  const before = flow.generation;
  flow.reset();
  assert.deepEqual(discarded.sort(), ['k.begin', 'k.done', 'k.verify']);
  assert.equal(flow.record, undefined);
  assert.equal(flow.generation, before + 1);
  assert.equal(saved.at(-1), undefined);
  flow.memory.password = 'secret';
  flow.finish();
  assert.equal(flow.finished, true);
  assert.equal(flow.memory.password, '');
  flow.reset();
  assert.equal(flow.finished, false);
});

test('reset(false) leaves the saved record to the caller', () => {
  const { flow, saved } = setup({ initial: record(C1) });
  flow.reset(false);
  assert.equal(flow.record, undefined);
  assert.deepEqual(saved, []);
});

test('the snapshot is read on first use and renewed by show()', () => {
  const { flow } = setup();
  const first = flow.getSnapshot();
  assert.equal(flow.getSnapshot(), first);
  let heard = 0;
  flow.subscribe(() => {
    heard += 1;
  });
  flow.show({ kind: 'resent' });
  assert.notEqual(flow.getSnapshot(), first);
  assert.deepEqual(flow.getSnapshot().notice, { kind: 'resent' });
  assert.equal(heard, 1);
});

test('send() is busy until the answer, and a stale answer leaves busy alone', async () => {
  const { flow } = setup();
  const own = flow.generation;
  const pending = flow.send(own, 'begin', () => Promise.resolve(1));
  assert.equal(flow.busy, true);
  assert.equal((await pending).kind, 'committed');
  assert.equal(flow.busy, false);

  const stale = flow.send(flow.generation, 'verify', () => Promise.resolve(1));
  flow.reset();
  flow.hold();
  await stale;
  assert.equal(flow.busy, true);
  assert.equal(flow.dropped(own), true);
  assert.equal(flow.dropped(flow.generation), false);
});

test('refused() applies the common rules after the specific ones', async () => {
  const { flow, abandoned } = setup();
  const run = async (error) => {
    const result = await flow.send(flow.generation, 'verify', () =>
      Promise.reject(error),
    );
    return result;
  };
  const specific = () => ({ kind: 'wrong-code' });
  flow.refused(await run(refused(400, 'InvalidArgument')), 'verify', specific);
  assert.deepEqual(flow.notice, { kind: 'wrong-code' });
  flow.refused(await run(refused(400, 'X')), 'verify', () => 'silent');
  assert.equal(flow.notice, undefined);
  flow.refused(
    await run(refused(429, 'RateLimited', { retryAfterSeconds: 5 })),
    'verify',
    () => undefined,
  );
  assert.deepEqual(flow.notice, { kind: 'limited', untilMs: 6000 });
  flow.refused(
    await run(refused(429, 'RateLimited')),
    'verify',
    () => undefined,
  );
  assert.deepEqual(flow.notice, { kind: 'limited', untilMs: 61_000 });
  flow.refused(
    await run(refused(503, 'AuthUnavailable')),
    'verify',
    () => undefined,
  );
  assert.deepEqual(flow.notice, { kind: 'unavailable' });
  assert.equal(abandoned(), 0);
  flow.refused(await run(refused(401, 'Unauthenticated')), 'verify', specific);
  assert.equal(abandoned(), 1);
  assert.equal(flow.notice, undefined);
  assert.deepEqual(flow.startOver({ kind: 'expired' }), { kind: 'expired' });
  assert.equal(abandoned(), 2);
});

test('a lost answer becomes the unknown notice of its action', async () => {
  const { flow } = setup();
  const result = await flow.send(flow.generation, 'done', () =>
    Promise.reject(
      new ApiError({
        ...localFailure('Transport', 'unknown', 0),
        retryable: false,
      }),
    ),
  );
  flow.refused(result, 'done', () => undefined);
  assert.deepEqual(flow.notice, { kind: 'unknown', action: 'done' });
});
