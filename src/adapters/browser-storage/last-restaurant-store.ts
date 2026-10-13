import type { LastRestaurantStore } from '@/application/access';
import { isEntityId } from '@/domain/ids';

export const lastRestaurantKey = 'umir.lastRestaurant';

type KeyValue = Pick<Storage, 'getItem' | 'setItem'>;

// /app opens the restaurant used last. Blocked storage throws; the app then
// forgets and picks a restaurant from access.
export function createLastRestaurantStore(
  storage: KeyValue | undefined,
): LastRestaurantStore {
  return {
    read() {
      try {
        const value = storage?.getItem(lastRestaurantKey);
        return isEntityId(value) ? value : undefined;
      } catch {
        return undefined;
      }
    },
    write(restaurantID) {
      try {
        storage?.setItem(lastRestaurantKey, restaurantID);
      } catch {
        // Nothing to remember in a private window or with blocked site data.
      }
    },
  };
}
