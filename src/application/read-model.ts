import type { StaleScope, StaleTarget } from '@/application/live-sync';

export interface LoadOptions {
  // True when a live signal or tick caused the read; the request then sends
  // X-Umir-Activity: background and does not extend the session.
  readonly background: boolean;
  readonly signal?: AbortSignal | undefined;
}

export interface ReadCancellation {
  readonly signal: AbortSignal;
  abort(): void;
}

export interface ReadModelSnapshot<T> {
  // The response to the latest settled request, or the previous one if that
  // request failed.
  readonly value: T | undefined;
  // Clock time of the last successful read in milliseconds since the epoch.
  readonly loadedAt: number | undefined;
  readonly loading: boolean;
  readonly failed: boolean;
  // The rejection of the latest failed read, for choosing the screen state;
  // undefined after a success.
  readonly failure: unknown;
}

export interface ReadModel<T> extends StaleTarget {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => ReadModelSnapshot<T>;
  // A read the operator caused. It starts at once and supersedes the request
  // in flight.
  refresh(): void;
  dispose(): void;
}

export interface ReadModelOptions {
  // Re-read on every tick, for models that depend on the current time.
  readonly refreshOnTick: boolean;
  readonly now: () => number;
  readonly createCancellation: () => ReadCancellation;
}

// Data of one view. Only the response to the latest request is applied: the
// order comes from a client request counter, not from stateVersion. A model
// without subscribers only remembers that it is stale and reads on the next
// subscription.
export function createReadModel<T>(
  load: (options: LoadOptions) => Promise<T>,
  { refreshOnTick, now, createCancellation }: ReadModelOptions,
): ReadModel<T> {
  const listeners = new Set<() => void>();
  let snapshot: ReadModelSnapshot<T> = {
    value: undefined,
    loadedAt: undefined,
    loading: false,
    failed: false,
    failure: undefined,
  };
  let latest = 0;
  let stale = true;
  let disposed = false;
  let active: ReadCancellation | undefined;

  function update(next: ReadModelSnapshot<T>): void {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function start(background: boolean): void {
    if (disposed) return;
    active?.abort();
    active = createCancellation();
    const signal = active.signal;
    latest += 1;
    const request = latest;
    stale = false;
    update({ ...snapshot, loading: true });
    load({ background, signal }).then(
      (value) => {
        settle(request, {
          value,
          loadedAt: now(),
          loading: false,
          failed: false,
          failure: undefined,
        });
      },
      (error: unknown) => {
        settle(request, {
          ...snapshot,
          loading: false,
          failed: true,
          failure: error,
        });
      },
    );
  }

  function settle(request: number, next: ReadModelSnapshot<T>): void {
    if (disposed || request !== latest) return;
    active = undefined;
    update(next);
    if (stale && listeners.size > 0) start(true);
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      if (listeners.size === 1 && stale && !snapshot.loading) start(false);
      return () => {
        listeners.delete(listener);
        void Promise.resolve().then(() => {
          if (disposed || listeners.size > 0 || active === undefined) return;
          latest += 1;
          active.abort();
          active = undefined;
          stale = true;
          update({ ...snapshot, loading: false });
        });
      };
    },
    getSnapshot: () => snapshot,
    refresh() {
      start(false);
    },
    markStale(scope: StaleScope) {
      if (disposed) return;
      if (scope === 'time' && !refreshOnTick) return;
      stale = true;
      if (listeners.size > 0 && !snapshot.loading) start(true);
    },
    dispose() {
      disposed = true;
      latest += 1;
      active?.abort();
      active = undefined;
      update({
        value: undefined,
        loadedAt: undefined,
        loading: false,
        failed: false,
        failure: undefined,
      });
    },
  };
}
