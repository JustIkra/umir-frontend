import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { ApiError, localFailure } from '../../src/application/api.ts';
import { createCommandRunner } from '../../src/application/commands.ts';
import { createEpochRegistry } from '../../src/application/epochs.ts';
import {
  createPasswordResetFlow,
  isCodeExpired,
} from '../../src/application/password-reset.ts';

const C1 = '44444444-4444-4444-8444-444444444444';
const C2 = '55555555-5555-4555-8555-555555555555';
const START = 1_000_000;
const instant = (epochMs) => ({
  iso: new Date(epochMs).toISOString(),
  epochMs,
});
const challenge = (challengeID = C1, at = START) => ({
  challengeID,
  expiresAt: instant(at + 600_000),
  resendAvailableAt: instant(at + 60_000),
  state: 'pending',
});
const refused = (status, code, outcome, extra = {}) =>
  new ApiError({
    ...localFailure(code, outcome, status),
    retryable: false,
    ...extra,
  });
const lost = () => refused(0, 'Transport', 'unknown');
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

// Each call takes the next prepared answer: a value, an ApiError or a
// function returning a promise.
function recovery() {
  const calls = [];
  const answers = { begin: [], verify: [], resend: [], complete: [] };
  const take = (name, args) => {
    calls.push([name, ...args]);
    const next = answers[name].shift();
    if (next === undefined)
      return Promise.reject(new Error(`no ${name} answer`));
    if (typeof next === 'function') return next();
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };
  return {
    calls,
    answers,
    api: {
      begin: (...args) => take('begin', args),
      verify: (...args) => take('verify', args),
      resend: (...args) => take('resend', args),
      complete: (...args) => take('complete', args),
    },
  };
}

function memory(initial) {
  const box = { record: initial, saves: 0 };
  return {
    box,
    load: () => box.record,
    save: (record) => {
      box.saves += 1;
      box.record = record;
    },
    clear: () => {
      box.record = undefined;
    },
  };
}

function setup({ stored } = {}) {
  const clock = { now: START };
  let n = 0;
  const commands = createCommandRunner({
    newId: () => `cmd-${String((n += 1))}`,
    now: () => clock.now,
    epochs: createEpochRegistry(),
    onReset: () => {},
  });
  const fake = recovery();
  const storage = memory(stored);
  const adopted = [];
  const flow = createPasswordResetFlow({
    api: fake.api,
    commands,
    session: { adopt: (view) => adopted.push(view) },
    storage,
    now: () => clock.now,
  });
  return { flow, fake, storage, clock, commands, adopted };
}

async function atCode(options) {
  const context = setup(options);
  context.fake.answers.begin.push(challenge());
  assert.equal(await context.flow.request('m.belova@restoran.example'), 'code');
  return context;
}

async function atPassword() {
  const context = await atCode();
  context.fake.answers.verify.push({
    challenge: { ...challenge(), state: 'verified' },
    proof: 'proof-1',
    retainUntil: instant(START + 86_400_000),
  });
  assert.equal(await context.flow.verify('482913'), 'password');
  return context;
}

test('request() trims the email, sends a reset code and moves to the code step', async () => {
  const { flow, fake, storage } = setup();
  fake.answers.begin.push(challenge());
  assert.equal(await flow.request('  m.belova@restoran.example '), 'code');
  assert.deepEqual(fake.calls, [
    ['begin', 'm.belova@restoran.example', 'cmd-1'],
  ]);
  const snapshot = flow.getSnapshot();
  assert.equal(snapshot.step, 'code');
  assert.equal(snapshot.email, 'm.belova@restoran.example');
  assert.equal(snapshot.expiresAtMs, START + 600_000);
  assert.equal(snapshot.resendAtMs, START + 60_000);
  assert.equal(snapshot.busy, false);
  assert.equal(storage.box.record.challenge.challengeID, C1);
  assert.equal(storage.box.record.proof, undefined);
});

test('an empty email asks for one without a request', async () => {
  const { flow, fake } = setup();
  assert.equal(await flow.request('   '), 'stay');
  assert.deepEqual(flow.getSnapshot().notice, { kind: 'email-required' });
  assert.deepEqual(fake.calls, []);
});

test('refusals of the request: unknown email, bad email, a wait, the service', async () => {
  const cases = [
    [refused(404, 'NotFound', 'unavailable'), { kind: 'not-found' }],
    [
      refused(400, 'InvalidArgument', 'not_committed', {
        fieldErrors: { email: 'bad' },
      }),
      { kind: 'invalid-email' },
    ],
    [
      refused(429, 'RateLimited', 'not_committed', { retryAfterSeconds: 45 }),
      { kind: 'limited', untilMs: START + 45_000 },
    ],
    [
      refused(429, 'RateLimited', 'not_committed'),
      { kind: 'limited', untilMs: START + 60_000 },
    ],
    [
      refused(503, 'AuthStorageUnavailable', 'not_committed'),
      { kind: 'unavailable' },
    ],
  ];
  for (const [answer, notice] of cases) {
    const { flow, fake } = setup();
    fake.answers.begin.push(answer);
    assert.equal(await flow.request('a@b.ru'), 'stay');
    assert.deepEqual(flow.getSnapshot().notice, notice, answer.message);
    assert.equal(flow.getSnapshot().step, 'email');
  }
});

