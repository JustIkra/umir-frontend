import type { Service } from './api';

export type EpochChange = 'first' | 'same' | 'changed';

// The runtime epoch each warehouse and serving read reported, per restaurant
// and service. A POST sends the epoch of its own service. A changed epoch
// means the service restarted and lost its in-memory state.
export interface EpochRegistry {
  record(restaurantID: string, service: Service, epoch: string): EpochChange;
  get(restaurantID: string, service: Service): string | undefined;
  clear(): void;
}

export function createEpochRegistry(): EpochRegistry {
  const epochs = new Map<string, string>();
  const key = (restaurantID: string, service: Service) =>
    `${restaurantID}/${service}`;
  return {
    record(restaurantID, service, epoch) {
      const previous = epochs.get(key(restaurantID, service));
      epochs.set(key(restaurantID, service), epoch);
      if (previous === undefined) return 'first';
      return previous === epoch ? 'same' : 'changed';
    },
    get: (restaurantID, service) => epochs.get(key(restaurantID, service)),
    clear() {
      epochs.clear();
    },
  };
}
