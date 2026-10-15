import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { ApiError, localFailure } from '../../src/application/api.ts';
import { createCommandRunner } from '../../src/application/commands.ts';
import { createEpochRegistry } from '../../src/application/epochs.ts';
import {
  createRegistration,
  isRegisterCodeExpired,
  registerKeys,
} from '../../src/application/registration.ts';

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
const verified = (challengeID = C1) => ({
  challenge: { ...challenge(challengeID), state: 'verified' },
  proof: 'proof-1',
  retainUntil: instant(START + 86_400_000),
});
const userView = { user: { userID: 'u1' }, csrfToken: 'csrf-2' };
const refused = (status, code, outcome, extra = {}) =>
  new ApiError({
    ...localFailure(code, outcome, status),
    retryable: false,
    ...extra,
  });
const lost = () => refused(0, 'Transport', 'unknown');
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
const form = {
  displayName: '  Ирина Ковалёва ',
  email: ' i.kovaleva@example.test ',
  password: 'correct horse',
  repeat: 'correct horse',
  consent: true,
};

function backend() {
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
  const box = { record: initial, saves: [] };
  return {
    box,
    load: () => box.record,
    save: (record) => {
      box.saves.push(JSON.stringify(record));
      box.record = record;
    },
    clear: () => {
      box.record = undefined;
    },
  };
}

function setup({ stored, storage = memory(stored), clock } = {}) {
  const time = clock ?? { now: START };
  let n = 0;
  const commands = createCommandRunner({
    newId: () => `cmd-${String((n += 1))}`,
    now: () => time.now,
    epochs: createEpochRegistry(),
    onReset: () => {},
  });
  const fake = backend();
  const adopted = [];
  const refreshed = { count: 0 };
  // What the check of the session answers: 'ended' is a guest.
  const session = { status: 'ended', checks: 0 };
  const registration = createRegistration({
    api: fake.api,
    commands,
    session: {
      adopt: (view) => adopted.push(view),
      check: () => {
        session.checks += 1;
        return Promise.resolve(session.status);
      },
    },
    access: {
      refresh: () => {
        refreshed.count += 1;
        return Promise.resolve({ status: 'loading' });
      },
    },
    storage,
    now: () => time.now,
  });
  return {
    registration,
    fake,
    storage,
    clock: time,
    commands,
    adopted,
    refreshed,
    session,
  };
}

async function atCode(options) {
  const context = setup(options);
  context.fake.answers.begin.push(challenge());
  await context.registration.submit(form);
  return context;
}

test('a fresh registration is at the form with nothing to show', () => {
  const { registration } = setup();
  assert.deepEqual(registration.getSnapshot(), {
    step: 'form',
    email: '',
    displayName: '',
    expiresAtMs: undefined,
    resendAtMs: undefined,
    busy: false,
    notice: undefined,
  });
});

test('registration goes from the form through the code to a new session', async () => {
  const { registration, fake, storage, adopted, refreshed } = setup();
  fake.answers.begin.push(challenge());
  await registration.submit(form);
  assert.deepEqual(fake.calls, [['begin', 'i.kovaleva@example.test', 'cmd-1']]);
  let snapshot = registration.getSnapshot();
  assert.equal(snapshot.step, 'code');
  assert.equal(snapshot.email, 'i.kovaleva@example.test');
  assert.equal(snapshot.displayName, 'Ирина Ковалёва');
  assert.equal(snapshot.expiresAtMs, START + 600_000);
  assert.equal(snapshot.resendAtMs, START + 60_000);
  assert.deepEqual(storage.box.record, {
    email: 'i.kovaleva@example.test',
    displayName: 'Ирина Ковалёва',
    challenge: challenge(),
    proof: undefined,
  });

  fake.answers.verify.push(verified());
  fake.answers.complete.push(userView);
  await registration.verify('482 913');
  assert.deepEqual(fake.calls.slice(1), [
    ['verify', C1, '482913', 'cmd-2'],
    [
      'complete',
      {
        challengeID: C1,
        proof: 'proof-1',
        password: 'correct horse',
        displayName: 'Ирина Ковалёва',
      },
      'cmd-3',
    ],
  ]);
  snapshot = registration.getSnapshot();
  assert.equal(snapshot.step, 'done');
  assert.equal(snapshot.busy, false);
  assert.equal(snapshot.notice, undefined);
  assert.deepEqual(adopted, [userView]);
  assert.equal(refreshed.count, 1);
  assert.equal(storage.box.record, undefined);
});

