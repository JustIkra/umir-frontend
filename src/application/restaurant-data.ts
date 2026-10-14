import { ApiError, localFailure, type Envelope, type Topic } from './api';
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
  HistoryEvent,
  Inventory,
  PendingBatches,
  StockReport,
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
  // Ranked by the nearest expiry: re-read on every tick as well.
  recommendations(): ReadModel<Envelope<Recommendations>>;
  // inventory and pendingWriteoffs re-read on the tick too: without /live an
  // expired batch moves between the lists only by a re-read.
  inventory(): ReadModel<Envelope<Inventory>>;
  // Batches expiring within 48 hours; their remaining time follows the clock.
  expiringBatches(): ReadModel<Envelope<ExpiringBatches>>;
  pendingWriteoffs(): ReadModel<Envelope<PendingBatches>>;
  // The first page of the stock report for a window of whole hours.
  stockReport(riskHours: number): ReadModel<Envelope<StockReport>>;
  // A further page of the same report («Показать ещё»).
  stockReportPage(
    riskHours: number,
    cursor: string,
  ): ReadModel<Envelope<StockReport>>;
  // The whole journal of the current warehouse epoch, ascending by sequence.
  history(): ReadModel<Envelope<History>>;
}

const catalogTopics: readonly Topic[] = ['catalog'];
// Menu and stop list follow stock and the dish catalog.
const availabilityTopics: readonly Topic[] = ['menu', 'stock', 'catalog'];
const stockTopics: readonly Topic[] = ['stock'];
const reportTopics: readonly Topic[] = ['stock', 'analytics'];
// Deliveries and writeoffs, sales, and catalog events all land in the journal.
const historyTopics: readonly Topic[] = ['stock', 'orders', 'catalog'];

// The warehouse answers up to this many events after fromSequence.
const historyPage = 500;

interface Journal {
  readonly epoch: string;
  readonly events: readonly HistoryEvent[];
}

const lastSequence = (events: readonly HistoryEvent[]) =>
  events.at(-1)?.sequence ?? '0';

// The events of a page that come after `sequence`, in order; a repeated or
// older event is dropped, so a journal never lists an event twice.
function newer(
  events: readonly HistoryEvent[],
  sequence: string,
): HistoryEvent[] {
  const result: HistoryEvent[] = [];
  let last = BigInt(sequence);
  for (const event of events) {
    const current = BigInt(event.sequence);
    if (current > last) {
      result.push(event);
      last = current;
    }
  }
  return result;
}

// Two reads may overlap (a refresh supersedes a read in flight). Both read the
// same journal from its start, so the longer one wins and nothing repeats.
function merge(current: Journal | undefined, next: Journal): Journal {
  if (current?.epoch !== next.epoch) return next;
  const added = newer(next.events, lastSequence(current.events));
  return added.length === 0
    ? current
    : { epoch: current.epoch, events: [...current.events, ...added] };
}

// The load function of the history model. The registry keeps the first load
// function of a model, so the journal read so far lives in this closure and
// goes away with the registry on sign-out and user change. fromSequence is
// exclusive and a page holds up to 500 events: a full page means more may
// follow. A page of another warehouse epoch starts the journal over from 0.
// A failed page fails the whole read and keeps what was read before it.
function historyLoader(
  read: (
    fromSequence: string,
    options: LoadOptions,
  ) => Promise<Envelope<History>>,
): (options: LoadOptions) => Promise<Envelope<History>> {
  let kept: Journal | undefined;
  return async (options) => {
    let epoch = kept?.epoch;
    const events = [...(kept?.events ?? [])];
    let restarted = false;
    for (;;) {
      const from = lastSequence(events);
      const page = await read(from, options);
      const { runtimeEpoch } = page.context;
      if (epoch !== undefined && runtimeEpoch !== epoch) {
        // The warehouse restarted and its journal began anew. A second
        // restart within one read fails it: the operator reads again.
        if (restarted) {
          throw new ApiError(localFailure('RuntimeReset', 'unavailable'));
        }
        restarted = true;
        epoch = undefined;
        events.length = 0;
        continue;
      }
      epoch = runtimeEpoch;
      const added = newer(page.result.events, from);
      events.push(...added);
      if (page.result.events.length < historyPage || added.length === 0) {
        kept = merge(kept, { epoch, events });
        return { context: page.context, result: { events: kept.events } };
      }
    }
  };
}

