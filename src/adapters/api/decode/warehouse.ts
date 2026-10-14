import type {
  BatchState,
  BatchStatus,
  BatchV2,
  DeliveryReceipt,
  ExpiringBatch,
  ExpiringBatches,
  History,
  HistoryEvent,
  Inventory,
  PendingBatches,
  ShelfLife,
  StockReport,
  StockRow,
  WriteoffObservation,
  WriteoffResult,
} from '@/application/warehouse';
import { baseUnits } from '@/domain/quantity';
import {
  DecodeError,
  array,
  entityId,
  instant,
  nonEmptyString,
  nonNegativeInt64,
  object,
  oneOf,
  positiveInt64,
  string,
} from './common';

const id = nonEmptyString;

const shelfLifeUnits = ['day', 'month'] as const;
const batchStates: readonly BatchState[] = [
  'available',
  'pending_writeoff',
  'written_off',
];
const observationStates = [
  'committed',
  'pending',
  'unseen',
  'rejected',
] as const;

// riskHours travels as a JSON number, unlike int64 strings.
function integer(
  value: unknown,
  path: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new DecodeError(
      path,
      `not an integer from ${String(min)} to ${String(max)}`,
    );
  }
  return value;
}

function decodeStockRow(value: unknown, path: string): StockRow {
  const row = object(value, path);
  return {
    productID: id(row.productID, `${path}.productID`),
    name: string(row.name, `${path}.name`),
    baseUnit: oneOf(row.baseUnit, `${path}.baseUnit`, baseUnits),
    availableQuantity: nonNegativeInt64(
      row.availableQuantity,
      `${path}.availableQuantity`,
    ),
    pendingWriteoffQuantity: nonNegativeInt64(
      row.pendingWriteoffQuantity,
      `${path}.pendingWriteoffQuantity`,
    ),
    onHandQuantity: nonNegativeInt64(
      row.onHandQuantity,
      `${path}.onHandQuantity`,
    ),
    expiringQuantity: nonNegativeInt64(
      row.expiringQuantity,
      `${path}.expiringQuantity`,
    ),
  };
}

export function decodeInventory(value: unknown, path: string): Inventory {
  const inventory = object(value, path);
  return { items: array(inventory.items, `${path}.items`, decodeStockRow) };
}

function decodeExpiringBatch(value: unknown, path: string): ExpiringBatch {
  const batch = object(value, path);
  return {
    batchID: id(batch.batchID, `${path}.batchID`),
    productID: id(batch.productID, `${path}.productID`),
    remainingQuantity: positiveInt64(
      batch.remainingQuantity,
      `${path}.remainingQuantity`,
    ),
    baseUnit: oneOf(batch.baseUnit, `${path}.baseUnit`, baseUnits),
    expiresAt: instant(batch.expiresAt, `${path}.expiresAt`),
    remainingSeconds: nonNegativeInt64(
      batch.remainingSeconds,
      `${path}.remainingSeconds`,
    ),
  };
}

export function decodeExpiringBatches(
  value: unknown,
  path: string,
): ExpiringBatches {
  const batches = object(value, path);
  return {
    evaluatedAt: instant(batches.evaluatedAt, `${path}.evaluatedAt`),
    stateVersion: nonNegativeInt64(
      batches.stateVersion,
      `${path}.stateVersion`,
    ),
    items: array(batches.items, `${path}.items`, decodeExpiringBatch),
  };
}

// The whole analytics/stock body: the report fields sit next to context, not
// under result. The caller decodes context.
export function decodeStockReport(value: unknown, path: string): StockReport {
  const report = object(value, path);
  return {
    riskHours: integer(report.riskHours, `${path}.riskHours`, 1, 8784),
    riskCutoff: instant(report.riskCutoff, `${path}.riskCutoff`),
    items: array(report.items, `${path}.items`, decodeStockRow),
    nextCursor:
      report.nextCursor === undefined
        ? undefined
        : nonEmptyString(report.nextCursor, `${path}.nextCursor`),
  };
}

