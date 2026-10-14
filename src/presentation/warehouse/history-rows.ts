import type { Product } from '@/application/restaurant';
import type { History, HistoryEvent } from '@/application/warehouse';
import { formatQuantity, formatThousandths } from '@/domain/quantity';
import { inSentence } from '@/presentation/orders/order-rows';
import { plural } from '@/presentation/ui/plural';
import { formatInstant } from '@/presentation/ui/time';
import { formatStamp } from '@/presentation/ui/zones';

export type HistoryFilter = 'all' | 'deliveries' | 'sales' | 'writeoffs';

export type HistoryKind =
  'sale' | 'receipt' | 'pending' | 'confirmed' | 'expired';

export interface HistoryRowView {
  readonly sequence: string;
  readonly kind: HistoryKind;
  readonly label: string;
  readonly text: string;
  // «10.10.2026, 12:40:03»; on 390 the time alone sits beside the badge.
  readonly at: string;
  readonly time: string;
}

const labels: Readonly<Record<HistoryKind, string>> = {
  sale: 'Продажа',
  receipt: 'Поступление',
  pending: 'Ожидает списания',
  confirmed: 'Списание подтверждено',
  expired: 'Списание просрочки',
};

const filters: Readonly<Record<HistoryFilter, readonly HistoryKind[]>> = {
  all: ['sale', 'receipt', 'pending', 'confirmed', 'expired'],
  deliveries: ['receipt'],
  sales: ['sale'],
  writeoffs: ['pending', 'confirmed', 'expired'],
};

const count = (value: number, one: string, few: string, many: string) =>
  `${String(value)} ${plural(value, one, few, many)}`;

// «Партия P-0133 · руккола · 150 г». BatchExpired carries no unit: it comes
// from the catalog; an unknown product shows its code and the bare number.
function batchText(
  event: Extract<HistoryEvent, { readonly batchID: string }>,
  products: ReadonlyMap<string, Product>,
): string {
  const product = products.get(event.productID);
  const name =
    product === undefined ? event.productID : inSentence(product.name);
  const unit = event.baseUnit ?? product?.baseUnit;
  const quantity =
    unit === undefined
      ? formatThousandths(event.quantity)
      : formatQuantity(event.quantity, unit);
  return `Партия ${event.batchID} · ${name} · ${quantity}`;
}

// Catalog events (ProductRegistered, DishDefined) have no row.
function rowOf(
  event: HistoryEvent,
  products: ReadonlyMap<string, Product>,
): { readonly kind: HistoryKind; readonly text: string } | undefined {
  switch (event.type) {
    case 'OrderPlaced':
      return {
        kind: 'sale',
        text: `Заказ ${event.orderID} · ${count(event.positions, 'позиция', 'позиции', 'позиций')}`,
      };
    case 'DeliveryReceived':
      return {
        kind: 'receipt',
        text: `Поставка № ${event.number} · ${count(event.lines, 'строка', 'строки', 'строк')}, ${count(event.batches, 'партия', 'партии', 'партий')}`,
      };
    case 'BatchExpiryPending':
      return { kind: 'pending', text: batchText(event, products) };
    case 'BatchWriteoffConfirmed':
      return { kind: 'confirmed', text: batchText(event, products) };
    case 'BatchExpired':
      return { kind: 'expired', text: batchText(event, products) };
    case 'ProductRegistered':
    case 'DishDefined':
      return undefined;
  }
}

// Figma H1: the journal from the newest event to the oldest, one filter at a
// time; the time of a row is recordedAt in the organization's zone.
export function historyRows(
  history: History,
  products: ReadonlyMap<string, Product>,
  filter: HistoryFilter,
  timeZone: string,
): readonly HistoryRowView[] {
  const shown = filters[filter];
  const rows: HistoryRowView[] = [];
  for (const event of history.events) {
    const row = rowOf(event, products);
    if (row === undefined || !shown.includes(row.kind)) continue;
    const epochMs = event.recordedAt.epochMs;
    const time = formatInstant(epochMs, timeZone, 'timeSeconds');
    rows.push({
      sequence: `#${event.sequence}`,
      kind: row.kind,
      label: labels[row.kind],
      text: row.text,
      at: `${formatInstant(epochMs, timeZone, 'date')}, ${time}`,
      time,
    });
  }
  return rows.reverse();
}

// «Последнее событие #1057 · 10.10.2026, 15:21:08 UTC+3»: the last event of
// the journal, catalog events included. An empty journal shows when it was
// read.
export function historyStamp(
  history: History,
  evaluatedAtMs: number,
  timeZone: string,
): string {
  const last = history.events.at(-1);
  return last === undefined
    ? `Оценка ${formatStamp(evaluatedAtMs, timeZone)}`
    : `Последнее событие #${last.sequence} · ${formatStamp(last.recordedAt.epochMs, timeZone)}`;
}

// UnknownEventSchema from the warehouse, or an event this client cannot
// decode (Malformed): the journal is not shown at all.
export function unreadableHistory(code: string): boolean {
  return code === 'UnknownEventSchema' || code === 'Malformed';
}