test('the flow stays busy between the check of the code and the completion', async () => {
  const { registration, fake } = await atCode();
  const seen = [];
  registration.subscribe(() => seen.push(registration.getSnapshot().busy));
  fake.answers.verify.push(verified());
  fake.answers.complete.push(userView);
  await registration.verify('482913');
  assert.deepEqual(seen, [true, true, false]);
});

test('the form is checked before any request', async () => {
  const { registration, fake, storage } = setup();
  await registration.submit({
    displayName: ' ',
    email: ' ',
    password: '',
    repeat: '',
    consent: false,
  });
  assert.deepEqual(registration.getSnapshot().notice, {
    kind: 'fields',
    name: 'required',
    email: 'required',
    password: 'required',
    repeat: undefined,
  });
  await registration.submit({
    displayName: 'И',
    email: 'not-an-email',
    password: 'short',
    repeat: 'other',
    consent: true,
  });
  assert.deepEqual(registration.getSnapshot().notice, {
    kind: 'fields',
    name: 'length',
    email: 'format',
    password: 'length',
    repeat: 'mismatch',
  });
  await registration.submit({
    ...form,
    displayName: 'И'.repeat(81),
    password: 'x'.repeat(33),
    repeat: 'x'.repeat(33),
  });
  assert.deepEqual(registration.getSnapshot().notice, {
    kind: 'fields',
    name: 'length',
    email: undefined,
    password: 'length',
    repeat: undefined,
  });
  assert.deepEqual(fake.calls, []);
  assert.equal(storage.box.record, undefined);
  assert.equal(registration.getSnapshot().step, 'form');
});

test('the consent is asked for once the fields are in order', async () => {
  const { registration, fake } = setup();
  await registration.submit({ ...form, consent: false });
  assert.deepEqual(registration.getSnapshot().notice, { kind: 'consent' });
  assert.equal(registration.getSnapshot().step, 'form');
  assert.deepEqual(fake.calls, []);
});

test('the form keeps the typed name and email after a fault', async () => {
  const { registration } = setup();
  await registration.submit({ ...form, password: '' });
  const snapshot = registration.getSnapshot();
  assert.equal(snapshot.displayName, 'Ирина Ковалёва');
  assert.equal(snapshot.email, 'i.kovaleva@example.test');
});

test('the name and the password are counted in code points', async () => {
  const { registration, fake } = setup();
  fake.answers.begin.push(challenge());
  await registration.submit({
    ...form,
    displayName: '😀😀',
    password: '😀'.repeat(8),
    repeat: '😀'.repeat(8),
  });
  assert.equal(registration.getSnapshot().step, 'code');
  assert.equal(registration.getSnapshot().notice, undefined);
});

test('the password is neither trimmed nor stored', async () => {
  const { registration, fake, storage } = setup();
  fake.answers.begin.push(challenge());
  await registration.submit({
    ...form,
    password: ' pass word ',
    repeat: ' pass word ',
  });
  fake.answers.verify.push(verified());
  fake.answers.complete.push(userView);
  await registration.verify('482913');
  assert.equal(fake.calls[2][1].password, ' pass word ');
  for (const saved of storage.box.saves) {
    assert.equal(saved.includes('pass word'), false);
  }
});

test('a wrong code format and a code past its time are told without a request', async () => {
  const { registration, fake, clock } = await atCode();
  await registration.verify('12345');
  assert.deepEqual(registration.getSnapshot().notice, { kind: 'code-format' });
  clock.now = START + 600_000;
  await registration.verify('482913');
  assert.deepEqual(registration.getSnapshot().notice, { kind: 'expired' });
  assert.equal(
    isRegisterCodeExpired(registration.getSnapshot(), clock.now - 1),
    false,
  );
  assert.equal(
    isRegisterCodeExpired(registration.getSnapshot(), clock.now),
    true,
  );
  assert.equal(
    isRegisterCodeExpired(
      { ...registration.getSnapshot(), step: 'form' },
      clock.now,
    ),
    false,
  );
  assert.equal(fake.calls.length, 1);
});

