import {
  addDish,
  invalidLines,
  removeLine,
  setPortions as withPortions,
  type Draft,
} from '@/domain/order-draft';
import {
  ApiError,
  failureOf,
  localFailure,
  type ApiFailure,
  type Envelope,
} from './api';
import type { CommandResult, CommandRunner, CommandSpec } from './commands';
import type { EpochRegistry } from './epochs';
import type { Scheduler } from './live-sync';
import type {
  ConfirmResult,
  Order,
  OrderApi,
  OrderProposal,
  OrderStorage,
  StoredAttempt,
} from './restaurant';

export type OrderPhase =
  | { readonly kind: 'compose' }
  | { readonly kind: 'preparing' }
  | {
      readonly kind: 'proposal';
      readonly proposal: OrderProposal;
      readonly previous: OrderProposal | undefined;
    }
  | {
      readonly kind: 'confirming';
      readonly proposal: OrderProposal;
      readonly previous: OrderProposal | undefined;
    }
  | {
      readonly kind: 'confirmed';
      readonly order: Order;
      readonly afterCheck: boolean;
    }
  | { readonly kind: 'empty'; readonly proposal: OrderProposal | undefined }
  | {
      readonly kind: 'unknown';
      readonly attempt: StoredAttempt;
      readonly checking: boolean;
    }
  | {
      readonly kind: 'pending';
      readonly attempt: StoredAttempt;
      readonly checking: boolean;
    }
  | {
      readonly kind: 'conflict';
      readonly attempt: StoredAttempt;
      readonly checking: boolean;
    }
  | {
      readonly kind: 'superseded';
      readonly replacement: OrderProposal | undefined;
    }
  | {
      readonly kind: 'not-found';
      readonly afterAttempt: boolean;
      // When the check was answered; only after an attempt.
      readonly checkedAt: number | undefined;
    }
  | {
      readonly kind: 'refused';
      readonly code: string;
      readonly proposal: OrderProposal;
    }
  | { readonly kind: 'reset' };
export type OrderNotice =
  | { readonly kind: 'portions'; readonly lines: readonly number[] }
  | { readonly kind: 'prepare-failed' }
  | { readonly kind: 'check-failed' };
export interface OrderSnapshot {
  readonly draft: Draft;
  readonly phase: OrderPhase;
  readonly notice: OrderNotice | undefined;
  readonly locked: boolean; // preparing, confirming, unknown, pending, conflict
}
export interface OrderFlow {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => OrderSnapshot;
  add(dishID: string): void;
  setPortions(lineNo: number, portions: string): void;
  remove(lineNo: number): void;
  prepare(): Promise<void>;
  confirm(): Promise<void>;
  check(): Promise<void>;
  openReplacement(): void;
  editAgain(): void;
  restart(): Promise<void>;
  dispose(): void;
}
export interface OrderFlowOptions {
  readonly api: OrderApi;
  readonly commands: CommandRunner;
  readonly epochs: Pick<EpochRegistry, 'get'>;
  readonly storage: OrderStorage;
  readonly scheduler: Scheduler;
  readonly now: () => number;
  readonly restaurantID: string;
  readonly userID: string;
  readonly onReset: () => void; // «Данные обновились» after RuntimeReset outside the runner
  readonly onOrdered: () => void; // menu, stock and orders are stale
  readonly onUnauthenticated: () => void; // session check
}

export const resolveDelayMs = 3000;
export const confirmKey = (restaurantID: string) =>
  `order.confirm.${restaurantID}`;
// W11 names the attempt «Результат оформления заказа от …».
const label = 'оформления заказа';

const lockedPhases = new Set<OrderPhase['kind']>([
  'preparing',
  'confirming',
  'unknown',
  'pending',
  'conflict',
]);
const preparable = new Set<OrderPhase['kind']>([
  'compose',
  'empty',
  'superseded',
  'not-found',
  'refused',
  'reset',
]);

