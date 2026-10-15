import type { Envelope, Settings } from '@/application/api';
import type {
  Batch,
  BatchFact,
  DeliveryReceipt,
  ExpiringBatches,
  History,
  HistoryRecord,
  Inventory,
  PendingBatches,
  ProductBatch,
  ProductBatches,
  ShelfLife,
  WriteoffResult,
} from '@/application/warehouse';
import { baseUnits } from '@/domain/quantity';
import {
  array,
  boolean,
  closedObject,
  DecodeError,
  entityId,
  exactNumber,
  instant,
  instantNanos,
  nonEmptyString,
  nonNegativeInt64,
  object,
  oneOf,
  positiveInt64,
  string,
} from './common';
import { decodeContext } from './context';
import { decodeOrder } from './serving';

const batchKeys = [
  'batchID',
  'deliveryID',
  'lineNo',
  'productID',
  'manufacturedAt',
  'shelfLife',
  'receivedAt',
  'expiresAt',
  'receivedQuantity',
  'remainingQuantity',
];

export function decodeSettings(value: unknown, path: string): Settings {
  const v = closedObject(value, path, ['timeZone', 'settingsVersion']);
  return {
    timeZone: nonEmptyString(v.timeZone, `${path}.timeZone`),
    settingsVersion: positiveInt64(
      v.settingsVersion,
      `${path}.settingsVersion`,
    ),
  };
}

function shelfLife(value: unknown, path: string): ShelfLife {
  const v = closedObject(value, path, ['value', 'unit']);
  return {
    value: positiveInt64(v.value, `${path}.value`),
    unit: oneOf(v.unit, `${path}.unit`, ['day', 'month']),
  };
}

function batchFact(value: unknown, path: string, v2: boolean): BatchFact {
  const v = closedObject(value, path, [
    ...batchKeys,
    ...(v2 ? ['appliedSettings', 'tzdataVersion'] : []),
  ]);
  return {
    batchID: nonEmptyString(v.batchID, `${path}.batchID`),
    deliveryID: nonEmptyString(v.deliveryID, `${path}.deliveryID`),
    lineNo: positiveInt64(v.lineNo, `${path}.lineNo`),
    productID: nonEmptyString(v.productID, `${path}.productID`),
    manufacturedAt: instant(v.manufacturedAt, `${path}.manufacturedAt`),
    shelfLife: shelfLife(v.shelfLife, `${path}.shelfLife`),
    receivedAt: instant(v.receivedAt, `${path}.receivedAt`),
    expiresAt: instant(v.expiresAt, `${path}.expiresAt`),
    receivedQuantity: positiveInt64(
      v.receivedQuantity,
      `${path}.receivedQuantity`,
    ),
    remainingQuantity: nonNegativeInt64(
      v.remainingQuantity,
      `${path}.remainingQuantity`,
    ),
  };
}

export function decodeBatch(value: unknown, path: string): Batch {
  const v = closedObject(value, path, [
    ...batchKeys,
    'appliedSettings',
    'tzdataVersion',
  ]);
  return {
    ...batchFact(v, path, true),
    appliedSettings: decodeSettings(
      v.appliedSettings,
      `${path}.appliedSettings`,
    ),
    tzdataVersion: nonEmptyString(v.tzdataVersion, `${path}.tzdataVersion`),
  };
}

export function decodeWarehouseEnvelope<T>(
  body: unknown,
  decode: (value: unknown, path: string) => T,
): Envelope<T> {
  const v = closedObject(body, 'envelope', ['context', 'result']);
  const c = closedObject(v.context, 'context', [
    'orgID',
    'tenantID',
    'runtimeEpoch',
    'settings',
    'evaluatedAt',
    'stateVersion',
  ]);
  decodeSettings(c.settings, 'context.settings');
  return {
    context: decodeContext(c, 'context'),
    result: decode(v.result, 'result'),
  };
}