test('a lost answer keeps the attempt; check() repeats the same command', async () => {
  const { flow, fake } = setup();
  fake.answers.begin.push(lost(), challenge());
  assert.equal(await flow.request('a@b.ru'), 'stay');
  assert.deepEqual(flow.getSnapshot().notice, {
    kind: 'unknown',
    action: 'request',
  });
  assert.equal(await flow.check(), 'code');
  assert.deepEqual(fake.calls, [
    ['begin', 'a@b.ru', 'cmd-1'],
    ['begin', 'a@b.ru', 'cmd-1'],
  ]);
});

test('a pasted code with a space is sent as six digits', async () => {
  const { flow, fake } = await atCode();
  fake.answers.verify.push(refused(400, 'InvalidArgument', 'committed'));
  await flow.verify(' 482 913 ');
  assert.deepEqual(fake.calls.at(-1), ['verify', C1, '482913', 'cmd-2']);
  assert.deepEqual(flow.getSnapshot().notice, { kind: 'wrong-code' });
});

test('a wrong format or an expired code is refused without a request', async () => {
  const { flow, fake, clock } = await atCode();
  await flow.verify('12345');
  assert.deepEqual(flow.getSnapshot().notice, { kind: 'code-format' });
  clock.now = START + 600_000;
  await flow.verify('482913');
  assert.deepEqual(flow.getSnapshot().notice, { kind: 'expired' });
  assert.equal(fake.calls.length, 1);
  assert.equal(isCodeExpired(flow.getSnapshot(), clock.now), true);
  assert.equal(isCodeExpired(flow.getSnapshot(), clock.now - 1), false);
});

test('refusals of the code: locked and expired', async () => {
  for (const [answer, notice] of [
    [refused(400, 'ChallengeLocked', 'not_committed'), { kind: 'locked' }],
    [refused(404, 'NotFound', 'unavailable'), { kind: 'expired' }],
  ]) {
    const { flow, fake } = await atCode();
    fake.answers.verify.push(answer);
    assert.equal(await flow.verify('482913'), 'stay');
    assert.deepEqual(flow.getSnapshot().notice, notice);
  }
});

test('a right code keeps the proof and moves to the password step', async () => {
  const { flow, storage } = await atPassword();
  assert.equal(flow.getSnapshot().step, 'password');
  assert.equal(storage.box.record.proof, 'proof-1');
});

test('resend() renews the wait and says a new code was sent', async () => {
  const { flow, fake } = await atCode();
  fake.answers.resend.push(challenge(C1, START + 60_000));
  assert.equal(await flow.resend(), 'stay');
  assert.deepEqual(fake.calls.at(-1), ['resend', C1, 'cmd-2']);
  assert.equal(flow.getSnapshot().resendAtMs, START + 120_000);
  assert.deepEqual(flow.getSnapshot().notice, { kind: 'resent' });
  fake.answers.resend.push(refused(404, 'NotFound', 'unavailable'));
  await flow.resend();
  assert.deepEqual(flow.getSnapshot().notice, { kind: 'expired' });
});

test('renew() asks for a new challenge with the same email', async () => {
  const { flow, fake } = await atCode();
  fake.answers.begin.push(challenge(C2));
  assert.equal(await flow.renew(), 'stay');
  assert.deepEqual(fake.calls.at(-1), [
    'begin',
    'm.belova@restoran.example',
    'cmd-2',
  ]);
  assert.deepEqual(flow.getSnapshot().notice, { kind: 'resent' });
});

test('a new challenge drops the attempts of the old one', async () => {
  const { flow, fake, commands } = await atCode();
  fake.answers.verify.push(lost());
  await flow.verify('482913');
  assert.equal(commands.getSnapshot().length, 1);
  fake.answers.begin.push(challenge(C2));
  await flow.renew();
  assert.deepEqual(commands.getSnapshot(), []);
  fake.answers.verify.push(refused(400, 'InvalidArgument', 'committed'));
  await flow.verify('111111');
  assert.deepEqual(fake.calls.at(-1), ['verify', C2, '111111', 'cmd-4']);
});

test('complete() checks the fields first', async () => {
  const { flow, fake } = await atPassword();
  const before = fake.calls.length;
  await flow.complete('', '');
  assert.deepEqual(flow.getSnapshot().notice, {
    kind: 'password-fields',
    newPassword: 'required',
    repeat: undefined,
  });
  await flow.complete('short', 'other');
  assert.deepEqual(flow.getSnapshot().notice, {
    kind: 'password-fields',
    newPassword: 'length',
    repeat: 'mismatch',
  });
  await flow.complete('😀'.repeat(8), '😀'.repeat(8));
  assert.equal(fake.calls.length, before + 1, 'eight code points are enough');
});

