// Calculations of the «Аналитика» charts over numbers the backend computed:
// order, shares and rounding only. Quantities are decimal strings of
// thousandths; shares are tenths of a percent rounded down.

export const chartLimit = 10;

export interface CoverageInput {
  readonly productID: string;
  readonly productName: string;
  readonly coverageDays: string | null;
  readonly blockedDishIDs: readonly string[];
}
export interface CoverageRow<T extends CoverageInput> {
  readonly item: T;
  readonly reason: 'blocking' | 'low';
  // Share of the 0…targetDays scale in percent; undefined without consumption.
  readonly fill: number | undefined;
}

export interface StockInput {
  readonly productID: string;
  readonly name: string;
  readonly availableQuantity: string;
  readonly pendingWriteoffQuantity: string;
  readonly onHandQuantity: string;
  readonly expiringQuantity: string;
}
export interface RiskRow<T extends StockInput> {
  readonly item: T;
  readonly onHand: bigint;
  // available − expiring: what will not spoil within the risk window.
  readonly safe: bigint;
  readonly expiring: bigint;
  readonly pending: bigint;
  readonly riskTenths: bigint;
}
export interface RiskChart<T extends StockInput> {
  readonly rows: readonly RiskRow<T>[];
  // Products in stock without risk, and products in stock at all.
  readonly calm: number;
  readonly stocked: number;
}

export interface MovementInput {
  readonly productID: string;
  readonly name: string;
  readonly orderedQuantity: string;
  readonly writtenOffQuantity: string;
}
export interface FlowRow<T extends MovementInput> {
  readonly item: T;
  readonly ordered: bigint;
  readonly writtenOff: bigint;
  readonly writtenOffTenths: bigint;
}

export interface AnalyticsWeek {
  readonly fromDate: string;
  readonly throughDate: string;
}

// «2.142857» → «2.1», «2.96» → «3», «1428.571429» → «1428.6»: half up.
export function roundTenth(value: string): string {
  const [whole = '0', fraction = ''] = value.split('.');
  const first = fraction.charAt(0);
  const tenths =
    BigInt(whole) * 10n +
    (first === '' ? 0n : BigInt(first)) +
    (fraction.charAt(1) >= '5' ? 1n : 0n);
  const head = (tenths / 10n).toString();
  const tail = tenths % 10n;
  return tail === 0n ? head : `${head}.${tail.toString()}`;
}

export function shareTenths(part: bigint, whole: bigint): bigint {
  return whole === 0n ? 0n : (part * 1000n) / whole;
}

// «64 %»; a share above zero but under one percent reads «<1 %».
export function percentText(tenths: bigint): string {
  if (tenths > 0n && tenths < 10n) return '<1\u00a0%';
  return `${(tenths / 10n).toString()}\u00a0%`;
}

// Widths of the parts of one bar in percent of their sum.
export function segmentShares(parts: readonly bigint[]): number[] {
  const total = parts.reduce((sum, part) => sum + part, 0n);
  return parts.map((part) =>
    total === 0n ? 0 : Number((part * 100_000n) / total) / 1000,
  );
}

