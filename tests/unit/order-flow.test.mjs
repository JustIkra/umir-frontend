import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { ApiError, localFailure } from '../../src/application/api.ts';
import { createCommandRunner } from '../../src/application/commands.ts';
import { createEpochRegistry } from '../../src/application/epochs.ts';
import {
  confirmKey,
  createOrderFlow,
  resolveDelayMs,
} from '../../src/application/order-flow.ts';

const R = '33333333-3333-4333-8333-333333333333';
const EPOCH = '55555555-5555-4555-8555-555555555555';
const at = { iso: '2026-10-14T10:00:00+03:00', epochMs: 1 };
const refused = (status, code, outcome) =>
  new ApiError({ ...localFailure(code, outcome, status), retryable: false });
const lost = () => refused(0, 'Transport', 'unknown');
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
const proposalOf = (
  proposalID,
  accepted = [{ lineNo: '1', dishID: '206', portions: '1' }],
  changes = [],
) => ({
  proposalID,
  evaluatedAt: at,
  stateVersion: '1',
  requestedPositions: [{ lineNo: '1', dishID: '206', portions: '1' }],
  acceptedPositions: accepted,
  changes,
  warehouseEpoch: '66666666-6666-4666-8666-666666666666',
});
const order = {
  orderID: 'ord-1',
  proposalID: 'prp-1',
  acceptedPositions: [],
  allocations: [],
  placedAt: at,
};
const context = {
  runtimeEpoch: EPOCH,
  warehouseEpoch: '66666666-6666-4666-8666-666666666666',
};
const envelope = (result) => ({ context, result });

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
    delays: () =>
      tasks.filter((task) => !task.done).map((task) => task.delayMs),
    runDue() {
      for (const task of tasks.filter((item) => !item.done)) {
        task.done = true;
        task.callback();
      }
    },
  };
}

function memory(initial) {
  const box = { record: initial, cleared: 0 };
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
      box.cleared += 1;
      box.record = undefined;
    },
  };
}

function setup({ stored, epoch = EPOCH, commands: shared } = {}) {
  const epochs = createEpochRegistry();
  if (epoch !== null) epochs.record(R, 'serving', epoch);
  let n = 0;
  const commands =
    shared ??
    createCommandRunner({
      newId: () => `cmd-${String((n += 1))}`,
      now: () => 0,
      epochs,
      onReset: () => {},
    });
  const calls = [];
  const answers = { prepare: [], confirm: [], resolve: [] };
  const take = (name, args) => {
    calls.push([name, ...args]);
    if (answers[name].length === 0)
      return Promise.reject(new Error(`no ${name} answer`));
    const next = answers[name].shift();
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };
  const storage = memory(stored);
  const scheduler = manualScheduler();
  const events = [];
  const flow = createOrderFlow({
    api: {
      prepare: (...args) => take('prepare', args),
      confirm: (...args) => take('confirm', args),
      resolve: (...args) => take('resolve', args),
    },
    commands,
    epochs,
    storage,
    scheduler,
    now: () => 42,
    restaurantID: R,
    userID: 'u1',
    onReset: () => events.push('reset'),
    onOrdered: () => events.push('ordered'),
    onUnauthenticated: () => events.push('check'),
  });
  return {
    flow,
    calls,
    answers,
    storage,
    scheduler,
    events,
    commands,
    epochs,
  };
}

async function atProposal(options) {
  const context = setup(options);
  context.flow.add('206');
  context.answers.prepare.push(envelope(proposalOf('prp-1')));
  await context.flow.prepare();
  return context;
}

const phase = (flow) => flow.getSnapshot().phase;

test('edits build the draft, keep it in the tab and stay closed outside compose', async () => {
  const { flow, storage } = setup();
  flow.add('206');
  flow.add('207');
  flow.setPortions(2, '3');
  flow.remove(1);
  assert.deepEqual(flow.getSnapshot().draft, [
    { lineNo: 1, dishID: '207', portions: '3' },
  ]);
  assert.deepEqual(storage.box.record.lines, flow.getSnapshot().draft);
  assert.equal(storage.box.record.attempt, undefined);
});

