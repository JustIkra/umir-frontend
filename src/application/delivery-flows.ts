import type { DeliveryFlow } from './delivery-flow';
import type { DeliveryStorage } from './warehouse';

export interface DeliveryFlowRegistry {
  get(userID: string, restaurantID: string): DeliveryFlow;
  // Sign-out or another user: drop every flow and the deliveries of the tab.
  forget(): void;
}

// One delivery flow per user and restaurant for the lifetime of the tab, so a
// draft and an unchecked attempt survive leaving the page.
export function createDeliveryFlowRegistry(
  create: (userID: string, restaurantID: string) => DeliveryFlow,
  storage: Pick<DeliveryStorage, 'clearAll'>,
): DeliveryFlowRegistry {
  const flows = new Map<string, DeliveryFlow>();
  return {
    get(userID, restaurantID) {
      const key = `${userID}/${restaurantID}`;
      let flow = flows.get(key);
      if (flow === undefined) {
        flow = create(userID, restaurantID);
        flows.set(key, flow);
      }
      return flow;
    },
    forget() {
      for (const flow of flows.values()) flow.dispose();
      flows.clear();
      storage.clearAll();
    },
  };
}
