import { failureOf, localFailure, type ApiFailure } from './api';
import type {
  AccountApi,
  SessionInfo,
  SignInInput,
  User,
  UserView,
} from './account';
import type { CommandResult, CommandRunner } from './commands';
import type {
  PageVisibility,
  Scheduler,
  SessionCheck,
  SessionStatus,
} from './live-sync';

// unknown: not checked yet. anonymous.expired: the server ended a session
// this tab had (the sign-in page then says so). unavailable: /me got no
// answer; it is not a guest.
export type SessionState =
  | { readonly status: 'unknown' }
  | {
      readonly status: 'active';
      readonly user: User;
      readonly session: SessionInfo;
    }
  | { readonly status: 'anonymous'; readonly expired: boolean }
  | { readonly status: 'unavailable'; readonly failure: ApiFailure };

export interface SessionStore extends SessionCheck {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => SessionState;
  ensure(): Promise<SessionState>;
  signIn(input: SignInInput): Promise<CommandResult<User>>;
  signOut(): Promise<'done' | 'failed'>;
  // The live stream reported session-expired.
  expire(): void;
}

export interface SessionOptions {
  readonly api: AccountApi;
  readonly commands: CommandRunner;
  readonly scheduler: Scheduler;
  readonly visibility: PageVisibility;
  readonly now: () => number;
  readonly setCsrfToken: (token: string) => void;
  // An explicit sign-out: forget models, attempts, epochs and access.
  readonly onSignedOut: () => void;
  // The server ended the session: stop the stream. Attempts stay, so that
  // after the next sign-in the same attempt is checked (X03).
  readonly onExpired: () => void;
  // Sign-in or /me brought another user than the last one: forget the
  // previous user's access, models, epochs and attempts.
  readonly onUserChanged: () => void;
}

export const signInKey = 'session.sign-in';
// The background check runs this long after the idle deadline, when the
// server has already ended an idle session.
export const idleGraceMs = 1000;
// A remember-me session idles for 30 days; it is still checked hourly.
export const maxIdleCheckMs = 3_600_000;
// A deadline that has passed or did not move (this clock runs ahead of the
// server's) is checked again after this long, not at once.
export const idleRecheckMs = 30_000;
// A background check without an answer is repeated after this long.
export const lostCheckRetryMs = 60_000;

// The sign-in page returns only to addresses inside the app.
export function returnPath(raw: string | null): string {
  if (raw === null || raw.includes('\\') || !/^\/app(?:[/?#]|$)/.test(raw)) {
    return '/app';
  }
  return raw;
}

export function createSessionStore({
  api,
  commands,
  scheduler,
  visibility,
  now,
  setCsrfToken,
  onSignedOut,
  onExpired,
  onUserChanged,
}: SessionOptions): SessionStore {
  const listeners = new Set<() => void>();
  let state: SessionState = { status: 'unknown' };
  let request: Promise<SessionState> | undefined;
  let cancelIdle: (() => void) | undefined;
  let lastUserID: string | undefined;
  let lastIdleDeadline: number | undefined;
  // Signing in, signing out and expiry start a new generation; /me answers
  // of an older one are dropped.
  let generation = 0;

  function publish(next: SessionState): void {
    state = next;
    for (const listener of listeners) listener();
  }

  function scheduleCheck(delayMs: number): void {
    cancelIdle?.();
    cancelIdle = scheduler.schedule(delayMs, () => {
      cancelIdle = undefined;
      void check();
    });
  }

  function newGeneration(): void {
    generation += 1;
    request = undefined;
  }

  function activate(view: UserView): void {
    setCsrfToken(view.csrfToken);
    if (lastUserID !== undefined && lastUserID !== view.user.userID) {
      onUserChanged();
    }
    lastUserID = view.user.userID;
    const at = now();
    const deadline = view.session.idleExpiresAt.epochMs;
    const untilIdle = deadline - at + idleGraceMs;
    const stalled = deadline <= at || deadline === lastIdleDeadline;
    lastIdleDeadline = deadline;
    scheduleCheck(
      Math.min(
        maxIdleCheckMs,
        stalled ? Math.max(untilIdle, idleRecheckMs) : untilIdle,
      ),
    );
    publish({ status: 'active', user: view.user, session: view.session });
  }

  function end(expired: boolean): void {
    cancelIdle?.();
    cancelIdle = undefined;
    newGeneration();
    const wasActive = state.status === 'active';
    publish({ status: 'anonymous', expired });
    if (expired && wasActive) onExpired();
  }

  function load(background: boolean): Promise<SessionState> {
    if (request !== undefined) return request;
    const own = generation;
    const pending: Promise<SessionState> = api
      .me({ background })
      .then(
        (view): SessionState => {
          if (own === generation) activate(view);
          return state;
        },
        (error: unknown): SessionState => {
          if (own !== generation) return state;
          const failure =
            failureOf(error) ?? localFailure('Malformed', 'unavailable');
          if (failure.status === 401) end(state.status === 'active');
          else if (!background) publish({ status: 'unavailable', failure });
          else if (state.status === 'active') scheduleCheck(lostCheckRetryMs);
          // A lost background answer keeps the session but is reported as
          // unavailable to the caller.
          return background && state.status === 'active'
            ? { status: 'unavailable', failure }
            : state;
        },
      )
      .finally(() => {
        if (request === pending) request = undefined;
      });
    request = pending;
    return pending;
  }

  async function check(): Promise<SessionStatus> {
    const result = await load(true);
    if (result.status === 'active') return 'active';
    return result.status === 'anonymous' ? 'ended' : 'unknown';
  }

  visibility.subscribe(() => {
    if (visibility.isVisible() && state.status === 'active') void check();
  });

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    ensure() {
      return state.status === 'unknown' || state.status === 'unavailable'
        ? load(false)
        : Promise.resolve(state);
    },
    check,
    async signIn(input) {
      const result = await commands.run({
        key: signInKey,
        label: 'входа',
        execute: (commandID) => api.signIn(input, commandID),
      });
      if (result.kind !== 'committed') return result;
      newGeneration();
      activate(result.value);
      return { kind: 'committed', value: result.value.user };
    },
    async signOut() {
      try {
        await api.signOut();
      } catch (error) {
        if (failureOf(error)?.status !== 401) return 'failed';
      }
      end(false);
      onSignedOut();
      return 'done';
    },
    expire() {
      if (state.status === 'active') end(true);
    },
  };
}
