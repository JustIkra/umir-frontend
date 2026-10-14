import type { OrderFlow } from './order-flow';
import type { OrderStorage } from './restaurant';

export interface OrderFlowRegistry {
  get(userID: string, restaurantID: string): OrderFlow;
  // Sign-out or another user: drop every flow and the orders of the tab.
  forget(): void;
}

// One order flow per user and restaurant for the lifetime of the tab, so a
// draft and an unchecked attempt survive leaving the section.
export function createOrderFlowRegistry(
  create: (userID: string, restaurantID: string) => OrderFlow,
  storage: Pick<OrderStorage, 'clearAll'>,
): OrderFlowRegistry {
  const flows = new Map<string, OrderFlow>();
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
