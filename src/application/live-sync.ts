import type { Topic } from './api';
import type {
  AccessEndReason,
  LiveEvent,
  LiveFeed,
  LiveStatus,
} from './live-feed';

export interface Scheduler {
  // Runs callback once after delayMs; the returned function cancels it.
  schedule(delayMs: number, callback: () => void): () => void;
}

export interface PageVisibility {
  isVisible(): boolean;
  subscribe(onChange: () => void): () => void;
}

export type SessionStatus = 'active' | 'ended' | 'unknown';

// Tells whether the session still exists without extending it.
export interface SessionCheck {
  check(): Promise<SessionStatus>;
}

// 'all' follows a state change; 'time' concerns models that depend on the
// current time: the expiry window and recommendations.
export type StaleScope = 'all' | 'time';

export interface StaleTarget {
  markStale(scope: StaleScope): void;
}

// The model registry, as the stream sees it.
export interface LiveModels {
  markStale(restaurantID: string, topics: readonly Topic[] | 'all'): void;
  markTime(restaurantID: string): void;
}

export interface LiveState {
  readonly connection: LiveStatus;
  // Shown data may be outdated: the stream has not been open for
  // staleAfterMs.
  readonly stale: boolean;
  readonly restaurantID: string | undefined;
}

export interface LiveSync {
  // One stream at a time: starting another restaurant closes the first.
  start(restaurantID: string): void;
  stop(): void;
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => LiveState;
}

export interface LiveSyncOptions {
  readonly feed: LiveFeed;
  readonly scheduler: Scheduler;
  readonly visibility: PageVisibility;
  // Asked after the feed gave up: the browser hides whether a 401 or a 502
  // refused the stream.
  readonly sessionCheck: SessionCheck;
  readonly models: LiveModels;
  readonly onAccessEnded: (
    restaurantID: string,
    reason: AccessEndReason,
  ) => void;
  // Re-checks ConfirmationPending attempts with their original commandID.
  readonly resolvePending: () => Promise<void>;
}

export const staleAfterMs = 10_000;
// Matches the stream's retry: 3000 for a feed that gave up.
export const reconnectDelayMs = 3_000;
// v2 has no tick event: time-dependent models are re-read every minute.
export const timeRefreshMs = 60_000;

