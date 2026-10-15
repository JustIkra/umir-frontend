import type { Envelope, Topic } from './api';
import type { ModelRegistry } from './models';
import type { LoadOptions, ReadModel } from './read-model';
import type {
  CatalogKind,
  DishCatalog,
  DishDetails,
  Menu,
  Products,
  Recommendations,
  RestaurantReads,
  StopList,
  Suggestion,
} from './restaurant';
import type {
  ExpiringBatches,
  History,
  Inventory,
  PendingBatches,
  ProductBatches,
  SupplySuggestions,
  WarehouseReads,
} from './warehouse';

export interface RestaurantData {
  readonly restaurantID: string;
  products(): ReadModel<Envelope<Products>>;
  dishCatalog(): ReadModel<Envelope<DishCatalog>>;
  dish(dishID: string): ReadModel<Envelope<DishDetails>>;
  // The smallest free code; re-read after a catalog change.
  suggestion(kind: CatalogKind): ReadModel<Envelope<Suggestion>>;
  servingProducts(): ReadModel<Envelope<Products>>;
  menu(): ReadModel<Envelope<Menu>>;
  stopList(): ReadModel<Envelope<StopList>>;
  recommendations(): ReadModel<Envelope<Recommendations>>;
  inventory(): ReadModel<Envelope<Inventory>>;
  productBatches(productID: string): ReadModel<Envelope<ProductBatches>>;
  pendingWriteoffs(): ReadModel<Envelope<PendingBatches>>;
  expiringBatches(): ReadModel<Envelope<ExpiringBatches>>;
  history(): ReadModel<Envelope<History>>;
  supplySuggestions(): ReadModel<Envelope<SupplySuggestions>>;
}

const catalogTopics: readonly Topic[] = ['catalog'];
// Menu and stop list follow stock and the dish catalog.
const availabilityTopics: readonly Topic[] = ['menu', 'stock', 'catalog'];

// The read models of one restaurant. The registry keeps one model per
// resource, records the runtime epoch of each read and marks the models on
// live changes of their topics.
export function createRestaurantData(
  models: Pick<ModelRegistry, 'scoped'>,
  reads: RestaurantReads & WarehouseReads,
  restaurantID: string,
): RestaurantData {
  function warehouse<T>(
    resource: string,
    load: (options: LoadOptions) => Promise<Envelope<T>>,
    topics: readonly Topic[] = catalogTopics,
    refreshOnTick = false,
  ): ReadModel<Envelope<T>> {
    return models.scoped(
      { restaurantID, resource, topics, service: 'warehouse', refreshOnTick },
      load,
    );
  }
  function serving<T>(
    resource: string,
    topics: readonly Topic[],
    load: (options: LoadOptions) => Promise<Envelope<T>>,
    refreshOnTick = false,
  ): ReadModel<Envelope<T>> {
    return models.scoped(
      { restaurantID, resource, topics, service: 'serving', refreshOnTick },
      load,
    );
  }
  return {
    restaurantID,
    products: () =>
      warehouse('warehouse/products', (options) =>
        reads.products(restaurantID, options),
      ),
    dishCatalog: () =>
      warehouse('warehouse/dish-catalog', (options) =>
        reads.dishCatalog(restaurantID, options),
      ),
    dish: (dishID) =>
      warehouse(`warehouse/dish?dishID=${dishID}`, (options) =>
        reads.dish(restaurantID, dishID, options),
      ),
    suggestion: (kind) =>
      warehouse(`warehouse/id-suggestions?kind=${kind}`, (options) =>
        reads.suggestID(restaurantID, kind, options),
      ),
    servingProducts: () =>
      serving('serving/products', catalogTopics, (options) =>
        reads.servingProducts(restaurantID, options),
      ),
    menu: () =>
      serving(
        'serving/menu',
        availabilityTopics,
        (options) => reads.menu(restaurantID, options),
        true,
      ),
    stopList: () =>
      serving(
        'serving/stop-list',
        availabilityTopics,
        (options) => reads.stopList(restaurantID, options),
        true,
      ),
    recommendations: () =>
      serving(
        'serving/recommendations',
        availabilityTopics,
        (options) => reads.recommendations(restaurantID, options),
        true,
      ),
    inventory: () =>
      warehouse(
        'warehouse/inventory',
        (options) => reads.inventory(restaurantID, options),
        ['stock', 'catalog'],
        true,
      ),
    productBatches: (productID) =>
      warehouse(
        `warehouse/products/${encodeURIComponent(productID)}/batches`,
        (options) => reads.productBatches(restaurantID, productID, options),
        ['stock'],
        true,
      ),
    pendingWriteoffs: () =>
      warehouse(
        'warehouse/pending-writeoffs',
        (options) => reads.pendingWriteoffs(restaurantID, options),
        ['stock'],
        true,
      ),
    expiringBatches: () =>
      warehouse(
        'warehouse/expiring-batches',
        (options) => reads.expiringBatches(restaurantID, options),
        ['stock', 'catalog'],
        true,
      ),
    history: () =>
      warehouse(
        'warehouse/history',
        (options) => reads.history(restaurantID, options),
        ['stock', 'orders', 'catalog'],
      ),
    supplySuggestions: () =>
      warehouse(
        'warehouse/supply-suggestions',
        (options) => reads.supplySuggestions(restaurantID, options),
        ['stock', 'orders', 'catalog'],
        true,
      ),
  };
}