test('a wrong code, a locked code and an expired code are told apart', async () => {
  const { registration, fake } = await atCode();
  fake.answers.verify.push(refused(400, 'InvalidArgument', 'committed'));
  await registration.verify('111111');
  assert.deepEqual(registration.getSnapshot().notice, { kind: 'wrong-code' });
  fake.answers.verify.push(refused(400, 'ChallengeLocked', 'committed'));
  await registration.verify('111111');
  assert.deepEqual(registration.getSnapshot().notice, { kind: 'locked' });
  fake.answers.verify.push(refused(404, 'NotFound', 'not_committed'));
  await registration.verify('111111');
  assert.deepEqual(registration.getSnapshot().notice, { kind: 'expired' });
  assert.equal(registration.getSnapshot().step, 'code');
});

test('a rate limit waits retryAfterSeconds, or a minute when none is given', async () => {
  const { registration, fake, clock } = await atCode();
  fake.answers.verify.push(
    refused(429, 'RateLimited', 'not_committed', { retryAfterSeconds: 30 }),
  );
  await registration.verify('111111');
  assert.deepEqual(registration.getSnapshot().notice, {
    kind: 'limited',
    untilMs: clock.now + 30_000,
  });
  fake.answers.resend.push(refused(429, 'RateLimited', 'not_committed'));
  await registration.resend();
  assert.deepEqual(registration.getSnapshot().notice, {
    kind: 'limited',
    untilMs: clock.now + 60_000,
  });
});

test('resend() keeps the step with a new code', async () => {
  const { registration, fake, storage, clock } = await atCode();
  clock.now = START + 70_000;
  fake.answers.resend.push(challenge(C1, clock.now));
  await registration.resend();
  assert.deepEqual(fake.calls[1], ['resend', C1, 'cmd-2']);
  const snapshot = registration.getSnapshot();
  assert.deepEqual(snapshot.notice, { kind: 'resent' });
  assert.equal(snapshot.step, 'code');
  assert.equal(snapshot.expiresAtMs, clock.now + 600_000);
  assert.equal(
    storage.box.record.challenge.expiresAt.epochMs,
    clock.now + 600_000,
  );
});

test('resend() of a challenge that is gone starts over with the expiry notice', async () => {
  const { registration, fake, storage } = await atCode();
  fake.answers.resend.push(refused(404, 'NotFound', 'not_committed'));
  await registration.resend();
  const snapshot = registration.getSnapshot();
  assert.equal(snapshot.step, 'form');
  assert.deepEqual(snapshot.notice, { kind: 'expired' });
  assert.equal(snapshot.email, 'i.kovaleva@example.test');
  assert.equal(storage.box.record, undefined);
});

test('requestCode() asks for a new code for the same address', async () => {
  const { registration, fake, storage } = await atCode();
  fake.answers.begin.push(challenge(C2, START + 10));
  await registration.requestCode();
  assert.deepEqual(fake.calls[1], [
    'begin',
    'i.kovaleva@example.test',
    fake.calls[1][2],
  ]);
  assert.equal(registration.getSnapshot().step, 'code');
  assert.equal(storage.box.record.challenge.challengeID, C2);
  // The password of the first attempt still completes the registration.
  fake.answers.verify.push(verified(C2));
  fake.answers.complete.push(userView);
  await registration.verify('482913');
  assert.equal(registration.getSnapshot().step, 'done');
});

test('the refusals of the code request', async () => {
  const cases = [
    [refused(403, 'Forbidden', 'not_committed'), { kind: 'closed' }],
    [
      refused(400, 'InvalidArgument', 'not_committed'),
      {
        kind: 'fields',
        name: undefined,
        email: 'format',
        password: undefined,
        repeat: undefined,
      },
    ],
    [
      refused(429, 'RateLimited', 'not_committed', { retryAfterSeconds: 90 }),
      { kind: 'limited', untilMs: START + 90_000 },
    ],
    [
      refused(429, 'RateLimited', 'not_committed'),
      { kind: 'limited', untilMs: START + 60_000 },
    ],
    [refused(503, 'AuthUnavailable', 'unavailable'), { kind: 'unavailable' }],
  ];
  for (const [failure, notice] of cases) {
    const { registration, fake, storage } = setup();
    fake.answers.begin.push(failure);
    await registration.submit(form);
    const snapshot = registration.getSnapshot();
    assert.deepEqual(snapshot.notice, notice, failure.failure.code);
    assert.equal(snapshot.step, 'form');
    assert.equal(snapshot.busy, false);
    assert.equal(storage.box.record, undefined);
  }
});

