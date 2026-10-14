import type { Inventory } from '@/application/warehouse';
import { formatQuantity } from '@/domain/quantity';
import { matchesQuery } from '@/presentation/ui/search';
import { formatStamp } from '@/presentation/ui/zones';

export type StockNote = 'Весь остаток ожидает списания' | 'Нет остатка';

export interface StockRowView {
  readonly productID: string;
  readonly name: string;
  readonly available: string;
  readonly pending: string;
  readonly onHand: string;
  readonly expiring: string;
  readonly note: StockNote | undefined;
}

// A zero row is a successful answer, not an error (S1, «Белые грибы»).
function noteOf(available: string, pending: string): StockNote | undefined {
  if (BigInt(available) > 0n) return undefined;
  return BigInt(pending) > 0n ? 'Весь остаток ожидает списания' : 'Нет остатка';
}

// S1: the columns of StockRow, alphabetical by name (the server orders by
// productID), searched by name.
export function stockRows(
  inventory: Inventory,
  query: string,
): readonly StockRowView[] {
  return inventory.items
    .filter((row) => matchesQuery(query, row.name))
    .map((row) => ({
      productID: row.productID,
      name: row.name,
      available: formatQuantity(row.availableQuantity, row.baseUnit),
      pending: formatQuantity(row.pendingWriteoffQuantity, row.baseUnit),
      onHand: formatQuantity(row.onHandQuantity, row.baseUnit),
      expiring: formatQuantity(row.expiringQuantity, row.baseUnit),
      note: noteOf(row.availableQuantity, row.pendingWriteoffQuantity),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'ru'));
}

export function stockStamp(epochMs: number, timeZone: string): string {
  return `Оценка ${formatStamp(epochMs, timeZone)}`;
}

export function noMatchText(query: string): string {
  return `Нет продуктов, в названии которых есть „${query.trim()}“.`;
}
