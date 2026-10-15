import type { Topic } from './api';

// Signals of gateway's GET /api/v2/r/{restaurantID}/live. The stream carries
// no business data: screens re-read their models with ordinary GET requests.

export type AccessEndReason =
  'revoked' | 'deleted' | 'session-expired' | 'auth-unavailable';

export type LiveEvent =
  | {
      readonly type: 'change';
      readonly tenantID: string;
      readonly epoch: string;
      readonly sequence: bigint;
      readonly topics: readonly Topic[];
    }
  | {
      readonly type: 'refresh-required';
      readonly tenantID: string;
      readonly epoch: string;
    }
  | {
      readonly type: 'access-ended';
      readonly tenantID: string;
      readonly reason: AccessEndReason;
    };

export type LiveStatus = 'connecting' | 'open' | 'closed';

// A subscription starts as connecting and reports later transitions only.
// 'closed' means the feed gave up and will not reconnect by itself. No
// callback runs after the returned unsubscribe.
export interface LiveFeed {
  subscribe(
    restaurantID: string,
    onEvent: (event: LiveEvent) => void,
    onStatus: (status: LiveStatus) => void,
  ): () => void;
  // Drops what the feed remembers between subscriptions (resume cursors), so
  // the next user or sign-in never resumes another user's stream.
  forget(): void;
}
