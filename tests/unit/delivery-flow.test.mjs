import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { ApiError, localFailure } from '../../src/application/api.ts';
import { createCommandRunner } from '../../src/application/commands.ts';
import {
  createDeliveryFlow,
  deliveryKey,
} from '../../src/application/delivery-flow.ts';
import { createEpochRegistry } from '../../src/application/epochs.ts';
import {
  emptyDeliveryDraft,
  setDeliveryField,
} from '../../src/domain/delivery-draft.ts';

const R = '33333333-3333-4333-8333-333333333333';
const EPOCH = '44444444-4444-4444-8444-444444444444';
const at = { iso: '2026-10-10T15:22:10+03:00', epochMs: 1 };
const refused = (status, code, outcome) =>
  new ApiError({ ...localFailure(code, outcome, status), retryable: false });
const lost = () => refused(0, 'Transport', 'unknown');
const civil = (localDateTime) => ({ civil: { localDateTime } });
// What the page builds from the draft (task 12); the flow adds deliveryID.
const input = {
  number: '1192',
  createdAt: civil('2026-10-10T15:00:00'),
  expectedSettingsVersion: '7',
  lines: [
    {
      productID: '114',
      manufacturedAt: civil('2026-10-01T09:00:00'),
      shelfLife: { value: '30', unit: 'day' },
      receivedAt: civil('2026-10-10T14:00:00'),
      quantity: '1200000',
    },
  ],
};
const sent = (deliveryID) => ({ ...input, deliveryID });
const receipt = (deliveryID) => ({
  deliveryID,
  batches: [
    {
      batchID: 'P-0170',
      deliveryID,
      lineNo: '1',
      productID: '114',
      manufacturedAt: at,
      shelfLife: { value: '30', unit: 'day' },
      receivedAt: at,
      expiresAt: at,
      receivedQuantity: '1200000',
      remainingQuantity: '1200000',
    },
  ],
});
const envelope = (result) => ({
  context: { runtimeEpoch: EPOCH, evaluatedAt: at },
  result,
});
const numbered = (draft) => setDeliveryField(draft, 'number', '1192');
const storedRecord = (overrides = {}) => ({
  userID: 'u1',
  restaurantID: R,
  draft: numbered(emptyDeliveryDraft()),
  deliveryID: 'd-saved',
  attempt: {
    commandID: 'saved-cmd',
    epoch: EPOCH,
    startedAt: 7,
    input: sent('d-saved'),
  },
  ...overrides,
});

function memory(initial) {
  const box = { record: initial };
  return {
    box,
    load: (userID, restaurantID) =>
      box.record?.userID === userID && box.record?.restaurantID === restaurantID
        ? box.record
        : undefined,
    save: (record) => {
      box.record = record;
    },
    clear: () => {
      box.record = undefined;
    },
    clearAll: () => {
      box.record = undefined;
    },
  };
}

function setup({ stored, epoch = EPOCH } = {}) {
  const epochs = createEpochRegistry();
  if (epoch !== null) epochs.record(R, 'warehouse', epoch);
  const events = [];
  let commandNo = 0;
  const commands = createCommandRunner({
    newId: () => `cmd-${String((commandNo += 1))}`,
    now: () => 0,
    epochs,
    onReset: () => events.push('runner-reset'),
  });
  const calls = [];
  const answers = [];
  const storage = memory(stored);
  let deliveryNo = 0;
  const flow = createDeliveryFlow({
    api: {
      receiveDelivery: (...args) => {
        calls.push(args);
        if (answers.length === 0) return Promise.reject(new Error('no answer'));
        const next = answers.shift();
        return next instanceof Error
          ? Promise.reject(next)
          : Promise.resolve(next);
      },
    },
    commands,
    epochs,
    storage,
    newID: () => `d-${String((deliveryNo += 1))}`,
    now: () => 42,
    restaurantID: R,
    userID: 'u1',
    onReceived: () => events.push('received'),
    onSettingsChanged: () => events.push('settings'),
    onUnauthenticated: () => events.push('check'),
  });
  return { flow, commands, calls, answers, storage, events };
}

async function sendWith(answer, options) {
  const context = setup(options);
  context.flow.edit(numbered);
  context.answers.push(answer);
  await context.flow.submit(input);
  return context;
}

