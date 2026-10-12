// Signals of gateway's GET /api/live stream. The stream carries no business
// data: screens re-read their models with ordinary GET requests. Timestamps
// stay MoscowTimestamp strings; seq is the exact journal number.

export type SessionEndReason = 'signed_out' | 'revoked' | 'expired';

export type LiveEvent =
  | { readonly type: 'change'; readonly epoch: string; readonly seq: bigint }
  | { readonly type: 'tick'; readonly serverTime: string }
  | {
      readonly type: 'session';
      readonly idleExpiresAt: string;
      readonly absoluteExpiresAt: string;
    }
  | { readonly type: 'session-ended'; readonly reason: SessionEndReason }
  | { readonly type: 'upstream'; readonly available: boolean };

export type LiveStatus = 'connecting' | 'open' | 'closed';

// A subscription starts as connecting and reports later transitions only.
// 'closed' means the feed gave up and will not reconnect by itself. No
// callback runs after the returned unsubscribe.
export interface LiveFeed {
  subscribe(
    onEvent: (event: LiveEvent) => void,
    onStatus: (status: LiveStatus) => void,
  ): () => void;
}
