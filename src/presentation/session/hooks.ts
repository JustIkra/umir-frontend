import { useSyncExternalStore } from 'react';
import type { AccessState } from '@/application/access';
import type { Attempt } from '@/application/commands';
import type { LiveState } from '@/application/live-sync';
import type { RefreshNotice } from '@/application/models';
import type { ReadModel, ReadModelSnapshot } from '@/application/read-model';
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
