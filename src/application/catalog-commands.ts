import type { Envelope, Topic } from './api';
import type { CommandResult, CommandRunner } from './commands';
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
}

export interface CatalogCommandsOptions {
  readonly api: CatalogApi;
  readonly commands: CommandRunner;
  readonly restaurantID: string;
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
  markStale,
  onUnauthenticated,
}: CatalogCommandsOptions): CatalogCommands {
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

  return {
    async registerProduct(input) {
      if (!listed(productKey(restaurantID))) lastProduct = input;
      return outcome(
        await commands.run({
          key: productKey(restaurantID),
          label: 'создания продукта',
          restaurantID,
          service: 'warehouse',
          execute: (commandID, epoch) =>
            api.registerProduct(restaurantID, input, commandID, epoch ?? ''),
        }),
      );
    },
    async defineDish(input) {
      if (!listed(dishKey(restaurantID))) lastDish = input;
      return outcome(
        await commands.run({
          key: dishKey(restaurantID),
          label: 'создания блюда',
          restaurantID,
          service: 'warehouse',
          execute: (commandID, epoch) =>
            api.defineDish(restaurantID, input, commandID, epoch ?? ''),
        }),
      );
    },
    pendingProduct: () =>
      listed(productKey(restaurantID)) ? lastProduct : undefined,
    pendingDish: () => (listed(dishKey(restaurantID)) ? lastDish : undefined),
  };
}