test('an old proof turns the registration back to the form', async () => {
  const { registration, fake, storage } = await atCode();
  fake.answers.verify.push(verified());
  fake.answers.complete.push(refused(404, 'NotFound', 'not_committed'));
  await registration.verify('482913');
  const snapshot = registration.getSnapshot();
  assert.equal(snapshot.step, 'form');
  assert.deepEqual(snapshot.notice, { kind: 'proof-expired' });
  assert.equal(snapshot.email, 'i.kovaleva@example.test');
  assert.equal(storage.box.record, undefined);
});

test('an email that got an account meanwhile is told, and the dead attempt is dropped', async () => {
  const { registration, fake, storage, adopted } = await atCode();
  fake.answers.verify.push(verified());
  fake.answers.complete.push(refused(409, 'CommandConflict', 'not_committed'));
  await registration.verify('482913');
  assert.deepEqual(registration.getSnapshot().notice, { kind: 'email-taken' });
  assert.equal(registration.getSnapshot().step, 'form');
  assert.equal(storage.box.record, undefined);
  assert.deepEqual(adopted, []);
});

test('a completion refused with a session behind it starts over silently', async () => {
  const { registration, fake, storage, session } = await atCode();
  session.status = 'active';
  fake.answers.verify.push(verified());
  fake.answers.complete.push(refused(403, 'Forbidden', 'not_committed'));
  await registration.verify('482913');
  const snapshot = registration.getSnapshot();
  assert.equal(session.checks, 1);
  assert.equal(snapshot.step, 'form');
  assert.equal(snapshot.notice, undefined);
  assert.equal(snapshot.busy, false);
  assert.equal(storage.box.record, undefined);
});

test('a completion refused without a session says that registration is closed', async () => {
  const { registration, fake, storage, session, adopted } = await atCode();
  session.status = 'ended';
  fake.answers.verify.push(verified());
  fake.answers.complete.push(refused(403, 'Forbidden', 'not_committed'));
  await registration.verify('482913');
  const snapshot = registration.getSnapshot();
  assert.equal(session.checks, 1);
  assert.equal(snapshot.step, 'form');
  assert.deepEqual(snapshot.notice, { kind: 'closed' });
  assert.equal(snapshot.busy, false);
  assert.equal(snapshot.email, 'i.kovaleva@example.test');
  assert.equal(storage.box.record, undefined);
  assert.deepEqual(adopted, []);
});

test('a completion refused while the session cannot be checked keeps the attempt', async () => {
  const { registration, fake, storage, session } = await atCode();
  session.status = 'unknown';
  fake.answers.verify.push(verified());
  fake.answers.complete.push(refused(403, 'Forbidden', 'not_committed'));
  await registration.verify('482913');
  const snapshot = registration.getSnapshot();
  assert.equal(snapshot.step, 'details');
  assert.deepEqual(snapshot.notice, { kind: 'unavailable' });
  assert.equal(snapshot.busy, false);
  assert.ok(storage.box.record.proof);
});

test('a completion refused on the details step after a reload is told the same way', async () => {
  const { storage } = await atCode();
  storage.box.record = { ...storage.box.record, proof: 'proof-1' };
  const reloaded = setup({ storage });
  reloaded.session.status = 'ended';
  reloaded.fake.answers.complete.push(
    refused(403, 'Forbidden', 'not_committed'),
  );
  await reloaded.registration.completeDetails({
    displayName: 'Ирина Ковалёва',
    password: 'correct horse',
    repeat: 'correct horse',
  });
  assert.deepEqual(reloaded.registration.getSnapshot().notice, {
    kind: 'closed',
  });
  assert.equal(reloaded.registration.getSnapshot().step, 'form');
  assert.equal(storage.box.record, undefined);
});

test('a code check and a new code refused with 403 say that registration is closed', async () => {
  const { registration, fake, storage, session } = await atCode();
  fake.answers.verify.push(refused(403, 'Forbidden', 'not_committed'));
  await registration.verify('482913');
  assert.deepEqual(registration.getSnapshot().notice, { kind: 'closed' });
  fake.answers.resend.push(refused(403, 'Forbidden', 'not_committed'));
  await registration.resend();
  assert.deepEqual(registration.getSnapshot().notice, { kind: 'closed' });
  // Only a completion has to tell a signed-in user from a closed service.
  assert.equal(session.checks, 0);
  assert.equal(registration.getSnapshot().step, 'code');
  assert.ok(storage.box.record);
});

