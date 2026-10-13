import type { Envelope, Service, Topic } from './api';
import type { EpochRegistry } from './epochs';
import {
  createReadModel,
  type LoadOptions,
  type ReadModel,
} from './read-model';

export interface ModelKey {
  readonly restaurantID: string | undefined;
  // The resource with its parameters, e.g. "warehouse/inventory".
  readonly resource: string;
  // Live stream topics whose change makes the model stale.
  readonly topics: readonly Topic[];
  readonly refreshOnTick?: boolean | undefined;
}

export interface ScopedKey extends ModelKey {
  readonly restaurantID: string;
  readonly service: Service;
}

// «Данные обновились»: a service of the restaurant restarted.
export interface RefreshNotice {
  readonly restaurantID: string;
}

export interface ModelRegistry {
  model<T>(
    key: ModelKey,
    load: (options: LoadOptions) => Promise<T>,
  ): ReadModel<T>;
  // A warehouse or serving read: records the runtime epoch of its envelope.
  scoped<T>(
    key: ScopedKey,
    load: (options: LoadOptions) => Promise<Envelope<T>>,
  ): ReadModel<Envelope<T>>;
  markStale(restaurantID: string, topics: readonly Topic[] | 'all'): void;
  markTime(restaurantID: string): void;
  reset(restaurantID: string): void;
  readonly subscribeNotice: (listener: () => void) => () => void;
  readonly getNotice: () => RefreshNotice | undefined;
  dismissNotice(): void;
  clear(): void;
}

interface Entry {
  readonly key: ModelKey;
  readonly model: ReadModel<unknown>;
}

export function createModelRegistry({
  now,
  epochs,
}: {
  readonly now: () => number;
  readonly epochs: EpochRegistry;
}): ModelRegistry {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  let notice: RefreshNotice | undefined;

  const idOf = (key: ModelKey) =>
    `${key.restaurantID ?? ''}\u0000${key.resource}`;

  function setNotice(next: RefreshNotice | undefined): void {
    notice = next;
    for (const listener of listeners) listener();
  }

  function stale(
    restaurantID: string,
    matches: (key: ModelKey) => boolean,
    except?: string,
  ): void {
    for (const [id, entry] of entries) {
      if (
        id !== except &&
        entry.key.restaurantID === restaurantID &&
        matches(entry.key)
      ) {
        entry.model.markStale('all');
      }
    }
  }

  function model<T>(
    key: ModelKey,
    load: (options: LoadOptions) => Promise<T>,
  ): ReadModel<T> {
    const existing = entries.get(idOf(key));
    if (existing) return existing.model as ReadModel<T>;
    const created = createReadModel(load, {
      refreshOnTick: key.refreshOnTick ?? false,
      now,
    });
    entries.set(idOf(key), { key, model: created });
    return created;
  }

  return {
    model,
    scoped(key, load) {
      const id = idOf(key);
      return model(key, async (options) => {
        const envelope = await load(options);
        const change = epochs.record(
          key.restaurantID,
          key.service,
          envelope.context.runtimeEpoch,
        );
        if (change === 'changed') {
          stale(key.restaurantID, () => true, id);
          setNotice({ restaurantID: key.restaurantID });
        }
        return envelope;
      });
    },
    markStale(restaurantID, topics) {
      stale(
        restaurantID,
        (key) =>
          topics === 'all' ||
          key.topics.some((topic) => topics.includes(topic)),
      );
    },
    markTime(restaurantID) {
      for (const entry of entries.values()) {
        if (
          entry.key.restaurantID === restaurantID &&
          entry.key.refreshOnTick
        ) {
          entry.model.markStale('time');
        }
      }
    },
    reset(restaurantID) {
      stale(restaurantID, () => true);
      setNotice({ restaurantID });
    },
    subscribeNotice(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getNotice: () => notice,
    dismissNotice() {
      if (notice) setNotice(undefined);
    },
    clear() {
      entries.clear();
      setNotice(undefined);
    },
  };
}
