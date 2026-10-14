import type { Envelope } from '@/application/api';
import type {
  TimeInput,
  WarehouseApi,
  WarehouseReads,
} from '@/application/warehouse';
import type { GatewayClient } from '@/adapters/http/gateway-client';
import type { components } from './backend-v2';
import { decoded, object } from './decode/common';
import { decodeContext, decodeEnvelope } from './decode/context';
import {
  decodeDeliveryReceipt,
  decodeExpiringBatches,
  decodeHistory,
  decodeInventory,
  decodePendingBatches,
  decodeStockReport,
  decodeWriteoffObservation,
  decodeWriteoffResult,
} from './decode/warehouse';

const base = (restaurantID: string) =>
  `/api/v2/r/${encodeURIComponent(restaurantID)}/warehouse`;
const query = (value: string) => encodeURIComponent(value);

// A decoder of {context, result}; a contract mismatch becomes Malformed with
// the given outcome.
function envelope<T>(
  result: (value: unknown, path: string) => T,
  outcome: 'unavailable' | 'unknown',
): (body: unknown) => Envelope<T> {
  return decoded((body) => decodeEnvelope(body, result), outcome);
}

// analytics/stock and pending-writeoffs put their fields next to context; the
// application still gets {context, result}.
function flat<T>(
  result: (value: unknown, path: string) => T,
): (body: unknown) => Envelope<T> {
  return decoded(
    (body) => ({
      context: decodeContext(object(body, 'body').context, 'context'),
      result: result(body, 'body'),
    }),
    'unavailable',
  );
}

const inventory = envelope(decodeInventory, 'unavailable');
const expiringBatches = envelope(decodeExpiringBatches, 'unavailable');
const history = envelope(decodeHistory, 'unavailable');
const pendingWriteoffs = flat(decodePendingBatches);
const stockReport = flat(decodeStockReport);
const receipt = envelope(decodeDeliveryReceipt, 'unknown');
const writeoff = envelope(decodeWriteoffResult, 'unknown');
const observation = decoded(
  (body) => decodeWriteoffObservation(body, 'lookup'),
  'unavailable',
);

const minutes = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

// The contract's LocalDateTime has seconds; the form edits minutes.
function timeBody(input: TimeInput): components['schemas']['TimeInput'] {
  if ('instant' in input) return { instant: input.instant };
  const { localDateTime, occurrence } = input.civil;
  const civil = {
    localDateTime: minutes.test(localDateTime)
      ? `${localDateTime}:00`
      : localDateTime,
  };
  return { civil: occurrence === undefined ? civil : { ...civil, occurrence } };
}

export function createWarehouseReads(
  client: Pick<GatewayClient, 'read'>,
): WarehouseReads {
  return {
    async inventory(restaurantID, options) {
      return inventory(
        await client.read(`${base(restaurantID)}/inventory`, options),
      );
    },
    async expiringBatches(restaurantID, options) {
      return expiringBatches(
        await client.read(`${base(restaurantID)}/expiring-batches`, options),
      );
    },
    async pendingWriteoffs(restaurantID, options) {
      return pendingWriteoffs(
        await client.read(`${base(restaurantID)}/pending-writeoffs`, options),
      );
    },
    async stockReport(
      restaurantID,
      { riskHours, settingsVersion, cursor },
      options,
    ) {
      const params = [
        `riskHours=${String(riskHours)}`,
        `expectedSettingsVersion=${query(settingsVersion)}`,
        'limit=500',
        ...(cursor === undefined ? [] : [`cursor=${query(cursor)}`]),
      ];
      return stockReport(
        await client.read(
          `${base(restaurantID)}/analytics/stock?${params.join('&')}`,
          options,
        ),
      );
    },
    async history(restaurantID, fromSequence, options) {
      return history(
        await client.read(
          `${base(restaurantID)}/history?fromSequence=${query(fromSequence)}`,
          options,
        ),
      );
    },
  };
}

export function createWarehouseApi(
  client: Pick<GatewayClient, 'read' | 'send'>,
): WarehouseApi {
  return {
    async receiveDelivery(restaurantID, input, commandID, epoch) {
      const body: components['schemas']['ReceiveDeliveryV2'] = {
        commandID,
        deliveryID: input.deliveryID,
        number: input.number,
        createdAt: timeBody(input.createdAt),
        expectedSettingsVersion: input.expectedSettingsVersion,
        lines: input.lines.map((line) => ({
          productID: line.productID,
          manufacturedAt: timeBody(line.manufacturedAt),
          shelfLife: { value: line.shelfLife.value, unit: line.shelfLife.unit },
          receivedAt: timeBody(line.receivedAt),
          quantity: line.quantity,
        })),
      };
      return receipt(
        await client.send('POST', `${base(restaurantID)}/deliveries`, {
          body,
          epoch,
        }),
      );
    },
    async confirmWriteoff(restaurantID, batchID, commandID, epoch) {
      const body: components['schemas']['WriteoffRequest'] = {
        commandID,
        batchID,
      };
      return writeoff(
        await client.send('POST', `${base(restaurantID)}/writeoffs`, {
          body,
          epoch,
        }),
      );
    },
    async lookupWriteoff(restaurantID, { commandID, batchID, epoch }) {
      return observation(
        await client.read(
          `${base(restaurantID)}/writeoffs/commands?commandID=${query(commandID)}&batchID=${query(batchID)}`,
          { background: false, epoch },
        ),
      );
    },
  };
}