test('the server refusing a checked form is told as a form problem', async () => {
  const { registration, fake } = await atCode();
  fake.answers.verify.push(verified());
  fake.answers.complete.push(refused(400, 'InvalidArgument', 'not_committed'));
  await registration.verify('482913');
  assert.deepEqual(registration.getSnapshot().notice, {
    kind: 'fields',
    name: 'length',
    email: undefined,
    password: 'length',
    repeat: undefined,
  });
  assert.equal(registration.getSnapshot().step, 'details');
});

test('an ended session at the completion starts over without a notice', async () => {
  const { registration, fake, storage } = await atCode();
  fake.answers.verify.push(verified());
  fake.answers.complete.push(refused(401, 'Unauthenticated', 'not_committed'));
  await registration.verify('482913');
  const snapshot = registration.getSnapshot();
  assert.equal(snapshot.step, 'form');
  assert.equal(snapshot.notice, undefined);
  assert.equal(snapshot.busy, false);
  assert.equal(storage.box.record, undefined);
});

test('a lost answer to the check of the code is repeated with the same commandID', async () => {
  const { registration, fake, commands } = await atCode();
  fake.answers.verify.push(lost());
  await registration.verify('482 913');
  assert.deepEqual(registration.getSnapshot().notice, {
    kind: 'unknown',
    action: 'verify',
  });
  assert.equal(commands.getSnapshot()[0].label, 'проверки кода');
  assert.equal(commands.getSnapshot()[0].key, registerKeys.verify);
  fake.answers.verify.push(verified());
  fake.answers.complete.push(userView);
  await registration.check();
  assert.deepEqual(fake.calls[1], ['verify', C1, '482913', 'cmd-2']);
  assert.deepEqual(fake.calls[2], ['verify', C1, '482913', 'cmd-2']);
  assert.equal(registration.getSnapshot().step, 'done');
  assert.equal(commands.getSnapshot().length, 0);
});

test('a lost answer to the code request is repeated with the same commandID', async () => {
  const { registration, fake, commands } = setup();
  fake.answers.begin.push(lost(), challenge());
  await registration.submit(form);
  assert.deepEqual(registration.getSnapshot().notice, {
    kind: 'unknown',
    action: 'begin',
  });
  assert.equal(registration.getSnapshot().step, 'form');
  assert.equal(commands.getSnapshot()[0].label, 'запроса кода');
  assert.equal(commands.getSnapshot()[0].key, registerKeys.begin);
  await registration.check();
  assert.deepEqual(fake.calls, [
    ['begin', 'i.kovaleva@example.test', 'cmd-1'],
    ['begin', 'i.kovaleva@example.test', 'cmd-1'],
  ]);
  assert.equal(registration.getSnapshot().step, 'code');
  assert.equal(registration.getSnapshot().notice, undefined);
});

test('a lost answer to the resend is repeated with the same commandID', async () => {
  const { registration, fake, commands } = await atCode();
  fake.answers.resend.push(lost(), challenge(C1, START + 5));
  await registration.resend();
  assert.deepEqual(registration.getSnapshot().notice, {
    kind: 'unknown',
    action: 'resend',
  });
  assert.equal(commands.getSnapshot()[0].label, 'повторной отправки кода');
  assert.equal(commands.getSnapshot()[0].key, registerKeys.resend);
  await registration.check();
  assert.deepEqual(fake.calls.slice(1), [
    ['resend', C1, 'cmd-2'],
    ['resend', C1, 'cmd-2'],
  ]);
  assert.deepEqual(registration.getSnapshot().notice, { kind: 'resent' });
});

test('a lost answer to the creation of the account is repeated with the same commandID', async () => {
  const { registration, fake, commands, adopted } = await atCode();
  fake.answers.verify.push(verified());
  fake.answers.complete.push(lost(), userView);
  await registration.verify('482913');
  assert.deepEqual(registration.getSnapshot().notice, {
    kind: 'unknown',
    action: 'complete',
  });
  assert.equal(registration.getSnapshot().step, 'details');
  assert.equal(commands.getSnapshot()[0].label, 'создания учётной записи');
  assert.equal(commands.getSnapshot()[0].key, registerKeys.complete);
  await registration.check();
  assert.equal(fake.calls[2][2], 'cmd-3');
  assert.equal(fake.calls[3][2], 'cmd-3');
  assert.equal(fake.calls[3][1].password, 'correct horse');
  assert.equal(registration.getSnapshot().step, 'done');
  assert.deepEqual(adopted, [userView]);
});

