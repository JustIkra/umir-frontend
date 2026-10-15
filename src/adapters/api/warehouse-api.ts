import type { BusinessContext, Envelope } from '@/application/api';
import { ApiError, localFailure, type Outcome } from '@/application/api';
import type {
  History,
  ProductBatch,
  WarehouseApi,
  WarehouseReads,
} from '@/application/warehouse';
import type { GatewayClient } from '@/adapters/http/gateway-client';
import type { components } from './backend-v2';
import { decoded, DecodeError, instantNanos } from './decode/common';
import {
  decodePlanningEnvelope,
  decodeSupplySuggestions,
} from './decode/planning';
import {
  decodeBatchPage,
  decodeExpiring,
  decodeHistory,
  decodeInventory,
  decodePending,
  decodeReceipt,
  decodeWarehouseEnvelope,
  decodeWriteoff,
  validBatchCapture,
} from './decode/warehouse';

const base = (restaurantID: string) =>
  `/api/v2/r/${encodeURIComponent(restaurantID)}/warehouse`;
const malformed = (
  problem: string,
  outcome: Outcome = 'unavailable',
): never => {
  const failure = new ApiError(localFailure('Malformed', outcome, 200));
  failure.cause = new DecodeError('warehouse', problem);
  throw failure;
};
const reading =
  <T>(decode: (value: unknown, path: string) => T) =>
  (body: unknown) =>
    decoded(
      (body) => decodeWarehouseEnvelope(body, decode),
      'unavailable',
    )(body);
const stock = reading(decodeInventory);
const expiring = reading(decodeExpiring);
const batches = reading(decodeBatchPage);
const historyPage = reading(decodeHistory);
const supply = decoded(
  (body) => decodePlanningEnvelope(body, decodeSupplySuggestions, 'warehouse'),
  'unavailable',
);

function scope<T>(
  value: Envelope<T>,
  restaurantID: string,
  outcome: Outcome = 'unavailable',
): Envelope<T> {
  if (value.context.tenantID !== restaurantID)
    return malformed('restaurant differs from request', outcome);
  return value;
}
function sameScope(a: BusinessContext, b: BusinessContext): boolean {
  return (
    a.orgID === b.orgID &&
    a.tenantID === b.tenantID &&
    a.runtimeEpoch === b.runtimeEpoch &&
    a.settings.timeZone === b.settings.timeZone &&
    a.settings.settingsVersion === b.settings.settingsVersion
  );
}
function compareBatch(a: ProductBatch, b: ProductBatch): number {
  const expiry =
    instantNanos(a.batch.expiresAt) - instantNanos(b.batch.expiresAt);
  if (expiry !== 0n) return expiry < 0n ? -1 : 1;
  const received =
    instantNanos(a.batch.receivedAt) - instantNanos(b.batch.receivedAt);
  if (received !== 0n) return received < 0n ? -1 : 1;
  return a.batch.batchID < b.batch.batchID
    ? -1
    : a.batch.batchID > b.batch.batchID
      ? 1
      : 0;
}

