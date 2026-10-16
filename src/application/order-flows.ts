import type { OrderFlow } from './order-flow';

export interface OrderFlowRegistry {
  get(userID: string, restaurantID: string): OrderFlow;
  // Sign-out or another user: stop every flow of the tab. The saved orders
  // stay: they belong to their user and come back when that user returns.
  forget(): void;
}

// One order flow per user and restaurant for the lifetime of the tab, so a
// draft and an unchecked attempt survive leaving the section.
export function createOrderFlowRegistry(
  create: (userID: string, restaurantID: string) => OrderFlow,
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
    },
  };
}