export function decodeInventory(value: unknown, path: string): Inventory {
  const v = closedObject(value, path, ['items']);
  const items = array(v.items, `${path}.items`, (value, path) => {
    const v = closedObject(value, path, [
      'productID',
      'name',
      'baseUnit',
      'availableQuantity',
      'pendingWriteoffQuantity',
      'onHandQuantity',
      'expiringQuantity',
    ]);
    const availableQuantity = nonNegativeInt64(
      v.availableQuantity,
      `${path}.availableQuantity`,
    );
    const pendingWriteoffQuantity = nonNegativeInt64(
      v.pendingWriteoffQuantity,
      `${path}.pendingWriteoffQuantity`,
    );
    const onHandQuantity = nonNegativeInt64(
      v.onHandQuantity,
      `${path}.onHandQuantity`,
    );
    const expiringQuantity = nonNegativeInt64(
      v.expiringQuantity,
      `${path}.expiringQuantity`,
    );
    if (
      BigInt(availableQuantity) + BigInt(pendingWriteoffQuantity) !==
        BigInt(onHandQuantity) ||
      BigInt(expiringQuantity) > BigInt(availableQuantity)
    )
      throw new DecodeError(path, 'inconsistent stock totals');
    return {
      productID: nonEmptyString(v.productID, `${path}.productID`),
      name: nonEmptyString(v.name, `${path}.name`),
      baseUnit: oneOf(v.baseUnit, `${path}.baseUnit`, baseUnits),
      availableQuantity,
      pendingWriteoffQuantity,
      onHandQuantity,
      expiringQuantity,
    };
  });
  if (new Set(items.map((v) => v.productID)).size !== items.length)
    throw new DecodeError(path, 'duplicate or oversized stock rows');
  return { items };
}

export interface BatchPage extends ProductBatches {
  readonly nextCursor: string | undefined;
}
export function decodeBatchPage(value: unknown, path: string): BatchPage {
  const v = closedObject(
    value,
    path,
    ['productID', 'evaluatedAt', 'page', 'items'],
    ['nextCursor'],
  );
  const page = closedObject(v.page, `${path}.page`, [
    'tenantID',
    'epoch',
    'stateVersion',
    'prefixSequence',
    'filterFingerprint',
    'settings',
  ]);
  const fingerprint = string(
    page.filterFingerprint,
    `${path}.page.filterFingerprint`,
  );
  if (!/^[a-f0-9]{64}$/.test(fingerprint))
    throw new DecodeError(path, 'invalid capture fingerprint');
  const items = array(v.items, `${path}.items`, (value, path): ProductBatch => {
    const v = closedObject(value, path, ['batch', 'baseUnit', 'status']);
    const batch = decodeBatch(v.batch, `${path}.batch`);
    positiveInt64(batch.remainingQuantity, `${path}.batch.remainingQuantity`);
    return {
      batch,
      baseUnit: oneOf(v.baseUnit, `${path}.baseUnit`, baseUnits),
      status: oneOf(v.status, `${path}.status`, [
        'available',
        'pending_writeoff',
      ]),
    };
  });
  if (items.length > 500) throw new DecodeError(path, 'oversized batch page');
  const nextCursor =
    v.nextCursor === undefined
      ? undefined
      : nonEmptyString(v.nextCursor, `${path}.nextCursor`);
  if (nextCursor !== undefined && nextCursor.length > 128)
    throw new DecodeError(path, 'invalid cursor');
  return {
    productID: nonEmptyString(v.productID, `${path}.productID`),
    evaluatedAt: instant(v.evaluatedAt, `${path}.evaluatedAt`),
    page: {
      tenantID: entityId(page.tenantID, `${path}.page.tenantID`),
      epoch: entityId(page.epoch, `${path}.page.epoch`),
      stateVersion: nonNegativeInt64(
        page.stateVersion,
        `${path}.page.stateVersion`,
      ),
      prefixSequence: nonNegativeInt64(
        page.prefixSequence,
        `${path}.page.prefixSequence`,
      ),
      filterFingerprint: fingerprint,
      settings: decodeSettings(page.settings, `${path}.page.settings`),
    },
    items,
    nextCursor,
  };
}

export function decodePending(body: unknown): Envelope<PendingBatches> {
  const v = closedObject(body, 'pending', ['context', 'items']);
  const context = decodeContext(
    closedObject(v.context, 'context', [
      'orgID',
      'tenantID',
      'runtimeEpoch',
      'settings',
      'evaluatedAt',
      'stateVersion',
    ]),
    'context',
  );
  const items = array(v.items, 'items', (value, path) => {
    const v = closedObject(value, path, ['batch', 'status', 'appliedSettings']);
    return {
      batch: decodeBatch(v.batch, `${path}.batch`),
      status: oneOf(v.status, `${path}.status`, ['pending_writeoff']),
      appliedSettings: decodeSettings(
        v.appliedSettings,
        `${path}.appliedSettings`,
      ),
    };
  });
  if (new Set(items.map((v) => v.batch.batchID)).size !== items.length)
    throw new DecodeError('pending', 'invalid pending list');
  return { context, result: { items } };
}