export function createLiveSync({
  feed,
  scheduler,
  visibility,
  sessionCheck,
  models,
  onAccessEnded,
  resolvePending,
}: LiveSyncOptions): LiveSync {
  const listeners = new Set<() => void>();
  let restaurantID: string | undefined;
  let connection: LiveStatus = 'closed';
  let disconnectedTooLong = false;
  let state = snapshot();
  let known: { epoch: string; sequence: bigint } | undefined;
  let firstChangeOfConnection = false;
  let deferred: Set<Topic> | 'all' | undefined;
  let deferredTime = false;
  let resolving = false;
  let resolveAgain = false;
  let unsubscribeFeed: (() => void) | undefined;
  let cancelReconnect: (() => void) | undefined;
  let pendingCheck: object | undefined;
  let cancelStaleTimer: (() => void) | undefined;
  let cancelTimeTick: (() => void) | undefined;
  let stopVisibility: (() => void) | undefined;

  function snapshot(): LiveState {
    return { connection, stale: disconnectedTooLong, restaurantID };
  }

  function publish(): void {
    state = snapshot();
    for (const listener of listeners) listener();
  }

  function setConnection(status: LiveStatus): void {
    connection = status;
    if (status === 'open') {
      cancelStaleTimer?.();
      cancelStaleTimer = undefined;
      disconnectedTooLong = false;
      firstChangeOfConnection = true;
    } else if (!cancelStaleTimer && !disconnectedTooLong) {
      cancelStaleTimer = scheduler.schedule(staleAfterMs, () => {
        cancelStaleTimer = undefined;
        disconnectedTooLong = true;
        publish();
      });
    }
    publish();
  }

  function connect(): void {
    if (restaurantID === undefined) return;
    setConnection('connecting');
    unsubscribeFeed = feed.subscribe(restaurantID, onEvent, onStatus);
  }

  function disconnect(): void {
    unsubscribeFeed?.();
    unsubscribeFeed = undefined;
    cancelReconnect?.();
    cancelReconnect = undefined;
  }

  function onStatus(status: LiveStatus): void {
    setConnection(status);
    if (status !== 'closed') return;
    disconnect();
    checkSession();
  }

  // An ended session stops the stream for good; otherwise the feed is
  // subscribed again. One check runs per refused stream, and halt() discards
  // its answer.
  function checkSession(): void {
    if (pendingCheck) return;
    const token = {};
    pendingCheck = token;
    sessionCheck.check().then(
      (status) => {
        checked(token, status);
      },
      () => {
        checked(token, 'unknown');
      },
    );
  }

  function checked(token: object, status: SessionStatus): void {
    if (pendingCheck !== token) return;
    pendingCheck = undefined;
    if (status === 'ended') {
      halt();
      publish();
      return;
    }
    cancelReconnect = scheduler.schedule(reconnectDelayMs, () => {
      cancelReconnect = undefined;
      connect();
    });
  }

  function onEvent(event: LiveEvent): void {
    if (restaurantID === undefined || event.tenantID !== restaurantID) return;
    switch (event.type) {
      case 'change':
        onChange(event.epoch, event.sequence, event.topics);
        return;
      case 'refresh-required':
        known = { epoch: event.epoch, sequence: 0n };
        firstChangeOfConnection = false;
        markStale('all');
        requestResolve();
        return;
      case 'access-ended':
        accessEnded(restaurantID, event.reason);
        return;
    }
  }

  // A new epoch re-reads everything. A smaller or equal sequence of the same
  // epoch changes nothing, but the first change after a reconnect still
  // re-checks pending attempts.
  function onChange(
    epoch: string,
    sequence: bigint,
    topics: readonly Topic[],
  ): void {
    const reconnected = firstChangeOfConnection;
    firstChangeOfConnection = false;
    if (known?.epoch !== epoch) {
      known = { epoch, sequence };
      markStale('all');
      requestResolve();
      return;
    }
    if (sequence > known.sequence) {
      known = { epoch, sequence };
      markStale(topics);
      requestResolve();
      return;
    }
    if (reconnected) requestResolve();
  }

  // auth-unavailable is temporary: the stream reconnects once /me answers.
  // Every other reason ends the stream of this restaurant.
  function accessEnded(id: string, reason: AccessEndReason): void {
    if (reason === 'auth-unavailable') {
      disconnect();
      setConnection('closed');
      checkSession();
    } else {
      halt();
      publish();
    }
    onAccessEnded(id, reason);
  }

  // A hidden tab keeps the topics and re-reads once it is shown.
  function markStale(scope: readonly Topic[] | 'all'): void {
    if (restaurantID === undefined) return;
    if (!visibility.isVisible()) {
      deferred =
        scope === 'all' || deferred === 'all'
          ? 'all'
          : new Set([...(deferred ?? []), ...scope]);
      return;
    }
    models.markStale(restaurantID, scope);
  }

  function tick(): void {
    cancelTimeTick = scheduler.schedule(timeRefreshMs, () => {
      cancelTimeTick = undefined;
      if (restaurantID === undefined) return;
      if (visibility.isVisible()) models.markTime(restaurantID);
      else deferredTime = true;
      tick();
    });
  }

  function onVisibilityChange(): void {
    if (!visibility.isVisible() || restaurantID === undefined) return;
    if (deferred !== undefined) {
      const scope = deferred;
      deferred = undefined;
      models.markStale(restaurantID, scope === 'all' ? 'all' : [...scope]);
    }
    if (deferredTime) {
      deferredTime = false;
      models.markTime(restaurantID);
    }
  }

  // Attempts are checked one call at a time. Signals during a call cause
  // exactly one more call after it.
  function requestResolve(): void {
    if (resolving) {
      resolveAgain = true;
      return;
    }
    resolving = true;
    resolvePending().then(resolved, resolved);
  }

  function resolved(): void {
    resolving = false;
    const again = resolveAgain && restaurantID !== undefined;
    resolveAgain = false;
    if (again) requestResolve();
  }

  function halt(): void {
    disconnect();
    pendingCheck = undefined;
    cancelStaleTimer?.();
    cancelStaleTimer = undefined;
    cancelTimeTick?.();
    cancelTimeTick = undefined;
    stopVisibility?.();
    stopVisibility = undefined;
    deferred = undefined;
    deferredTime = false;
    connection = 'closed';
    disconnectedTooLong = false;
    restaurantID = undefined;
  }

  return {
    start(id) {
      if (restaurantID === id) return;
      if (restaurantID !== undefined) halt();
      restaurantID = id;
      known = undefined;
      stopVisibility = visibility.subscribe(onVisibilityChange);
      tick();
      connect();
    },
    stop() {
      if (restaurantID === undefined) return;
      halt();
      publish();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
  };
}
