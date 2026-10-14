import type { Envelope } from '@/application/api';
import type { OrderPhase } from '@/application/order-flow';
import type {
  DishCatalog,
  Product,
  Products,
  Recommendations,
  StopList,
} from '@/application/restaurant';
import type {
  ExpiringBatches,
  Inventory,
  PendingBatches,
  StockReport,
} from '@/application/warehouse';
import { formatQuantity } from '@/domain/quantity';
import { deficitText } from '@/presentation/orders/order-rows';
import { plural } from '@/presentation/ui/plural';
import { formatInstant } from '@/presentation/ui/time';
import { zoneLabel } from '@/presentation/ui/zones';
import {
  batchRows,
  reportRows,
  windowHours,
} from '@/presentation/warehouse/expiry-rows';

export type TileWindow = '24h' | '3d' | '7d';

// A tile shows at most three rows; the rest is counted (W03).
const SHOWN = 3;
const HOUR_MS = 3_600_000;

const counted = (count: number, one: string, few: string, many: string) =>
  `${String(count)} ${plural(count, one, few, many)}`;
export const batchesText = (count: number) =>
  counted(count, 'партия', 'партии', 'партий');
export const productsText = (count: number) =>
  counted(count, 'продукт', 'продукта', 'продуктов');

const windows: readonly { value: TileWindow; title: string }[] = [
  { value: '24h', title: '24 ч' },
  { value: '3d', title: '3 дня' },
  { value: '7d', title: '7 дней' },
];

// Spec 6.1: without analytics.read only «24 ч» is offered.
export function tileWindows(
  analytics: boolean,
): readonly { value: TileWindow; title: string }[] {
  return analytics ? windows : windows.slice(0, 1);
}

// W03: «оценка 14:32».
export function tileStamp(epochMs: number, timeZone: string): string {
  return `оценка ${formatInstant(epochMs, timeZone, 'time')}`;
}

// W03: «Граница: 11.10.2026, 14:32 (Москва, UTC+3)».
export function boundaryText(epochMs: number, timeZone: string): string {
  return `Граница: ${formatInstant(epochMs, timeZone, 'date')}, ${formatInstant(epochMs, timeZone, 'time')} (${zoneLabel(timeZone, epochMs)})`;
}

// W03: «Истекает через 6 ч» — whole hours rounded up. The tiles show only
// batches that have not expired, so the text never goes below one hour.
export function hoursLeftText(seconds: bigint): string {
  const hours = (seconds + 3599n) / 3600n;
  return `Истекает через ${String(hours < 1n ? 1n : hours)} ч`;
}

export interface TileRow {
  readonly key: string;
  readonly title: string;
  readonly detail: string;
  readonly badge: string | undefined;
}

export interface WarehouseTileView {
  readonly count: string;
  readonly note: string;
  readonly rows: readonly TileRow[];
  readonly more: string | undefined;
  readonly boundary: string;
  readonly stamp: string;
}

// Spec 9, window 24 h: batches of expiring-batches that expire within 24 h
// (plan ruling 5), in the order of the expiry page.
export function batchTile(
  batches: ExpiringBatches,
  products: ReadonlyMap<string, string>,
  timeZone: string,
): WarehouseTileView {
  const hours = windowHours['24h'];
  const rows = batchRows(batches, products, BigInt(hours * 3600));
  const rest = rows.length - SHOWN;
  const evaluated = batches.evaluatedAt.epochMs;
  return {
    count: batchesText(rows.length),
    note: 'с остатком и сроком до выбранной границы',
    rows: rows.slice(0, SHOWN).map((row) => ({
      key: row.batchID,
      title: row.product,
      detail: `${row.batchID} · остаток ${row.quantity}`,
      badge: hoursLeftText(BigInt(row.remainingSeconds)),
    })),
    more: rest > 0 ? `Ещё ${batchesText(rest)} в окне` : undefined,
    boundary: boundaryText(evaluated + hours * HOUR_MS, timeZone),
    stamp: tileStamp(evaluated, timeZone),
  };
}

// Spec 9, windows 3 and 7 days: products of analytics/stock whose stock
// expires before riskCutoff. The count covers the first page (500 products).
export function reportTile(
  report: Envelope<StockReport>,
  timeZone: string,
): WarehouseTileView {
  const rows = reportRows(report.result);
  const rest = rows.length - SHOWN;
  return {
    count: productsText(rows.length),
    note: 'с остатком, срок которого истекает до границы',
    rows: rows.slice(0, SHOWN).map((row) => ({
      key: row.productID,
      title: row.product,
      detail: `истекает ${row.expiring}`,
      badge: undefined,
    })),
    more: rest > 0 ? `Ещё ${productsText(rest)}` : undefined,
    boundary: boundaryText(report.result.riskCutoff.epochMs, timeZone),
    stamp: tileStamp(report.context.evaluatedAt.epochMs, timeZone),
  };
}

