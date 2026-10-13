import { failureOf, localFailure, type ApiFailure } from './api';

export type ScreenFailure =
  | { readonly kind: 'session-ended' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'restaurant-gone' }
  | { readonly kind: 'not-ready' }
  | {
      readonly kind: 'rate-limited';
      readonly retryAfterSeconds: number | undefined;
    }
  | { readonly kind: 'unavailable'; readonly failure: ApiFailure }
  | { readonly kind: 'error'; readonly failure: ApiFailure };

const rateLimits = new Set([
  'RateLimited',
  'LoginRateLimited',
  'PasswordChangeRateLimited',
  'FeedbackRateLimited',
]);

// What a refused read means for the screen (spec section 7). Auth answers
// ScopeDeleted with 409 instead of the contract's 410; both count.
export function screenFailure(error: unknown): ScreenFailure {
  const failure = failureOf(error) ?? localFailure('Malformed', 'unavailable');
  if (failure.status === 401 || failure.code === 'Unauthenticated') {
    return { kind: 'session-ended' };
  }
  if (failure.code === 'ScopeDeleted' || failure.status === 410) {
    return { kind: 'restaurant-gone' };
  }
  if (failure.code === 'Forbidden') return { kind: 'forbidden' };
  if (failure.code === 'RuntimeNotReady') return { kind: 'not-ready' };
  if (failure.status === 429 || rateLimits.has(failure.code)) {
    return {
      kind: 'rate-limited',
      retryAfterSeconds: failure.retryAfterSeconds,
    };
  }
  if (failure.outcome === 'unavailable')
    return { kind: 'unavailable', failure };
  return { kind: 'error', failure };
}
