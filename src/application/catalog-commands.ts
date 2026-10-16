import type { Envelope, Topic } from './api';
import type { AttemptStore } from './attempt-store';
import type { CommandResult, CommandRunner, CommandSpec } from './commands';
import {
  attemptDamagedCode,
  createDurableAttempts,
  type AttemptState,
} from './durable-attempts';
import type {
  CatalogApi,
  Dish,
  DishInput,
  Product,
  ProductInput,
} from './restaurant';

export type CreateOutcome<T> =
  | { readonly kind: 'created'; readonly value: T }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'reset' }
  | { readonly kind: 'refused'; readonly code: string }
  | { readonly kind: 'ended' };

export interface CatalogCommands {
  registerProduct(input: ProductInput): Promise<CreateOutcome<Product>>;
  defineDish(input: DishInput): Promise<CreateOutcome<Dish>>;
  // The input of a create whose outcome is still unknown in this tab: the
  // form stays closed and «Проверить результат» repeats the same command.
  pendingProduct(): ProductInput | undefined;
  pendingDish(): DishInput | undefined;
  // What the saved attempt of each create lets a screen know: not saved,
  // damaged, discardable.
  readonly productAttempt: AttemptState;
  readonly dishAttempt: AttemptState;
}

export interface CatalogCommandsOptions {
  readonly api: CatalogApi;
  readonly commands: CommandRunner;
  readonly restaurantID: string;
  readonly userID: string;
  readonly attempts: AttemptStore;
  readonly now: () => number;
  readonly markStale: (topics: readonly Topic[]) => void;
  readonly onUnauthenticated: () => void;
}

export const productKey = (restaurantID: string) =>
  `catalog.product.${restaurantID}`;
export const dishKey = (restaurantID: string) => `catalog.dish.${restaurantID}`;

const conflicts = new Set(['ProductConflict', 'DishConflict']);

// K05–K11 and K14–K22. A lost answer is checked by repeating the same
// command (same commandID and body); the warehouse epoch travels with it.
export function createCatalogCommands({
  api,
  commands,
  restaurantID,
  userID,
  attempts,
  now,
  markStale,
  onUnauthenticated,
}: CatalogCommandsOptions): CatalogCommands {
  const durable = createDurableAttempts({
    store: attempts,
    userID,
    restaurantID,
    now,
  });
  const productRef = { kind: 'product', userID, restaurantID } as const;
  const dishRef = { kind: 'dish', userID, restaurantID } as const;
  let lastProduct: ProductInput | undefined;
  let lastDish: DishInput | undefined;

  const listed = (key: string) =>
    commands.getSnapshot().some((attempt) => attempt.key === key);

  function outcome<T>(result: CommandResult<Envelope<T>>): CreateOutcome<T> {
    switch (result.kind) {
      case 'committed':
        markStale(['catalog']);
        return { kind: 'created', value: result.value.result };
      case 'unknown':
        return { kind: 'unknown' };
      case 'reset':
        return { kind: 'reset' };
      case 'rejected': {
        const { failure } = result;
        if (failure.status === 401 || failure.code === 'Unauthenticated') {
          onUnauthenticated();
          return { kind: 'ended' };
        }
        if (conflicts.has(failure.code)) return { kind: 'conflict' };
        if (failure.code === 'InvalidArgument') return { kind: 'invalid' };
        return { kind: 'refused', code: failure.code };
      }
    }
  }

  function productSpec(input: ProductInput): CommandSpec<Envelope<Product>> {
    return {
      key: productKey(restaurantID),
      label: 'создания продукта',
      restaurantID,
      service: 'warehouse',
      execute: durable.keep(
        { kind: 'product', payload: input },
        (commandID, epoch) =>
          api.registerProduct(restaurantID, input, commandID, epoch ?? ''),
      ),
    };
  }
  function dishSpec(input: DishInput): CommandSpec<Envelope<Dish>> {
    return {
      key: dishKey(restaurantID),
      label: 'создания блюда',
      restaurantID,
      service: 'warehouse',
      execute: durable.keep(
        { kind: 'dish', payload: input },
        (commandID, epoch) =>
          api.defineDish(restaurantID, input, commandID, epoch ?? ''),
      ),
    };
  }

  // The creates saved in an earlier visit of this tab come back as pending.
  for (const record of durable.restored()) {
    const saved = {
      commandID: record.commandID,
      epoch: record.epoch,
      startedAt: record.startedAt,
    };
    if (record.kind === 'product' && !listed(productKey(restaurantID))) {
      lastProduct = record.payload;
      commands.restore(productSpec(record.payload), saved);
    } else if (record.kind === 'dish' && !listed(dishKey(restaurantID))) {
      lastDish = record.payload;
      commands.restore(dishSpec(record.payload), saved);
    }
  }
  const damagedOutcome = {
    kind: 'refused',
    code: attemptDamagedCode,
  } as const;

  return {
    async registerProduct(input) {
      if (durable.blocked(productRef)) return damagedOutcome;
      if (!listed(productKey(restaurantID))) lastProduct = input;
      return outcome(await commands.run(productSpec(input)));
    },
    async defineDish(input) {
      if (durable.blocked(dishRef)) return damagedOutcome;
      if (!listed(dishKey(restaurantID))) lastDish = input;
      return outcome(await commands.run(dishSpec(input)));
    },
    pendingProduct: () =>
      listed(productKey(restaurantID)) ? lastProduct : undefined,
    pendingDish: () => (listed(dishKey(restaurantID)) ? lastDish : undefined),
    productAttempt: durable.state(productRef),
    dishAttempt: durable.state(dishRef),
  };
}