test('prepare checks the portions first and needs the serving epoch', async () => {
  const bad = setup();
  bad.flow.add('206');
  bad.flow.setPortions(1, '0');
  await bad.flow.prepare();
  assert.deepEqual(bad.flow.getSnapshot().notice, {
    kind: 'portions',
    lines: [1],
  });
  assert.equal(bad.calls.length, 0);
  const noEpoch = setup({ epoch: null });
  noEpoch.flow.add('206');
  await noEpoch.flow.prepare();
  assert.deepEqual(noEpoch.flow.getSnapshot().notice, {
    kind: 'prepare-failed',
  });
  assert.equal(noEpoch.calls.length, 0);
});

test('prepare sends the positions; an exact proposal, a cut one and an empty one', async () => {
  const { flow, calls, answers } = setup();
  flow.add('206');
  flow.setPortions(1, ' 3 ');
  answers.prepare.push(envelope(proposalOf('prp-1')));
  await flow.prepare();
  assert.deepEqual(calls[0], [
    'prepare',
    R,
    [{ dishID: '206', portions: '3' }],
    EPOCH,
  ]);
  assert.equal(phase(flow).kind, 'proposal');
  assert.equal(phase(flow).previous, undefined);
  const empty = setup();
  empty.flow.add('206');
  empty.answers.prepare.push(envelope(proposalOf('prp-0', [])));
  await empty.flow.prepare();
  assert.equal(phase(empty.flow).kind, 'empty');
});

test('a failed prepare keeps the draft and says so; a reset raises the notice', async () => {
  const { flow, answers, events } = setup();
  flow.add('206');
  answers.prepare.push(lost());
  await flow.prepare();
  assert.equal(phase(flow).kind, 'compose');
  assert.deepEqual(flow.getSnapshot().notice, { kind: 'prepare-failed' });
  assert.equal(flow.getSnapshot().draft.length, 1);
  answers.prepare.push(refused(409, 'RuntimeReset', 'indeterminate'));
  await flow.prepare();
  assert.deepEqual(events, ['reset']);
});

test('a confirmed order clears the draft and the attempt', async () => {
  const { flow, calls, answers, storage, events } = await atProposal();
  answers.confirm.push(envelope({ kind: 'OrderConfirmed', order }));
  await flow.confirm();
  assert.deepEqual(calls.at(-1), ['confirm', R, 'prp-1', 'cmd-1', EPOCH]);
  assert.deepEqual(phase(flow), {
    kind: 'confirmed',
    context,
    order,
    afterCheck: false,
  });
  assert.deepEqual(flow.getSnapshot().draft, []);
  assert.equal(storage.box.record.attempt, undefined);
  assert.deepEqual(events, ['ordered']);
});

test('a second confirm while confirming sends nothing', async () => {
  const { flow, calls, answers } = await atProposal();
  let answer;
  answers.confirm.push(
    new Promise((resolve) => {
      answer = resolve;
    }),
  );
  // The queued value is a promise: take() resolves with it.
  const first = flow.confirm();
  const second = flow.confirm();
  answer(envelope({ kind: 'OrderConfirmed', order }));
  await Promise.all([first, second]);
  assert.equal(calls.filter(([name]) => name === 'confirm').length, 1);
});

test('RequiresConfirmation shows the new proposal against the old one', async () => {
  const { flow, answers, calls } = await atProposal();
  answers.confirm.push(
    envelope({ kind: 'RequiresConfirmation', proposal: proposalOf('prp-2') }),
  );
  await flow.confirm();
  assert.equal(phase(flow).proposal.proposalID, 'prp-2');
  assert.equal(phase(flow).previous.proposalID, 'prp-1');
  answers.confirm.push(envelope({ kind: 'OrderConfirmed', order }));
  await flow.confirm();
  assert.deepEqual(calls.at(-1), ['confirm', R, 'prp-2', 'cmd-2', EPOCH]);
});