function held(answers) {
  let release;
  answers.push(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  // The queued value is a promise: the fake api resolves with it.
  return (value) => release(value);
}

const phase = (flow) => flow.getSnapshot().phase;

test('the first edit issues the deliveryID and keeps the draft in the tab', () => {
  const { flow, storage } = setup();
  assert.deepEqual(phase(flow), { kind: 'editing' });
  assert.deepEqual(flow.getSnapshot().draft, emptyDeliveryDraft());
  assert.equal(storage.box.record, undefined);
  flow.edit(numbered);
  flow.edit((draft) =>
    setDeliveryField(draft, 'createdAt', '2026-10-10T15:00'),
  );
  const { draft, locked } = flow.getSnapshot();
  assert.equal(draft.number, '1192');
  assert.equal(draft.createdAt, '2026-10-10T15:00');
  assert.equal(locked, false);
  assert.deepEqual(storage.box.record, {
    userID: 'u1',
    restaurantID: R,
    draft,
    deliveryID: 'd-1',
    attempt: undefined,
  });
});

test('the snapshot is stable between changes and listeners hear each one', () => {
  const { flow } = setup();
  let heard = 0;
  const stop = flow.subscribe(() => {
    heard += 1;
  });
  const before = flow.getSnapshot();
  assert.equal(flow.getSnapshot(), before);
  flow.edit(numbered);
  assert.equal(heard, 1);
  assert.notEqual(flow.getSnapshot(), before);
  stop();
  flow.edit(numbered);
  assert.equal(heard, 1);
});

test('a received delivery clears the tab record and marks the stock stale', async () => {
  const { flow, calls, storage, events } = await sendWith(
    envelope(receipt('d-1')),
  );
  assert.deepEqual(calls, [[R, sent('d-1'), 'cmd-1', EPOCH]]);
  assert.deepEqual(phase(flow), {
    kind: 'received',
    receipt: receipt('d-1'),
    input: sent('d-1'),
    evaluatedAt: at,
  });
  assert.equal(storage.box.record, undefined);
  assert.deepEqual(events, ['received']);
  assert.deepEqual(flow.getSnapshot().draft, emptyDeliveryDraft());
  assert.equal(flow.getSnapshot().locked, false);
});

test('restart after a receipt starts a new delivery with a new deliveryID', async () => {
  const { flow, calls, answers } = await sendWith(envelope(receipt('d-1')));
  flow.edit(numbered);
  await flow.submit(input);
  assert.equal(phase(flow).kind, 'received');
  assert.equal(calls.length, 1);
  flow.restart();
  assert.deepEqual(phase(flow), { kind: 'editing' });
  flow.edit(numbered);
  answers.push(envelope(receipt('d-2')));
  await flow.submit(input);
  assert.deepEqual(calls.at(-1), [R, sent('d-2'), 'cmd-2', EPOCH]);
});

test('the attempt is kept in the tab before the request leaves', async () => {
  const { flow, answers, storage } = setup();
  flow.edit(numbered);
  const answer = held(answers);
  const sending = flow.submit(input);
  assert.deepEqual(phase(flow), { kind: 'sending' });
  assert.equal(flow.getSnapshot().locked, true);
  assert.deepEqual(storage.box.record.attempt, {
    commandID: 'cmd-1',
    epoch: EPOCH,
    startedAt: 42,
    input: sent('d-1'),
  });
  answer(envelope(receipt('d-1')));
  await sending;
  assert.equal(phase(flow).kind, 'received');
});

test('a second submit while sending sends nothing', async () => {
  const { flow, calls, answers, events } = setup();
  flow.edit(numbered);
  const answer = held(answers);
  const first = flow.submit(input);
  const second = flow.submit(input);
  answer(envelope(receipt('d-1')));
  await Promise.all([first, second]);
  assert.equal(calls.length, 1);
  assert.equal(phase(flow).kind, 'received');
  // The second submit did not even wait for the same answer.
  assert.deepEqual(events, ['received']);
});

test('a lost answer keeps the attempt and closes the form; the check repeats the same command', async () => {
  for (const failure of [
    lost(),
    refused(200, 'Malformed', 'unknown'),
    refused(504, 'UpstreamTimeout', 'unknown'),
    new Error('not an ApiError'),
  ]) {
    const { flow, calls, answers, storage, commands } = await sendWith(failure);
    assert.deepEqual(phase(flow), { kind: 'unknown', checking: false });
    assert.equal(flow.getSnapshot().locked, true);
    assert.equal(flow.getSnapshot().notice, undefined);
    assert.equal(storage.box.record.attempt.commandID, 'cmd-1');
    assert.equal(commands.getSnapshot()[0].commandID, 'cmd-1');
    flow.edit((draft) => setDeliveryField(draft, 'number', '7'));
    flow.chooseOccurrence('later');
    flow.restart();
    await flow.submit(input);
    assert.equal(flow.getSnapshot().draft.number, '1192');
    assert.equal(flow.getSnapshot().occurrence, undefined);
    assert.equal(calls.length, 1);
    answers.push(envelope(receipt('d-1')));
    await flow.check();
    assert.deepEqual(calls, [
      [R, sent('d-1'), 'cmd-1', EPOCH],
      [R, sent('d-1'), 'cmd-1', EPOCH],
    ]);
    assert.equal(phase(flow).kind, 'received');
  }
});

test('a stored delivery attempt after reload is checked with the same commandID', async () => {
  const stored = storedRecord();
  // A reloaded tab has read nothing yet: the check carries the saved epoch.
  const { flow, calls, answers, commands } = setup({ stored, epoch: null });
  assert.deepEqual(phase(flow), { kind: 'unknown', checking: false });
  assert.equal(flow.getSnapshot().locked, true);
  assert.deepEqual(flow.getSnapshot().draft, stored.draft);
  assert.deepEqual(
    commands
      .getSnapshot()
      .map(({ key, commandID, startedAt }) => [key, commandID, startedAt]),
    [[deliveryKey(R), 'saved-cmd', 7]],
  );
  const answer = held(answers);
  const checking = flow.check();
  assert.deepEqual(phase(flow), { kind: 'unknown', checking: true });
  await flow.check();
  answer(envelope(receipt('d-saved')));
  await checking;
  assert.deepEqual(calls, [[R, sent('d-saved'), 'saved-cmd', EPOCH]]);
  assert.equal(phase(flow).kind, 'received');
});

test('a stored draft without an attempt comes back for editing with its deliveryID', async () => {
  const stored = storedRecord({ attempt: undefined });
  const { flow, calls, answers, commands } = setup({ stored });
  assert.deepEqual(phase(flow), { kind: 'editing' });
  assert.deepEqual(flow.getSnapshot().draft, stored.draft);
  assert.deepEqual(commands.getSnapshot(), []);
  answers.push(envelope(receipt('d-saved')));
  await flow.submit(input);
  assert.deepEqual(calls, [[R, sent('d-saved'), 'cmd-1', EPOCH]]);
});

test('a record of another user or restaurant is not read', () => {
  for (const stored of [
    storedRecord({ userID: 'u2' }),
    storedRecord({ restaurantID: '99999999-9999-4999-8999-999999999999' }),
  ]) {
    const { flow, commands, storage } = setup({ stored });
    assert.deepEqual(phase(flow), { kind: 'editing' });
    assert.deepEqual(flow.getSnapshot().draft, emptyDeliveryDraft());
    assert.deepEqual(commands.getSnapshot(), []);
    flow.edit(numbered);
    assert.equal(storage.box.record.userID, 'u1');
    assert.equal(storage.box.record.restaurantID, R);
    assert.equal(storage.box.record.deliveryID, 'd-1');
  }
});

test('answers of the warehouse settle the attempt by their code, even with an unknown outcome', async () => {
  const cases = [
    [409, 'CommandConflict', { kind: 'conflict' }],
    [422, 'AmbiguousLocalTime', { kind: 'ambiguous-time' }],
    [422, 'NonexistentLocalTime', { kind: 'nonexistent-time' }],
    [409, 'SettingsChanged', { kind: 'settings-changed' }],
    [400, 'InvalidArgument', { kind: 'refused', code: 'InvalidArgument' }],
    [400, 'InvalidRequest', { kind: 'refused', code: 'InvalidRequest' }],
    [422, 'UnknownTimeZone', { kind: 'refused', code: 'UnknownTimeZone' }],
    [
      503,
      'TimeZoneDataUnavailable',
      { kind: 'refused', code: 'TimeZoneDataUnavailable' },
    ],
  ];
  for (const [status, code, expected] of cases) {
    for (const outcome of ['not_committed', 'unknown']) {
      const name = `${code}/${outcome}`;
      const { flow, calls, answers, storage, commands } = await sendWith(
        refused(status, code, outcome),
      );
      assert.deepEqual(phase(flow), expected, name);
      assert.equal(flow.getSnapshot().locked, false, name);
      assert.deepEqual(commands.getSnapshot(), [], name);
      assert.equal(storage.box.record.attempt, undefined, name);
      assert.equal(storage.box.record.deliveryID, 'd-1', name);
      assert.equal(flow.getSnapshot().draft.number, '1192', name);
      // The next send is a new command of the same delivery.
      answers.push(envelope(receipt('d-1')));
      await flow.submit(input);
      assert.deepEqual(calls.at(-1), [R, sent('d-1'), 'cmd-2', EPOCH], name);
    }
  }
});

test('SettingsChanged calls onSettingsChanged; P8 marks the stock stale', async () => {
  const settings = await sendWith(
    refused(409, 'SettingsChanged', 'not_committed'),
  );
  assert.deepEqual(settings.events, ['settings']);
  const conflict = await sendWith(
    refused(409, 'CommandConflict', 'not_committed'),
  );
  assert.deepEqual(conflict.events, ['received']);
  const ambiguous = await sendWith(
    refused(422, 'AmbiguousLocalTime', 'not_committed'),
  );
  assert.deepEqual(ambiguous.events, []);
});

test('DS01: the chosen occurrence stays for the next submit; restart drops it', async () => {
  const { flow } = await sendWith(
    refused(422, 'AmbiguousLocalTime', 'not_committed'),
  );
  flow.chooseOccurrence('earlier');
  flow.edit((draft) =>
    setDeliveryField(draft, 'createdAt', '2026-10-25T02:30'),
  );
  const snapshot = flow.getSnapshot();
  assert.equal(snapshot.occurrence, 'earlier');
  assert.deepEqual(snapshot.phase, { kind: 'ambiguous-time' });
  assert.equal(snapshot.draft.createdAt, '2026-10-25T02:30');
  flow.restart();
  assert.equal(flow.getSnapshot().occurrence, undefined);
  assert.deepEqual(flow.getSnapshot().draft, emptyDeliveryDraft());
});

test('technical refusals and an ended session on a first send', async () => {
  const cases = [
    [
      refused(429, 'RateLimited', 'not_committed'),
      { kind: 'refused', code: 'RateLimited' },
    ],
    [
      refused(403, 'Forbidden', 'not_committed'),
      { kind: 'refused', code: 'Forbidden' },
    ],
    [
      refused(503, 'InventoryUnavailable', 'unavailable'),
      { kind: 'refused', code: 'InventoryUnavailable' },
    ],
    [refused(401, 'Unauthenticated', 'not_committed'), { kind: 'editing' }],
  ];
  for (const [failure, expected] of cases) {
    const { flow, storage, commands, events } = await sendWith(failure);
    assert.deepEqual(phase(flow), expected, failure.message);
    assert.deepEqual(commands.getSnapshot(), [], failure.message);
    assert.equal(storage.box.record.attempt, undefined, failure.message);
    assert.equal(storage.box.record.deliveryID, 'd-1', failure.message);
    assert.deepEqual(
      events,
      expected.kind === 'editing' ? ['check'] : [],
      failure.message,
    );
  }
});

test('without a read of the warehouse epoch nothing is sent', async () => {
  const { flow, calls, commands } = setup({ epoch: null });
  flow.edit(numbered);
  await flow.submit(input);
  assert.deepEqual(phase(flow), { kind: 'refused', code: 'EpochUnknown' });
  assert.equal(calls.length, 0);
  assert.deepEqual(commands.getSnapshot(), []);
});

test('RuntimeReset clears the attempt and keeps the draft', async () => {
  const first = await sendWith(refused(409, 'RuntimeReset', 'indeterminate'));
  assert.deepEqual(phase(first.flow), { kind: 'reset' });
  assert.equal(first.flow.getSnapshot().locked, false);
  assert.equal(first.flow.getSnapshot().draft.number, '1192');
  assert.equal(first.storage.box.record.attempt, undefined);
  assert.equal(first.storage.box.record.deliveryID, 'd-1');
  assert.deepEqual(first.commands.getSnapshot(), []);
  assert.deepEqual(first.events, ['runner-reset']);
  // The same on a check after a reload; the next send is a new command.
  const stored = storedRecord();
  const checked = setup({ stored });
  checked.answers.push(refused(409, 'RuntimeReset', 'indeterminate'));
  await checked.flow.check();
  assert.deepEqual(phase(checked.flow), { kind: 'reset' });
  assert.deepEqual(checked.flow.getSnapshot().draft, stored.draft);
  assert.equal(checked.storage.box.record.attempt, undefined);
  assert.equal(checked.storage.box.record.deliveryID, 'd-saved');
  checked.answers.push(envelope(receipt('d-saved')));
  await checked.flow.submit(input);
  assert.deepEqual(checked.calls.at(-1), [R, sent('d-saved'), 'cmd-1', EPOCH]);
});

for (const [status, code, outcome] of [
  [429, 'RateLimited', 'not_committed'],
  [403, 'Forbidden', 'not_committed'],
  [503, 'RuntimeNotReady', 'not_committed'],
  [503, 'InventoryUnavailable', 'unavailable'],
  [0, 'Transport', 'unknown'],
]) {
  test(`a refused check keeps the attempt: ${code}`, async () => {
    const { flow, calls, answers, storage, commands, events } = setup({
      stored: storedRecord(),
    });
    answers.push(refused(status, code, outcome));
    await flow.check();
    assert.deepEqual(phase(flow), { kind: 'unknown', checking: false });
    assert.deepEqual(flow.getSnapshot().notice, { kind: 'check-failed' });
    // The repeat kept the commandID, the epoch and the start of the attempt.
    assert.deepEqual(storage.box.record.attempt, storedRecord().attempt);
    assert.equal(commands.getSnapshot()[0].commandID, 'saved-cmd');
    assert.deepEqual(events, []);
    answers.push(envelope(receipt('d-saved')));
    await flow.check();
    assert.deepEqual(calls.at(-1), [R, sent('d-saved'), 'saved-cmd', EPOCH]);
    assert.equal(phase(flow).kind, 'received');
    assert.equal(flow.getSnapshot().notice, undefined);
  });
}

test('a 401 on the check keeps the attempt for after the sign-in', async () => {
  const { flow, answers, storage, commands, events } = setup({
    stored: storedRecord(),
  });
  answers.push(refused(401, 'Unauthenticated', 'not_committed'));
  await flow.check();
  assert.deepEqual(events, ['check']);
  assert.deepEqual(phase(flow), { kind: 'unknown', checking: false });
  assert.equal(storage.box.record.attempt.commandID, 'saved-cmd');
  assert.equal(commands.getSnapshot()[0].commandID, 'saved-cmd');
});

test('an answer of the warehouse to the check settles the attempt', async () => {
  for (const [failure, expected, heard] of [
    [
      refused(409, 'CommandConflict', 'unknown'),
      { kind: 'conflict' },
      ['received'],
    ],
    [
      refused(400, 'InvalidArgument', 'not_committed'),
      { kind: 'refused', code: 'InvalidArgument' },
      [],
    ],
  ]) {
    const { flow, answers, storage, commands, events } = setup({
      stored: storedRecord(),
    });
    answers.push(failure);
    await flow.check();
    assert.deepEqual(phase(flow), expected, failure.message);
    assert.deepEqual(commands.getSnapshot(), [], failure.message);
    assert.equal(storage.box.record.attempt, undefined, failure.message);
    assert.equal(storage.box.record.deliveryID, 'd-saved', failure.message);
    assert.deepEqual(events, heard, failure.message);
  }
});

test('after dispose a late answer changes nothing', async () => {
  const { flow, answers, events } = setup();
  flow.edit(numbered);
  const answer = held(answers);
  const sending = flow.submit(input);
  flow.dispose();
  answer(envelope(receipt('d-1')));
  await sending;
  assert.deepEqual(phase(flow), { kind: 'sending' });
  assert.deepEqual(events, []);
});
