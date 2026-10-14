import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { ApiError, localFailure } from '../../src/application/api.ts';
import { createCommandRunner } from '../../src/application/commands.ts';
import { createEpochRegistry } from '../../src/application/epochs.ts';
import {
  createWriteoffCommands,
  writeoffKey,
} from '../../src/application/writeoff-commands.ts';

const R = '33333333-3333-4333-8333-333333333333';
const EPOCH = '44444444-4444-4444-8444-444444444444';
const NEWER = '55555555-5555-4555-8555-555555555555';
const B = 'B1';
const refused = (status, code, outcome) =>
  new ApiError({ ...localFailure(code, outcome, status), retryable: false });
const lost = () => refused(0, 'Transport', 'unknown');
const result = {
  batchID: B,
  productID: 'P1',
  writtenOffQuantity: '5000',
  baseUnit: 'g',
  actorUserID: '11111111-1111-4111-8111-111111111111',
  confirmedAt: { iso: '2026-10-14T10:00:00+03:00', epochMs: 1 },
  eventID: 'writeoff-fact-1',
};
const confirmed = (value = result) => ({ context: {}, result: value });

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function setup({ read = true } = {}) {
  const epochs = createEpochRegistry();
  if (read) epochs.record(R, 'warehouse', EPOCH);
  const resets = [];
  let n = 0;
  const commands = createCommandRunner({
    newId: () => `cmd-${String((n += 1))}`,
    now: () => 0,
    epochs,
    onReset: (restaurantID) => resets.push(restaurantID),
  });
  const calls = [];
  // Answers per method: a value, a promise (answered later) or an error.
  const answers = { confirmWriteoff: [], lookupWriteoff: [] };
  const answer = (name, args) => {
    calls.push([name, ...args]);
    const queue = answers[name];
    if (queue.length === 0) return Promise.reject(new Error(`no ${name}`));
    const next = queue.shift();
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };
  const events = [];
  const writeoffs = createWriteoffCommands({
    api: {
      receiveDelivery: () => Promise.reject(new Error('not used')),
      confirmWriteoff: (...args) => answer('confirmWriteoff', args),
      lookupWriteoff: (...args) => answer('lookupWriteoff', args),
    },
    commands,
    restaurantID: R,
    markStale: (topics) => events.push(['stale', topics]),
    onUnauthenticated: () => events.push(['check']),
  });
  return { writeoffs, commands, epochs, calls, answers, events, resets };
}

const sentConfirm = (commandID, epoch = EPOCH) => [
  'confirmWriteoff',
  R,
  B,
  commandID,
  epoch,
];
const sentLookup = (commandID, epoch = EPOCH) => [
  'lookupWriteoff',
  R,
  { commandID, batchID: B, epoch },
];

// A confirm whose answer was lost: the attempt cmd-1 stays open.
async function unknownAttempt(context) {
  context.answers.confirmWriteoff.push(lost());
  assert.deepEqual(await context.writeoffs.confirm(B), { kind: 'unknown' });
  context.events.length = 0;
}

test('a confirmed writeoff marks stock stale and returns the result', async () => {
  const { writeoffs, calls, answers, events } = setup();
  answers.confirmWriteoff.push(confirmed());
  assert.deepEqual(await writeoffs.confirm(B), {
    kind: 'written-off',
    result,
  });
  assert.deepEqual(calls, [sentConfirm('cmd-1')]);
  assert.deepEqual(events, [['stale', ['stock']]]);
  assert.equal(writeoffs.pending(B), false);
});

