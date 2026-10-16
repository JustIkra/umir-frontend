import type { AttemptStore } from './attempt-store';
import type { SessionStore } from './session';

export interface RestoreAttemptsOptions {
  readonly store: AttemptStore;
  readonly userID: string;
  // The factories restore the saved attempts of their restaurant when they
  // are created; asking for one is all that is needed.
  readonly warehouseCommands: (restaurantID: string) => unknown;
  readonly catalogCommands: (restaurantID: string) => unknown;
}

// Brings the saved attempts of one user back without an open page: the
// factory of every restaurant with a saved delivery, write-off, product or
// dish puts the attempt into the runner, so W11 shows it and the restaurant
// cannot be left unnoticed. A factory is made once per restaurant and kind,
// however many records a restaurant has; damaged records count too, because
// their screen has to show them.
export function restoreAttempts({
  store,
  userID,
  warehouseCommands,
  catalogCommands,
}: RestoreAttemptsOptions): void {
  const listed = store.list(userID);
  if (listed.status !== 'ok') return;
  const warehouse = new Set<string>();
  const catalog = new Set<string>();
  for (const { ref } of listed.entries) {
    const into =
      ref.kind === 'delivery' || ref.kind === 'writeoff' ? warehouse : catalog;
    into.add(ref.restaurantID);
  }
  for (const restaurantID of warehouse) warehouseCommands(restaurantID);
  for (const restaurantID of catalog) catalogCommands(restaurantID);
}

// Runs `restore` for the user of the session once it is active and again
// after each new sign-in (the user changed, or the session ended and began
// again), never while the session is unknown, unavailable or anonymous and
// never twice for one sign-in. Returns the way to stop watching.
export function restoreWhenActive(
  session: Pick<SessionStore, 'subscribe' | 'getSnapshot'>,
  restore: (userID: string) => void,
): () => void {
  let restoredFor: string | undefined;
  const check = (): void => {
    const state = session.getSnapshot();
    if (state.status !== 'active') {
      restoredFor = undefined;
      return;
    }
    if (restoredFor === state.user.userID) return;
    restoredFor = state.user.userID;
    // A failed restore costs only the early return of the attempts (their
    // screens restore them on opening); it must not stop the other
    // listeners of the session.
    try {
      restore(state.user.userID);
    } catch {
      // Nothing to do: the next sign-in tries again.
    }
  };
  const stop = session.subscribe(check);
  check();
  return stop;
}
