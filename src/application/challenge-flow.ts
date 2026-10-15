import type { Challenge } from './account';
import type { ApiFailure } from './api';
import type { CommandResult, CommandRunner } from './commands';
import { defaultWaitSeconds } from './credentials';

// The attempt core that the scenarios built on an email code share (the
// invitation and the registration): the saved record of the challenge, the
// busy flag and the notice, generations that drop stale answers, the sending
// of a command under its key, and the refusals every step has in common. A
// scenario brings its keys, labels, notices and snapshot.

export interface ChallengeRecord {
  readonly challenge: Challenge;
}

export interface FlowStorage<R> {
  save(record: R): void;
  clear(): void;
}

// The notices the core itself raises.
export interface CoreNotices<A extends string, N> {
  readonly unknown: (action: A) => N;
  readonly limited: (untilMs: number) => N;
  readonly unavailable: N;
}

export interface ChallengeFlowOptions<
  A extends string,
  N extends { readonly kind: string },
  R extends ChallengeRecord,
  S,
> {
  readonly commands: CommandRunner;
  readonly now: () => number;
  readonly storage: FlowStorage<R>;
  // The record saved by a previous load of the tab.
  readonly initial: R | undefined;
  // Command key per action. The action 'begin' is the request of the code:
  // the other keys belong to one challenge.
  readonly keys: Readonly<Record<A, string>>;
  // Labels name the action in W11 if an attempt is still unchecked.
  readonly labels: Readonly<Record<A, string>>;
  readonly notices: CoreNotices<A, N>;
  // The snapshot of the scenario, read after every change.
  readonly view: () => S;
  // The attempt is dead (the session the code was bound to is gone, or a
  // step failed for good): the scenario goes back to its start.
  readonly abandon: () => void;
}

type Refusal = Exclude<CommandResult<unknown>, { readonly kind: 'committed' }>;

export interface ChallengeFlow<
  A extends string,
  N extends { readonly kind: string },
  R extends ChallengeRecord,
  S,
> {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => S;
  readonly record: R | undefined;
  readonly notice: N | undefined;
  readonly busy: boolean;
  readonly finished: boolean;
  readonly generation: number;
  // The inputs of the last attempts live in memory only: «Проверить
  // результат» repeats them, and a reload loses them.
  readonly memory: { password: string; lastCode: string };
  // Sets the notice and tells the subscribers.
  show(next: N | undefined): void;
  // Marks the flow busy without a notification (a step continues into the
  // next command).
  hold(): void;
  // Saves the record. Another challenge makes the attempts of the previous
  // one meaningless: every key but the code request is discarded.
  keep(next: R | undefined): void;
  // A record read back from the storage, not saved again.
  adopt(next: R): void;
  // Back to the start, without a notification: a new generation, no attempts,
  // no record (and no saved one unless wipeStorage is false), no inputs.
  reset(wipeStorage?: boolean): void;
  // The scenario is over: the result stays, the record and inputs go.
  finish(): void;
  // True if the answer belongs to an older generation (and was told to the
  // subscribers as it stands).
  dropped(own: number): boolean;
  send<T>(
    own: number,
    action: A,
    execute: (commandID: string) => Promise<T>,
  ): Promise<CommandResult<T>>;
  // Refusals every step shares. specific answers for the codes of the
  // action: a notice, 'silent' for none, undefined to leave it to the common
  // rules (a wait for 429, a service that did not run the command).
  refused(
    result: Refusal,
    action: A,
    specific: (failure: ApiFailure) => N | 'silent' | undefined,
  ): void;
  // The attempt is dead: back to the start with the reason.
  startOver(reason: N): N;
}

export function createChallengeFlow<
  A extends string,
  N extends { readonly kind: string },
  R extends ChallengeRecord,
  S,
>({
  commands,
  now,
  storage,
  initial,
  keys,
  labels,
  notices,
  view,
  abandon,
}: ChallengeFlowOptions<A, N, R, S>): ChallengeFlow<A, N, R, S> {
  const listeners = new Set<() => void>();
  const memory = { password: '', lastCode: '' };
  let record = initial;
  let notice: N | undefined;
  let busy = false;
  let finished = false;
  // reset() and finish() start a new generation; answers of an older one are
  // dropped.
  let generation = 0;
  // Read on first use: the scenario's view may not exist yet when the core
  // is built.
  let snapshot: S | undefined;

  const discard = (only?: (action: A) => boolean): void => {
    for (const action of Object.keys(keys) as A[]) {
      if (only === undefined || only(action)) commands.discard(keys[action]);
    }
  };

  function show(next: N | undefined): void {
    notice = next;
    snapshot = view();
    for (const listener of listeners) listener();
  }

  function keep(next: R | undefined): void {
    if (next?.challenge.challengeID !== record?.challenge.challengeID) {
      discard((action) => action !== 'begin');
    }
    record = next;
    if (next === undefined) storage.clear();
    else storage.save(next);
  }

  function forgetInputs(): void {
    memory.password = '';
    memory.lastCode = '';
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      snapshot ??= view();
      return snapshot;
    },
    get record() {
      return record;
    },
    get notice() {
      return notice;
    },
    get busy() {
      return busy;
    },
    get finished() {
      return finished;
    },
    get generation() {
      return generation;
    },
    memory,
    show,
    hold() {
      busy = true;
    },
    keep,
    adopt(next) {
      record = next;
    },
    reset(wipeStorage = true) {
      generation += 1;
      discard();
      record = undefined;
      if (wipeStorage) storage.clear();
      forgetInputs();
      finished = false;
      busy = false;
    },
    finish() {
      generation += 1;
      discard();
      record = undefined;
      storage.clear();
      forgetInputs();
      finished = true;
      busy = false;
    },
    dropped(own) {
      if (own === generation) return false;
      show(notice);
      return true;
    },
    // own is the generation of the action: a stale answer leaves busy to the
    // newer action.
    async send(own, action, execute) {
      busy = true;
      show(undefined);
      const result = await commands.run({
        key: keys[action],
        label: labels[action],
        execute,
      });
      if (own === generation) busy = false;
      return result;
    },
    refused(result, action, specific) {
      if (result.kind === 'unknown') {
        show(notices.unknown(action));
        return;
      }
      const { failure } = result;
      // 401: the session the code was bound to is gone.
      if (failure.status === 401) {
        abandon();
        show(undefined);
        return;
      }
      const own = specific(failure);
      if (own !== undefined) {
        show(own === 'silent' ? undefined : own);
        return;
      }
      if (failure.status === 429) {
        const seconds = failure.retryAfterSeconds ?? defaultWaitSeconds;
        show(notices.limited(now() + seconds * 1000));
        return;
      }
      show(notices.unavailable);
    },
    startOver(reason) {
      abandon();
      return reason;
    },
  };
}
