import { ApiError, failureOf, localFailure } from './api';
import type {
  AttemptBody,
  AttemptDiscard,
  AttemptRecord,
  AttemptRef,
  AttemptStore,
} from './attempt-store';
import { settlesAttempt } from './commands';

// The code of the refusal a screen gets when the saved attempt of an
// operation cannot be read: nothing was sent and no new command was made.
export const attemptDamagedCode = 'AttemptDamaged';

// The code of the refusal when the saved attempt of the operation is another
// command that has not been settled yet: nothing was sent either, and the
// saved record stays as it is until its own answer (or a reload) settles it.
export const attemptUnresolvedCode = 'AttemptUnresolved';

// What a screen reads about one operation: whether the attempt could not be
// saved (it lives in this tab only), whether the saved one is damaged, and
// the owner's way to discard a damaged one.
export interface AttemptState {
  notSaved(): boolean;
  damaged(): boolean;
  // Removes the record only when it cannot be read; a readable one is
  // refused. After `ok` the operation is available again.
  discardCorrupt(): AttemptDiscard;
  readonly subscribe: (listener: () => void) => () => void;
}

export type Execute<T> = (
  commandID: string,
  epoch: string | undefined,
) => Promise<T>;

export interface DurableAttempts {
  // The readable records of this user and restaurant; the damaged ones are
  // only marked.
  restored(): readonly AttemptRecord[];
  state(ref: AttemptRef): AttemptState;
  // True, with the operation marked damaged, when its record cannot be read.
  blocked(ref: AttemptRef): boolean;
  // Wraps a send: the record is written before the API is called (once per
  // command, a resend writes nothing) and removed when the command is settled.
  keep<T>(body: AttemptBody, execute: Execute<T>): Execute<T>;
}

export interface DurableAttemptsOptions {
  readonly store: AttemptStore;
  readonly userID: string;
  readonly restaurantID: string;
  readonly now: () => number;
}

export function refOfBody(
  body: AttemptBody,
  userID: string,
  restaurantID: string,
): AttemptRef {
  return body.kind === 'writeoff'
    ? { kind: 'writeoff', userID, restaurantID, batchID: body.payload.batchID }
    : { kind: body.kind, userID, restaurantID };
}

const slot = (ref: AttemptRef): string =>
  ref.kind === 'writeoff' ? `writeoff.${ref.batchID}` : ref.kind;

export function createDurableAttempts({
  store,
  userID,
  restaurantID,
  now,
}: DurableAttemptsOptions): DurableAttempts {
  const damaged = new Set<string>();
  const notSaved = new Set<string>();
  // The command and start time of the attempt sent from this tab.
  const begun = new Map<string, { commandID: string; startedAt: number }>();
  // The command of a settled attempt whose record could not be removed: its
  // answer is known, so it is the one readable record that may be removed
  // later, before the next command of the operation is refused over it.
  const leftover = new Map<string, string>();
  const listeners = new Set<() => void>();
  // One state object per slot: a screen subscribing keeps one identity.
  const states = new Map<string, AttemptState>();

  function announce(): void {
    for (const listener of listeners) listener();
  }

  function mark(set: Set<string>, key: string, on: boolean): void {
    if (on === set.has(key)) return;
    if (on) set.add(key);
    else set.delete(key);
    announce();
  }

  function persist(
    body: AttemptBody,
    ref: AttemptRef,
    commandID: string,
    epoch: string | undefined,
  ): void {
    const key = slot(ref);
    const loaded = store.load(ref);
    if (loaded.status === 'corrupt') {
      // save would overwrite it: only the owner may discard it.
      mark(damaged, key, true);
      throw new ApiError(localFailure(attemptDamagedCode, 'not_committed'));
    }
    if (loaded.status === 'ok') {
      if (loaded.record.commandID === commandID) {
        mark(notSaved, key, false);
        return;
      }
      // A readable record is dropped only by the answer to its own command;
      // writing over it would lose the trace of a command that may be done.
      // The one exception is a record of a settled command that could not be
      // removed then: it is removed now, or the operation stays blocked.
      const settled = leftover.get(key) === loaded.record.commandID;
      if (!settled || store.remove(ref) !== 'ok') {
        throw new ApiError(
          localFailure(attemptUnresolvedCode, 'not_committed'),
        );
      }
      leftover.delete(key);
    }
    const known = begun.get(key);
    const startedAt = known?.commandID === commandID ? known.startedAt : now();
    begun.set(key, { commandID, startedAt });
    const result = store.save({
      ...body,
      userID,
      restaurantID,
      commandID,
      epoch,
      startedAt,
    });
    mark(notSaved, key, result === 'unavailable');
  }

  // Only the record of this very command goes: a late answer of a detached
  // attempt must not remove a newer one.
  function release(ref: AttemptRef, commandID: string): void {
    const key = slot(ref);
    const loaded = store.load(ref);
    if (loaded.status === 'unavailable') leftover.set(key, commandID);
    else if (
      loaded.status === 'ok' &&
      loaded.record.commandID === commandID &&
      store.remove(ref) === 'unavailable'
    ) {
      leftover.set(key, commandID);
    }
    if (begun.get(key)?.commandID === commandID) {
      begun.delete(key);
      mark(notSaved, key, false);
    }
  }

  return {
    restored() {
      const listed = store.list(userID);
      if (listed.status !== 'ok') return [];
      const records: AttemptRecord[] = [];
      for (const { ref, result } of listed.entries) {
        if (ref.restaurantID !== restaurantID) continue;
        if (result.status === 'corrupt') damaged.add(slot(ref));
        else records.push(result.record);
      }
      return records;
    },
    state(ref) {
      const key = slot(ref);
      const known = states.get(key);
      if (known !== undefined) return known;
      const created: AttemptState = {
        notSaved: () => notSaved.has(key),
        damaged: () => damaged.has(key),
        discardCorrupt() {
          const result = store.discardCorrupt(ref);
          if (result === 'ok') mark(damaged, key, false);
          return result;
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
      };
      states.set(key, created);
      return created;
    },
    blocked(ref) {
      const corrupt = store.load(ref).status === 'corrupt';
      mark(damaged, slot(ref), corrupt);
      return corrupt;
    },
    keep(body, execute) {
      const ref = refOfBody(body, userID, restaurantID);
      return async (commandID, epoch) => {
        persist(body, ref, commandID, epoch);
        try {
          const value = await execute(commandID, epoch);
          release(ref, commandID);
          return value;
        } catch (error) {
          const failure =
            failureOf(error) ?? localFailure('Malformed', 'unknown');
          if (settlesAttempt(failure)) release(ref, commandID);
          throw error;
        }
      };
    },
  };
}
