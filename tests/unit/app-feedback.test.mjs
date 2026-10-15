import assert from 'node:assert/strict';
import { test } from 'bun:test';
import examples from '../../api/backend-v2-examples.json' with { type: 'json' };
import { createAppFeedbackApiSender } from '../../src/adapters/feedback/app-feedback-sender.ts';
import { ApiError, localFailure } from '../../src/application/api.ts';
import {
  R,
  activeSession,
  hrefs,
  renderRoute,
  text,
} from './support/render-route.mjs';

const saved = examples.schemaCases.find(
  (item) => item.schema === 'FeedbackSaved' && item.valid,
).value;
const submissionID = '11111111-1111-4111-8111-111111111111';
const draft = {
  name: ' Марина Белова ',
  email: 'm.belova@restoran.example ',
  phone: '',
  message: ' Не открывается склад. ',
  consent: true,
  website: '',
};

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

test('a submission goes to the feedback endpoint of the restaurant', async () => {
  const fake = client(saved);
  const outcome = await createAppFeedbackApiSender(fake, R).send({
    submissionID,
    draft,
  });
  assert.deepEqual(outcome, { kind: 'sent' });
  assert.deepEqual(fake.calls, [
    [
      'POST',
      `/api/v2/r/${R}/feedback`,
      {
        submissionID,
        name: 'Марина Белова',
        email: 'm.belova@restoran.example',
        message: 'Не открывается склад.',
        consent: { accepted: true, documentVersion: '2026-10-11' },
        website: '',
      },
    ],
  ]);
});

test('the answers map to the outcomes of the landing form', async () => {
  const refused = (status, code, outcome, extra = {}) =>
    new ApiError({
      ...localFailure(code, outcome, status),
      retryable: false,
      ...extra,
    });
  const cases = [
    [
      refused(429, 'FeedbackRateLimited', 'not_committed', {
        retryAfterSeconds: 120,
      }),
      { kind: 'rateLimited', retryAfterSeconds: 120 },
    ],
    [
      refused(403, 'Forbidden', 'not_committed'),
      { kind: 'unavailable', diagnostics: '403 Forbidden' },
    ],
    [refused(0, 'Transport', 'unknown'), { kind: 'unknown' }],
  ];
  for (const [answer, outcome] of cases) {
    const result = await createAppFeedbackApiSender(client(answer), R).send({
      submissionID,
      draft,
    });
    assert.deepEqual(result, outcome);
  }
});

test('the page offers the form with the name and email of the user', async () => {
  const html = await renderRoute(`/app/r/${R}/feedback`);
  assert.ok(html.includes('Обратная связь'));
  assert.ok(html.includes('aria-label="Форма обратной связи"'));
  assert.ok(html.includes(`value="${activeSession.user.displayName}"`));
  assert.ok(html.includes(`value="${activeSession.user.email}"`));
  assert.ok(text(html).includes('Отправить'));
});

test('a user without an email gets an empty email field', async () => {
  const html = await renderRoute(`/app/r/${R}/feedback`, {
    session: {
      ...activeSession,
      user: { ...activeSession.user, email: undefined },
    },
  });
  assert.ok(html.includes(`value="${activeSession.user.displayName}"`));
  assert.ok(!html.includes('m.belova@restoran.example'));
});

test('the account menu links to the feedback page inside a restaurant only', async () => {
  const inside = await renderRoute(`/app/r/${R}`);
  assert.ok(hrefs(inside).includes(`/app/r/${R}/feedback`));
  assert.ok(text(inside).includes('Обратная связь'));
  const outside = await renderRoute('/app/settings');
  assert.ok(!hrefs(outside).some((href) => href.endsWith('/feedback')));
  assert.ok(!text(outside).includes('Обратная связь'));
});
