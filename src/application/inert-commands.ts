import type { CatalogCommands } from './catalog-commands';
import type { AttemptState } from './durable-attempts';
import type { WarehouseCommands } from './warehouse-commands';

const ended = () => Promise.resolve({ kind: 'ended' } as const);

const unsubscribe = (): void => undefined;

// The state of an operation nobody can run: nothing is unsaved or damaged and
// nothing can be discarded.
export function inertAttemptState(): AttemptState {
  return {
    notSaved: () => false,
    damaged: () => false,
    discardCorrupt: () => 'refused',
    subscribe: () => unsubscribe,
  };
}

// Warehouse commands for the time without a signed-in user: every command
// reports an ended session, nothing is sent and nothing is saved.
export function inertWarehouseCommands(): WarehouseCommands {
  const state = inertAttemptState();
  return {
    receiveDelivery: ended,
    pendingDelivery: () => undefined,
    pendingDeliveryTimeZone: () => undefined,
    confirmWriteoff: ended,
    pendingWriteoff: () => false,
    deliveryAttempt: state,
    writeoffAttempt: () => state,
  };
}

// The same for catalog commands.
export function inertCatalogCommands(): CatalogCommands {
  const state = inertAttemptState();
  return {
    registerProduct: ended,
    defineDish: ended,
    pendingProduct: () => undefined,
    pendingDish: () => undefined,
    productAttempt: state,
    dishAttempt: state,
  };
}
