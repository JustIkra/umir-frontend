import assert from 'node:assert/strict';
import { test } from 'bun:test';
import examples from '../../api/backend-v2-examples.json' with { type: 'json' };
import { createFeedbackApiSender } from '../../src/adapters/feedback/feedback-api-sender.ts';
import { ApiError, localFailure } from '../../src/application/api.ts';

const saved = examples.schemaCases.find(
  (item) => item.schema === 'FeedbackSaved' && item.valid,
).value;
const submissionID = '11111111-1111-4111-8111-111111111111';
const draft = {
  name: ' Ирина Смирнова ',
  email: 'irina@example.ru ',
  phone: '',
  message: ' Хотим подключить второй зал. ',
  consent: true,
  website: '',
};
const refused = (status, code, outcome, extra = {}) =>
  new ApiError({
    ...localFailure(code, outcome, status),
    retryable: false,
    ...extra,
  });

function client(answer) {
  const calls = [];
  return {
    calls,
    send: (method, path, options) => {
      calls.push([method, path, options.body]);
      return answer instanceof Error
        ? Promise.reject(answer)
        : Promise.resolve(answer);
    },
  };
}

test('a submission goes to the anonymous endpoint with the consent version', async () => {
  const fake = client(saved);
  const outcome = await createFeedbackApiSender(fake).send({
    submissionID,
    draft,
  });
  assert.deepEqual(outcome, { kind: 'sent' });
  assert.deepEqual(fake.calls, [
    [
      'POST',
      '/api/v2/feedback/anonymous',
      {
        submissionID,
        name: 'Ирина Смирнова',
        email: 'irina@example.ru',
        message: 'Хотим подключить второй зал.',
        consent: { accepted: true, documentVersion: '2026-10-11' },
        website: '',
      },
    ],
  ]);
});

test('a phone goes trimmed; a duplicate answer counts as sent', async () => {
  const fake = client({ ...saved, state: 'duplicate' });
  const outcome = await createFeedbackApiSender(fake).send({
    submissionID,
    draft: { ...draft, phone: ' +7 (900) 000-00-00 ' },
  });
  assert.deepEqual(outcome, { kind: 'sent' });
  assert.equal(fake.calls[0][2].phone, '+7 (900) 000-00-00');
});

test('answers map to the outcomes of the form', async () => {
  const cases = [
    [
      refused(400, 'InvalidArgument', 'not_committed', {
        fieldErrors: { email: 'bad' },
      }),
      { kind: 'invalid', fieldErrors: { email: 'InvalidFormat' } },
    ],
    [
      refused(400, 'InvalidArgument', 'not_committed'),
      { kind: 'unavailable', diagnostics: '400 InvalidArgument' },
    ],
    [
      refused(413, 'PayloadTooLarge', 'not_committed'),
      { kind: 'unavailable', diagnostics: '413 PayloadTooLarge' },
    ],
    [
      refused(429, 'FeedbackRateLimited', 'not_committed', {
        retryAfterSeconds: 120,
      }),
      { kind: 'rateLimited', retryAfterSeconds: 120 },
    ],
    [
      refused(429, 'RateLimited', 'not_committed'),
      { kind: 'rateLimited', retryAfterSeconds: 60 },
    ],
    [
      refused(503, 'ServiceUnavailable', 'unavailable'),
      { kind: 'unavailable', diagnostics: '503 ServiceUnavailable' },
    ],
    [refused(0, 'Transport', 'unknown'), { kind: 'unknown' }],
    [{ state: 'stored' }, { kind: 'unknown' }],
  ];
  for (const [answer, outcome] of cases) {
    const result = await createFeedbackApiSender(client(answer)).send({
      submissionID,
      draft,
    });
    assert.deepEqual(result, outcome, JSON.stringify(answer));
  }
});
