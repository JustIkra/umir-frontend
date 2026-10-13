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
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => readonly Attempt[];
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

  function settle(attempt: Pending, error: unknown): CommandResult<unknown> {
    const failure = failureOf(error) ?? localFailure('Malformed', 'unknown');
    if (
      failure.code === 'RuntimeReset' ||
      failure.outcome === 'indeterminate'
    ) {
      pending.delete(attempt.key);
      onReset(attempt.restaurantID);
      return { kind: 'reset', failure };
    }
    if (settledOutcomes.has(failure.outcome)) {
      pending.delete(attempt.key);
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
          pending.delete(attempt.key);
          return { kind: 'committed', value };
        },
        (error: unknown) => settle(attempt, error),
      )
      .finally(() => {
        inFlight.delete(attempt.key);
        publish();
      });
    inFlight.set(attempt.key, result);
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
      publish();
      return send(attempt) as Promise<CommandResult<T>>;
    },
    retry: resend,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    discard(key) {
      if (pending.delete(key)) publish();
    },
    clear() {
      pending.clear();
      publish();
    },
  };
}