export function decodeExpiring(value: unknown, path: string): ExpiringBatches {
  const v = closedObject(value, path, ['evaluatedAt', 'stateVersion', 'items']);
  return {
    evaluatedAt: instant(v.evaluatedAt, `${path}.evaluatedAt`),
    stateVersion: nonNegativeInt64(v.stateVersion, `${path}.stateVersion`),
    items: array(v.items, `${path}.items`, (value, path) => {
      const v = closedObject(value, path, [
        'batchID',
        'productID',
        'remainingQuantity',
        'baseUnit',
        'expiresAt',
        'remainingSeconds',
        'isExpired',
      ]);
      return {
        batchID: nonEmptyString(v.batchID, `${path}.batchID`),
        productID: nonEmptyString(v.productID, `${path}.productID`),
        remainingQuantity: positiveInt64(
          v.remainingQuantity,
          `${path}.remainingQuantity`,
        ),
        baseUnit: oneOf(v.baseUnit, `${path}.baseUnit`, baseUnits),
        expiresAt: instant(v.expiresAt, `${path}.expiresAt`),
        remainingSeconds: nonNegativeInt64(
          v.remainingSeconds,
          `${path}.remainingSeconds`,
        ),
        isExpired: boolean(v.isExpired, `${path}.isExpired`),
      };
    }),
  };
}

export function decodeReceipt(value: unknown, path: string): DeliveryReceipt {
  const v = closedObject(value, path, ['deliveryID', 'batchIDs', 'batches']);
  return {
    deliveryID: nonEmptyString(v.deliveryID, `${path}.deliveryID`),
    batchIDs: array(v.batchIDs, `${path}.batchIDs`, nonEmptyString),
    batches: array(v.batches, `${path}.batches`, decodeBatch),
  };
}

export function decodeWriteoff(value: unknown, path: string): WriteoffResult {
  const v = closedObject(value, path, [
    'batchID',
    'productID',
    'writtenOffQuantity',
    'baseUnit',
    'actorUserID',
    'confirmedAt',
    'eventID',
  ]);
  nonEmptyString(v.eventID, `${path}.eventID`);
  return {
    batchID: nonEmptyString(v.batchID, `${path}.batchID`),
    productID: nonEmptyString(v.productID, `${path}.productID`),
    writtenOffQuantity: positiveInt64(
      v.writtenOffQuantity,
      `${path}.writtenOffQuantity`,
    ),
    baseUnit: oneOf(v.baseUnit, `${path}.baseUnit`, baseUnits),
    actorUserID: entityId(v.actorUserID, `${path}.actorUserID`),
    confirmedAt: instant(v.confirmedAt, `${path}.confirmedAt`),
  };
}

