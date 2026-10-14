import type { Product } from '@/application/restaurant';
import type { PendingBatches } from '@/application/warehouse';
import type { WriteoffOutcome } from '@/application/writeoff-commands';
import { formatQuantity, formatThousandths } from '@/domain/quantity';
import { formatInstant } from '@/presentation/ui/time';

export interface WriteoffMessage {
  readonly tone: 'success' | 'error' | 'unknown' | 'info';
  readonly title: string;
  readonly text: string | undefined;
}

export interface PendingRowView {
  readonly batchID: string;
  readonly productID: string;
  // The catalog name; a product missing from the catalog shows its code.
  readonly product: string;
  readonly quantity: string;
  readonly expired: string;
}

// Spec 6.2: batches in pending_writeoff only, the oldest expiry first. A
// batch carries no unit: it comes from the catalog, else the bare number.
export function pendingRows(
  pending: PendingBatches,
  products: ReadonlyMap<string, Product>,
  timeZone: string,
): readonly PendingRowView[] {
  return pending.items
    .filter((item) => item.status === 'pending_writeoff')
    .map((item) => item.batch)
    .sort(
      (left, right) =>
        left.expiresAt.epochMs - right.expiresAt.epochMs ||
        left.batchID.localeCompare(right.batchID, 'ru', { numeric: true }),
    )
    .map((batch) => {
      const product = products.get(batch.productID);
      return {
        batchID: batch.batchID,
        productID: batch.productID,
        product: product?.name ?? batch.productID,
        quantity:
          product === undefined
            ? formatThousandths(batch.remainingQuantity)
            : formatQuantity(batch.remainingQuantity, product.baseUnit),
        expired: `срок истёк ${formatInstant(batch.expiresAt.epochMs, timeZone, 'dateTime')}`,
      };
    });
}

export function pendingTitle(count: number | undefined): string {
  return `Ожидают списания · ${count === undefined ? '…' : String(count)}`;
}

export function dialogTitle(batchID: string): string {
  return `Списать партию ${batchID}?`;
}

export function dialogText(row: PendingRowView): string {
  return `${row.product} · остаток ${row.quantity}. Склад спишет фактический остаток партии на момент подтверждения. Отменить списание нельзя.`;
}

// In the dialog after a lost answer; the check never writes off twice.
export const unknownMessage: WriteoffMessage = {
  tone: 'unknown',
  title: 'Результат списания неизвестен',
  text: 'Ответ склада не получен. Списание могло пройти. Проверьте результат: проверка не спишет партию дважды.',
};

// Spec 6.3. RuntimeReset is told by the common «Данные обновились» notice
// and an ended session by the session check, so both have no text here.
export function writeoffMessage(
  outcome: WriteoffOutcome,
  batchID: string,
  timeZone: string,
): WriteoffMessage | undefined {
  switch (outcome.kind) {
    case 'written-off': {
      const { result } = outcome;
      return {
        tone: 'success',
        title: `Партия ${batchID} списана: ${formatQuantity(result.writtenOffQuantity, result.baseUnit)}, ${formatInstant(result.confirmedAt.epochMs, timeZone, 'dateTime')}.`,
        text: undefined,
      };
    }
    case 'unknown':
      return unknownMessage;
    case 'already':
      return {
        tone: 'info',
        title: 'Партия уже списана',
        text: 'Списание этой партии уже записано. Список обновлён.',
      };
    case 'not-pending':
      return {
        tone: 'error',
        title: 'Партию пока нельзя списать',
        text: 'По данным склада срок годности партии ещё не истёк. Список обновлён.',
      };
    case 'not-found':
      return {
        tone: 'error',
        title: 'Партия не найдена',
        text: 'Список обновлён.',
      };
    case 'refused':
      return {
        tone: 'error',
        title: 'Списание не выполнено',
        text: 'Склад отклонил запрос: ничего не записано. Повторите позже.',
      };
    case 'check-failed':
      return {
        tone: 'error',
        title: 'Проверка не удалась',
        text: 'Не удалось проверить. Повторите позже.',
      };
    case 'reset':
    case 'ended':
      return undefined;
  }
}

// An unknown outcome and a failed check stay in the dialog with «Проверить
// результат»; every other outcome closes it.
export function keepsDialog(outcome: WriteoffOutcome): boolean {
  return outcome.kind === 'unknown' || outcome.kind === 'check-failed';
}