const ended = (failure: ApiFailure) =>
  failure.status === 401 || failure.code === 'Unauthenticated';
const wasReset = (failure: ApiFailure) =>
  failure.code === 'RuntimeReset' || failure.outcome === 'indeterminate';

// The order of one restaurant: draft, evaluation, confirmation and every
// outcome of the sale frames. An attempt whose outcome is unknown is kept in
// the tab and checked with the same command; until then the order is closed
// («Unknown commit/retained attempt must be resolved before a new evaluation
// or retry», backend-v2.md).
export function createOrderFlow({
  api,
  commands,
  epochs,
  storage,
  scheduler,
  now,
  restaurantID,
  userID,
  onReset,
  onOrdered,
  onUnauthenticated,
}: OrderFlowOptions): OrderFlow {
  const key = confirmKey(restaurantID);
  const listeners = new Set<() => void>();
  const stored = storage.load(userID, restaurantID);
  let draft: Draft = stored?.lines ?? [];
  let attempt: StoredAttempt | undefined = stored?.attempt;
  let phase: OrderPhase = { kind: 'compose' };
  let notice: OrderNotice | undefined;
  // The proposal of the latest evaluation: the replacement for F1.
  let latest: OrderProposal | undefined;
  let cancelTimer: (() => void) | undefined;
  let disposed = false;

  function view(): OrderSnapshot {
    return { draft, phase, notice, locked: lockedPhases.has(phase.kind) };
  }

  function publish(): void {
    snapshot = view();
    for (const listener of listeners) listener();
  }

  function show(next: OrderPhase, nextNotice?: OrderNotice): void {
    phase = next;
    notice = nextNotice;
    publish();
  }

  function save(): void {
    storage.save({ userID, restaurantID, lines: draft, attempt });
  }

  function keepAttempt(next: StoredAttempt): StoredAttempt {
    attempt = next;
    save();
    return next;
  }

  function clearAttempt(): void {
    attempt = undefined;
    save();
  }

  function confirmSpec(
    proposal: OrderProposal,
  ): CommandSpec<Envelope<ConfirmResult>> {
    return {
      key,
      label,
      restaurantID,
      service: 'serving',
      execute: (commandID, epoch) => {
        if (epoch === undefined) {
          return Promise.reject(
            new ApiError(localFailure('EpochUnknown', 'not_committed')),
          );
        }
        keepAttempt({
          commandID,
          proposalID: proposal.proposalID,
          runtimeEpoch: epoch,
          proposal,
          startedAt:
            attempt?.commandID === commandID ? attempt.startedAt : now(),
          state: 'sent',
        });
        return api.confirm(restaurantID, proposal.proposalID, commandID, epoch);
      },
    };
  }

  function restorePending(saved: StoredAttempt): void {
    commands.restore(confirmSpec(saved.proposal), {
      commandID: saved.commandID,
      epoch: saved.runtimeEpoch,
      startedAt: saved.startedAt,
    });
  }

  function scheduleResolve(): void {
    cancelTimer?.();
    cancelTimer = scheduler.schedule(resolveDelayMs, () => {
      cancelTimer = undefined;
      void resolveAttempt();
    });
  }

  function applyResult(result: ConfirmResult, checking: boolean): void {
    switch (result.kind) {
      case 'OrderConfirmed':
        attempt = undefined;
        draft = [];
        save();
        onOrdered();
        show({ kind: 'confirmed', order: result.order, afterCheck: checking });
        return;
      case 'RequiresConfirmation': {
        const previous = attempt?.proposal ?? latest;
        clearAttempt();
        latest = result.proposal;
        show({ kind: 'proposal', proposal: result.proposal, previous });
        return;
      }
      case 'EmptyOrder':
        clearAttempt();
        show({ kind: 'empty', proposal: undefined });
        return;
      case 'ProposalSuperseded': {
        clearAttempt();
        const replacement =
          latest?.proposalID === result.supersededBy ? latest : undefined;
        show({ kind: 'superseded', replacement });
        return;
      }
      case 'ConfirmationPending': {
        if (attempt === undefined) {
          show({ kind: 'not-found', afterAttempt: true, checkedAt: now() });
          return;
        }
        const waiting = keepAttempt({ ...attempt, state: 'pending' });
        show({ kind: 'pending', attempt: waiting, checking: false });
        if (!checking) scheduleResolve();
        return;
      }
    }
  }

  function applyRefusal(
    failure: ApiFailure,
    checking: boolean,
    proposal: OrderProposal,
    previous: OrderProposal | undefined,
  ): void {
    if (ended(failure)) {
      onUnauthenticated();
      if (checking && attempt !== undefined) {
        // The check was refused, not the attempt: keep it for after sign-in.
        restorePending(attempt);
        show({ kind: 'unknown', attempt, checking: false });
        return;
      }
      clearAttempt();
      show({ kind: 'proposal', proposal, previous });
      return;
    }
    if (failure.code === 'CommandConflict' && attempt !== undefined) {
      const kept = keepAttempt({ ...attempt, state: 'conflict' });
      show({ kind: 'conflict', attempt: kept, checking: false });
      return;
    }
    if (checking && attempt !== undefined) {
      // Only the owner of the command can refuse it; any other refusal of the
      // check says nothing about the original attempt, so it stays unresolved.
      restorePending(attempt);
      show(
        { kind: 'unknown', attempt, checking: false },
        { kind: 'check-failed' },
      );
      return;
    }
    clearAttempt();
    show({ kind: 'refused', code: failure.code, proposal });
  }

  function settle(
    result: CommandResult<Envelope<ConfirmResult>>,
    checking: boolean,
    proposal: OrderProposal,
    previous: OrderProposal | undefined,
  ): void {
    if (disposed) return;
    // Serving answers ProposalNotFound with an unknown outcome, so the runner
    // keeps the attempt open; the code decides, not the outcome.
    if (
      result.kind !== 'committed' &&
      result.failure.code === 'ProposalNotFound'
    ) {
      commands.discard(key);
      clearAttempt();
      show({
        kind: 'not-found',
        afterAttempt: checking,
        checkedAt: checking ? now() : undefined,
      });
      return;
    }
    switch (result.kind) {
      case 'committed':
        applyResult(result.value.result, checking);
        return;
      case 'unknown':
        if (attempt !== undefined) {
          show({ kind: 'unknown', attempt, checking: false });
        }
        return;
      case 'reset':
        clearAttempt();
        show({ kind: 'reset' });
        return;
      case 'rejected':
        applyRefusal(result.failure, checking, proposal, previous);
        return;
    }
  }

  async function resolveAttempt(): Promise<void> {
    const current = phase;
    const saved = attempt;
    if (
      saved === undefined ||
      (current.kind !== 'pending' && current.kind !== 'conflict')
    ) {
      return;
    }
    cancelTimer?.();
    cancelTimer = undefined;
    show({ ...current, checking: true });
    let result: ConfirmResult;
    try {
      result = (
        await api.resolve(restaurantID, {
          commandID: saved.commandID,
          proposalID: saved.proposalID,
          runtimeEpoch: saved.runtimeEpoch,
        })
      ).result;
    } catch (error) {
      if (disposed) return;
      const failure =
        failureOf(error) ?? localFailure('Malformed', 'unavailable');
      if (ended(failure)) {
        onUnauthenticated();
        show({ ...current, checking: false });
        return;
      }
      if (wasReset(failure)) {
        clearAttempt();
        onReset();
        show({ kind: 'reset' });
        return;
      }
      if (failure.code === 'ProposalNotFound') {
        clearAttempt();
        show({ kind: 'not-found', afterAttempt: true, checkedAt: now() });
        return;
      }
      show({ ...current, checking: false }, { kind: 'check-failed' });
      return;
    }
    if (disposed) return;
    if (result.kind === 'ConfirmationPending') {
      const waiting = keepAttempt({ ...saved, state: 'pending' });
      show({ kind: 'pending', attempt: waiting, checking: false });
      return;
    }
    applyResult(result, true);
  }

  function edit(next: Draft): void {
    if (phase.kind !== 'compose') return;
    draft = next;
    save();
    show({ kind: 'compose' });
  }

  function editAgain(): void {
    if (attempt !== undefined || lockedPhases.has(phase.kind)) return;
    show({ kind: 'compose' });
  }

  async function prepare(): Promise<void> {
    if (!preparable.has(phase.kind) || attempt !== undefined) return;
    if (draft.length === 0) return;
    const bad = invalidLines(draft);
    if (bad.length > 0) {
      show({ kind: 'compose' }, { kind: 'portions', lines: bad });
      return;
    }
    const epoch = epochs.get(restaurantID, 'serving');
    if (epoch === undefined) {
      show({ kind: 'compose' }, { kind: 'prepare-failed' });
      return;
    }
    show({ kind: 'preparing' });
    let proposal: OrderProposal;
    try {
      proposal = (
        await api.prepare(
          restaurantID,
          draft.map((line) => ({
            dishID: line.dishID,
            portions: line.portions.trim(),
          })),
          epoch,
        )
      ).result;
    } catch (error) {
      if (disposed) return;
      const failure =
        failureOf(error) ?? localFailure('Malformed', 'unavailable');
      if (ended(failure)) onUnauthenticated();
      if (wasReset(failure)) onReset();
      show({ kind: 'compose' }, { kind: 'prepare-failed' });
      return;
    }
    if (disposed) return;
    latest = proposal;
    show(
      proposal.acceptedPositions.length === 0
        ? { kind: 'empty', proposal }
        : { kind: 'proposal', proposal, previous: undefined },
    );
  }

  async function confirm(): Promise<void> {
    if (phase.kind !== 'proposal' && phase.kind !== 'refused') return;
    const { proposal } = phase;
    const previous = phase.kind === 'proposal' ? phase.previous : undefined;
    show({ kind: 'confirming', proposal, previous });
    const result = await commands.run(confirmSpec(proposal));
    settle(result, false, proposal, previous);
  }

  async function check(): Promise<void> {
    const current = phase;
    if (current.kind === 'unknown' && !current.checking) {
      const saved = current.attempt;
      if (!commands.getSnapshot().some((item) => item.key === key)) {
        restorePending(saved);
      }
      show({ kind: 'unknown', attempt: saved, checking: true });
      const result = await commands.run(confirmSpec(saved.proposal));
      settle(result, true, saved.proposal, undefined);
      return;
    }
    if (
      (current.kind === 'pending' || current.kind === 'conflict') &&
      !current.checking
    ) {
      await resolveAttempt();
    }
  }

  if (attempt !== undefined) {
    if (attempt.state === 'sent') {
      restorePending(attempt);
      phase = { kind: 'unknown', attempt, checking: false };
    } else if (attempt.state === 'pending') {
      phase = { kind: 'pending', attempt, checking: false };
      scheduleResolve();
    } else {
      phase = { kind: 'conflict', attempt, checking: false };
    }
  }
  let snapshot: OrderSnapshot = view();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    add: (dishID) => {
      edit(addDish(draft, dishID));
    },
    setPortions: (lineNo, portions) => {
      edit(withPortions(draft, lineNo, portions));
    },
    remove: (lineNo) => {
      edit(removeLine(draft, lineNo));
    },
    prepare,
    confirm,
    check,
    openReplacement() {
      if (phase.kind === 'superseded' && phase.replacement !== undefined) {
        show({
          kind: 'proposal',
          proposal: phase.replacement,
          previous: undefined,
        });
      }
    },
    editAgain,
    async restart() {
      editAgain();
      await prepare();
    },
    dispose() {
      disposed = true;
      cancelTimer?.();
      cancelTimer = undefined;
    },
  };
}