function decodeShelfLife(value: unknown, path: string): ShelfLife {
  const shelfLife = object(value, path);
  return {
    value: positiveInt64(shelfLife.value, `${path}.value`),
    unit: oneOf(shelfLife.unit, `${path}.unit`, shelfLifeUnits),
  };
}

function decodeBatch(value: unknown, path: string): BatchV2 {
  const batch = object(value, path);
  return {
    batchID: id(batch.batchID, `${path}.batchID`),
    deliveryID: id(batch.deliveryID, `${path}.deliveryID`),
    lineNo: positiveInt64(batch.lineNo, `${path}.lineNo`),
    productID: id(batch.productID, `${path}.productID`),
    manufacturedAt: instant(batch.manufacturedAt, `${path}.manufacturedAt`),
    shelfLife: decodeShelfLife(batch.shelfLife, `${path}.shelfLife`),
    receivedAt: instant(batch.receivedAt, `${path}.receivedAt`),
    expiresAt: instant(batch.expiresAt, `${path}.expiresAt`),
    receivedQuantity: positiveInt64(
      batch.receivedQuantity,
      `${path}.receivedQuantity`,
    ),
    remainingQuantity: nonNegativeInt64(
      batch.remainingQuantity,
      `${path}.remainingQuantity`,
    ),
  };
}

function decodeBatchStatus(value: unknown, path: string): BatchStatus {
  const status = object(value, path);
  return {
    batch: decodeBatch(status.batch, `${path}.batch`),
    status: oneOf(status.status, `${path}.status`, batchStates),
  };
}

// The whole pending-writeoffs body: items sit next to context, not under
// result. The caller decodes context.
export function decodePendingBatches(
  value: unknown,
  path: string,
): PendingBatches {
  const pending = object(value, path);
  return { items: array(pending.items, `${path}.items`, decodeBatchStatus) };
}

export function decodeWriteoffResult(
  value: unknown,
  path: string,
): WriteoffResult {
  const result = object(value, path);
  return {
    batchID: id(result.batchID, `${path}.batchID`),
    productID: id(result.productID, `${path}.productID`),
    writtenOffQuantity: positiveInt64(
      result.writtenOffQuantity,
      `${path}.writtenOffQuantity`,
    ),
    baseUnit: oneOf(result.baseUnit, `${path}.baseUnit`, baseUnits),
    actorUserID: entityId(result.actorUserID, `${path}.actorUserID`),
    confirmedAt: instant(result.confirmedAt, `${path}.confirmedAt`),
    eventID: id(result.eventID, `${path}.eventID`),
  };
}

// The whole writeoffs/commands body (WriteoffCommandLookup). committed carries
// the original ScopedWriteoffResult; rejected carries the recorded refusal.
export function decodeWriteoffObservation(
  value: unknown,
  path: string,
): WriteoffObservation {
  const lookup = object(value, path);
  const at = `${path}.observation`;
  const observation = object(lookup.observation, at);
  const state = oneOf(observation.state, `${at}.state`, observationStates);
  switch (state) {
    case 'committed': {
      const scoped = object(observation.result, `${at}.result`);
      return {
        state,
        result: decodeWriteoffResult(scoped.result, `${at}.result.result`),
      };
    }
    case 'pending':
      return { state };
    case 'unseen':
      return { state };
    case 'rejected': {
      const error = object(observation.error, `${at}.error`);
      return { state, code: nonEmptyString(error.code, `${at}.error.code`) };
    }
  }
}

export function decodeDeliveryReceipt(
  value: unknown,
  path: string,
): DeliveryReceipt {
  const receipt = object(value, path);
  return {
    deliveryID: id(receipt.deliveryID, `${path}.deliveryID`),
    batches: array(receipt.batches, `${path}.batches`, decodeBatch),
  };
}

