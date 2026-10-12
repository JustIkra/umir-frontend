import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createFeedbackSubmitter } from '../../src/application/feedback.ts';
import {
  emptyFeedbackDraft,
  validateFeedbackDraft,
} from '../../src/domain/feedback.ts';

const validDraft = {
  ...emptyFeedbackDraft,
  name: 'Ирина Смирнова',
  email: 'irina@example.ru',
  message: 'Хотим подключить второй зал.',
  consent: true,
};

test('empty draft reports every required field and the consent', () => {
  assert.deepEqual(validateFeedbackDraft(emptyFeedbackDraft), {
    name: 'Required',
    email: 'Required',
    message: 'Required',
    consent: 'ConsentRequired',
  });
});

test('valid draft has no errors and the phone stays optional', () => {
  assert.deepEqual(validateFeedbackDraft(validDraft), {});
  assert.deepEqual(
    validateFeedbackDraft({ ...validDraft, phone: '+7 (900) 000-00-00' }),
    {},
  );
});

test('email needs one @, a local part and a dotted domain', () => {
  for (const email of [
    'irina@',
    'irina.example.ru',
    '@example.ru',
    'a@b',
    'a@@b.ru',
    'a b@c.ru',
    'a@.ru',
  ]) {
    assert.equal(
      validateFeedbackDraft({ ...validDraft, email }).email,
      'InvalidFormat',
      email,
    );
  }
});

test('phone accepts 10–15 digits with separators only', () => {
  assert.equal(
    validateFeedbackDraft({ ...validDraft, phone: '12345' }).phone,
    'InvalidFormat',
  );
  assert.equal(
    validateFeedbackDraft({ ...validDraft, phone: '+7 900 abc' }).phone,
    'InvalidCharacters',
  );
});

test('message length counts code points of the trimmed text', () => {
  const emoji = '🙂';
  const atLimit = emoji.repeat(2000);
  assert.equal(
    validateFeedbackDraft({ ...validDraft, message: `  ${atLimit}  ` }).message,
    undefined,
  );
  assert.equal(
    validateFeedbackDraft({ ...validDraft, message: `${atLimit}${emoji}` })
      .message,
    'TooLong',
  );
});

test('message keeps line breaks and tabs but rejects other control characters', () => {
  assert.equal(
    validateFeedbackDraft({ ...validDraft, message: 'строка\n\tвторая' })
      .message,
    undefined,
  );
  assert.equal(
    validateFeedbackDraft({ ...validDraft, message: 'звонок\u0007' }).message,
    'InvalidCharacters',
  );
});

function recordingSender(outcomes) {
  const sent = [];
  return {
    sent,
    send(submission) {
      sent.push(submission);
      return Promise.resolve(outcomes.shift() ?? { kind: 'sent' });
    },
  };
}

function sequentialIds() {
  let next = 0;
  return () => `attempt-${String(++next)}`;
}

test('invalid draft is not sent', async () => {
  const sender = recordingSender([]);
  const submitter = createFeedbackSubmitter(sender, sequentialIds());
  const outcome = await submitter.submit(emptyFeedbackDraft);
  assert.equal(outcome.kind, 'invalid');
  assert.equal(sender.sent.length, 0);
});

test('repeating an unconfirmed attempt reuses its submissionID', async () => {
  const sender = recordingSender([
    { kind: 'unknown' },
    { kind: 'unavailable' },
    { kind: 'sent' },
  ]);
  const submitter = createFeedbackSubmitter(sender, sequentialIds());
  await submitter.submit(validDraft);
  await submitter.submit(validDraft);
  await submitter.submit({ ...validDraft });
  assert.deepEqual(
    sender.sent.map((submission) => submission.submissionID),
    ['attempt-1', 'attempt-1', 'attempt-1'],
  );
});

test('changed text and a confirmed send start a new attempt', async () => {
  const sender = recordingSender([
    { kind: 'unavailable' },
    { kind: 'sent' },
    { kind: 'sent' },
  ]);
  const submitter = createFeedbackSubmitter(sender, sequentialIds());
  await submitter.submit(validDraft);
  await submitter.submit({ ...validDraft, message: 'Другой текст' });
  await submitter.submit({ ...validDraft, message: 'Другой текст' });
  assert.deepEqual(
    sender.sent.map((submission) => submission.submissionID),
    ['attempt-1', 'attempt-2', 'attempt-3'],
  );
});
