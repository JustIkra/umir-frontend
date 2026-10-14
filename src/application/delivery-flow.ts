import {
  emptyDeliveryDraft,
  type DeliveryDraft,
} from '@/domain/delivery-draft';
import {
  ApiError,
  localFailure,
  type ApiFailure,
  type Envelope,
  type Instant,
} from './api';
import type { CommandResult, CommandRunner, CommandSpec } from './commands';
import type { EpochRegistry } from './epochs';
import type {
  DeliveryInput,
  DeliveryReceipt,
  DeliveryStorage,
  StoredDeliveryAttempt,
  WarehouseApi,
} from './warehouse';

export type DeliveryPhase =
  | { readonly kind: 'editing' }
  | { readonly kind: 'sending' }
  | {
      readonly kind: 'received';
      readonly receipt: DeliveryReceipt;
      readonly input: DeliveryInput;
      readonly evaluatedAt: Instant;
    }
  | { readonly kind: 'unknown'; readonly checking: boolean }
  // InvalidArgument, InvalidRequest, technical refusals
  | { readonly kind: 'refused'; readonly code: string }
  | { readonly kind: 'conflict' } // CommandConflict (P8)
  | { readonly kind: 'ambiguous-time' } // AmbiguousLocalTime (DS01)
  | { readonly kind: 'nonexistent-time' } // NonexistentLocalTime (DS02)
  | { readonly kind: 'settings-changed' } // SettingsChanged (DS03)
  | { readonly kind: 'reset' };
export interface DeliverySnapshot {
  readonly draft: DeliveryDraft;
  readonly phase: DeliveryPhase;
  // The DS01 choice for the next submit.
  readonly occurrence: 'earlier' | 'later' | undefined;
  readonly notice: { readonly kind: 'check-failed' } | undefined;
  readonly locked: boolean; // sending, unknown
}
export interface DeliveryFlow {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => DeliverySnapshot;
  // Ignored while locked and after a receipt (restart() first).
  edit(next: (draft: DeliveryDraft) => DeliveryDraft): void;
  chooseOccurrence(occurrence: 'earlier' | 'later'): void;
  // Presentation builds the input from the draft.
  submit(input: Omit<DeliveryInput, 'deliveryID'>): Promise<void>;
  check(): Promise<void>;
  // After received: a new empty draft and a new deliveryID.
  restart(): void;
  dispose(): void;
}
export interface DeliveryFlowOptions {
  readonly api: WarehouseApi;
  readonly commands: CommandRunner;
  readonly epochs: Pick<EpochRegistry, 'get'>;
  readonly storage: DeliveryStorage;
  readonly newID: () => string;
  readonly now: () => number;
  readonly restaurantID: string;
  readonly userID: string;
  readonly onReceived: () => void; // stock, history stale
  readonly onSettingsChanged: () => void; // access refresh
  readonly onUnauthenticated: () => void;
}

export const deliveryKey = (restaurantID: string) =>
  `warehouse.delivery.${restaurantID}`;
// W11 names the attempt «Результат приёма поставки от …».
const label = 'приёма поставки';

type Notice = DeliverySnapshot['notice'];

const ended = (failure: ApiFailure) =>
  failure.status === 401 || failure.code === 'Unauthenticated';

// Answers of the warehouse to this very command (spec 8.3). They settle the
// attempt whatever outcome they name, a check included: an exact repeat of a
// recorded command returns its receipt, so such a refusal means this command
// recorded nothing. Any other refusal is judged by its outcome.
function ownerAnswer(code: string): DeliveryPhase | undefined {
  switch (code) {
    case 'CommandConflict':
      return { kind: 'conflict' };
    case 'AmbiguousLocalTime':
      return { kind: 'ambiguous-time' };
    case 'NonexistentLocalTime':
      return { kind: 'nonexistent-time' };
    case 'SettingsChanged':
      return { kind: 'settings-changed' };
    case 'InvalidArgument':
    case 'InvalidRequest':
    case 'UnknownTimeZone':
    case 'TimeZoneDataUnavailable':
      return { kind: 'refused', code };
    default:
      return undefined;
  }
}