function byName(
  a: { readonly name: string; readonly id: string },
  b: { readonly name: string; readonly id: string },
): number {
  const names = a.name.localeCompare(b.name, 'ru');
  if (names !== 0) return names;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// coverageDays is a six-place decimal: «2.142857» → 2142857 millionths.
const millionths = (value: string) => BigInt(value.replace('.', ''));

export function coverageRows<T extends CoverageInput>(
  items: readonly T[],
  targetDays: number,
): CoverageRow<T>[] {
  const scale = BigInt(targetDays) * 1_000_000n;
  return items
    .map((item) => ({
      item,
      days:
        item.coverageDays === null ? undefined : millionths(item.coverageDays),
    }))
    .sort((a, b) => {
      const blocked =
        b.item.blockedDishIDs.length - a.item.blockedDishIDs.length;
      if (blocked !== 0) return blocked;
      if (a.days !== b.days) {
        if (a.days === undefined) return 1;
        if (b.days === undefined) return -1;
        return a.days < b.days ? -1 : 1;
      }
      return byName(
        { name: a.item.productName, id: a.item.productID },
        { name: b.item.productName, id: b.item.productID },
      );
    })
    .map(({ item, days }): CoverageRow<T> => ({
      item,
      reason: item.blockedDishIDs.length > 0 ? 'blocking' : 'low',
      fill:
        days === undefined || scale === 0n
          ? undefined
          : Number(((days < scale ? days : scale) * 100_000n) / scale) / 1000,
    }));
}

export function riskChart<T extends StockInput>(
  items: readonly T[],
): RiskChart<T> {
  const rows: RiskRow<T>[] = [];
  let calm = 0;
  let stocked = 0;
  for (const item of items) {
    const onHand = BigInt(item.onHandQuantity);
    if (onHand === 0n) continue;
    stocked += 1;
    const expiring = BigInt(item.expiringQuantity);
    const pending = BigInt(item.pendingWriteoffQuantity);
    if (expiring + pending === 0n) {
      calm += 1;
      continue;
    }
    rows.push({
      item,
      onHand,
      safe: BigInt(item.availableQuantity) - expiring,
      expiring,
      pending,
      riskTenths: shareTenths(expiring + pending, onHand),
    });
  }
  rows.sort((a, b) => {
    // a/b compared exactly: (risk of a) × (stock of b) against the reverse.
    const left = (a.expiring + a.pending) * b.onHand;
    const right = (b.expiring + b.pending) * a.onHand;
    if (left !== right) return left > right ? -1 : 1;
    return byName(
      { name: a.item.name, id: a.item.productID },
      { name: b.item.name, id: b.item.productID },
    );
  });
  return { rows, calm, stocked };
}

export function flowRows<T extends MovementInput>(
  items: readonly T[],
): FlowRow<T>[] {
  return items
    .map((item) => {
      const ordered = BigInt(item.orderedQuantity);
      const writtenOff = BigInt(item.writtenOffQuantity);
      return {
        item,
        ordered,
        writtenOff,
        writtenOffTenths: shareTenths(writtenOff, ordered + writtenOff),
      };
    })
    .filter((row) => row.ordered + row.writtenOff > 0n)
    .sort((a, b) => {
      const left = a.writtenOff * (b.ordered + b.writtenOff);
      const right = b.writtenOff * (a.ordered + a.writtenOff);
      if (left !== right) return left > right ? -1 : 1;
      return byName(
        { name: a.item.name, id: a.item.productID },
        { name: b.item.name, id: b.item.productID },
      );
    });
}

// Day numbers since 1970-01-01 of a civil date and back, in integers only
// (H. Hinnant's algorithms): domain code has no Date.
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy =
    Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(days: number): readonly [number, number, number] {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe -
      Math.floor(doe / 1460) +
      Math.floor(doe / 36524) -
      Math.floor(doe / 146096)) /
      365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return [yoe + era * 400 + (month <= 2 ? 1 : 0), month, day];
}

const isoDate = ([year, month, day]: readonly [number, number, number]) =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

// The seven civil days that end today in the restaurant's zone.
export function analyticsWeek(nowMs: number, timeZone: string): AnalyticsWeek {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(nowMs);
  const part = (type: 'year' | 'month' | 'day') =>
    Number(parts.find((entry) => entry.type === type)?.value);
  const today = [part('year'), part('month'), part('day')] as const;
  return {
    fromDate: isoDate(civilFromDays(daysFromCivil(...today) - 6)),
    throughDate: isoDate(today),
  };
}

// The row an arrow key moves to; undefined for keys the chart leaves alone.
export function nextRow(
  index: number,
  key: string,
  count: number,
): number | undefined {
  if (count === 0) return undefined;
  switch (key) {
    case 'ArrowDown':
      return Math.min(index + 1, count - 1);
    case 'ArrowUp':
      return Math.max(index - 1, 0);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return undefined;
  }
}