test('check() without an unknown outcome does nothing', async () => {
  const { registration, fake } = await atCode();
  await registration.check();
  assert.equal(fake.calls.length, 1);
});

test('a reload after the proof asks for the name and the password again', async () => {
  const { registration, fake, storage } = await atCode();
  fake.answers.verify.push(verified());
  fake.answers.complete.push(lost());
  await registration.verify('482913');
  assert.ok(storage.box.record.proof);
  for (const saved of storage.box.saves) {
    assert.equal(saved.includes('correct horse'), false);
  }

  const reloaded = setup({ storage });
  let snapshot = reloaded.registration.getSnapshot();
  assert.equal(snapshot.step, 'details');
  assert.equal(snapshot.displayName, 'Ирина Ковалёва');
  assert.equal(snapshot.email, 'i.kovaleva@example.test');
  assert.equal(snapshot.notice, undefined);

  // The password is gone: nothing is sent until it is typed again.
  await reloaded.registration.check();
  assert.deepEqual(reloaded.fake.calls, []);
  await reloaded.registration.completeDetails({
    displayName: 'Ирина Ковалёва',
    password: '',
    repeat: '',
  });
  assert.equal(reloaded.registration.getSnapshot().notice.kind, 'fields');
  assert.deepEqual(reloaded.fake.calls, []);

  reloaded.fake.answers.complete.push(userView);
  await reloaded.registration.completeDetails({
    displayName: ' Ирина К. ',
    password: 'another horse',
    repeat: 'another horse',
  });
  assert.deepEqual(reloaded.fake.calls, [
    [
      'complete',
      {
        challengeID: C1,
        proof: 'proof-1',
        password: 'another horse',
        displayName: 'Ирина К.',
      },
      'cmd-1',
    ],
  ]);
  snapshot = reloaded.registration.getSnapshot();
  assert.equal(snapshot.step, 'done');
  assert.deepEqual(reloaded.adopted, [userView]);
  assert.equal(storage.box.record, undefined);
});

test('completeDetails() needs a proof', async () => {
  const { registration, fake } = await atCode();
  await registration.completeDetails({
    displayName: 'Ирина',
    password: 'correct horse',
    repeat: 'correct horse',
  });
  assert.equal(fake.calls.length, 1);
});

test('a reload during the code step opens the code step', async () => {
  const { storage } = await atCode();
  const reloaded = setup({ storage });
  const snapshot = reloaded.registration.getSnapshot();
  assert.equal(snapshot.step, 'code');
  assert.equal(snapshot.expiresAtMs, START + 600_000);
  reloaded.fake.answers.verify.push(verified());
  await reloaded.registration.verify('482913');
  // Without the password in memory the registration waits for the details.
  assert.equal(reloaded.registration.getSnapshot().step, 'details');
  assert.deepEqual(
    reloaded.fake.calls.map(([name]) => name),
    ['verify'],
  );
});

test('restart() forgets the attempt and the inputs', async () => {
  const { registration, fake, storage, commands } = await atCode();
  fake.answers.verify.push(lost());
  await registration.verify('482913');
  registration.restart();
  const snapshot = registration.getSnapshot();
  assert.equal(snapshot.step, 'form');
  assert.equal(snapshot.notice, undefined);
  assert.equal(snapshot.displayName, '');
  assert.equal(snapshot.email, '');
  assert.equal(storage.box.record, undefined);
  assert.equal(commands.getSnapshot().length, 0);
  await registration.check();
  assert.equal(fake.calls.length, 2);
});

test('restart() after the result opens a fresh form', async () => {
  const { registration, fake } = await atCode();
  fake.answers.verify.push(verified());
  fake.answers.complete.push(userView);
  await registration.verify('482913');
  assert.equal(registration.getSnapshot().step, 'done');
  registration.restart();
  assert.equal(registration.getSnapshot().step, 'form');
});

