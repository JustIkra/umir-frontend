import { useSyncExternalStore } from 'react';
import type { LiveState } from '@/application/live-sync';
import type { ReadModel, ReadModelSnapshot } from '@/application/read-model';
import { useServices } from '@/presentation/services';

export function useLiveState(): LiveState {
  const { live } = useServices();
  return useSyncExternalStore(live.subscribe, live.getSnapshot);
}

// Subscribing mounts the view's reads: the first subscriber loads a model that
// was never read or was marked stale while no view showed it.
export function useReadModel<T>(model: ReadModel<T>): ReadModelSnapshot<T> {
  return useSyncExternalStore(model.subscribe, model.getSnapshot);
}
