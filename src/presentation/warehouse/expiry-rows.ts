import { failureOf, type Instant } from '@/application/api';
import type { ExpiringBatches, StockReport } from '@/application/warehouse';
import { formatQuantity } from '@/domain/quantity';
import { plural } from '@/presentation/ui/plural';
import { matchesQuery } from '@/presentation/ui/search';
import { formatInstant } from '@/presentation/ui/time';
import { zoneLabel } from '@/presentation/ui/zones';

export type ExpiryWindow = '24h' | '3d' | '7d' | 'custom';

export const windowHours: Readonly<Record<'24h' | '3d' | '7d', number>> = {
  '24h': 24,
  '3d': 72,
  '7d': 168,
};

// riskHours of analytics/stock: a leap year of hours at most.
export const maxRiskHours = 8784;
const hourMs = 3_600_000;

const windows: readonly ExpiryWindow[] = ['24h', '3d', '7d', 'custom'];

// ?window= of the address. Without analytics.read only «24 ч» exists.
export function windowOf(
  param: string | null,
  analytics: boolean,
): ExpiryWindow {
  const found = windows.find((item) => item === param);
  return found === undefined || !analytics ? '24h' : found;
}

// ?hours= of «Своя граница»: whole hours 1…8784, otherwise 24 hours.
export function customHoursOf(param: string | null): number {
  if (param === null || !/^\d{1,4}$/.test(param)) return windowHours['24h'];
  const hours = Number(param);
  return hours >= 1 && hours <= maxRiskHours ? hours : windowHours['24h'];
}

// Spec 6.1: the server counts the boundary in whole hours from its
// evaluatedAt, so the hours are rounded up and the shown boundary is the
// nearest one not earlier than the entered one.
export function customRiskHours(
  boundaryEpochMs: number,
  evaluatedAtMs: number,
): number | 'out-of-range' {
  const hours = Math.ceil((boundaryEpochMs - evaluatedAtMs) / hourMs);
  return hours >= 1 && hours <= maxRiskHours ? hours : 'out-of-range';
}

export const boundaryError =
  'Укажите границу позже текущего времени и не дальше чем через год.';

const civilPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

// The offset of the zone at a moment, in milliseconds.
function offsetMs(epochMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(epochMs);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value ?? '0');
  const local = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return local - Math.floor(epochMs / 1000) * 1000;
}

// The value of a datetime-local field, 'YYYY-MM-DDTHH:MM', read in the zone
// of the organization; undefined for anything else.
export function zonedEpochMs(
  localDateTime: string,
  timeZone: string,
): number | undefined {
  const match = civilPattern.exec(localDateTime);
  if (match === null) return undefined;
  const [, year, month, day, hour, minute, second = '0'] = match;
  const naive = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  const guess = naive - offsetMs(naive, timeZone);
  return naive - offsetMs(guess, timeZone);
}

// «через 5 ч 08 мин», under an hour «через 08 мин»; minutes round up, so
// the badge never shows less time than is left.
export function remainingText(seconds: string): string {
  const minutes = (BigInt(seconds) + 59n) / 60n;
  const hours = minutes / 60n;
  const rest = String(minutes % 60n).padStart(2, '0');
  return hours === 0n
    ? `через ${rest} мин`
    : `через ${String(hours)} ч ${rest} мин`;
}

export function boundaryText(epochMs: number, timeZone: string): string {
  return `Граница: ${formatInstant(epochMs, timeZone, 'dateTime')} (${zoneLabel(timeZone, epochMs)})`;
}

export function batchCountText(count: number): string {
  return `${String(count)} ${plural(count, 'партия', 'партии', 'партий')} с остатком и сроком до границы`;
}

export function productCountText(count: number): string {
  return `${String(count)} ${plural(count, 'продукт', 'продукта', 'продуктов')} с остатком, срок которого истекает до границы`;
}

export interface BatchRowView {
  readonly batchID: string;
  readonly productID: string;
  // The catalog name; a product missing from the catalog shows its code.
  readonly product: string;
  readonly quantity: string;
  readonly remainingSeconds: string;
  readonly remaining: string;
  readonly expiresAt: Instant;
}

// S3, window 24 h: the batches of expiring-batches (48 h) up to maxSeconds,
// by expiry, then by batch number.
export function batchRows(
  batches: ExpiringBatches,
  products: ReadonlyMap<string, string>,
  maxSeconds: bigint,
): readonly BatchRowView[] {
  return batches.items
    .filter((batch) => BigInt(batch.remainingSeconds) <= maxSeconds)
    .sort(
      (left, right) =>
        left.expiresAt.epochMs - right.expiresAt.epochMs ||
        left.batchID.localeCompare(right.batchID, 'ru', { numeric: true }),
    )
    .map((batch) => ({
      batchID: batch.batchID,
      productID: batch.productID,
      product: products.get(batch.productID) ?? batch.productID,
      quantity: formatQuantity(batch.remainingQuantity, batch.baseUnit),
      remainingSeconds: batch.remainingSeconds,
      remaining: remainingText(batch.remainingSeconds),
      expiresAt: batch.expiresAt,
    }));
}

export interface ReportRowView {
  readonly productID: string;
  readonly product: string;
  readonly expiring: string;
  readonly available: string;
}

// Windows 3 d, 7 d and «Своя граница»: products with a quantity expiring
// before riskCutoff, by name.
export function reportRows(
  report: StockReport,
  query = '',
): readonly ReportRowView[] {
  return report.items
    .filter(
      (row) =>
        BigInt(row.expiringQuantity) > 0n && matchesQuery(query, row.name),
    )
    .map((row) => ({
      productID: row.productID,
      product: row.name,
      expiring: formatQuantity(row.expiringQuantity, row.baseUnit),
      available: formatQuantity(row.availableQuantity, row.baseUnit),
    }))
    .sort((left, right) => left.product.localeCompare(right.product, 'ru'));
}

// The first page with the products of the pages read by «Показать ещё»; a
// product repeated after a re-read of the first page is kept once.
export function mergePages(
  first: StockReport,
  pages: readonly StockReport[],
): StockReport {
  const seen = new Set<string>();
  const items = [first, ...pages]
    .flatMap((page) => page.items)
    .filter((row) => {
      if (seen.has(row.productID)) return false;
      seen.add(row.productID);
      return true;
    });
  return { ...first, items };
}

// A cursor older than five minutes: the first page is read again.
export function isCursorExpired(failure: unknown): boolean {
  return failureOf(failure)?.code === 'RefreshRequired';
}

export type SettingsRetry = 'none' | 'due' | 'waiting' | 'failed';

// Spec 6.1 «Смена настроек»: SettingsChanged re-reads access and repeats the
// report once; a SettingsChanged of that repeat is a read error. retried
// holds loadedAt of the read when the repeat was sent, so a later success
// allows the next repeat.
export function settingsRetry(
  read: {
    readonly failed: boolean;
    readonly loading: boolean;
    readonly loadedAt: number | undefined;
    readonly failure: unknown;
  },
  retried: { readonly loadedAt: number | undefined } | undefined,
): SettingsRetry {
  if (!read.failed || failureOf(read.failure)?.code !== 'SettingsChanged')
    return 'none';
  if (retried === undefined || retried.loadedAt !== read.loadedAt) return 'due';
  return read.loading ? 'waiting' : 'failed';
}