test('complete() adopts the new session and clears the reset', async () => {
  const { flow, fake, storage, adopted } = await atPassword();
  const view = { user: { login: 'm.belova' }, csrfToken: 'csrf-2' };
  fake.answers.complete.push(view);
  assert.equal(await flow.complete(' new pass ', ' new pass '), 'done');
  assert.deepEqual(fake.calls.at(-1), [
    'complete',
    { challengeID: C1, proof: 'proof-1', newPassword: ' new pass ' },
    'cmd-3',
  ]);
  assert.deepEqual(adopted, [view]);
  assert.equal(storage.box.record, undefined);
  assert.equal(flow.getSnapshot().step, 'email');
  assert.equal(flow.getSnapshot().email, '');
});

test('refusals of the new password: rejected, expired proof, lost answer', async () => {
  {
    const { flow, fake } = await atPassword();
    fake.answers.complete.push(
      refused(400, 'PasswordRejected', 'not_committed'),
    );
    assert.equal(await flow.complete('new pass 1', 'new pass 1'), 'stay');
    assert.deepEqual(flow.getSnapshot().notice, {
      kind: 'password-fields',
      newPassword: 'length',
      repeat: undefined,
    });
  }
  {
    const { flow, fake, storage } = await atPassword();
    fake.answers.complete.push(refused(404, 'NotFound', 'unavailable'));
    assert.equal(await flow.complete('new pass 1', 'new pass 1'), 'email');
    assert.deepEqual(flow.getSnapshot().notice, { kind: 'proof-expired' });
    assert.equal(flow.getSnapshot().email, 'm.belova@restoran.example');
    assert.equal(storage.box.record, undefined);
  }
  {
    const { flow, fake } = await atPassword();
    fake.answers.complete.push(lost(), { user: {}, csrfToken: 'c' });
    await flow.complete('new pass 1', 'new pass 1');
    assert.deepEqual(flow.getSnapshot().notice, {
      kind: 'unknown',
      action: 'complete',
    });
    assert.equal(await flow.check(), 'done');
    assert.equal(
      fake.calls.at(-1)[2],
      fake.calls.at(-2)[2],
      'the same commandID',
    );
  }
});

test('a reload restores the step from storage', () => {
  const code = setup({
    stored: { email: 'a@b.ru', challenge: challenge(), proof: undefined },
  });
  assert.equal(code.flow.getSnapshot().step, 'code');
  assert.equal(code.flow.getSnapshot().email, 'a@b.ru');
  const password = setup({
    stored: { email: 'a@b.ru', challenge: challenge(), proof: 'proof-1' },
  });
  assert.equal(password.flow.getSnapshot().step, 'password');
});

test('restart() forgets the challenge and its attempts; keepEmail keeps the address', async () => {
  const { flow, fake, storage, commands } = await atCode();
  fake.answers.verify.push(lost());
  await flow.verify('482913');
  flow.restart(true);
  assert.equal(flow.getSnapshot().step, 'email');
  assert.equal(flow.getSnapshot().email, 'm.belova@restoran.example');
  assert.equal(storage.box.record, undefined);
  assert.deepEqual(commands.getSnapshot(), []);
  flow.restart(false);
  assert.equal(flow.getSnapshot().email, '');
});

test('an answer after restart is dropped', async () => {
  const { flow, fake, storage } = await atCode();
  let answer;
  fake.answers.verify.push(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  );
  const pending = flow.verify('482913');
  await settled();
  flow.restart(false);
  answer({
    challenge: challenge(),
    proof: 'late',
    retainUntil: instant(START),
  });
  assert.equal(await pending, 'stay');
  assert.equal(storage.box.record, undefined);
  assert.equal(flow.getSnapshot().step, 'email');
  assert.equal(flow.getSnapshot().busy, false);
});

test('the snapshot is stable between changes and shows a running request', async () => {
  const { flow, fake } = setup();
  assert.equal(flow.getSnapshot(), flow.getSnapshot());
  let answer;
  fake.answers.begin.push(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  );
  const seen = [];
  flow.subscribe(() => seen.push(flow.getSnapshot().busy));
  const pending = flow.request('a@b.ru');
  await settled();
  answer(challenge());
  await pending;
  assert.deepEqual(seen, [true, false]);
});

test('restart during a request in flight sends the next request anew', async () => {
  const { flow, fake, storage } = setup();
  let oldAnswer;
  fake.answers.begin.push(
    () =>
      new Promise((resolve) => {
        oldAnswer = resolve;
      }),
    challenge(C2),
  );
  const old = flow.request('old@b.ru');
  await settled();
  flow.restart(false);
  assert.equal(await flow.request('new@b.ru'), 'code');
  assert.deepEqual(fake.calls, [
    ['begin', 'old@b.ru', 'cmd-1'],
    ['begin', 'new@b.ru', 'cmd-2'],
  ]);
  assert.equal(storage.box.record.email, 'new@b.ru');
  assert.equal(storage.box.record.challenge.challengeID, C2);
  oldAnswer(challenge(C1));
  assert.equal(await old, 'stay');
  assert.equal(storage.box.record.email, 'new@b.ru');
  assert.equal(storage.box.record.challenge.challengeID, C2);
});