export function createWarehouseReads(
  client: Pick<GatewayClient, 'read'>,
): WarehouseReads {
  return {
    async inventory(id, options) {
      return scope(
        stock(await client.read(`${base(id)}/inventory`, options)),
        id,
      );
    },
    async pendingWriteoffs(id, options) {
      return scope(
        decoded(
          decodePending,
          'unavailable',
        )(await client.read(`${base(id)}/pending-writeoffs`, options)),
        id,
      );
    },
    async expiringBatches(id, options) {
      const value = scope(
        expiring(await client.read(`${base(id)}/expiring-batches`, options)),
        id,
      );
      if (
        value.result.stateVersion !== value.context.stateVersion ||
        instantNanos(value.result.evaluatedAt) !==
          instantNanos(value.context.evaluatedAt)
      )
        return malformed('expiry capture differs');
      return value;
    },
    async supplySuggestions(id, options) {
      return scope(
        supply(await client.read(`${base(id)}/supply-suggestions`, options)),
        id,
      );
    },
    async productBatches(id, productID, options) {
      const path = `${base(id)}/products/${encodeURIComponent(productID)}/batches?limit=500`;
      let page = scope(batches(await client.read(path, options)), id);
      if (!validBatchCapture(page, productID))
        return malformed('batch identity differs');
      const first = page;
      const items: ProductBatch[] = [];
      const seen = new Set<string>();
      const cursors = new Set<string>();
      for (;;) {
        if (!validBatchCapture(page, productID))
          return malformed('batch identity differs');
        if (
          !sameScope(first.context, page.context) ||
          first.context.stateVersion !== page.context.stateVersion ||
          instantNanos(first.context.evaluatedAt) !==
            instantNanos(page.context.evaluatedAt) ||
          first.result.page.filterFingerprint !==
            page.result.page.filterFingerprint
        )
          return malformed('batch capture changed between pages');
        for (const item of page.result.items) {
          const previous = items.at(-1);
          if (
            seen.has(item.batch.batchID) ||
            (previous !== undefined && compareBatch(previous, item) > 0)
          )
            return malformed('duplicate or unordered batches');
          seen.add(item.batch.batchID);
          items.push(item);
        }
        if (items.length > 10000)
          return malformed('batch capture capacity exceeded');
        const cursor = page.result.nextCursor;
        if (cursor === undefined) break;
        if (page.result.items.length === 0 || cursors.has(cursor))
          return malformed('batch cursor did not advance');
        if (items.length >= 10000 || cursors.size >= 20)
          return malformed('batch page capacity exceeded');
        cursors.add(cursor);
        page = scope(
          batches(
            await client.read(
              `${path}&cursor=${encodeURIComponent(cursor)}`,
              options,
            ),
          ),
          id,
        );
      }
      return {
        context: first.context,
        result: {
          productID: first.result.productID,
          evaluatedAt: first.result.evaluatedAt,
          page: first.result.page,
          items,
        },
      };
    },
    async history(id, options) {
      let page = scope(
        historyPage(await client.read(`${base(id)}/history`, options)),
        id,
      );
      const context = page.context;
      const target = BigInt(context.stateVersion);
      if (target > 10000n)
        return malformed('history capture exceeds 10000 events');
      const events: History['events'][number][] = [];
      const eventIDs = new Set<string>();
      let sequence = 0n;
      let pages = 0;
      if (target === 0n && page.result.events.length !== 0)
        return malformed('events exceed captured prefix');
      while (sequence < target) {
        pages += 1;
        if (pages > 20) return malformed('history page capacity exceeded');
        if (
          !sameScope(context, page.context) ||
          BigInt(page.context.stateVersion) < target ||
          page.result.events.length === 0
        )
          return malformed('history prefix or scope changed');
        const before = sequence;
        for (const event of page.result.events) {
          const next = BigInt(event.sequence);
          if (next > target) break;
          if (
            next !== sequence + 1n ||
            event.tenantID !== id ||
            event.runtimeEpoch !== context.runtimeEpoch ||
            eventIDs.has(event.eventID)
          )
            return malformed('noncontiguous history or mixed epoch');
          sequence = next;
          eventIDs.add(event.eventID);
          events.push(event);
        }
        if (sequence === before)
          return malformed('history page did not advance');
        if (sequence < target)
          page = scope(
            historyPage(
              await client.read(
                `${base(id)}/history?fromSequence=${sequence.toString()}`,
                options,
              ),
            ),
            id,
          );
      }
      return { context, result: { events } };
    },
  };
}

export function createWarehouseApi(
  client: Pick<GatewayClient, 'read' | 'send'>,
): WarehouseApi {
  return {
    async receiveDelivery(id, input, commandID, epoch) {
      const body: components['schemas']['ReceiveDeliveryV2'] = {
        ...input,
        commandID,
        lines: input.lines.map((line) => ({ ...line })),
      };
      const value = scope(
        decoded(
          (body) => decodeWarehouseEnvelope(body, decodeReceipt),
          'unknown',
        )(await client.send('POST', `${base(id)}/deliveries`, { body, epoch })),
        id,
        'unknown',
      );
      if (
        value.result.deliveryID !== input.deliveryID ||
        value.context.runtimeEpoch !== epoch ||
        value.result.batchIDs.length !== input.lines.length ||
        value.result.batches.length !== input.lines.length ||
        new Set(value.result.batchIDs).size !== value.result.batchIDs.length ||
        value.result.batches.some(
          (batch, i) =>
            batch.deliveryID !== input.deliveryID ||
            batch.batchID !== value.result.batchIDs[i] ||
            batch.lineNo !== String(i + 1),
        )
      )
        return malformed('delivery receipt identity differs', 'unknown');
      return value;
    },
    async confirmWriteoff(id, batchID, commandID, epoch) {
      const value = scope(
        decoded(
          (body) => decodeWarehouseEnvelope(body, decodeWriteoff),
          'unknown',
        )(
          await client.send('POST', `${base(id)}/writeoffs`, {
            body: { batchID, commandID },
            epoch,
          }),
        ),
        id,
        'unknown',
      );
      if (
        value.context.runtimeEpoch !== epoch ||
        value.result.batchID !== batchID
      )
        return malformed('writeoff result identity differs', 'unknown');
      return value;
    },
  };
}
