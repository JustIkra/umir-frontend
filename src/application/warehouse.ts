import type { BaseUnit } from '@/domain/quantity';
import type { Envelope, Instant, Settings } from './api';
import type { HistoryCoverage, PlanningCapture } from './planning';
import type { LoadOptions } from './read-model';
import type { Order } from './restaurant';

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
export interface ShelfLife {
  readonly value: string;
  readonly unit: 'day' | 'month';
}
export interface BatchFact {
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
export interface Batch extends BatchFact {
  readonly appliedSettings: Settings;
  readonly tzdataVersion: string;
}
export interface ProductBatch {
  readonly batch: Batch;
  readonly baseUnit: BaseUnit;
  readonly status: 'available' | 'pending_writeoff';
}
export interface ProductBatches {
  readonly productID: string;
  readonly evaluatedAt: Instant;
  readonly page: CapturePage;
  readonly items: readonly ProductBatch[];
}
// The identity of one captured report page: every page of the report repeats
// it, so a change between pages means a broken answer.
export interface CapturePage {
  readonly tenantID: string;
  readonly epoch: string;
  readonly stateVersion: string;
  readonly prefixSequence: string;
  readonly filterFingerprint: string;
  readonly settings: Settings;
}
export interface MovementRow {
  readonly productID: string;
  readonly name: string;
  readonly baseUnit: BaseUnit;
  readonly receivedQuantity: string;
  readonly orderedQuantity: string;
  readonly writtenOffQuantity: string;
}
export interface MovementReport {
  readonly from: Instant;
  readonly to: Instant;
  readonly coverage: HistoryCoverage;
  readonly items: readonly MovementRow[];
}
// Civil dates in the restaurant's zone, both included.
export interface AnalyticsPeriod {
  readonly fromDate: string;
  readonly throughDate: string;
}
export interface PendingBatch {
  readonly batch: Batch;
  readonly status: 'pending_writeoff';
  readonly appliedSettings: Settings;
}
export interface PendingBatches {
  readonly items: readonly PendingBatch[];
}
export interface ExpiringBatch {
  readonly batchID: string;
  readonly productID: string;
  readonly remainingQuantity: string;
  readonly baseUnit: BaseUnit;
  readonly expiresAt: Instant;
  readonly remainingSeconds: string;
  readonly isExpired: boolean;
}
export interface ExpiringBatches {
  readonly evaluatedAt: Instant;
  readonly stateVersion: string;
  readonly items: readonly ExpiringBatch[];
}
export interface SupplyRow {
  readonly productID: string;
  readonly productName: string;
  readonly baseUnit: BaseUnit;
  readonly availableQuantity: string;
  readonly consumedQuantity: string;
  readonly averageDailyBaseUnits: string;
  readonly coverageDays: string | null;
  readonly onePortionDeficit: string;
  readonly suggestedQuantity: string;
  readonly blockedDishIDs: readonly string[];
  readonly reasons: readonly ('low_coverage' | 'stop_list_deficit')[];
}
export interface SupplySuggestions extends PlanningCapture {
  readonly policy: {
    readonly version: 'FIN1';
    readonly historyDays: 7;
    readonly coverageThresholdDays: 3;
    readonly targetDays: 7;
  };
  readonly items: readonly SupplyRow[];
}
export interface HistoryRecord {
  readonly tenantID: string;
  readonly runtimeEpoch: string;
  readonly sequence: string;
  readonly eventID: string;
  readonly recordedAt: Instant;
  readonly fact:
    | { readonly kind: 'product' | 'dish'; readonly name: string }
    | {
        readonly kind: 'receipt';
        readonly deliveryID: string;
        readonly number: string;
        readonly batches: readonly BatchFact[];
      }
    | { readonly kind: 'sale'; readonly order: Order }
    | {
        readonly kind: 'pending' | 'writeoff';
        readonly batchID: string;
        readonly productID: string;
        readonly quantity: string;
        readonly baseUnit: BaseUnit | undefined;
      };
}
export interface History {
  readonly events: readonly HistoryRecord[];
}
export interface WarehouseReads {
  inventory(
    restaurantID: string,
    options: LoadOptions,
  ): Promise<Envelope<Inventory>>;
  productBatches(
    restaurantID: string,
    productID: string,
    options: LoadOptions,
  ): Promise<Envelope<ProductBatches>>;
  pendingWriteoffs(
    restaurantID: string,
    options: LoadOptions,
  ): Promise<Envelope<PendingBatches>>;
  expiringBatches(
    restaurantID: string,
    options: LoadOptions,
  ): Promise<Envelope<ExpiringBatches>>;
  history(
    restaurantID: string,
    options: LoadOptions,
  ): Promise<Envelope<History>>;
  supplySuggestions(
    restaurantID: string,
    options: LoadOptions,
  ): Promise<Envelope<SupplySuggestions>>;
  movementReport(
    restaurantID: string,
    period: AnalyticsPeriod,
    options: LoadOptions,
  ): Promise<Envelope<MovementReport>>;
}
export interface CivilTime {
  readonly civil: { readonly localDateTime: string };
}
export interface DeliveryInput {
  readonly deliveryID: string;
  readonly number: string;
  readonly createdAt: CivilTime;
  readonly expectedSettingsVersion: string;
  readonly lines: readonly {
    readonly productID: string;
    readonly quantity: string;
    readonly manufacturedAt: CivilTime;
    readonly receivedAt: CivilTime;
    readonly shelfLife: ShelfLife;
  }[];
}
export interface DeliveryReceipt {
  readonly deliveryID: string;
  readonly batchIDs: readonly string[];
  readonly batches: readonly Batch[];
}
export interface WriteoffResult {
  readonly batchID: string;
  readonly productID: string;
  readonly writtenOffQuantity: string;
  readonly baseUnit: BaseUnit;
  readonly actorUserID: string;
  readonly confirmedAt: Instant;
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
}
