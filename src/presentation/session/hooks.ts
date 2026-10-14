import { useSyncExternalStore } from 'react';
import { useParams } from 'react-router';
import type { AccessState } from '@/application/access';
import type { Attempt } from '@/application/commands';
import { screenFailure, type ScreenFailure } from '@/application/failure';
import type { LiveState } from '@/application/live-sync';
import type { RefreshNotice } from '@/application/models';
import type { ReadModel, ReadModelSnapshot } from '@/application/read-model';
import type { RestaurantData } from '@/application/restaurant-data';
import type { SessionState } from '@/application/session';
import { useServices } from '@/presentation/services';

// getSnapshot doubles as the server snapshot: route tests render on the
// server.
export function useSession(): SessionState {
  const { session } = useServices();
  return useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
}

export function useAccess(): AccessState {
  const { access } = useServices();
  return useSyncExternalStore(
    access.subscribe,
    access.getSnapshot,
    access.getSnapshot,
  );
}

export function useLiveState(): LiveState {
  const { live } = useServices();
  return useSyncExternalStore(
    live.subscribe,
    live.getSnapshot,
    live.getSnapshot,
  );
}

export function useAttempts(): readonly Attempt[] {
  const { commands } = useServices();
  return useSyncExternalStore(
    commands.subscribe,
    commands.getSnapshot,
    commands.getSnapshot,
  );
}

export function useRefreshNotice(): RefreshNotice | undefined {
  const { models } = useServices();
  return useSyncExternalStore(
    models.subscribeNotice,
    models.getNotice,
    models.getNotice,
  );
}

// Subscribing mounts the view's reads: the first subscriber loads a model that
// was never read or was marked stale while no view showed it.
export function useReadModel<T>(model: ReadModel<T>): ReadModelSnapshot<T> {
  return useSyncExternalStore(
    model.subscribe,
    model.getSnapshot,
    model.getSnapshot,
  );
}

export function useStore<T>(store: {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => T;
}): T {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}

// A restaurant read with the screen state of its failure (spec section 7 of
// the foundation): the previous value stays shown when a re-read fails.
export function useRestaurantRead<T>(model: ReadModel<T>): {
  readonly snapshot: ReadModelSnapshot<T>;
  readonly failure: ScreenFailure | undefined;
} {
  const snapshot = useReadModel(model);
  return {
    snapshot,
    failure: snapshot.failed ? screenFailure(snapshot.failure) : undefined,
  };
}

// The read models of the restaurant in the address. Rendered only inside
// /app/r/:restaurantID.
export function useRestaurantData(): RestaurantData {
  const { restaurantID } = useParams();
  const { restaurantData } = useServices();
  if (restaurantID === undefined) {
    throw new Error('useRestaurantData outside a restaurant');
  }
  return restaurantData(restaurantID);
}
