import {
  failureOf,
  localFailure,
  type ApiFailure,
  type Envelope,
  type Topic,
} from './api';
import type { CommandResult, CommandRunner, CommandSpec } from './commands';
import type {
  WarehouseApi,
  WriteoffObservation,
  WriteoffResult,
} from './warehouse';

export type WriteoffOutcome =
  | { readonly kind: 'written-off'; readonly result: WriteoffResult }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'already' } // AlreadyWrittenOff
  | { readonly kind: 'not-pending' } // NotPendingWriteoff
  | { readonly kind: 'not-found' } // BatchNotFound
  | { readonly kind: 'reset' }
  | { readonly kind: 'refused'; readonly code: string }
  | { readonly kind: 'check-failed' }
  | { readonly kind: 'ended' }; // 401: session check

export interface WriteoffCommands {
  confirm(batchID: string): Promise<WriteoffOutcome>;
  // Lookup first; pending or unseen resends the same command.
  check(batchID: string): Promise<WriteoffOutcome>;
  // An attempt of this batch is open in the tab: in flight or unknown.
  pending(batchID: string): boolean;
}

export interface WriteoffCommandsOptions {
  readonly api: WarehouseApi;
  readonly commands: CommandRunner;
  readonly restaurantID: string;
  // ['stock'] after a definite outcome.
  readonly markStale: (topics: readonly Topic[]) => void;
  readonly onUnauthenticated: () => void;
}

export const writeoffKey = (restaurantID: string, batchID: string) =>
  `warehouse.writeoff.${restaurantID}.${batchID}`;

// The restaurant switch names the attempt «Результат списания партии от …».
const label = 'списания партии';
const stockTopics: readonly Topic[] = ['stock'];

// Refusals after which the list of pending batches is outdated. The warehouse
// answers a missing batch with NotFound; BatchNotFound is kept for the contract.
const listRefusals = new Map<string, WriteoffOutcome>([
  ['AlreadyWrittenOff', { kind: 'already' }],
  ['NotPendingWriteoff', { kind: 'not-pending' }],
  ['BatchNotFound', { kind: 'not-found' }],
  ['NotFound', { kind: 'not-found' }],
]);

const ended = (failure: ApiFailure) =>
  failure.status === 401 || failure.code === 'Unauthenticated';
const wasReset = (failure: ApiFailure) =>
  failure.code === 'RuntimeReset' || failure.outcome === 'indeterminate';

// Spec 6.3. The attempt is kept only in this tab's runner (spec 2: a second
// writeoff of a batch is refused with AlreadyWrittenOff). An unknown outcome
// is checked with writeoffs/commands under the attempt's own commandID and
// epoch; pending or unseen means the same command is sent again.
export function createWriteoffCommands({
  api,
  commands,
  restaurantID,
  markStale,
  onUnauthenticated,
}: WriteoffCommandsOptions): WriteoffCommands {
  // The commandID and epoch each batch's attempt went out with: the lookup
  // needs both, and the runner does not show the epoch.
  const sent = new Map<
    string,
    { readonly commandID: string; readonly epoch: string }
  >();
  const checks = new Map<string, Promise<WriteoffOutcome>>();

  const listed = (batchID: string) =>
    commands
      .getSnapshot()
      .some((attempt) => attempt.key === writeoffKey(restaurantID, batchID));

  function spec(batchID: string): CommandSpec<Envelope<WriteoffResult>> {
    return {
      key: writeoffKey(restaurantID, batchID),
      label,
      restaurantID,
      service: 'warehouse',
      execute: (commandID, epoch) => {
        // Unreachable undefined: the runner refuses a warehouse command
        // without an epoch (EpochUnknown) before calling execute.
        const sentEpoch = epoch ?? '';
        sent.set(batchID, { commandID, epoch: sentEpoch });
        return api.confirmWriteoff(restaurantID, batchID, commandID, sentEpoch);
      },
    };
  }

  function written(result: WriteoffResult): WriteoffOutcome {
    markStale(stockTopics);
    return { kind: 'written-off', result };
  }

  function endedBySession(): WriteoffOutcome {
    onUnauthenticated();
    return { kind: 'ended' };
  }

  function refusal(code: string): WriteoffOutcome {
    const outcome = listRefusals.get(code);
    if (outcome === undefined) return { kind: 'refused', code };
    markStale(stockTopics);
    return outcome;
  }

  function settle(
    batchID: string,
    result: CommandResult<Envelope<WriteoffResult>>,
  ): WriteoffOutcome {
    switch (result.kind) {
      case 'committed':
        return written(result.value.result);
      case 'unknown':
        // The runner reports any failure without a settled outcome as unknown,
        // even a definite refusal such as AlreadyWrittenOff. The code decides;
        // only a transport loss or a malformed answer keeps the attempt open.
        if (ended(result.failure)) {
          commands.discard(writeoffKey(restaurantID, batchID));
          return endedBySession();
        }
        if (listRefusals.has(result.failure.code)) {
          commands.discard(writeoffKey(restaurantID, batchID));
          return refusal(result.failure.code);
        }
        return { kind: 'unknown' };
      case 'reset':
        // The runner has dropped the attempt and reported the reset.
        return { kind: 'reset' };
      case 'rejected':
        if (ended(result.failure)) return endedBySession();
        return refusal(result.failure.code);
    }
  }

  async function confirm(batchID: string): Promise<WriteoffOutcome> {
    // A second confirm while the first is in flight joins it; with an
    // unknown attempt of the batch, the runner resends that attempt.
    return settle(batchID, await commands.run(spec(batchID)));
  }

  async function lookup(batchID: string): Promise<WriteoffOutcome> {
    const attempt = sent.get(batchID);
    if (attempt === undefined || !listed(batchID)) {
      // Nothing unsettled in this tab: a new confirmation cannot write the
      // batch off twice, the warehouse answers AlreadyWrittenOff.
      return confirm(batchID);
    }
    const key = writeoffKey(restaurantID, batchID);
    let observation: WriteoffObservation;
    try {
      observation = await api.lookupWriteoff(restaurantID, {
        commandID: attempt.commandID,
        batchID,
        epoch: attempt.epoch,
      });
    } catch (error) {
      const failure =
        failureOf(error) ?? localFailure('Malformed', 'unavailable');
      if (ended(failure)) {
        // The check was refused, not the attempt: it stays for after sign-in.
        onUnauthenticated();
        return { kind: 'ended' };
      }
      if (wasReset(failure)) {
        // The warehouse restarted since the attempt: its outcome is lost.
        commands.discard(key);
        markStale(stockTopics);
        return { kind: 'reset' };
      }
      return { kind: 'check-failed' };
    }
    switch (observation.state) {
      case 'committed':
        commands.discard(key);
        return written(observation.result);
      case 'rejected':
        // The warehouse rejected the command: nothing was written, the
        // attempt is settled, and the code says how.
        commands.discard(key);
        if (observation.code === 'Unauthenticated') return endedBySession();
        if (observation.code === 'RuntimeReset') {
          markStale(stockTopics);
          return { kind: 'reset' };
        }
        return refusal(observation.code);
      case 'pending':
      case 'unseen':
        // Still running, or never reached the warehouse: the same command
        // (same commandID, batch and epoch) settles it exactly once.
        return confirm(batchID);
    }
  }

  return {
    confirm,
    check(batchID) {
      const running = checks.get(batchID);
      if (running) return running;
      const result = lookup(batchID).finally(() => {
        checks.delete(batchID);
      });
      checks.set(batchID, result);
      return result;
    },
    pending: listed,
  };
}