// The delivery being received in one restaurant: the draft, its deliveryID
// and a send whose outcome is unknown, all kept in the tab. v2 has no read of
// a delivery command, so «Проверить результат» repeats the same command (same
// commandID, deliveryID, body and epoch); an exact repeat returns the original
// receipt and never records a second one (spec 2, 8.3).
export function createDeliveryFlow({
  api,
  commands,
  epochs,
  storage,
  newID,
  now,
  restaurantID,
  userID,
  onReceived,
  onSettingsChanged,
  onUnauthenticated,
}: DeliveryFlowOptions): DeliveryFlow {
  const key = deliveryKey(restaurantID);
  const listeners = new Set<() => void>();
  const stored = storage.load(userID, restaurantID);
  let draft: DeliveryDraft = stored?.draft ?? emptyDeliveryDraft();
  let deliveryID: string | undefined = stored?.deliveryID;
  let attempt: StoredDeliveryAttempt | undefined = stored?.attempt;
  let phase: DeliveryPhase = { kind: 'editing' };
  let occurrence: 'earlier' | 'later' | undefined;
  let notice: Notice;
  let disposed = false;

  const isLocked = () => phase.kind === 'sending' || phase.kind === 'unknown';

  function view(): DeliverySnapshot {
    return { draft, phase, occurrence, notice, locked: isLocked() };
  }

  function publish(): void {
    snapshot = view();
    for (const listener of listeners) listener();
  }

  function show(next: DeliveryPhase, nextNotice?: Notice): void {
    phase = next;
    notice = nextNotice;
    publish();
  }

  function save(): void {
    storage.save({ userID, restaurantID, draft, deliveryID, attempt });
  }

  function clearAttempt(): void {
    attempt = undefined;
    save();
  }

  function deliverySpec(
    input: DeliveryInput,
  ): CommandSpec<Envelope<DeliveryReceipt>> {
    return {
      key,
      label,
      restaurantID,
      service: 'warehouse',
      execute: (commandID, epoch) => {
        if (epoch === undefined) {
          return Promise.reject(
            new ApiError(localFailure('EpochUnknown', 'not_committed')),
          );
        }
        // Kept before the request leaves: a reload while it is in flight
        // checks this very command.
        attempt = {
          commandID,
          epoch,
          startedAt:
            attempt?.commandID === commandID ? attempt.startedAt : now(),
          input,
        };
        save();
        return api.receiveDelivery(restaurantID, input, commandID, epoch);
      },
    };
  }

  function restorePending(saved: StoredDeliveryAttempt): void {
    commands.restore(deliverySpec(saved.input), {
      commandID: saved.commandID,
      epoch: saved.epoch,
      startedAt: saved.startedAt,
    });
  }

  // P6: the record of the tab is erased; the next delivery gets a new
  // deliveryID at its first edit.
  function receive(
    { context, result }: Envelope<DeliveryReceipt>,
    input: DeliveryInput,
  ): void {
    attempt = undefined;
    draft = emptyDeliveryDraft();
    deliveryID = undefined;
    occurrence = undefined;
    storage.clear(userID, restaurantID);
    onReceived();
    show({
      kind: 'received',
      receipt: result,
      input,
      evaluatedAt: context.evaluatedAt,
    });
  }

  function refuse(failure: ApiFailure, checking: boolean): void {
    const session = ended(failure);
    if (session) onUnauthenticated();
    if (checking && attempt !== undefined) {
      // The gateway refused the check, not the warehouse the command: nothing
      // is known of the first send, so the attempt stays open.
      restorePending(attempt);
      show(
        { kind: 'unknown', checking: false },
        session ? undefined : { kind: 'check-failed' },
      );
      return;
    }
    clearAttempt();
    show(
      session ? { kind: 'editing' } : { kind: 'refused', code: failure.code },
    );
  }

  function settle(
    result: CommandResult<Envelope<DeliveryReceipt>>,
    input: DeliveryInput,
    checking: boolean,
  ): void {
    if (disposed) return;
    if (result.kind === 'committed') {
      receive(result.value, input);
      return;
    }
    // The code decides before the outcome (the lesson of ProposalNotFound in
    // subproject 3); a lost answer (Transport, Malformed) has no such code.
    const answer =
      result.kind === 'reset' ? undefined : ownerAnswer(result.failure.code);
    if (answer !== undefined) {
      // An answer with an unknown outcome leaves the attempt in the runner.
      commands.discard(key);
      clearAttempt();
      if (answer.kind === 'settings-changed') onSettingsChanged();
      // P8: another send recorded this delivery; the stock is stale.
      if (answer.kind === 'conflict') onReceived();
      show(answer);
      return;
    }
    switch (result.kind) {
      case 'unknown':
        show(
          { kind: 'unknown', checking: false },
          checking ? { kind: 'check-failed' } : undefined,
        );
        return;
      case 'reset':
        // The runner raised «Данные обновились»; the draft stays for a send
        // in the new epoch.
        clearAttempt();
        show({ kind: 'reset' });
        return;
      case 'rejected':
        refuse(result.failure, checking);
        return;
    }
  }

  async function submit(
    fields: Omit<DeliveryInput, 'deliveryID'>,
  ): Promise<void> {
    if (isLocked() || phase.kind === 'received' || attempt !== undefined) {
      return;
    }
    if (epochs.get(restaurantID, 'warehouse') === undefined) {
      show({ kind: 'refused', code: 'EpochUnknown' });
      return;
    }
    if (deliveryID === undefined) {
      deliveryID = newID();
      save();
    }
    const input: DeliveryInput = { ...fields, deliveryID };
    show({ kind: 'sending' });
    const result = await commands.run(deliverySpec(input));
    settle(result, input, false);
  }

  async function check(): Promise<void> {
    const saved = attempt;
    if (phase.kind !== 'unknown' || phase.checking || saved === undefined) {
      return;
    }
    if (!commands.getSnapshot().some((item) => item.key === key)) {
      restorePending(saved);
    }
    show({ kind: 'unknown', checking: true });
    const result = await commands.run(deliverySpec(saved.input));
    settle(result, saved.input, true);
  }

  if (attempt !== undefined) {
    restorePending(attempt);
    phase = { kind: 'unknown', checking: false };
  }
  let snapshot: DeliverySnapshot = view();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    // The message of the last send stays while the form is edited.
    edit(next) {
      if (isLocked() || phase.kind === 'received') return;
      draft = next(draft);
      deliveryID ??= newID();
      save();
      publish();
    },
    chooseOccurrence(choice) {
      if (isLocked()) return;
      occurrence = choice;
      publish();
    },
    submit,
    check,
    restart() {
      if (isLocked() || attempt !== undefined) return;
      draft = emptyDeliveryDraft();
      deliveryID = undefined;
      occurrence = undefined;
      storage.clear(userID, restaurantID);
      show({ kind: 'editing' });
    },
    dispose() {
      disposed = true;
    },
  };
}