// The read models of one restaurant. The registry keeps one model per
// resource, records the runtime epoch of each read and marks the models on
// live changes of their topics.
export function createRestaurantData(
  models: Pick<ModelRegistry, 'scoped'>,
  reads: RestaurantReads,
  warehouseReads: WarehouseReads,
  restaurantID: string,
  // The organization's settings version from access; the stock report sends
  // it as expectedSettingsVersion.
  settingsVersion: () => string | undefined,
): RestaurantData {
  function warehouse<T>(
    resource: string,
    topics: readonly Topic[],
    load: (options: LoadOptions) => Promise<Envelope<T>>,
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
  // The version is taken at each read: after access re-reads the settings,
  // the next report goes with the new one.
  function report(
    riskHours: number,
    cursor: string | undefined,
    options: LoadOptions,
  ): Promise<Envelope<StockReport>> {
    const version = settingsVersion();
    if (version === undefined) {
      return Promise.reject(
        new ApiError(localFailure('SettingsUnknown', 'unavailable')),
      );
    }
    return warehouseReads.stockReport(
      restaurantID,
      { riskHours, settingsVersion: version, cursor },
      options,
    );
  }
  return {
    restaurantID,
    products: () =>
      warehouse('warehouse/products', catalogTopics, (options) =>
        reads.products(restaurantID, options),
      ),
    dishCatalog: () =>
      warehouse('warehouse/dish-catalog', catalogTopics, (options) =>
        reads.dishCatalog(restaurantID, options),
      ),
    dish: (dishID) =>
      warehouse(`warehouse/dish?dishID=${dishID}`, catalogTopics, (options) =>
        reads.dish(restaurantID, dishID, options),
      ),
    suggestion: (kind) =>
      warehouse(
        `warehouse/id-suggestions?kind=${kind}`,
        catalogTopics,
        (options) => reads.suggestID(restaurantID, kind, options),
      ),
    servingProducts: () =>
      serving('serving/products', catalogTopics, (options) =>
        reads.servingProducts(restaurantID, options),
      ),
    menu: () =>
      serving('serving/menu', availabilityTopics, (options) =>
        reads.menu(restaurantID, options),
      ),
    stopList: () =>
      serving('serving/stop-list', availabilityTopics, (options) =>
        reads.stopList(restaurantID, options),
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
        stockTopics,
        (options) => warehouseReads.inventory(restaurantID, options),
        true,
      ),
    expiringBatches: () =>
      warehouse(
        'warehouse/expiring-batches',
        stockTopics,
        (options) => warehouseReads.expiringBatches(restaurantID, options),
        true,
      ),
    pendingWriteoffs: () =>
      warehouse(
        'warehouse/pending-writeoffs',
        stockTopics,
        (options) => warehouseReads.pendingWriteoffs(restaurantID, options),
        true,
      ),
    stockReport: (riskHours) =>
      warehouse(
        `warehouse/analytics/stock?riskHours=${String(riskHours)}`,
        reportTopics,
        (options) => report(riskHours, undefined, options),
        true,
      ),
    stockReportPage: (riskHours, cursor) =>
      warehouse(
        `warehouse/analytics/stock?riskHours=${String(riskHours)}&cursor=${cursor}`,
        reportTopics,
        (options) => report(riskHours, cursor, options),
      ),
    // A new loader on every call; the registry keeps only the first one.
    history: () =>
      warehouse(
        'warehouse/history',
        historyTopics,
        historyLoader((fromSequence, options) =>
          warehouseReads.history(restaurantID, fromSequence, options),
        ),
      ),
  };
}
