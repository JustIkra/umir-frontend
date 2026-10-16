import { ApiError, localFailure, type Envelope, type Topic } from './api';
import type { AttemptBody, AttemptStore } from './attempt-store';
import type { CreateOutcome } from './catalog-commands';
import { defaultWaitSeconds } from './credentials';
import type { CommandResult, CommandRunner, CommandSpec } from './commands';
import {
  attemptDamagedCode,
  createDurableAttempts,
  type AttemptState,
  type Execute,
} from './durable-attempts';
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
  // What the saved attempt of the delivery or of one batch's write-off lets a
  // screen know: not saved, damaged, discardable.
  readonly deliveryAttempt: AttemptState;
  writeoffAttempt(batchID: string): AttemptState;
}
export interface WarehouseCommandsOptions {
  readonly api: WarehouseApi;
  readonly commands: CommandRunner;
  readonly restaurantID: string;
  readonly userID: string;
  readonly attempts: AttemptStore;
  readonly now: () => number;
  readonly newID: () => string;
  readonly markStale: (topics: readonly Topic[]) => void;
  readonly onUnauthenticated: () => void;
}

export function createWarehouseCommands({
  api,
  commands,
  restaurantID,
  userID,
  attempts,
  now,
  newID,
  markStale,
  onUnauthenticated,
}: WarehouseCommandsOptions): WarehouseCommands {
  const durable = createDurableAttempts({
    store: attempts,
    userID,
    restaurantID,
    now,
  });
  const deliveryRef = { kind: 'delivery', userID, restaurantID } as const;
  const writeoffRef = (batchID: string) =>
    ({ kind: 'writeoff', userID, restaurantID, batchID }) as const;
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
      result.failure.status === 429 ||
      result.failure.code === 'RateLimited'
    ) {
      return {
        kind: 'rate-limited',
        retryAfterSeconds:
          result.failure.retryAfterSeconds ?? defaultWaitSeconds,
      };
    }
    if (
      result.failure.code === 'InvalidArgument' ||
      result.failure.code === 'InvalidRequest'
    )
      return { kind: 'invalid' };
    return { kind: 'refused', code: result.failure.code };
  }
  // A send under the epoch the screen saw: another epoch means the service
  // restarted and the command is lost. The record is kept around the send.
  function guarded<T>(
    body: AttemptBody,
    expectedEpoch: string | undefined,
    send: Execute<T>,
  ): Execute<T> {
    const kept = durable.keep(body, send);
    return (commandID, epoch) => {
      if (epoch !== expectedEpoch)
        return Promise.reject(
          new ApiError(localFailure('RuntimeReset', 'indeterminate')),
        );
      return kept(commandID, epoch);
    };
  }
  function deliverySpec(
    saved: DeliveryInput,
    zone: string,
    expectedEpoch: string | undefined,
  ): CommandSpec<Envelope<DeliveryReceipt>> {
    return {
      key: deliveryKey,
      label: 'приёма поставки',
      restaurantID,
      service: 'warehouse',
      execute: guarded(
        { kind: 'delivery', payload: { input: saved, timeZone: zone } },
        expectedEpoch,
        (commandID) =>
          api.receiveDelivery(
            restaurantID,
            saved,
            commandID,
            expectedEpoch ?? '',
          ),
      ),
    };
  }
  function writeoffSpec(
    batchID: string,
    expectedEpoch: string | undefined,
  ): CommandSpec<Envelope<WriteoffResult>> {
    return {
      key: writeoffKey(batchID),
      label: 'подтверждения списания',
      restaurantID,
      service: 'warehouse',
      execute: guarded(
        { kind: 'writeoff', payload: { batchID } },
        expectedEpoch,
        (commandID) =>
          api.confirmWriteoff(
            restaurantID,
            batchID,
            commandID,
            expectedEpoch ?? '',
          ),
      ),
    };
  }
  // The attempts saved in an earlier visit of this tab come back as pending.
  for (const record of durable.restored()) {
    const saved = {
      commandID: record.commandID,
      epoch: record.epoch,
      startedAt: record.startedAt,
    };
    if (record.kind === 'delivery' && !listed(deliveryKey)) {
      delivery = record.payload.input;
      deliveryZone = record.payload.timeZone;
      commands.restore(
        deliverySpec(delivery, deliveryZone, record.epoch),
        saved,
      );
    } else if (
      record.kind === 'writeoff' &&
      !listed(writeoffKey(record.payload.batchID))
    ) {
      commands.restore(
        writeoffSpec(record.payload.batchID, record.epoch),
        saved,
      );
    }
  }
  const damagedOutcome = {
    kind: 'refused',
    code: attemptDamagedCode,
  } as const;
  return {
    async receiveDelivery(input, timeZone, expectedEpoch) {
      if (durable.blocked(deliveryRef)) return damagedOutcome;
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
      return outcome(
        await commands.run(
          deliverySpec(delivery, deliveryZone ?? timeZone, expectedEpoch),
        ),
      );
    },
    pendingDelivery: () => (listed(deliveryKey) ? delivery : undefined),
    pendingDeliveryTimeZone: () =>
      listed(deliveryKey) ? deliveryZone : undefined,
    async confirmWriteoff(batchID, expectedEpoch) {
      if (durable.blocked(writeoffRef(batchID))) return damagedOutcome;
      return outcome(await commands.run(writeoffSpec(batchID, expectedEpoch)));
    },
    pendingWriteoff: (batchID) => listed(writeoffKey(batchID)),
    deliveryAttempt: durable.state(deliveryRef),
    writeoffAttempt: (batchID) => durable.state(writeoffRef(batchID)),
  };
}
