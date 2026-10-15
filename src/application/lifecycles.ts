import { failureOf } from './api';
import type { Scheduler } from './live-sync';
import type { OperationKind } from './organization-commands';
import type { Lifecycle, OrganizationsApi } from './organizations';

// Follows the preparation of a new restaurant and the deletion of a
// restaurant or an organization: Auth finishes them after the answer, and
// GET /orgs/{orgID}/lifecycle/{operationID} tells how far it got.

export type OperationStatus = 'following' | 'finished' | 'stalled' | 'lost';

export interface FollowedOperation {
  readonly kind: OperationKind;
  readonly name: string;
  readonly orgID: string;
  readonly operationID: string;
  readonly lifecycle: Lifecycle; // the latest observation
  readonly status: OperationStatus;
  readonly startedAt: number;
}

export interface LifecycleTracker {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => readonly FollowedOperation[];
  follow(kind: OperationKind, name: string, lifecycle: Lifecycle): void;
  // NE09, RS07: watch a stalled operation again from the first delay.
  retry(operationID: string): void;
  forget(operationID: string): void;
  clear(): void;
}

export interface LifecycleTrackerOptions {
  readonly api: Pick<OrganizationsApi, 'lifecycle'>;
  readonly scheduler: Scheduler;
  readonly now: () => number;
  // Finished or lost: organizations and restaurants changed.
  readonly onSettled: () => void;
}

// Auth's own reconciliation backs off the same way (backend-v2.md:79).
export const pollDelaysMs: readonly number[] = [
  1000, 2000, 4000, 8000, 16000, 30000,
];
export const stallAfterMs = 90_000;

// The statuses of a poll that mean the operation can no longer be read: the
// reader lost the right, or the organization is gone.
const lostStatuses: readonly number[] = [403, 404, 410];

export function isFinished(kind: OperationKind, lifecycle: Lifecycle): boolean {
  return kind === 'create-organization' || kind === 'create-restaurant'
    ? lifecycle.lifecycle === 'ready'
    : lifecycle.lifecycle === 'deleted' && lifecycle.cleanup === 'complete';
}

interface Entry {
  operation: FollowedOperation;
  // The index of the next delay.
  step: number;
  cancel: (() => void) | undefined;
}

export function createLifecycleTracker({
  api,
  scheduler,
  now,
  onSettled,
}: LifecycleTrackerOptions): LifecycleTracker {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  let snapshot: readonly FollowedOperation[] = [];

  function publish(): void {
    snapshot = [...entries.values()].map((entry) => entry.operation);
    for (const listener of [...listeners]) listener();
  }

  function update(entry: Entry, changes: Partial<FollowedOperation>): void {
    entry.operation = { ...entry.operation, ...changes };
    publish();
  }

  function settle(entry: Entry, status: 'finished' | 'lost'): void {
    entry.cancel = undefined;
    update(entry, { status });
    onSettled();
  }

  function schedule(entry: Entry): void {
    const remaining = entry.operation.startedAt + stallAfterMs - now();
    if (remaining <= 0) {
      entry.cancel = undefined;
      update(entry, { status: 'stalled' });
      return;
    }
    const delay = Math.min(
      pollDelaysMs[Math.min(entry.step, pollDelaysMs.length - 1)] ?? 0,
      remaining,
    );
    entry.step += 1;
    entry.cancel = scheduler.schedule(delay, () => {
      entry.cancel = undefined;
      void poll(entry);
    });
  }

  async function poll(entry: Entry): Promise<void> {
    const { orgID, operationID, kind } = entry.operation;
    let lifecycle: Lifecycle;
    try {
      lifecycle = await api.lifecycle(orgID, operationID);
    } catch (error) {
      if (entries.get(operationID) !== entry) return;
      const status = failureOf(error)?.status;
      if (status !== undefined && lostStatuses.includes(status)) {
        settle(entry, 'lost');
        return;
      }
      schedule(entry);
      return;
    }
    // Forgotten, cleared or watched anew while the request was running.
    if (entries.get(operationID) !== entry) return;
    if (isFinished(kind, lifecycle)) {
      entry.operation = { ...entry.operation, lifecycle };
      settle(entry, 'finished');
      return;
    }
    entry.operation = { ...entry.operation, lifecycle };
    publish();
    schedule(entry);
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    follow(kind, name, lifecycle) {
      if (entries.has(lifecycle.operationID)) return;
      const entry: Entry = {
        operation: {
          kind,
          name,
          orgID: lifecycle.orgID,
          operationID: lifecycle.operationID,
          lifecycle,
          status: 'following',
          startedAt: now(),
        },
        step: 0,
        cancel: undefined,
      };
      entries.set(lifecycle.operationID, entry);
      if (isFinished(kind, lifecycle)) {
        settle(entry, 'finished');
        return;
      }
      publish();
      schedule(entry);
    },
    retry(operationID) {
      const entry = entries.get(operationID);
      if (entry?.operation.status !== 'stalled') return;
      entry.step = 0;
      update(entry, { status: 'following', startedAt: now() });
      schedule(entry);
    },
    forget(operationID) {
      const entry = entries.get(operationID);
      if (entry === undefined) return;
      entry.cancel?.();
      entries.delete(operationID);
      publish();
    },
    clear() {
      for (const entry of entries.values()) entry.cancel?.();
      entries.clear();
      publish();
    },
  };
}