export function decodeHistory(value: unknown, path: string): History {
  const v = closedObject(value, path, ['events']);
  const events = array(
    v.events,
    `${path}.events`,
    (value, path): HistoryRecord => {
      const record = closedObject(value, path, [
        'tenantID',
        'runtimeEpoch',
        'event',
      ]);
      entityId(record.tenantID, `${path}.tenantID`);
      entityId(record.runtimeEpoch, `${path}.runtimeEpoch`);
      const peek = object(record.event, `${path}.event`);
      const type = oneOf(peek.type, path, [
        'ProductRegistered',
        'DishDefined',
        'DeliveryReceived',
        'OrderPlaced',
        'BatchExpiryPending',
        'BatchWriteoffConfirmed',
        'BatchExpired',
      ]);
      const scoped =
        type === 'BatchExpiryPending' || type === 'BatchWriteoffConfirmed';
      const e = closedObject(record.event, `${path}.event`, [
        'eventID',
        'streamID',
        'sequence',
        'schemaVersion',
        'commandID',
        'commandFingerprint',
        'recordedAt',
        'type',
        'payload',
        ...(scoped ? ['tenantID', 'runtimeEpoch'] : []),
      ]);
      oneOf(e.streamID, path, ['inventory']);
      nonEmptyString(e.commandID, path);
      if (!/^[a-f0-9]{64}$/.test(string(e.commandFingerprint, path)))
        throw new DecodeError(path, 'invalid event fingerprint');
      if (
        (e.tenantID !== undefined && e.tenantID !== record.tenantID) ||
        (e.runtimeEpoch !== undefined && e.runtimeEpoch !== record.runtimeEpoch)
      )
        throw new DecodeError(path, 'mixed history scope');
      const version = e.schemaVersion;
      if (version !== 1 && version !== 2)
        throw new DecodeError(path, 'unknown event schema');
      let fact: HistoryRecord['fact'];
      if (type === 'ProductRegistered') {
        exactNumber(version, path, 1);
        const payload = closedObject(e.payload, path, ['product']);
        const product = closedObject(payload.product, path, [
          'productID',
          'name',
          'baseUnit',
        ]);
        nonEmptyString(product.productID, path);
        oneOf(product.baseUnit, path, baseUnits);
        fact = { kind: 'product', name: nonEmptyString(product.name, path) };
      } else if (type === 'DishDefined') {
        exactNumber(version, path, 1);
        const payload = closedObject(e.payload, path, ['dish']);
        const dish = closedObject(payload.dish, path, [
          'dishID',
          'name',
          'ingredients',
        ]);
        nonEmptyString(dish.dishID, path);
        array(dish.ingredients, path, (v, p) => {
          const ingredient = closedObject(v, p, ['productID', 'quantity']);
          nonEmptyString(ingredient.productID, p);
          return positiveInt64(ingredient.quantity, p);
        });
        fact = { kind: 'dish', name: nonEmptyString(dish.name, path) };
      } else if (type === 'DeliveryReceived') {
        const payload = closedObject(e.payload, path, ['delivery', 'batches']);
        const delivery = closedObject(payload.delivery, path, [
          'deliveryID',
          'number',
          'createdAt',
          'lines',
        ]);
        instant(delivery.createdAt, path);
        array(delivery.lines, path, (v, p) => {
          const line = closedObject(v, p, [
            'productID',
            'manufacturedAt',
            'shelfLife',
            'receivedAt',
            'quantity',
          ]);
          nonEmptyString(line.productID, p);
          instant(line.manufacturedAt, p);
          instant(line.receivedAt, p);
          shelfLife(line.shelfLife, p);
          return positiveInt64(line.quantity, p);
        });
        fact = {
          kind: 'receipt',
          deliveryID: nonEmptyString(delivery.deliveryID, path),
          number: nonEmptyString(delivery.number, path),
          batches: array(payload.batches, path, (v, p) =>
            batchFact(v, p, version === 2),
          ),
        };
      } else if (type === 'OrderPlaced') {
        exactNumber(version, path, 1);
        const payload = closedObject(e.payload, path, ['order']);
        fact = { kind: 'sale', order: decodeOrder(payload.order, path) };
      } else if (type === 'BatchWriteoffConfirmed') {
        exactNumber(version, path, 2);
        const writeoff = decodeWriteoff(e.payload, path);
        fact = {
          kind: 'writeoff',
          batchID: writeoff.batchID,
          productID: writeoff.productID,
          quantity: writeoff.writtenOffQuantity,
          baseUnit: writeoff.baseUnit,
        };
      } else if (type === 'BatchExpiryPending') {
        exactNumber(version, path, 2);
        const payload = closedObject(e.payload, path, [
          'batchID',
          'productID',
          'remainingQuantity',
          'baseUnit',
          'expiresAt',
        ]);
        instant(payload.expiresAt, path);
        fact = {
          kind: 'pending',
          batchID: nonEmptyString(payload.batchID, path),
          productID: nonEmptyString(payload.productID, path),
          quantity: positiveInt64(payload.remainingQuantity, path),
          baseUnit: oneOf(payload.baseUnit, path, baseUnits),
        };
      } else {
        exactNumber(version, path, 1);
        const payload = closedObject(e.payload, path, ['expiry']);
        const expiry = closedObject(payload.expiry, path, [
          'batchID',
          'productID',
          'writtenOffQuantity',
          'reason',
          'expiresAt',
          'processedAt',
        ]);
        instant(expiry.expiresAt, path);
        instant(expiry.processedAt, path);
        fact = {
          kind: 'writeoff',
          batchID: nonEmptyString(expiry.batchID, path),
          productID: nonEmptyString(expiry.productID, path),
          quantity: positiveInt64(expiry.writtenOffQuantity, path),
          baseUnit: undefined,
        };
      }
      return {
        tenantID: entityId(record.tenantID, path),
        runtimeEpoch: entityId(record.runtimeEpoch, path),
        sequence: positiveInt64(e.sequence, path),
        eventID: nonEmptyString(e.eventID, path),
        recordedAt: instant(e.recordedAt, path),
        fact,
      };
    },
  );
  if (events.length > 500)
    throw new DecodeError(path, 'oversized history page');
  return { events };
}

export function validBatchCapture(
  value: Envelope<BatchPage>,
  productID: string,
): boolean {
  const { context: c, result: v } = value;
  const page = v.page;
  return !(
    v.productID !== productID ||
    page.tenantID !== c.tenantID ||
    page.epoch !== c.runtimeEpoch ||
    page.stateVersion !== c.stateVersion ||
    page.prefixSequence !== c.stateVersion ||
    instantNanos(v.evaluatedAt) !== instantNanos(c.evaluatedAt) ||
    page.settings.timeZone !== c.settings.timeZone ||
    page.settings.settingsVersion !== c.settings.settingsVersion ||
    v.items.some(
      (row) =>
        row.batch.productID !== productID ||
        (row.status === 'available' &&
          instantNanos(row.batch.expiresAt) <= instantNanos(c.evaluatedAt)),
    )
  );
}