test('EmptyOrder and ProposalSuperseded', async () => {
  const empty = await atProposal();
  empty.answers.confirm.push(envelope({ kind: 'EmptyOrder' }));
  await empty.flow.confirm();
  assert.deepEqual(phase(empty.flow), { kind: 'empty', proposal: undefined });
  const lostReplacement = await atProposal();
  lostReplacement.answers.confirm.push(
    envelope({ kind: 'ProposalSuperseded', supersededBy: 'prp-9' }),
  );
  await lostReplacement.flow.confirm();
  assert.deepEqual(phase(lostReplacement.flow), {
    kind: 'superseded',
    replacement: undefined,
  });
  const known = await atProposal();
  known.answers.confirm.push(
    envelope({ kind: 'RequiresConfirmation', proposal: proposalOf('prp-2') }),
  );
  await known.flow.confirm();
  known.answers.prepare.length = 0;
  known.flow.editAgain();
  known.flow.add('207');
  known.answers.prepare.push(envelope(proposalOf('prp-3')));
  await known.flow.prepare();
  known.answers.confirm.push(
    envelope({ kind: 'ProposalSuperseded', supersededBy: 'prp-3' }),
  );
  await known.flow.confirm();
  assert.equal(phase(known.flow).replacement.proposalID, 'prp-3');
  known.flow.openReplacement();
  assert.equal(phase(known.flow).kind, 'proposal');
});

test('ConfirmationPending waits, checks once after 3 s and then on demand', async () => {
  const { flow, answers, calls, scheduler, storage } = await atProposal();
  answers.confirm.push(envelope({ kind: 'ConfirmationPending' }));
  await flow.confirm();
  assert.equal(phase(flow).kind, 'pending');
  assert.equal(storage.box.record.attempt.state, 'pending');
  assert.deepEqual(scheduler.delays(), [resolveDelayMs]);
  answers.resolve.push(envelope({ kind: 'ConfirmationPending' }));
  scheduler.runDue();
  await settled();
  assert.deepEqual(calls.at(-1), [
    'resolve',
    R,
    { commandID: 'cmd-1', proposalID: 'prp-1', runtimeEpoch: EPOCH },
  ]);
  assert.equal(phase(flow).kind, 'pending');
  assert.deepEqual(scheduler.delays(), []);
  answers.resolve.push(envelope({ kind: 'OrderConfirmed', order }));
  await flow.check();
  assert.deepEqual(phase(flow), {
    kind: 'confirmed',
    context,
    order,
    afterCheck: true,
  });
});

test('an explicit check resumes a saved pending command after passive lookup remains pending', async () => {
  const { flow, answers, calls } = await atProposal();
  answers.confirm.push(envelope({ kind: 'ConfirmationPending' }));
  await flow.confirm();
  answers.resolve.push(envelope({ kind: 'ConfirmationPending' }));
  answers.confirm.push(envelope({ kind: 'OrderConfirmed', order }));
  await flow.check();
  assert.equal(phase(flow).kind, 'confirmed');
  assert.deepEqual(
    calls.filter((call) => call[0] === 'confirm').map((call) => call.slice(1)),
    [
      [R, 'prp-1', 'cmd-1', EPOCH],
      [R, 'prp-1', 'cmd-1', EPOCH],
    ],
  );
});

test('a failed resolve says so and keeps waiting; 401 asks the session', async () => {
  const { flow, answers, events } = await atProposal();
  answers.confirm.push(envelope({ kind: 'ConfirmationPending' }));
  await flow.confirm();
  answers.resolve.push(refused(503, 'UpstreamUnavailable', 'unavailable'));
  await flow.check();
  assert.equal(phase(flow).kind, 'pending');
  assert.deepEqual(flow.getSnapshot().notice, { kind: 'check-failed' });
  answers.resolve.push(refused(401, 'Unauthenticated', 'not_committed'));
  await flow.check();
  assert.ok(events.includes('check'));
  assert.equal(phase(flow).kind, 'pending');
});

test('a lost answer keeps the attempt; the check repeats the same command', async () => {
  const { flow, answers, calls, storage } = await atProposal();
  answers.confirm.push(lost());
  await flow.confirm();
  assert.equal(phase(flow).kind, 'unknown');
  assert.equal(flow.getSnapshot().locked, true);
  assert.equal(storage.box.record.attempt.commandID, 'cmd-1');
  assert.equal(storage.box.record.attempt.state, 'sent');
  answers.confirm.push(envelope({ kind: 'OrderConfirmed', order }));
  await flow.check();
  assert.deepEqual(calls.at(-1), ['confirm', R, 'prp-1', 'cmd-1', EPOCH]);
  assert.equal(phase(flow).afterCheck, true);
});

