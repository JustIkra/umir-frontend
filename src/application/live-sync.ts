import type {
  LiveEvent,
  LiveFeed,
  LiveStatus,
  SessionEndReason,
} from '@/application/live-feed';

export interface Scheduler {
  // Runs callback once after delayMs; the returned function cancels it.
  schedule(delayMs: number, callback: () => void): () => void;
}

export interface PageVisibility {
  isVisible(): boolean;
  subscribe(onChange: () => void): () => void;
}

export type SessionStatus = 'active' | 'ended' | 'unknown';

// Tells whether the operator session still exists without extending it.
export interface SessionCheck {
  check(): Promise<SessionStatus>;
}

// 'all' follows a state change; 'time' follows a tick and concerns models that
// depend on the current time: the expiry window and recommendations.
export type StaleScope = 'all' | 'time';

export interface StaleTarget {
  markStale(scope: StaleScope): void;
}

export interface LiveSession {
  readonly idleExpiresAt: string;
  readonly absoluteExpiresAt: string;
}

export interface LiveState {
  readonly connection: LiveStatus;
  // Shown data may be outdated: the stream has not been open for
  // staleAfterMs, or gateway reports the warehouse unavailable.
  readonly stale: boolean;
  readonly serverTime: string | undefined;
  readonly session: LiveSession | undefined;
  readonly sessionEnded: SessionEndReason | undefined;
}

export interface LiveSync {
  start(): void;
  stop(): void;
  track(target: StaleTarget): () => void;
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => LiveState;
}

export interface LiveSyncOptions {
  feed: LiveFeed;
  scheduler: Scheduler;
  visibility: PageVisibility;
  // Asked after the feed gave up: the browser hides whether a 401 or a 502
  // refused the stream.
  sessionCheck: SessionCheck;
  // Re-checks ConfirmationPending attempts with their original commandID and
  // proposalID. A rejection keeps the attempts for the next signal.
  resolvePending: () => Promise<void>;
}

export const staleAfterMs = 10_000;
// Matches the stream's retry: 3000 for a feed that gave up.
export const reconnectDelayMs = 3_000;

export function createLiveSync({
  feed,
  scheduler,
  visibility,
  sessionCheck,
  resolvePending,
}: LiveSyncOptions): LiveSync {
  const targets = new Set<StaleTarget>();
  const listeners = new Set<() => void>();
  let running = false;
  let connection: LiveStatus = 'closed';
  let disconnectedTooLong = false;
  let upstreamAvailable = true;
  let serverTime: string | undefined;
  let session: LiveSession | undefined;
  let sessionEnded: SessionEndReason | undefined;
  let state = snapshot();
  let known: { epoch: string; seq: bigint } | undefined;
  let firstChangeOfConnection = false;
  let deferred: StaleScope | undefined;
  let resolving = false;
  let resolveAgain = false;
  let unsubscribeFeed: (() => void) | undefined;
  let cancelReconnect: (() => void) | undefined;
  let pendingCheck: object | undefined;
  let cancelStaleTimer: (() => void) | undefined;
  let stopVisibility: (() => void) | undefined;

  function snapshot(): LiveState {
    return {
      connection,
      stale: disconnectedTooLong || !upstreamAvailable,
      serverTime,
      session,
      sessionEnded,
    };
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
    setConnection('connecting');
    unsubscribeFeed = feed.subscribe(onEvent, onStatus);
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
      endSession('expired');
      return;
    }
    cancelReconnect = scheduler.schedule(reconnectDelayMs, () => {
      cancelReconnect = undefined;
      connect();
    });
  }

  function endSession(reason: SessionEndReason): void {
    halt();
    sessionEnded = reason;
    publish();
  }

  function onEvent(event: LiveEvent): void {
    switch (event.type) {
      case 'change':
        onChange(event.epoch, event.seq);
        return;
      case 'tick':
        serverTime = event.serverTime;
        publish();
        markStale('time');
        return;
      case 'session':
        session = {
          idleExpiresAt: event.idleExpiresAt,
          absoluteExpiresAt: event.absoluteExpiresAt,
        };
        publish();
        return;
      case 'session-ended':
        endSession(event.reason);
        return;
      case 'upstream':
        upstreamAvailable = event.available;
        publish();
        return;
    }
  }

  // The first change after start or a new epoch re-reads everything: a model
  // read before the stream opened may already be outdated. A smaller or equal
  // seq of the same epoch changes nothing.
  function onChange(epoch: string, seq: bigint): void {
    const reconnected = firstChangeOfConnection;
    firstChangeOfConnection = false;
    const newer = known?.epoch !== epoch || seq > known.seq;
    if (newer) {
      known = { epoch, seq };
      markStale('all');
    }
    if (newer || reconnected) requestResolve();
  }

  // A hidden tab keeps one pending scope and re-reads once it is shown.
  function markStale(scope: StaleScope): void {
    if (!visibility.isVisible()) {
      deferred = deferred === 'all' ? 'all' : scope;
      return;
    }
    for (const target of targets) target.markStale(scope);
  }

  function onVisibilityChange(): void {
    if (deferred === undefined || !visibility.isVisible()) return;
    const scope = deferred;
    deferred = undefined;
    markStale(scope);
  }

  // Attempts are checked one call at a time. Signals during a call cause
  // exactly one more call after it. A rejected call keeps its attempts for
  // the next signal.
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
    const again = resolveAgain && running;
    resolveAgain = false;
    if (again) requestResolve();
  }

  function halt(): void {
    running = false;
    disconnect();
    pendingCheck = undefined;
    cancelStaleTimer?.();
    cancelStaleTimer = undefined;
    stopVisibility?.();
    stopVisibility = undefined;
    deferred = undefined;
    connection = 'closed';
    disconnectedTooLong = false;
  }

  return {
    start() {
      if (running) return;
      running = true;
      known = undefined;
      upstreamAvailable = true;
      session = undefined;
      sessionEnded = undefined;
      stopVisibility = visibility.subscribe(onVisibilityChange);
      connect();
    },
    stop() {
      if (!running) return;
      halt();
      publish();
    },
    track(target) {
      targets.add(target);
      return () => {
        targets.delete(target);
      };
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
  };
}
