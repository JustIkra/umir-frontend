import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  deletedRestaurantRetentionDays,
  feedbackRetentionDays,
  personalDataConsent,
  privacyPolicy,
  restaurantFeedbackRetentionDays,
  webServerLogRetentionDays,
} from '../../src/presentation/documents/content.ts';

const sentences = (document) =>
  document.sections
    .flatMap((section) => section.blocks)
    .flatMap((block) => (block.kind === 'item' ? [block.text] : []));
const withMarker = (document) =>
  sentences(document).filter((text) => text.includes('[N]'));

test('the retention periods are the G1-2 numbers', () => {
  assert.equal(feedbackRetentionDays, 30);
  assert.equal(restaurantFeedbackRetentionDays, 180);
  assert.equal(deletedRestaurantRetentionDays, 7);
  assert.equal(webServerLogRetentionDays, 14);
});

test('the policy and the consent state the numbers of the constants', () => {
  const policy = sentences(privacyPolicy).join('\n');
  assert.match(
    policy,
    new RegExp(
      `Журналы веб-сервера хранятся не более ${webServerLogRetentionDays}\\u00A0дней`,
    ),
  );
  assert.match(
    policy,
    new RegExp(
      `на сайте хранятся не более ${feedbackRetentionDays}\\u00A0дней`,
    ),
  );
  assert.match(
    policy,
    new RegExp(
      `отправляют из приложения, хранятся ${restaurantFeedbackRetentionDays}\\u00A0дней`,
    ),
  );
  const consent = sentences(personalDataConsent).join('\n');
  assert.match(
    consent,
    new RegExp(`Согласие действует ${feedbackRetentionDays}\\u00A0дней`),
  );
});

test('only the deletion period after withdrawal waits for the lawyer', () => {
  assert.deepEqual(withMarker(privacyPolicy), []);
  const [left, ...rest] = withMarker(personalDataConsent);
  assert.deepEqual(rest, []);
  assert.match(left, /в течение \[N\] рабочих дней/);
  assert.equal(left.match(/\[N\]/g).length, 1);
});
