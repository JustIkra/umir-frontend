import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { ApiError, localFailure } from '../../src/application/api.ts';
import { createCommandRunner } from '../../src/application/commands.ts';
import { createEpochRegistry } from '../../src/application/epochs.ts';
import {
  acceptKeys,
  createInvitationAcceptance,
  isAcceptCodeExpired,
} from '../../src/application/invitation-acceptance.ts';

const I = '22222222-2222-4222-8222-222222222222';
const I2 = '99999999-9999-4999-8999-999999999999';
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
const membership = {
  membershipID: '66666666-6666-4666-8666-666666666666',
  membershipVersion: '1',
  userID: '11111111-1111-4111-8111-111111111111',
  orgID: '33333333-3333-4333-8333-333333333333',
  orgRoles: [],
  assignments: [],
  state: 'active',
};
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
  password: 'correct horse',
  repeat: 'correct horse',
};

function invitations() {
  const calls = [];
  const answers = {
    begin: [],
    verify: [],
    resend: [],
    complete: [],
    accept: [],
  };
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
      accept: (...args) => take('accept', args),
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
  const fake = invitations();
  const adopted = [];
  const refreshed = { count: 0 };
  const acceptance = createInvitationAcceptance({
    api: fake.api,
    commands,
    session: { adopt: (view) => adopted.push(view) },
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
    acceptance,
    fake,
    storage,
    clock: time,
    commands,
    adopted,
    refreshed,
  };
}

async function registerAtCode(options) {
  const context = setup(options);
  context.acceptance.open(I, 'register');
  context.fake.answers.begin.push(challenge());
  await context.acceptance.register(form);
  return context;
}

async function acceptAtCode(options) {
  const context = setup(options);
  context.acceptance.open(I, 'accept');
  context.fake.answers.begin.push(challenge());
  await context.acceptance.requestCode();
  return context;
}

test('before open() the flow is at the start with nothing to show', () => {
  const { acceptance } = setup();
  assert.deepEqual(acceptance.getSnapshot(), {
    invitationID: undefined,
    mode: 'register',
    step: 'start',
    displayName: '',
    expiresAtMs: undefined,
    resendAtMs: undefined,
    busy: false,
    notice: undefined,
    membership: undefined,
  });
});

test('registration goes from the form through the code to a new session', async () => {
  const { acceptance, fake, storage, adopted, refreshed } = setup();
  acceptance.open(I, 'register');
  assert.equal(acceptance.getSnapshot().step, 'start');
  fake.answers.begin.push(challenge());
  await acceptance.register(form);
  assert.deepEqual(fake.calls, [['begin', I, 'cmd-1']]);
  let snapshot = acceptance.getSnapshot();
  assert.equal(snapshot.step, 'code');
  assert.equal(snapshot.displayName, 'Ирина Ковалёва');
  assert.equal(snapshot.expiresAtMs, START + 600_000);
  assert.equal(snapshot.resendAtMs, START + 60_000);
  assert.equal(snapshot.invitationID, I);
  assert.deepEqual(storage.box.record, {
    invitationID: I,
    mode: 'register',
    displayName: 'Ирина Ковалёва',
    challenge: challenge(),
    proof: undefined,
  });

  fake.answers.verify.push(verified());
  fake.answers.complete.push(userView);
  await acceptance.verify('482 913');
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
  snapshot = acceptance.getSnapshot();
  assert.equal(snapshot.step, 'done');
  assert.equal(snapshot.membership, undefined);
  assert.equal(snapshot.busy, false);
  assert.equal(snapshot.notice, undefined);
  assert.deepEqual(adopted, [userView]);
  assert.equal(refreshed.count, 1);
  assert.equal(storage.box.record, undefined);
});

test('a signed-in invitee asks for a code and accepts the invitation', async () => {
  const { acceptance, fake, storage, adopted, refreshed } = setup();
  acceptance.open(I, 'accept');
  fake.answers.begin.push(challenge());
  await acceptance.requestCode();
  assert.equal(acceptance.getSnapshot().step, 'code');
  assert.equal(storage.box.record.displayName, '');
  assert.equal(storage.box.record.mode, 'accept');
  fake.answers.verify.push(verified());
  fake.answers.accept.push(membership);
  await acceptance.verify('482913');
  assert.deepEqual(fake.calls.slice(1), [
    ['verify', C1, '482913', 'cmd-2'],
    ['accept', I, { challengeID: C1, proof: 'proof-1' }, 'cmd-3'],
  ]);
  const snapshot = acceptance.getSnapshot();
  assert.equal(snapshot.step, 'done');
  assert.deepEqual(snapshot.membership, membership);
  assert.deepEqual(adopted, []);
  assert.equal(refreshed.count, 1);
  assert.equal(storage.box.record, undefined);
});

test('the flow stays busy between the check of the code and the next call', async () => {
  const { acceptance, fake } = await registerAtCode();
  const seen = [];
  acceptance.subscribe(() => seen.push(acceptance.getSnapshot().busy));
  fake.answers.verify.push(verified());
  fake.answers.complete.push(userView);
  await acceptance.verify('482913');
  assert.deepEqual(seen, [true, true, false]);
});

test('open() again with the same arguments keeps the form inputs and the answers', async () => {
  const { acceptance, fake } = await registerAtCode();
  acceptance.open(I, 'register');
  assert.equal(acceptance.getSnapshot().step, 'code');
  fake.answers.verify.push(verified());
  fake.answers.complete.push(userView);
  await acceptance.verify('482913');
  assert.equal(acceptance.getSnapshot().step, 'done');
  // The page re-opens in accept mode once the session is active: the result stays.
  acceptance.open(I, 'accept');
  assert.equal(acceptance.getSnapshot().step, 'done');
});

test('the form is checked before any request', async () => {
  const { acceptance, fake, storage } = setup();
  acceptance.open(I, 'register');
  await acceptance.register({ displayName: ' ', password: '', repeat: '' });
  assert.deepEqual(acceptance.getSnapshot().notice, {
    kind: 'fields',
    name: 'required',
    password: 'required',
    repeat: undefined,
  });
  await acceptance.register({
    displayName: 'И',
    password: 'short',
    repeat: 'other',
  });
  assert.deepEqual(acceptance.getSnapshot().notice, {
    kind: 'fields',
    name: 'length',
    password: 'length',
    repeat: 'mismatch',
  });
  await acceptance.register({
    displayName: 'И'.repeat(81),
    password: 'x'.repeat(33),
    repeat: 'x'.repeat(33),
  });
  assert.deepEqual(acceptance.getSnapshot().notice, {
    kind: 'fields',
    name: 'length',
    password: 'length',
    repeat: undefined,
  });
  assert.deepEqual(fake.calls, []);
  assert.equal(storage.box.record, undefined);
  assert.equal(acceptance.getSnapshot().step, 'start');
});

test('the name and the password are counted in code points', async () => {
  const { acceptance, fake } = setup();
  acceptance.open(I, 'register');
  fake.answers.begin.push(challenge());
  // Four astral characters are four code points, eight UTF-16 units.
  await acceptance.register({
    displayName: '😀😀',
    password: '😀'.repeat(8),
    repeat: '😀'.repeat(8),
  });
  assert.equal(acceptance.getSnapshot().step, 'code');
  assert.equal(acceptance.getSnapshot().notice, undefined);
});

test('the password and the repeat are neither trimmed nor stored', async () => {
  const { acceptance, fake, storage } = setup();
  acceptance.open(I, 'register');
  fake.answers.begin.push(challenge());
  await acceptance.register({
    displayName: 'Ирина',
    password: ' pass word ',
    repeat: ' pass word ',
  });
  fake.answers.verify.push(verified());
  fake.answers.complete.push(userView);
  await acceptance.verify('482913');
  assert.equal(fake.calls[2][1].password, ' pass word ');
  for (const saved of storage.box.saves) {
    assert.equal(saved.includes('pass word'), false);
  }
});

test('a wrong code format and a code past its time are told without a request', async () => {
  const { acceptance, fake, clock } = await registerAtCode();
  await acceptance.verify('12345');
  assert.deepEqual(acceptance.getSnapshot().notice, { kind: 'code-format' });
  await acceptance.verify('12345a');
  assert.deepEqual(acceptance.getSnapshot().notice, { kind: 'code-format' });
  clock.now = START + 600_000;
  await acceptance.verify('482913');
  assert.deepEqual(acceptance.getSnapshot().notice, { kind: 'expired' });
  assert.equal(
    isAcceptCodeExpired(acceptance.getSnapshot(), clock.now - 1),
    false,
  );
  assert.equal(isAcceptCodeExpired(acceptance.getSnapshot(), clock.now), true);
  assert.equal(
    isAcceptCodeExpired(
      { ...acceptance.getSnapshot(), step: 'start' },
      clock.now,
    ),
    false,
  );
  assert.equal(fake.calls.length, 1);
});

test('a wrong code, a locked code and an expired code are told apart', async () => {
  const { acceptance, fake } = await registerAtCode();
  fake.answers.verify.push(refused(400, 'InvalidArgument', 'committed'));
  await acceptance.verify('111111');
  assert.deepEqual(acceptance.getSnapshot().notice, { kind: 'wrong-code' });
  assert.equal(acceptance.getSnapshot().step, 'code');
  fake.answers.verify.push(refused(400, 'ChallengeLocked', 'committed'));
  await acceptance.verify('111111');
  assert.deepEqual(acceptance.getSnapshot().notice, { kind: 'locked' });
  fake.answers.verify.push(refused(404, 'NotFound', 'not_committed'));
  await acceptance.verify('111111');
  assert.deepEqual(acceptance.getSnapshot().notice, { kind: 'expired' });
  assert.equal(acceptance.getSnapshot().step, 'code');
});

test('a rate limit waits retryAfterSeconds, or a minute when none is given', async () => {
  const { acceptance, fake, clock } = await registerAtCode();
  fake.answers.verify.push(
    refused(429, 'RateLimited', 'not_committed', { retryAfterSeconds: 30 }),
  );
  await acceptance.verify('111111');
  assert.deepEqual(acceptance.getSnapshot().notice, {
    kind: 'limited',
    untilMs: clock.now + 30_000,
  });
  fake.answers.resend.push(refused(429, 'RateLimited', 'not_committed'));
  await acceptance.resend();
  assert.deepEqual(acceptance.getSnapshot().notice, {
    kind: 'limited',
    untilMs: clock.now + 60_000,
  });
});

test('resend() keeps the step with a new code and forgets the old attempt', async () => {
  const { acceptance, fake, storage, clock } = await registerAtCode();
  clock.now = START + 70_000;
  fake.answers.resend.push(challenge(C1, clock.now));
  await acceptance.resend();
  assert.deepEqual(fake.calls[1], ['resend', C1, 'cmd-2']);
  const snapshot = acceptance.getSnapshot();
  assert.deepEqual(snapshot.notice, { kind: 'resent' });
  assert.equal(snapshot.step, 'code');
  assert.equal(snapshot.expiresAtMs, clock.now + 600_000);
  assert.equal(
    storage.box.record.challenge.expiresAt.epochMs,
    clock.now + 600_000,
  );
});

test('resend() of a challenge that is gone starts over with the expiry notice', async () => {
  const { acceptance, fake, storage } = await registerAtCode();
  fake.answers.resend.push(refused(404, 'NotFound', 'not_committed'));
  await acceptance.resend();
  const snapshot = acceptance.getSnapshot();
  assert.equal(snapshot.step, 'start');
  assert.deepEqual(snapshot.notice, { kind: 'expired' });
  assert.equal(snapshot.displayName, 'Ирина Ковалёва');
  assert.equal(storage.box.record, undefined);
});

test('an invitation that is closed or unavailable is told at the code request', async () => {
  const closed = setup();
  closed.acceptance.open(I, 'accept');
  closed.fake.answers.begin.push(refused(404, 'NotFound', 'not_committed'));
  await closed.acceptance.requestCode();
  assert.deepEqual(closed.acceptance.getSnapshot().notice, {
    kind: 'invitation-closed',
  });
  assert.equal(closed.acceptance.getSnapshot().step, 'start');
  assert.equal(closed.storage.box.record, undefined);

  const inactive = setup();
  inactive.acceptance.open(I, 'accept');
  inactive.fake.answers.begin.push(refused(403, 'Forbidden', 'not_committed'));
  await inactive.acceptance.requestCode();
  assert.deepEqual(inactive.acceptance.getSnapshot().notice, {
    kind: 'scope-closed',
  });

  const limited = setup();
  limited.acceptance.open(I, 'accept');
  limited.fake.answers.begin.push(
    refused(429, 'RateLimited', 'not_committed', { retryAfterSeconds: 90 }),
  );
  await limited.acceptance.requestCode();
  assert.deepEqual(limited.acceptance.getSnapshot().notice, {
    kind: 'limited',
    untilMs: START + 90_000,
  });

  const down = setup();
  down.acceptance.open(I, 'accept');
  down.fake.answers.begin.push(refused(503, 'AuthUnavailable', 'unavailable'));
  await down.acceptance.requestCode();
  assert.deepEqual(down.acceptance.getSnapshot().notice, {
    kind: 'unavailable',
  });
});

test('an old proof turns the registration back to the start', async () => {
  const { acceptance, fake, storage } = await registerAtCode();
  fake.answers.verify.push(verified());
  fake.answers.complete.push(refused(404, 'NotFound', 'not_committed'));
  await acceptance.verify('482913');
  const snapshot = acceptance.getSnapshot();
  assert.equal(snapshot.step, 'start');
  assert.deepEqual(snapshot.notice, { kind: 'proof-expired' });
  assert.equal(storage.box.record, undefined);
});

test('an email that already has an account is told, and the dead attempt is dropped', async () => {
  const { acceptance, fake, storage, adopted } = await registerAtCode();
  fake.answers.verify.push(verified());
  fake.answers.complete.push(refused(409, 'CommandConflict', 'not_committed'));
  await acceptance.verify('482913');
  assert.deepEqual(acceptance.getSnapshot().notice, { kind: 'email-taken' });
  assert.equal(acceptance.getSnapshot().step, 'start');
  assert.equal(storage.box.record, undefined);
  assert.deepEqual(adopted, []);
});

test('a registration refused for a signed-in user starts over', async () => {
  const { acceptance, fake, storage } = await registerAtCode();
  fake.answers.verify.push(verified());
  fake.answers.complete.push(refused(403, 'Forbidden', 'not_committed'));
  await acceptance.verify('482913');
  const snapshot = acceptance.getSnapshot();
  assert.equal(snapshot.step, 'start');
  assert.equal(snapshot.notice, undefined);
  assert.equal(storage.box.record, undefined);
});

test('the server refusing a checked form is told as a form problem', async () => {
  const { acceptance, fake } = await registerAtCode();
  fake.answers.verify.push(verified());
  fake.answers.complete.push(refused(400, 'InvalidArgument', 'not_committed'));
  await acceptance.verify('482913');
  assert.equal(acceptance.getSnapshot().notice.kind, 'fields');
  assert.equal(acceptance.getSnapshot().step, 'details');
});

test('the acceptance refusals: old proof, another email, not accepted', async () => {
  for (const [status, code, notice] of [
    [404, 'NotFound', 'proof-expired'],
    [403, 'Forbidden', 'other-email'],
    [409, 'CommandConflict', 'not-accepted'],
  ]) {
    const { acceptance, fake, storage, refreshed } = await acceptAtCode();
    fake.answers.verify.push(verified());
    fake.answers.accept.push(refused(status, code, 'not_committed'));
    await acceptance.verify('482913');
    const snapshot = acceptance.getSnapshot();
    assert.deepEqual(snapshot.notice, { kind: notice }, notice);
    assert.equal(snapshot.step, 'start', notice);
    assert.equal(snapshot.membership, undefined, notice);
    assert.equal(storage.box.record, undefined, notice);
    assert.equal(refreshed.count, 0, notice);
  }
});

test('an ended session at the acceptance starts over without a notice', async () => {
  const { acceptance, fake, storage } = await acceptAtCode();
  fake.answers.verify.push(verified());
  fake.answers.accept.push(refused(401, 'Unauthenticated', 'not_committed'));
  await acceptance.verify('482913');
  const snapshot = acceptance.getSnapshot();
  assert.equal(snapshot.step, 'start');
  assert.equal(snapshot.notice, undefined);
  assert.equal(snapshot.busy, false);
  assert.equal(storage.box.record, undefined);
});

test('a lost answer to the check of the code is repeated with the same commandID', async () => {
  const { acceptance, fake, commands } = await registerAtCode();
  fake.answers.verify.push(lost());
  await acceptance.verify('482 913');
  assert.deepEqual(acceptance.getSnapshot().notice, {
    kind: 'unknown',
    action: 'verify',
  });
  assert.equal(commands.getSnapshot()[0].label, 'проверки кода');
  assert.equal(commands.getSnapshot()[0].key, acceptKeys.verify);
  fake.answers.verify.push(verified());
  fake.answers.complete.push(userView);
  await acceptance.check();
  assert.deepEqual(fake.calls[1], ['verify', C1, '482913', 'cmd-2']);
  assert.deepEqual(fake.calls[2], ['verify', C1, '482913', 'cmd-2']);
  assert.equal(acceptance.getSnapshot().step, 'done');
  assert.equal(commands.getSnapshot().length, 0);
});

test('a lost answer to every other action is checked the same way', async () => {
  // begin
  const first = setup();
  first.acceptance.open(I, 'accept');
  first.fake.answers.begin.push(lost(), challenge());
  await first.acceptance.requestCode();
  assert.deepEqual(first.acceptance.getSnapshot().notice, {
    kind: 'unknown',
    action: 'begin',
  });
  assert.equal(first.commands.getSnapshot()[0].label, 'запроса кода');
  await first.acceptance.check();
  assert.deepEqual(first.fake.calls, [
    ['begin', I, 'cmd-1'],
    ['begin', I, 'cmd-1'],
  ]);
  assert.equal(first.acceptance.getSnapshot().step, 'code');

  // resend
  const second = await registerAtCode();
  second.fake.answers.resend.push(lost(), challenge(C1, START + 5));
  await second.acceptance.resend();
  assert.deepEqual(second.acceptance.getSnapshot().notice, {
    kind: 'unknown',
    action: 'resend',
  });
  assert.equal(
    second.commands.getSnapshot()[0].label,
    'повторной отправки кода',
  );
  await second.acceptance.check();
  assert.deepEqual(second.fake.calls.slice(1), [
    ['resend', C1, 'cmd-2'],
    ['resend', C1, 'cmd-2'],
  ]);
  assert.deepEqual(second.acceptance.getSnapshot().notice, { kind: 'resent' });

  // complete
  const third = await registerAtCode();
  third.fake.answers.verify.push(verified());
  third.fake.answers.complete.push(lost(), userView);
  await third.acceptance.verify('482913');
  assert.deepEqual(third.acceptance.getSnapshot().notice, {
    kind: 'unknown',
    action: 'complete',
  });
  assert.equal(third.commands.getSnapshot()[0].label, 'создания аккаунта');
  await third.acceptance.check();
  assert.equal(third.fake.calls[2][2], 'cmd-3');
  assert.equal(third.fake.calls[3][2], 'cmd-3');
  assert.equal(third.fake.calls[3][1].password, 'correct horse');
  assert.equal(third.acceptance.getSnapshot().step, 'done');

  // accept
  const fourth = await acceptAtCode();
  fourth.fake.answers.verify.push(verified());
  fourth.fake.answers.accept.push(lost(), membership);
  await fourth.acceptance.verify('482913');
  assert.deepEqual(fourth.acceptance.getSnapshot().notice, {
    kind: 'unknown',
    action: 'accept',
  });
  assert.equal(fourth.acceptance.getSnapshot().step, 'details');
  assert.equal(fourth.commands.getSnapshot()[0].label, 'принятия приглашения');
  await fourth.acceptance.check();
  assert.equal(fourth.fake.calls[2][3], 'cmd-3');
  assert.equal(fourth.fake.calls[3][3], 'cmd-3');
  assert.deepEqual(fourth.acceptance.getSnapshot().membership, membership);
});

test('check() without an unknown outcome does nothing', async () => {
  const { acceptance, fake } = await registerAtCode();
  await acceptance.check();
  assert.equal(fake.calls.length, 1);
});

test('a reload after the proof in register mode asks for the name and password again', async () => {
  const { acceptance, fake, storage } = await registerAtCode();
  fake.answers.verify.push(verified());
  fake.answers.complete.push(lost());
  await acceptance.verify('482913');
  assert.ok(storage.box.record.proof);
  for (const saved of storage.box.saves) {
    assert.equal(saved.includes('correct horse'), false);
  }

  const reloaded = setup({ storage });
  reloaded.acceptance.open(I, 'register');
  let snapshot = reloaded.acceptance.getSnapshot();
  assert.equal(snapshot.step, 'details');
  assert.equal(snapshot.displayName, 'Ирина Ковалёва');
  assert.equal(snapshot.notice, undefined);

  // The password is gone: nothing is sent until it is typed again.
  await reloaded.acceptance.check();
  assert.deepEqual(reloaded.fake.calls, []);
  await reloaded.acceptance.completeDetails({
    displayName: 'Ирина Ковалёва',
    password: '',
    repeat: '',
  });
  assert.equal(reloaded.acceptance.getSnapshot().notice.kind, 'fields');
  assert.deepEqual(reloaded.fake.calls, []);

  reloaded.fake.answers.complete.push(userView);
  await reloaded.acceptance.completeDetails({
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
  snapshot = reloaded.acceptance.getSnapshot();
  assert.equal(snapshot.step, 'done');
  assert.deepEqual(reloaded.adopted, [userView]);
  assert.equal(storage.box.record, undefined);
});

test('a reload during the code step opens the code step', async () => {
  const { storage } = await registerAtCode();
  const reloaded = setup({ storage });
  reloaded.acceptance.open(I, 'register');
  const snapshot = reloaded.acceptance.getSnapshot();
  assert.equal(snapshot.step, 'code');
  assert.equal(snapshot.expiresAtMs, START + 600_000);
  reloaded.fake.answers.verify.push(verified());
  await reloaded.acceptance.verify('482913');
  // Without the password in memory the registration waits for the details.
  assert.equal(reloaded.acceptance.getSnapshot().step, 'details');
  assert.deepEqual(
    reloaded.fake.calls.map(([name]) => name),
    ['verify'],
  );
});

test('a reload after the proof in accept mode offers the acceptance', async () => {
  const first = await acceptAtCode();
  first.fake.answers.verify.push(verified());
  first.fake.answers.accept.push(lost());
  await first.acceptance.verify('482913');

  const reloaded = setup({ storage: first.storage });
  reloaded.acceptance.open(I, 'accept');
  assert.equal(reloaded.acceptance.getSnapshot().step, 'details');
  reloaded.fake.answers.accept.push(membership);
  await reloaded.acceptance.acceptInvitation();
  assert.deepEqual(reloaded.fake.calls, [
    ['accept', I, { challengeID: C1, proof: 'proof-1' }, 'cmd-1'],
  ]);
  assert.equal(reloaded.acceptance.getSnapshot().step, 'done');
  assert.deepEqual(reloaded.acceptance.getSnapshot().membership, membership);
  assert.equal(first.storage.box.record, undefined);
});

test('a second accept after the first committed is refused as not accepted', async () => {
  const first = await acceptAtCode();
  first.fake.answers.verify.push(verified());
  first.fake.answers.accept.push(lost());
  await first.acceptance.verify('482913');
  const reloaded = setup({ storage: first.storage });
  reloaded.acceptance.open(I, 'accept');
  reloaded.fake.answers.accept.push(
    refused(409, 'CommandConflict', 'not_committed'),
  );
  await reloaded.acceptance.acceptInvitation();
  assert.deepEqual(reloaded.acceptance.getSnapshot().notice, {
    kind: 'not-accepted',
  });
});

test('acceptInvitation() needs the accept mode and a proof', async () => {
  const { acceptance, fake } = await registerAtCode();
  await acceptance.acceptInvitation();
  const accepting = await acceptAtCode();
  await accepting.acceptance.acceptInvitation();
  assert.deepEqual(
    fake.calls.map(([name]) => name),
    ['begin'],
  );
  assert.deepEqual(
    accepting.fake.calls.map(([name]) => name),
    ['begin'],
  );
});

test('a record of another invitation or mode is cleared by open()', () => {
  const record = {
    invitationID: I,
    mode: 'register',
    displayName: 'Ирина',
    challenge: challenge(),
    proof: 'proof-1',
  };
  const other = setup({ stored: record });
  other.acceptance.open(I2, 'register');
  assert.equal(other.acceptance.getSnapshot().step, 'start');
  assert.equal(other.acceptance.getSnapshot().invitationID, I2);
  assert.equal(other.acceptance.getSnapshot().displayName, '');
  assert.equal(other.storage.box.record, undefined);

  const mode = setup({ stored: record });
  mode.acceptance.open(I, 'accept');
  assert.equal(mode.acceptance.getSnapshot().step, 'start');
  assert.equal(mode.storage.box.record, undefined);
});

test('switching to another invitation drops the attempts of the previous one', async () => {
  const { acceptance, fake, commands } = await registerAtCode();
  fake.answers.verify.push(lost());
  await acceptance.verify('482913');
  assert.equal(commands.getSnapshot().length, 1);
  acceptance.open(I2, 'register');
  assert.equal(commands.getSnapshot().length, 0);
  const snapshot = acceptance.getSnapshot();
  assert.equal(snapshot.step, 'start');
  assert.equal(snapshot.notice, undefined);
});

test('restart() forgets the attempt and the inputs', async () => {
  const { acceptance, fake, storage, commands } = await registerAtCode();
  fake.answers.verify.push(lost());
  await acceptance.verify('482913');
  acceptance.restart();
  const snapshot = acceptance.getSnapshot();
  assert.equal(snapshot.step, 'start');
  assert.equal(snapshot.notice, undefined);
  assert.equal(snapshot.displayName, '');
  assert.equal(snapshot.invitationID, I);
  assert.equal(storage.box.record, undefined);
  assert.equal(commands.getSnapshot().length, 0);
  await acceptance.check();
  assert.equal(fake.calls.length, 2);
});

test('an answer that arrives after restart() is dropped', async () => {
  const { acceptance, fake, storage } = setup();
  acceptance.open(I, 'accept');
  let release;
  fake.answers.begin.push(
    () =>
      new Promise((resolve) => {
        release = () => resolve(challenge());
      }),
  );
  const pending = acceptance.requestCode();
  await settled();
  assert.equal(acceptance.getSnapshot().busy, true);
  acceptance.restart();
  release();
  await pending;
  const snapshot = acceptance.getSnapshot();
  assert.equal(snapshot.step, 'start');
  assert.equal(snapshot.busy, false);
  assert.equal(storage.box.record, undefined);
});

test('subscribers hear every change', async () => {
  const { acceptance, fake } = setup();
  let heard = 0;
  const stop = acceptance.subscribe(() => {
    heard += 1;
  });
  acceptance.open(I, 'accept');
  fake.answers.begin.push(challenge());
  await acceptance.requestCode();
  assert.ok(heard >= 2);
  const before = heard;
  stop();
  acceptance.restart();
  assert.equal(heard, before);
});

test('a new code in the same challenge request replaces the proof-less record', async () => {
  const { acceptance, fake, storage } = await acceptAtCode();
  fake.answers.begin.push(challenge(C2, START + 10));
  await acceptance.requestCode();
  assert.equal(acceptance.getSnapshot().step, 'code');
  assert.equal(storage.box.record.challenge.challengeID, C2);
});