test('an answer that arrives after restart() is dropped', async () => {
  const { registration, fake, storage } = setup();
  let release;
  fake.answers.begin.push(
    () =>
      new Promise((resolve) => {
        release = () => resolve(challenge());
      }),
  );
  const pending = registration.submit(form);
  await settled();
  assert.equal(registration.getSnapshot().busy, true);
  registration.restart();
  release();
  await pending;
  const snapshot = registration.getSnapshot();
  assert.equal(snapshot.step, 'form');
  assert.equal(snapshot.busy, false);
  assert.equal(storage.box.record, undefined);
});

test('subscribers hear every change', async () => {
  const { registration, fake } = setup();
  let heard = 0;
  const stop = registration.subscribe(() => {
    heard += 1;
  });
  fake.answers.begin.push(challenge());
  await registration.submit(form);
  assert.ok(heard >= 2);
  const before = heard;
  stop();
  registration.restart();
  assert.equal(heard, before);
});

test('a new code that Auth does not take is a message on the code step', async () => {
  const { registration, fake, storage } = await atCode();
  fake.answers.begin.push(refused(400, 'InvalidArgument', 'not_committed'));
  await registration.requestCode();
  const snapshot = registration.getSnapshot();
  assert.deepEqual(snapshot.notice, { kind: 'not-sent' });
  // The code that was sent stays usable.
  assert.equal(snapshot.step, 'code');
  assert.equal(storage.box.record.challenge.challengeID, C1);
  assert.equal(snapshot.busy, false);
});

async function atLostCompletion() {
  const context = await atCode();
  context.fake.answers.verify.push(verified());
  context.fake.answers.complete.push(lost());
  await context.registration.verify('482913');
  assert.deepEqual(context.registration.getSnapshot().notice, {
    kind: 'unknown',
    action: 'complete',
  });
  return context;
}

const completions = (fake) =>
  fake.calls.filter(([name]) => name === 'complete');

test('check() and the same name and password send one body under one commandID', async () => {
  const { registration, fake } = await atLostCompletion();
  fake.answers.complete.push(lost(), userView);
  await registration.check();
  await registration.completeDetails({
    displayName: 'Ирина Ковалёва',
    password: 'correct horse',
    repeat: 'correct horse',
  });
  const sent = completions(fake);
  assert.equal(sent.length, 3);
  for (const call of sent) {
    assert.equal(call[2], sent[0][2]);
    assert.deepEqual(call[1], sent[0][1]);
  }
  assert.equal(sent[0][1].password, 'correct horse');
  assert.equal(registration.getSnapshot().step, 'done');
});

test('another name or password after a lost completion is a new command, not a conflict', async () => {
  const cases = [
    ['Ирина К.', 'correct horse'],
    ['Ирина Ковалёва', 'another horse'],
  ];
  for (const [displayName, password] of cases) {
    const { registration, fake, commands } = await atLostCompletion();
    fake.answers.complete.push(userView);
    await registration.completeDetails({
      displayName,
      password,
      repeat: password,
    });
    const sent = completions(fake);
    assert.equal(sent.length, 2, displayName + password);
    assert.notEqual(sent[1][2], sent[0][2]);
    assert.equal(sent[1][1].displayName, displayName);
    assert.equal(sent[1][1].password, password);
    assert.equal(sent[1][1].proof, sent[0][1].proof);
    assert.equal(registration.getSnapshot().step, 'done');
    assert.deepEqual(commands.getSnapshot(), []);
  }
});

test('another name or password after a reload drops the attempt of the old key', async () => {
  const { storage } = await atLostCompletion();
  // The tab was reloaded: the runner starts empty, the proof is in storage.
  const reloaded = setup({ storage });
  reloaded.fake.answers.complete.push(lost(), userView);
  await reloaded.registration.completeDetails({
    displayName: 'Ирина Ковалёва',
    password: 'correct horse',
    repeat: 'correct horse',
  });
  assert.equal(reloaded.registration.getSnapshot().notice.kind, 'unknown');
  await reloaded.registration.completeDetails({
    displayName: 'Ирина Ковалёва',
    password: 'another horse',
    repeat: 'another horse',
  });
  const sent = completions(reloaded.fake);
  assert.equal(sent.length, 2);
  assert.notEqual(sent[1][2], sent[0][2]);
  assert.equal(sent[1][1].password, 'another horse');
  assert.equal(reloaded.registration.getSnapshot().step, 'done');
});
