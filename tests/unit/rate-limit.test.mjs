import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { test } from 'bun:test';
import { outcomeMessage } from '../../src/presentation/catalog/catalog-forms.ts';
import { serviceUnavailableText } from '../../src/presentation/ui/attempt-messages.ts';
import { RateLimitMessage } from '../../src/presentation/ui/rate-limit.tsx';
import { renderElement, text } from './support/render-route.mjs';

const wait = (overrides) => ({
  waiting: true,
  left: 7000,
  seconds: 7,
  started: true,
  begin() {},
  clear() {},
  ...overrides,
});

test('the 429 message shows the countdown and tells the screen reader the whole wait once', () => {
  const html = renderElement(h(RateLimitMessage, { wait: wait() }));
  assert.match(text(html), /Слишком много запросов/);
  assert.match(text(html), /Повторите через 0:07/);
  assert.match(html, /<span[^>]*aria-hidden="true"[^>]*>0:07<\/span>/);
  assert.match(html, />7 с</);
  assert.doesNotMatch(text(html), /commandID|RateLimited|429/);
});

test('when the wait is over the message says the send can be repeated', () => {
  const html = renderElement(
    h(RateLimitMessage, { wait: wait({ waiting: false, left: 0 }) }),
  );
  assert.match(text(html), /Можно отправить ещё раз/);
  assert.doesNotMatch(text(html), /Повторите через/);
});

test('nothing shows before a 429', () => {
  const html = renderElement(
    h(RateLimitMessage, {
      wait: wait({
        started: false,
        waiting: false,
        left: 0,
        seconds: undefined,
      }),
    }),
  );
  assert.equal(text(html), '');
});

test('a 503 before dispatch says nothing was done and the send can be repeated', () => {
  for (const kind of ['product', 'dish']) {
    const message = outcomeMessage(kind, 'refused', 'ServiceUnavailable');
    assert.equal(message.text, serviceUnavailableText);
    assert.match(message.text, /Ничего не выполнено/);
    assert.doesNotMatch(message.text, /503|ServiceUnavailable|commandID/);
  }
});
