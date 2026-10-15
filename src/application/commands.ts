import { failureOf, localFailure, type ApiFailure, type Service } from './api';
import type { EpochRegistry } from './epochs';

// An attempt whose outcome is not known yet: in flight, or answered with an
// unknown outcome. The label names the action in W11: «оформления заказа».
export interface Attempt {
  readonly key: string;
  readonly commandID: string;
  readonly label: string;
  readonly restaurantID: string | undefined;
  readonly startedAt: number;
}

export interface CommandSpec<T> {
  // One attempt per key at a time, e.g. "session.sign-in".
  readonly key: string;
  readonly label: string;
  readonly restaurantID?: string | undefined;
  // Warehouse and serving commands carry the epoch of that service.
  readonly service?: Service | undefined;
  readonly execute: (
    commandID: string,
    epoch: string | undefined,
  ) => Promise<T>;
}

export type CommandResult<T> =
  | { readonly kind: 'committed'; readonly value: T }
  | { readonly kind: 'rejected'; readonly failure: ApiFailure }
  | {
      readonly kind: 'unknown';
      readonly failure: ApiFailure;
      readonly attempt: Attempt;
    }
  | { readonly kind: 'reset'; readonly failure: ApiFailure };

export interface CommandRunner {
  // With a pending attempt of the same key, resends that attempt (same
  // commandID, body and epoch) instead of the new spec.
  run<T>(spec: CommandSpec<T>): Promise<CommandResult<T>>;
  retry(key: string): Promise<CommandResult<unknown>> | undefined;
  // True while a request of that key is on its way. An attempt without a
  // known outcome that is not on its way is waiting for a check.
  isInFlight(key: string): boolean;
  // A pending attempt saved outside the runner (the tab after a reload): kept
  // with its commandID, epoch and start time, not sent; retry or run of the
  // same key resends it.
  restore<T>(
    spec: CommandSpec<T>,
    saved: {
      readonly commandID: string;
      readonly epoch: string | undefined;
      readonly startedAt: number;
    },
  ): void;
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => readonly Attempt[];
  // Both also detach a request in flight: its answer no longer settles the
  // key, and the next run sends a new command.
  discard(key: string): void;
  clear(): void;
}

export interface CommandRunnerOptions {
  readonly newId: () => string;
  readonly now: () => number;
  readonly epochs: EpochRegistry;
  // A service restarted: the outcome is lost for good and the restaurant's
  // data is outdated.
  readonly onReset: (restaurantID: string | undefined) => void;
}

interface Pending extends Attempt {
  readonly epoch: string | undefined;
  readonly execute: (
    commandID: string,
    epoch: string | undefined,
  ) => Promise<unknown>;
}

// Outcomes after which the attempt is settled for good. unavailable on a
// command means the service did not run it.
const settledOutcomes = new Set(['committed', 'not_committed', 'unavailable']);

export function createCommandRunner({
  newId,
  now,
  epochs,
  onReset,
}: CommandRunnerOptions): CommandRunner {
  const pending = new Map<string, Pending>();
  const inFlight = new Map<string, Promise<CommandResult<unknown>>>();
  const listeners = new Set<() => void>();
  let snapshot: readonly Attempt[] = [];

  function publish(): void {
    snapshot = [...pending.values()].map(
      ({ key, commandID, label, restaurantID, startedAt }) => ({
        key,
        commandID,
        label,
        restaurantID,
        startedAt,
      }),
    );
    for (const listener of listeners) listener();
  }

  // A detached attempt settling late must not touch a newer one of its key.
  function release(attempt: Pending): void {
    if (pending.get(attempt.key) === attempt) pending.delete(attempt.key);
  }

  function settle(attempt: Pending, error: unknown): CommandResult<unknown> {
    const failure = failureOf(error) ?? localFailure('Malformed', 'unknown');
    if (
      failure.code === 'RuntimeReset' ||
      failure.outcome === 'indeterminate'
    ) {
      release(attempt);
      onReset(attempt.restaurantID);
      return { kind: 'reset', failure };
    }
    if (settledOutcomes.has(failure.outcome)) {
      release(attempt);
      return { kind: 'rejected', failure };
    }
    const { key, commandID, label, restaurantID, startedAt } = attempt;
    return {
      kind: 'unknown',
      failure,
      attempt: { key, commandID, label, restaurantID, startedAt },
    };
  }

  function send(attempt: Pending): Promise<CommandResult<unknown>> {
    const result = attempt
      .execute(attempt.commandID, attempt.epoch)
      .then(
        (value): CommandResult<unknown> => {
          release(attempt);
          return { kind: 'committed', value };
        },
        (error: unknown) => settle(attempt, error),
      )
      .finally(() => {
        if (inFlight.get(attempt.key) === result) inFlight.delete(attempt.key);
        publish();
      });
    inFlight.set(attempt.key, result);
    // Listeners learn that the attempt is on its way, a resend included.
    publish();
    return result;
  }

  function resend(key: string): Promise<CommandResult<unknown>> | undefined {
    const running = inFlight.get(key);
    if (running) return running;
    const attempt = pending.get(key);
    return attempt ? send(attempt) : undefined;
  }

  return {
    run<T>(spec: CommandSpec<T>): Promise<CommandResult<T>> {
      const again = resend(spec.key);
      if (again) return again as Promise<CommandResult<T>>;
      let epoch: string | undefined;
      if (spec.service !== undefined) {
        epoch =
          spec.restaurantID === undefined
            ? undefined
            : epochs.get(spec.restaurantID, spec.service);
        if (epoch === undefined) {
          return Promise.resolve({
            kind: 'rejected',
            failure: localFailure('EpochUnknown', 'not_committed'),
          });
        }
      }
      const attempt: Pending = {
        key: spec.key,
        commandID: newId(),
        label: spec.label,
        restaurantID: spec.restaurantID,
        startedAt: now(),
        epoch,
        execute: spec.execute,
      };
      pending.set(spec.key, attempt);
      return send(attempt) as Promise<CommandResult<T>>;
    },
    retry: resend,
    isInFlight: (key) => inFlight.has(key),
    restore(spec, saved) {
      if (pending.has(spec.key) || inFlight.has(spec.key)) return;
      pending.set(spec.key, {
        key: spec.key,
        commandID: saved.commandID,
        label: spec.label,
        restaurantID: spec.restaurantID,
        startedAt: saved.startedAt,
        epoch: saved.epoch,
        execute: spec.execute,
      });
      publish();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    discard(key) {
      const dropped = pending.delete(key);
      const detached = inFlight.delete(key);
      if (dropped || detached) publish();
    },
    clear() {
      pending.clear();
      inFlight.clear();
      publish();
    },
  };
}
