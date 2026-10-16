import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { ApiError, localFailure } from '../../src/application/api.ts';
import { screenFailure } from '../../src/application/failure.ts';

const refused = (status, code, outcome, extra = {}) =>
  new ApiError({ ...localFailure(code, outcome, status), ...extra });

test('refusals map to the states of spec section 7', () => {
  const kind = (error) => screenFailure(error).kind;
  assert.equal(
    kind(refused(401, 'Unauthenticated', 'not_committed')),
    'session-ended',
  );
  assert.equal(kind(refused(403, 'Forbidden', 'not_committed')), 'forbidden');
  assert.equal(
    kind(refused(410, 'ScopeDeleted', 'not_committed')),
    'restaurant-gone',
  );
  assert.equal(
    kind(refused(409, 'ScopeDeleted', 'not_committed')),
    'restaurant-gone',
  );
  assert.equal(
    kind(refused(503, 'RuntimeNotReady', 'unavailable')),
    'not-ready',
  );
  assert.equal(
    kind(refused(503, 'InventoryUnavailable', 'unavailable')),
    'unavailable',
  );
  assert.equal(kind(refused(0, 'Transport', 'unavailable')), 'unavailable');
  assert.equal(kind(refused(422, 'UnknownTimeZone', 'not_committed')), 'error');
  assert.equal(kind(new TypeError('broken')), 'unavailable');
});

test('a rate limit carries the seconds to wait', () => {
  assert.deepEqual(
    screenFailure(
      refused(429, 'LoginRateLimited', 'not_committed', {
        retryAfterSeconds: 60,
      }),
    ),
    { kind: 'rate-limited', retryAfterSeconds: 60 },
  );
});

test('DUR1 admission answers on a read: 429 waits, 503 before dispatch is unavailable', () => {
  assert.deepEqual(
    screenFailure(
      refused(429, 'RateLimited', 'not_committed', { retryAfterSeconds: 7 }),
    ),
    { kind: 'rate-limited', retryAfterSeconds: 7 },
  );
  assert.deepEqual(
    screenFailure(refused(429, 'RateLimited', 'not_committed')),
    { kind: 'rate-limited', retryAfterSeconds: undefined },
  );
  assert.equal(
    screenFailure(refused(503, 'ServiceUnavailable', 'unavailable')).kind,
    'unavailable',
  );
});