test('refusals: list changes, other refusals, ended session, reset', async () => {
  const cases = [
    [
      refused(409, 'AlreadyWrittenOff', 'not_committed'),
      { kind: 'already' },
      true,
    ],
    [
      refused(409, 'NotPendingWriteoff', 'not_committed'),
      { kind: 'not-pending' },
      true,
    ],
    [
      refused(404, 'BatchNotFound', 'not_committed'),
      { kind: 'not-found' },
      true,
    ],
    [
      refused(503, 'UpstreamUnavailable', 'not_committed'),
      { kind: 'refused', code: 'UpstreamUnavailable' },
      false,
    ],
    [
      refused(401, 'Unauthenticated', 'not_committed'),
      { kind: 'ended' },
      false,
    ],
    [refused(409, 'RuntimeReset', 'indeterminate'), { kind: 'reset' }, false],
  ];
  for (const [answer, outcome, stale] of cases) {
    const { writeoffs, answers, events, resets } = setup();
    answers.confirmWriteoff.push(answer);
    assert.deepEqual(await writeoffs.confirm(B), outcome, answer.message);
    assert.equal(
      events.some(([name]) => name === 'stale'),
      stale,
      answer.message,
    );
    assert.equal(
      events.some(([name]) => name === 'check'),
      outcome.kind === 'ended',
      answer.message,
    );
    assert.deepEqual(resets, outcome.kind === 'reset' ? [R] : []);
    assert.equal(writeoffs.pending(B), false, answer.message);
  }
});

test('without a read of the warehouse epoch nothing is sent', async () => {
  const { writeoffs, calls } = setup({ read: false });
  assert.deepEqual(await writeoffs.confirm(B), {
    kind: 'refused',
    code: 'EpochUnknown',
  });
  assert.equal(calls.length, 0);
});

test('a lost answer leaves the batch pending; another batch is its own command', async () => {
  const context = setup();
  const { writeoffs, commands, calls, answers } = context;
  await unknownAttempt(context);
  assert.equal(writeoffs.pending(B), true);
  assert.deepEqual(
    commands.getSnapshot().map(({ key, label }) => [key, label]),
    [[writeoffKey(R, B), 'списания партии']],
  );
  answers.confirmWriteoff.push(confirmed({ ...result, batchID: 'B2' }));
  assert.equal((await writeoffs.confirm('B2')).kind, 'written-off');
  assert.deepEqual(calls[1], ['confirmWriteoff', R, 'B2', 'cmd-2', EPOCH]);
  assert.equal(writeoffs.pending('B2'), false);
  // Confirming the unknown batch again repeats its own command.
  answers.confirmWriteoff.push(confirmed());
  assert.equal((await writeoffs.confirm(B)).kind, 'written-off');
  assert.deepEqual(calls[2], sentConfirm('cmd-1'));
  assert.equal(writeoffs.pending(B), false);
});

test('a second confirm of the same batch while sending sends nothing', async () => {
  const { writeoffs, calls, answers } = setup();
  const answer = deferred();
  answers.confirmWriteoff.push(answer.promise);
  const first = writeoffs.confirm(B);
  const second = writeoffs.confirm(B);
  assert.equal(writeoffs.pending(B), true);
  answer.resolve(confirmed());
  assert.deepEqual(await first, { kind: 'written-off', result });
  assert.deepEqual(await second, { kind: 'written-off', result });
  assert.deepEqual(calls, [sentConfirm('cmd-1')]);
});

test('a check with pending observation resends the same command', async () => {
  for (const state of ['pending', 'unseen']) {
    const context = setup();
    const { writeoffs, epochs, calls, answers, events } = context;
    await unknownAttempt(context);
    // A newer read changed the epoch: the attempt keeps its own.
    epochs.record(R, 'warehouse', NEWER);
    answers.lookupWriteoff.push({ state });
    answers.confirmWriteoff.push(confirmed());
    assert.deepEqual(
      await writeoffs.check(B),
      { kind: 'written-off', result },
      state,
    );
    assert.deepEqual(
      calls,
      [sentConfirm('cmd-1'), sentLookup('cmd-1'), sentConfirm('cmd-1')],
      state,
    );
    assert.deepEqual(events, [['stale', ['stock']]], state);
    assert.equal(writeoffs.pending(B), false, state);
  }
});