export interface Figure {
  readonly value: string;
  readonly label: string;
}

const figure = (
  count: number,
  one: string,
  few: string,
  many: string,
): Figure => ({ value: String(count), label: plural(count, one, few, many) });

// W03 «Справочники»: «24» «продукта» · «12» «блюд».
export function catalogFigures(
  products: Products,
  dishes: DishCatalog,
): readonly Figure[] {
  return [
    figure(products.items.length, 'продукт', 'продукта', 'продуктов'),
    figure(dishes.items.length, 'блюдо', 'блюда', 'блюд'),
  ];
}

const pendingItems = (pending: PendingBatches) =>
  pending.items.filter((item) => item.status === 'pending_writeoff');

// W03 «Под списание»: «2» «партии» · «2» «продукта».
export function writeoffFigures(pending: PendingBatches): readonly Figure[] {
  const items = pendingItems(pending);
  const products = new Set(items.map((item) => item.batch.productID)).size;
  return [
    figure(items.length, 'партия', 'партии', 'партий'),
    figure(products, 'продукт', 'продукта', 'продуктов'),
  ];
}

// W03 «Аналитика»: products with available stock, batches of the 48 h
// window, batches waiting for the write-off.
export function analyticsFigures(
  inventory: Inventory,
  expiring: ExpiringBatches,
  pending: PendingBatches,
): readonly Figure[] {
  const stocked = inventory.items.filter(
    (row) => BigInt(row.availableQuantity) > 0n,
  ).length;
  return [
    figure(
      stocked,
      'продукт с запасом',
      'продукта с запасом',
      'продуктов с запасом',
    ),
    figure(
      expiring.items.length,
      'ближайшая партия',
      'ближайшие партии',
      'ближайших партий',
    ),
    { value: String(pendingItems(pending).length), label: 'под списание' },
  ];
}

export interface StopTileView {
  readonly unavailable: string;
  readonly dishes: readonly {
    readonly dishID: string;
    readonly name: string;
    readonly reasons: readonly string[];
  }[];
}

// W03 «Стоп-лист»: «2 блюда недоступны» and the first dishes with their
// deficits.
export function stopTile(
  stopList: StopList,
  products: ReadonlyMap<string, Product>,
): StopTileView {
  const count = stopList.dishes.length;
  return {
    unavailable:
      count === 0
        ? 'Стоп-лист пуст'
        : `${counted(count, 'блюдо', 'блюда', 'блюд')} ${plural(count, 'недоступно', 'недоступны', 'недоступны')}`,
    dishes: stopList.dishes.slice(0, SHOWN).map((dish) => ({
      dishID: dish.dishID,
      name: dish.name,
      reasons: dish.deficits.map(
        (deficit) => `Не хватает на порцию: ${deficitText(deficit, products)}`,
      ),
    })),
  };
}

export interface RecommendationTileView {
  readonly title: string;
  readonly note: string;
  readonly reasons: readonly TileRow[];
}

const reasonsLead = (count: number) =>
  count === 1 ? 'Причина:' : count === 2 ? 'Обе причины:' : 'Причины:';

// W03 «Рекомендуем продать»: the first dish of the ranking with every reason.
export function recommendationTile(
  recommendations: Recommendations,
  timeZone: string,
): RecommendationTileView | undefined {
  const first = recommendations.items[0];
  if (first === undefined) return undefined;
  const evaluated = recommendations.evaluatedAt.epochMs;
  const nearest = first.priorityExpiresAt.epochMs;
  return {
    title: `1. ${first.dishName}`,
    note: `Ближайший срок партий одной порции — ${formatInstant(nearest, timeZone, 'date')}, ${formatInstant(nearest, timeZone, 'time')}. ${reasonsLead(first.reasons.length)}`,
    reasons: first.reasons.map((reason) => ({
      key: `${reason.productID} ${reason.batchID}`,
      title: `${reason.productName} · партия ${reason.batchID}`,
      detail: `${formatQuantity(reason.quantityPerPortion, reason.baseUnit)} на порцию`,
      badge: hoursLeftText(
        BigInt(Math.ceil((reason.expiresAt.epochMs - evaluated) / 1000)),
      ),
    })),
  };
}

// Overview 43:1829: an order attempt whose outcome the tab still holds.
export function attemptOpen(phase: OrderPhase): boolean {
  return (
    phase.kind === 'unknown' ||
    phase.kind === 'pending' ||
    phase.kind === 'conflict'
  );
}
