import type { DeliveryDraft } from '@/domain/delivery-draft';
import type { BaseUnit } from '@/domain/quantity';
import type { Envelope, Instant } from './api';
import type { LoadOptions } from './read-model';

// Quantities are decimal strings of thousandths of the base unit; counters
// and sequences are int64 strings.
export interface StockRow {
  readonly productID: string;
  readonly name: string;
  readonly baseUnit: BaseUnit;
  readonly availableQuantity: string;
  readonly pendingWriteoffQuantity: string;
  readonly onHandQuantity: string;
  readonly expiringQuantity: string;
}
export interface Inventory {
  readonly items: readonly StockRow[];
}
export interface ExpiringBatch {
  readonly batchID: string;
  readonly productID: string;
  readonly remainingQuantity: string;
  readonly baseUnit: BaseUnit;
  readonly expiresAt: Instant;
  readonly remainingSeconds: string;
}
export interface ExpiringBatches {
  readonly evaluatedAt: Instant;
  readonly stateVersion: string;
  readonly items: readonly ExpiringBatch[];
}
export interface StockReport {
  readonly riskHours: number;
  readonly riskCutoff: Instant;
  readonly items: readonly StockRow[];
  // Absent on the last page.
  readonly nextCursor: string | undefined;
}
export interface ShelfLife {
  readonly value: string;
  readonly unit: 'day' | 'month';
}
export interface BatchV2 {
  readonly batchID: string;
  readonly deliveryID: string;
  readonly lineNo: string;
  readonly productID: string;
  readonly manufacturedAt: Instant;
  readonly shelfLife: ShelfLife;
  readonly receivedAt: Instant;
  readonly expiresAt: Instant;
  readonly receivedQuantity: string;
  readonly remainingQuantity: string;
}
export type BatchState = 'available' | 'pending_writeoff' | 'written_off';
export interface BatchStatus {
  readonly batch: BatchV2;
  readonly status: BatchState;
}
export interface PendingBatches {
  readonly items: readonly BatchStatus[];
}
export interface WriteoffResult {
  readonly batchID: string;
  readonly productID: string;
  readonly writtenOffQuantity: string;
  readonly baseUnit: BaseUnit;
  readonly actorUserID: string;
  readonly confirmedAt: Instant;
  readonly eventID: string;
}
// GET writeoffs/commands. pending and unseen prove nothing; only rejected
// proves that nothing was written.
export type WriteoffObservation =
  | { readonly state: 'committed'; readonly result: WriteoffResult }
  | { readonly state: 'pending' }
  | { readonly state: 'unseen' }
  | { readonly state: 'rejected'; readonly code: string };
// civil: local time in the organization zone, 'YYYY-MM-DDTHH:MM:SS' (the
// adapter adds ':00' to 'YYYY-MM-DDTHH:MM'); occurrence answers DS01.
export type TimeInput =
  | {
      readonly civil: {
        readonly localDateTime: string;
        readonly occurrence?: 'earlier' | 'later';
      };
    }
  | { readonly instant: string };
export interface DeliveryLineInput {
  readonly productID: string;
  readonly manufacturedAt: TimeInput;
  readonly shelfLife: ShelfLife;
  readonly receivedAt: TimeInput;
  readonly quantity: string;
}
export interface DeliveryInput {
  readonly deliveryID: string;
  readonly number: string;
  readonly createdAt: TimeInput;
  readonly expectedSettingsVersion: string;
  readonly lines: readonly DeliveryLineInput[];
}
export interface DeliveryReceipt {
  readonly deliveryID: string;
  readonly batches: readonly BatchV2[];
}
// Journal events as the history screen needs them. DeliveryReceived covers
// schemas 1 and 2; BatchExpired (schema 1) carries no base unit.
export type HistoryEvent =
  | {
      readonly type: 'ProductRegistered';
      readonly sequence: string;
      readonly recordedAt: Instant;
    }
  | {
      readonly type: 'DishDefined';
      readonly sequence: string;
      readonly recordedAt: Instant;
    }
  | {
      readonly type: 'DeliveryReceived';
      readonly sequence: string;
      readonly recordedAt: Instant;
      readonly number: string;
      readonly lines: number;
      readonly batches: number;
    }
  | {
      readonly type: 'OrderPlaced';
      readonly sequence: string;
      readonly recordedAt: Instant;
      readonly orderID: string;
      readonly positions: number;
    }
  | {
      readonly type:
        'BatchExpired' | 'BatchExpiryPending' | 'BatchWriteoffConfirmed';
      readonly sequence: string;
      readonly recordedAt: Instant;
      readonly batchID: string;
      readonly productID: string;
      readonly quantity: string;
      readonly baseUnit: BaseUnit | undefined;
    };
// Ascending by sequence, as the warehouse returns them.
export interface History {
  readonly events: readonly HistoryEvent[];
}

// Reads of one restaurant's warehouse. Each rejects with ApiError.
export interface WarehouseReads {
  inventory(
    restaurantID: string,
    options: LoadOptions,
  ): Promise<Envelope<Inventory>>;
  expiringBatches(
    restaurantID: string,
    options: LoadOptions,
  ): Promise<Envelope<ExpiringBatches>>;
  pendingWriteoffs(
    restaurantID: string,
    options: LoadOptions,
  ): Promise<Envelope<PendingBatches>>;
  stockReport(
    restaurantID: string,
    query: {
      readonly riskHours: number;
      readonly settingsVersion: string;
      readonly cursor: string | undefined;
    },
    options: LoadOptions,
  ): Promise<Envelope<StockReport>>;
  // Up to 500 events after fromSequence (exclusive).
  history(
    restaurantID: string,
    fromSequence: string,
    options: LoadOptions,
  ): Promise<Envelope<History>>;
}
export interface WarehouseApi {
  receiveDelivery(
    restaurantID: string,
    input: DeliveryInput,
    commandID: string,
    epoch: string,
  ): Promise<Envelope<DeliveryReceipt>>;
  confirmWriteoff(
    restaurantID: string,
    batchID: string,
    commandID: string,
    epoch: string,
  ): Promise<Envelope<WriteoffResult>>;
  // A passive read: never writes, never repeats the command. A lost answer is
  // unavailable; another epoch is RuntimeReset.
  lookupWriteoff(
    restaurantID: string,
    attempt: {
      readonly commandID: string;
      readonly batchID: string;
      readonly epoch: string;
    },
  ): Promise<WriteoffObservation>;
}

// A delivery whose outcome is not settled yet; kept in the tab.
export interface StoredDeliveryAttempt {
  readonly commandID: string;
  readonly epoch: string;
  readonly startedAt: number;
  readonly input: DeliveryInput;
}
export interface StoredDelivery {
  readonly userID: string;
  readonly restaurantID: string;
  readonly draft: DeliveryDraft;
  readonly deliveryID: string | undefined;
  readonly attempt: StoredDeliveryAttempt | undefined;
}
export interface DeliveryStorage {
  load(userID: string, restaurantID: string): StoredDelivery | undefined;
  save(record: StoredDelivery): void;
  clear(userID: string, restaurantID: string): void;
  // Another user signed in or the user signed out.
  clearAll(): void;
}
