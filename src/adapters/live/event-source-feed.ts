import type { LiveFeed } from '@/application/live-feed';
import { decodeLiveEvent, liveEventNames } from '@/adapters/live/decode';

export const liveStreamPath = '/api/live';

// The part of the browser EventSource the feed uses.
export interface LiveEventSource {
  readonly readyState: number;
  addEventListener(
    type: string,
    listener: (event: { readonly data?: unknown }) => void,
  ): void;
  close(): void;
}

// EventSource.CLOSED: the browser gave up, for example after a response that
// is not 200 text/event-stream (401, 403, 405, 429, a 502 from Nginx).
const closedState = 2;

export function createEventSourceFeed(
  open: (url: string) => LiveEventSource,
): LiveFeed {
  return {
    subscribe(onEvent, onStatus) {
      const source = open(liveStreamPath);
      let active = true;
      const close = () => {
        active = false;
        source.close();
      };
      source.addEventListener('open', () => {
        if (active) onStatus('open');
      });
      source.addEventListener('error', () => {
        if (!active) return;
        if (source.readyState !== closedState) {
          onStatus('connecting');
          return;
        }
        close();
        onStatus('closed');
      });
      for (const name of liveEventNames) {
        source.addEventListener(name, (message) => {
          if (!active) return;
          const event = decodeLiveEvent(name, message.data);
          if (event) {
            onEvent(event);
            return;
          }
          // A malformed event is a stream failure; the owner reconnects.
          close();
          onStatus('closed');
        });
      }
      return close;
    },
  };
}
