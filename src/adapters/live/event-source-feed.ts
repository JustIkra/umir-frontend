import type { LiveFeed } from '@/application/live-feed';
import { decodeLiveEvent, liveEventNames } from './decode';

export function livePath(restaurantID: string, cursor?: string): string {
  const path = `/api/v2/r/${restaurantID}/live`;
  return cursor === undefined
    ? path
    : `${path}?cursor=${encodeURIComponent(cursor)}`;
}

// The part of the browser EventSource the feed uses.
export interface LiveEventSource {
  readonly readyState: number;
  addEventListener(
    type: string,
    listener: (event: {
      readonly data?: unknown;
      readonly lastEventId?: unknown;
    }) => void,
  ): void;
  close(): void;
}

// EventSource.CLOSED: the browser gave up, for example after a response that
// is not 200 text/event-stream (401, 403, 429, a 502 from Nginx).
const closedState = 2;

// While a stream is open, the browser itself resends Last-Event-ID. After the
// feed gave up, the next subscription resumes once from the last event id; a
// stream refused before it opened forgets that cursor, so a 403 on a stale
// cursor cannot loop.
export function createEventSourceFeed(
  open: (url: string) => LiveEventSource,
): LiveFeed {
  const cursors = new Map<string, string>();
  return {
    subscribe(restaurantID, onEvent, onStatus) {
      const cursor = cursors.get(restaurantID);
      const source = open(livePath(restaurantID, cursor));
      let active = true;
      let opened = false;
      const close = () => {
        active = false;
        source.close();
      };
      const giveUp = () => {
        if (!opened && cursor !== undefined) cursors.delete(restaurantID);
        close();
        onStatus('closed');
      };
      source.addEventListener('open', () => {
        if (!active) return;
        opened = true;
        onStatus('open');
      });
      source.addEventListener('error', () => {
        if (!active) return;
        if (source.readyState !== closedState) {
          onStatus('connecting');
          return;
        }
        giveUp();
      });
      for (const name of liveEventNames) {
        source.addEventListener(name, (message) => {
          if (!active) return;
          const event = decodeLiveEvent(name, message.data);
          if (!event) {
            // A malformed event is a stream failure; the owner reconnects.
            giveUp();
            return;
          }
          if (
            typeof message.lastEventId === 'string' &&
            message.lastEventId !== ''
          ) {
            cursors.set(restaurantID, message.lastEventId);
          }
          onEvent(event);
        });
      }
      return close;
    },
  };
}