const eventTypes = [
  'ProductRegistered',
  'DishDefined',
  'DeliveryReceived',
  'OrderPlaced',
  'BatchExpired',
  'BatchExpiryPending',
  'BatchWriteoffConfirmed',
] as const;

// The eight event schemas of the contract. Another type or schema version is
// an event the app cannot show, and the whole read fails (spec 7).
const schemaVersions: Readonly<
  Record<(typeof eventTypes)[number], readonly number[]>
> = {
  ProductRegistered: [1],
  DishDefined: [1],
  DeliveryReceived: [1, 2],
  OrderPlaced: [1],
  BatchExpired: [1],
  BatchExpiryPending: [2],
  BatchWriteoffConfirmed: [2],
};

function decodeEvent(value: unknown, path: string): HistoryEvent {
  const event = object(value, path);
  const type = oneOf(event.type, `${path}.type`, eventTypes);
  const version = event.schemaVersion;
  if (typeof version !== 'number' || !schemaVersions[type].includes(version)) {
    throw new DecodeError(`${path}.schemaVersion`, `not a ${type} schema`);
  }
  const sequence = positiveInt64(event.sequence, `${path}.sequence`);
  const recordedAt = instant(event.recordedAt, `${path}.recordedAt`);
  const at = `${path}.payload`;
  const payload = object(event.payload, at);
  switch (type) {
    case 'ProductRegistered':
      return { type, sequence, recordedAt };
    case 'DishDefined':
      return { type, sequence, recordedAt };
    case 'DeliveryReceived': {
      // Schema 1 carries Batch, schema 2 BatchV2; the row needs only counts.
      const delivery = object(payload.delivery, `${at}.delivery`);
      return {
        type,
        sequence,
        recordedAt,
        number: nonEmptyString(delivery.number, `${at}.delivery.number`),
        lines: array(delivery.lines, `${at}.delivery.lines`, object).length,
        batches: array(payload.batches, `${at}.batches`, object).length,
      };
    }
    case 'OrderPlaced': {
      const order = object(payload.order, `${at}.order`);
      return {
        type,
        sequence,
        recordedAt,
        orderID: id(order.orderID, `${at}.order.orderID`),
        positions: array(
          order.acceptedPositions,
          `${at}.order.acceptedPositions`,
          object,
        ).length,
      };
    }
    case 'BatchExpired': {
      const expiry = object(payload.expiry, `${at}.expiry`);
      return {
        type,
        sequence,
        recordedAt,
        batchID: id(expiry.batchID, `${at}.expiry.batchID`),
        productID: id(expiry.productID, `${at}.expiry.productID`),
        quantity: positiveInt64(
          expiry.writtenOffQuantity,
          `${at}.expiry.writtenOffQuantity`,
        ),
        baseUnit: undefined,
      };
    }
    case 'BatchExpiryPending':
      return {
        type,
        sequence,
        recordedAt,
        batchID: id(payload.batchID, `${at}.batchID`),
        productID: id(payload.productID, `${at}.productID`),
        quantity: positiveInt64(
          payload.remainingQuantity,
          `${at}.remainingQuantity`,
        ),
        baseUnit: oneOf(payload.baseUnit, `${at}.baseUnit`, baseUnits),
      };
    case 'BatchWriteoffConfirmed': {
      const result = decodeWriteoffResult(payload, at);
      return {
        type,
        sequence,
        recordedAt,
        batchID: result.batchID,
        productID: result.productID,
        quantity: result.writtenOffQuantity,
        baseUnit: result.baseUnit,
      };
    }
  }
}

// History.events are JournalRecords {tenantID, runtimeEpoch, event}.
export function decodeHistory(value: unknown, path: string): History {
  const history = object(value, path);
  return {
    events: array(history.events, `${path}.events`, (record, at) =>
      decodeEvent(object(record, at).event, `${at}.event`),
    ),
  };
}
