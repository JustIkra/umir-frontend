import type { Envelope, Instant } from './api';
import type { Allocation, Order } from './restaurant';
import type { History } from './warehouse';

export interface RecordedAllocation extends Allocation {
  readonly expiresAt: Instant | undefined;
}
export function recordedAllocations(
  order: Order,
  warehouseEpoch: string | undefined,
  history: Envelope<History> | undefined,
): readonly RecordedAllocation[] {
  const batches = new Map<
    string,
    { readonly productID: string; readonly expiresAt: Instant }
  >();
  if (
    history !== undefined &&
    warehouseEpoch !== undefined &&
    history.context.runtimeEpoch === warehouseEpoch
  ) {
    for (const event of history.result.events) {
      if (event.fact.kind === 'receipt')
        for (const batch of event.fact.batches)
          batches.set(batch.batchID, {
            productID: batch.productID,
            expiresAt: batch.expiresAt,
          });
    }
  }
  return order.allocations.map((allocation) => {
    const batch = batches.get(allocation.batchID);
    return {
      ...allocation,
      expiresAt:
        batch?.productID === allocation.productID ? batch.expiresAt : undefined,
    };
  });
}