test('ProposalNotFound is F2 on a first send and F4 on a check; the runner and the store are free', async () => {
  for (const outcome of ['unknown', 'not_committed']) {
    const fresh = await atProposal();
    fresh.answers.confirm.push(refused(404, 'ProposalNotFound', outcome));
    await fresh.flow.confirm();
    assert.deepEqual(phase(fresh.flow), {
      kind: 'not-found',
      afterAttempt: false,
      checkedAt: undefined,
    });
    assert.deepEqual(fresh.commands.getSnapshot(), []);
    assert.equal(fresh.storage.box.record.attempt, undefined);
    assert.equal(fresh.flow.getSnapshot().locked, false);
  }
  for (const outcome of ['unknown', 'not_committed']) {
    const checked = await atProposal();
    checked.answers.confirm.push(
      lost(),
      refused(404, 'ProposalNotFound', outcome),
    );
    await checked.flow.confirm();
    await checked.flow.check();
    assert.deepEqual(phase(checked.flow), {
      kind: 'not-found',
      afterAttempt: true,
      checkedAt: 42,
    });
    assert.deepEqual(checked.commands.getSnapshot(), []);
    assert.equal(checked.storage.box.record.attempt, undefined);
    assert.equal(checked.flow.getSnapshot().locked, false);
  }
});

test('the serving epoch changes between prepare and confirm: ProposalNotFound/unknown is F2 and unlocked', async () => {
  const context = await atProposal();
  const NEXT = '77777777-7777-4777-8777-777777777777';
  context.epochs.record(R, 'serving', NEXT);
  context.answers.confirm.push(refused(404, 'ProposalNotFound', 'unknown'));
  await context.flow.confirm();
  assert.deepEqual(context.calls.at(-1), [
    'confirm',
    R,
    'prp-1',
    'cmd-1',
    NEXT,
  ]);
  assert.deepEqual(phase(context.flow), {
    kind: 'not-found',
    afterAttempt: false,
    checkedAt: undefined,
  });
  assert.deepEqual(context.commands.getSnapshot(), []);
  assert.equal(context.storage.box.record.attempt, undefined);
  assert.equal(context.flow.getSnapshot().locked, false);
});

test('CommandConflict keeps the attempt and checks it through resolve', async () => {
  const { flow, answers, calls } = await atProposal();
  answers.confirm.push(refused(409, 'CommandConflict', 'not_committed'));
  await flow.confirm();
  assert.equal(phase(flow).kind, 'conflict');
  answers.resolve.push(envelope({ kind: 'OrderConfirmed', order }));
  await flow.check();
  assert.equal(calls.at(-1)[0], 'resolve');
  assert.equal(phase(flow).kind, 'confirmed');
});

test('InventoryUnavailable is E12; «Повторить оформление» is a new command', async () => {
  const { flow, answers, calls } = await atProposal();
  answers.confirm.push(refused(503, 'InventoryUnavailable', 'not_committed'));
  await flow.confirm();
  assert.deepEqual(phase(flow).kind, 'refused');
  assert.equal(phase(flow).code, 'InventoryUnavailable');
  answers.confirm.push(envelope({ kind: 'OrderConfirmed', order }));
  await flow.confirm();
  assert.deepEqual(calls.at(-1), ['confirm', R, 'prp-1', 'cmd-2', EPOCH]);
});

test('RuntimeReset drops the attempt and allows a new order', async () => {
  const { flow, answers, storage } = await atProposal();
  answers.confirm.push(refused(409, 'RuntimeReset', 'indeterminate'));
  await flow.confirm();
  assert.deepEqual(phase(flow), { kind: 'reset' });
  assert.equal(storage.box.record.attempt, undefined);
  assert.equal(flow.getSnapshot().locked, false);
});