test('a committed observation is the original result, without a resend', async () => {
  const context = setup();
  const { writeoffs, calls, answers, events } = context;
  await unknownAttempt(context);
  const original = { ...result, writtenOffQuantity: '4500' };
  answers.lookupWriteoff.push({ state: 'committed', result: original });
  assert.deepEqual(await writeoffs.check(B), {
    kind: 'written-off',
    result: original,
  });
  assert.deepEqual(calls, [sentConfirm('cmd-1'), sentLookup('cmd-1')]);
  assert.deepEqual(events, [['stale', ['stock']]]);
  assert.equal(writeoffs.pending(B), false);
});

test('a rejected observation is a refusal by its code', async () => {
  for (const [code, outcome, stale] of [
    ['AlreadyWrittenOff', { kind: 'already' }, true],
    ['NotPendingWriteoff', { kind: 'not-pending' }, true],
    ['BatchNotFound', { kind: 'not-found' }, true],
    ['InvalidRequest', { kind: 'refused', code: 'InvalidRequest' }, false],
  ]) {
    const context = setup();
    const { writeoffs, calls, answers, events } = context;
    await unknownAttempt(context);
    answers.lookupWriteoff.push({ state: 'rejected', code });
    assert.deepEqual(await writeoffs.check(B), outcome, code);
    assert.equal(calls.length, 2, code);
    assert.equal(events.length > 0, stale, code);
    assert.equal(writeoffs.pending(B), false, code);
  }
});

test('a failed check keeps the attempt; a later check settles it', async () => {
  const context = setup();
  const { writeoffs, calls, answers } = context;
  await unknownAttempt(context);
  answers.lookupWriteoff.push(refused(0, 'Transport', 'unavailable'));
  assert.deepEqual(await writeoffs.check(B), { kind: 'check-failed' });
  assert.equal(writeoffs.pending(B), true);
  answers.lookupWriteoff.push({ state: 'committed', result });
  assert.deepEqual(await writeoffs.check(B), { kind: 'written-off', result });
  assert.deepEqual(calls, [
    sentConfirm('cmd-1'),
    sentLookup('cmd-1'),
    sentLookup('cmd-1'),
  ]);
});

test('a check after a warehouse restart drops the attempt', async () => {
  const context = setup();
  const { writeoffs, answers, events } = context;
  await unknownAttempt(context);
  answers.lookupWriteoff.push(refused(409, 'RuntimeReset', 'indeterminate'));
  assert.deepEqual(await writeoffs.check(B), { kind: 'reset' });
  assert.equal(writeoffs.pending(B), false);
  assert.deepEqual(events, [['stale', ['stock']]]);
});

test('a check refused for the session keeps the attempt', async () => {
  const context = setup();
  const { writeoffs, answers, events } = context;
  await unknownAttempt(context);
  answers.lookupWriteoff.push(refused(401, 'Unauthenticated', 'unavailable'));
  assert.deepEqual(await writeoffs.check(B), { kind: 'ended' });
  assert.deepEqual(events, [['check']]);
  assert.equal(writeoffs.pending(B), true);
});

test('a second check while checking sends one lookup', async () => {
  const context = setup();
  const { writeoffs, calls, answers } = context;
  await unknownAttempt(context);
  const answer = deferred();
  answers.lookupWriteoff.push(answer.promise);
  const first = writeoffs.check(B);
  const second = writeoffs.check(B);
  answer.resolve({ state: 'committed', result });
  assert.deepEqual(await first, { kind: 'written-off', result });
  assert.deepEqual(await second, { kind: 'written-off', result });
  assert.deepEqual(calls, [sentConfirm('cmd-1'), sentLookup('cmd-1')]);
});

test('a check with nothing pending confirms anew', async () => {
  const { writeoffs, calls, answers } = setup();
  answers.confirmWriteoff.push(
    refused(409, 'AlreadyWrittenOff', 'not_committed'),
  );
  assert.deepEqual(await writeoffs.check(B), { kind: 'already' });
  assert.deepEqual(calls, [sentConfirm('cmd-1')]);
});
