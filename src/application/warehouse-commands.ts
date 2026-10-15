import { ApiError, localFailure, type Envelope, type Topic } from './api';
import type { CreateOutcome } from './catalog-commands';
import type { CommandResult, CommandRunner } from './commands';
import type {
  DeliveryInput,
  DeliveryReceipt,
  WarehouseApi,
  WriteoffResult,
} from './warehouse';

export type DeliveryDraft = Omit<DeliveryInput, 'deliveryID'>;
export interface WarehouseCommands {
  receiveDelivery(
    input: DeliveryDraft,
    timeZone: string,
    expectedEpoch: string,
  ): Promise<CreateOutcome<DeliveryReceipt>>;
  pendingDelivery(): DeliveryInput | undefined;
  pendingDeliveryTimeZone(): string | undefined;
  confirmWriteoff(
    batchID: string,
    expectedEpoch: string,
  ): Promise<CreateOutcome<WriteoffResult>>;
  pendingWriteoff(batchID: string): boolean;
}
export interface WarehouseCommandsOptions {
  readonly api: WarehouseApi;
  readonly commands: CommandRunner;
  readonly restaurantID: string;
  readonly newID: () => string;
  readonly markStale: (topics: readonly Topic[]) => void;
  readonly onUnauthenticated: () => void;
}

export function createWarehouseCommands({
  api,
  commands,
  restaurantID,
  newID,
  markStale,
  onUnauthenticated,
}: WarehouseCommandsOptions): WarehouseCommands {
  const deliveryKey = `warehouse.delivery.${restaurantID}`;
  const writeoffKey = (batchID: string) =>
    `warehouse.writeoff.${restaurantID}.${batchID}`;
  const listed = (key: string) =>
    commands.getSnapshot().some((attempt) => attempt.key === key);
  let delivery: DeliveryInput | undefined;
  let deliveryZone: string | undefined;
  function outcome<T>(result: CommandResult<Envelope<T>>): CreateOutcome<T> {
    if (result.kind === 'committed') {
      markStale(['stock', 'orders', 'menu']);
      return { kind: 'created', value: result.value.result };
    }
    if (result.kind === 'unknown') return { kind: 'unknown' };
    if (result.kind === 'reset') return { kind: 'reset' };
    if (
      result.failure.status === 401 ||
      result.failure.code === 'Unauthenticated'
    ) {
      onUnauthenticated();
      return { kind: 'ended' };
    }
    if (
      result.failure.code === 'InvalidArgument' ||
      result.failure.code === 'InvalidRequest'
    )
      return { kind: 'invalid' };
    return { kind: 'refused', code: result.failure.code };
  }
  return {
    async receiveDelivery(input, timeZone, expectedEpoch) {
      if (!listed(deliveryKey) || delivery === undefined) {
        deliveryZone = timeZone;
        delivery = {
          ...input,
          deliveryID: newID(),
          createdAt: { civil: { ...input.createdAt.civil } },
          lines: input.lines.map((line) => ({
            ...line,
            shelfLife: { ...line.shelfLife },
            manufacturedAt: { civil: { ...line.manufacturedAt.civil } },
            receivedAt: { civil: { ...line.receivedAt.civil } },
          })),
        };
      }
      const saved = delivery;
      return outcome(
        await commands.run({
          key: deliveryKey,
          label: 'приёма поставки',
          restaurantID,
          service: 'warehouse',
          execute: (commandID, epoch) => {
            if (epoch !== expectedEpoch)
              return Promise.reject(
                new ApiError(localFailure('RuntimeReset', 'indeterminate')),
              );
            return api.receiveDelivery(
              restaurantID,
              saved,
              commandID,
              expectedEpoch,
            );
          },
        }),
      );
    },
    pendingDelivery: () => (listed(deliveryKey) ? delivery : undefined),
    pendingDeliveryTimeZone: () =>
      listed(deliveryKey) ? deliveryZone : undefined,
    async confirmWriteoff(batchID, expectedEpoch) {
      return outcome(
        await commands.run({
          key: writeoffKey(batchID),
          label: 'подтверждения списания',
          restaurantID,
          service: 'warehouse',
          execute: (commandID, epoch) => {
            if (epoch !== expectedEpoch)
              return Promise.reject(
                new ApiError(localFailure('RuntimeReset', 'indeterminate')),
              );
            return api.confirmWriteoff(
              restaurantID,
              batchID,
              commandID,
              expectedEpoch,
            );
          },
        }),
      );
    },
    pendingWriteoff: (batchID) => listed(writeoffKey(batchID)),
  };
}