test('nothing changes the order while an attempt is unchecked', async () => {
  const { flow, answers, calls } = await atProposal();
  answers.confirm.push(lost());
  await flow.confirm();
  const before = calls.length;
  flow.add('207');
  flow.editAgain();
  await flow.prepare();
  assert.equal(phase(flow).kind, 'unknown');
  assert.equal(calls.length, before);
});

test('a stored attempt after reload is checked with the same commandID', async () => {
  const proposal = proposalOf('prp-1');
  const stored = {
    userID: 'u1',
    restaurantID: R,
    lines: [{ lineNo: 1, dishID: '206', portions: '1' }],
    attempt: {
      commandID: 'saved-cmd',
      proposalID: 'prp-1',
      runtimeEpoch: EPOCH,
      proposal,
      startedAt: 7,
      state: 'sent',
    },
  };
  const { flow, answers, calls, commands } = setup({ stored });
  assert.equal(phase(flow).kind, 'unknown');
  assert.deepEqual(flow.getSnapshot().draft, stored.lines);
  assert.equal(commands.getSnapshot()[0].key, confirmKey(R));
  answers.confirm.push(envelope({ kind: 'OrderConfirmed', order }));
  await flow.check();
  assert.deepEqual(calls, [['confirm', R, 'prp-1', 'saved-cmd', EPOCH]]);
  assert.equal(phase(flow).kind, 'confirmed');
});

test('a stored pending attempt resolves after 3 s; a stored conflict waits for the check', () => {
  const proposal = proposalOf('prp-1');
  const attempt = {
    commandID: 'c',
    proposalID: 'prp-1',
    runtimeEpoch: EPOCH,
    proposal,
    startedAt: 7,
    state: 'pending',
  };
  const pending = setup({
    stored: { userID: 'u1', restaurantID: R, lines: [], attempt },
  });
  assert.equal(phase(pending.flow).kind, 'pending');
  assert.deepEqual(pending.scheduler.delays(), [resolveDelayMs]);
  const conflict = setup({
    stored: {
      userID: 'u1',
      restaurantID: R,
      lines: [],
      attempt: { ...attempt, state: 'conflict' },
    },
  });
  assert.equal(phase(conflict.flow).kind, 'conflict');
  assert.deepEqual(conflict.scheduler.delays(), []);
});

test('a 401 on the check keeps the attempt for after the sign-in', async () => {
  const { flow, answers, events, commands, storage } = await atProposal();
  answers.confirm.push(
    lost(),
    refused(401, 'Unauthenticated', 'not_committed'),
  );
  await flow.confirm();
  await flow.check();
  assert.ok(events.includes('check'));
  assert.equal(phase(flow).kind, 'unknown');
  assert.equal(storage.box.record.attempt.commandID, 'cmd-1');
  assert.equal(commands.getSnapshot()[0].commandID, 'cmd-1');
});

for (const [status, code] of [
  [429, 'RateLimited'],
  [403, 'Forbidden'],
]) {
  test(`a ${String(status)} on the check keeps the attempt`, async () => {
    const proposal = proposalOf('prp-1');
    const stored = {
      userID: 'u1',
      restaurantID: R,
      lines: [{ lineNo: 1, dishID: '206', portions: '1' }],
      attempt: {
        commandID: 'saved-cmd',
        proposalID: 'prp-1',
        runtimeEpoch: EPOCH,
        proposal,
        startedAt: 7,
        state: 'sent',
      },
    };
    const { flow, answers, calls, storage, commands } = setup({ stored });
    answers.confirm.push(refused(status, code, 'not_committed'));
    await flow.check();
    assert.equal(phase(flow).kind, 'unknown');
    assert.equal(phase(flow).checking, false);
    assert.deepEqual(flow.getSnapshot().notice, { kind: 'check-failed' });
    assert.equal(storage.box.record.attempt.commandID, 'saved-cmd');
    assert.equal(commands.getSnapshot()[0].commandID, 'saved-cmd');
    answers.confirm.push(envelope({ kind: 'OrderConfirmed', order }));
    await flow.check();
    assert.deepEqual(calls.at(-1), ['confirm', R, 'prp-1', 'saved-cmd', EPOCH]);
    assert.equal(phase(flow).kind, 'confirmed');
  });
}
