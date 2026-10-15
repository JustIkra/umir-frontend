import type {
  AttemptBody,
  AttemptDiscard,
  AttemptEntry,
  AttemptKind,
  AttemptList,
  AttemptLoad,
  AttemptRecord,
  AttemptRef,
  AttemptStore,
  AttemptWrite,
} from '@/application/attempt-store';
import type { DishInput, ProductInput } from '@/application/restaurant';
import type { CivilTime, DeliveryInput } from '@/application/warehouse';
import { baseUnits, type BaseUnit } from '@/domain/quantity';

export const attemptKeyPrefix = 'umir.attempt.';

const version = 1;
const kinds: readonly AttemptKind[] = [
  'delivery',
  'writeoff',
  'product',
  'dish',
];
// Quantities are decimal strings of thousandths, without leading zeros.
const quantityPattern = /^[1-9][0-9]{0,17}$/;

type KeyValue = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key'> & {
  readonly length: number;
};
type Fields = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Parts of a key are joined by dots, so a part holds none.
const isKeyPart = (value: unknown): value is string =>
  typeof value === 'string' && value !== '' && !value.includes('.');

const kindOf = (value: unknown): AttemptKind | undefined =>
  kinds.find((kind) => kind === value);

const text = (value: unknown): value is string => typeof value === 'string';

function keyOf(ref: AttemptRef): string | undefined {
  const parts = [ref.kind, ref.userID, ref.restaurantID];
  if (ref.kind === 'writeoff') parts.push(ref.batchID);
  return parts.every(isKeyPart)
    ? `${attemptKeyPrefix}${parts.join('.')}`
    : undefined;
}

// The reverse of keyOf for the keys of one user; other keys are not ours.
function refOfKey(key: string, userID: string): AttemptRef | undefined {
  if (!key.startsWith(attemptKeyPrefix)) return undefined;
  const parts = key.slice(attemptKeyPrefix.length).split('.');
  const [name, owner, restaurantID, batchID] = parts;
  const kind = kindOf(name);
  if (kind === undefined || owner !== userID || !isKeyPart(restaurantID)) {
    return undefined;
  }
  if (kind === 'writeoff') {
    return parts.length === 4 && isKeyPart(batchID)
      ? { kind, userID, restaurantID, batchID }
      : undefined;
  }
  return parts.length === 3 ? { kind, userID, restaurantID } : undefined;
}

function civilOf(value: unknown): CivilTime | undefined {
  if (!isObject(value) || !isObject(value.civil)) return undefined;
  const { localDateTime } = value.civil;
  return text(localDateTime) ? { civil: { localDateTime } } : undefined;
}

function lineOf(value: unknown): DeliveryInput['lines'][number] | undefined {
  if (!isObject(value) || !isObject(value.shelfLife)) return undefined;
  const { productID, quantity, shelfLife } = value;
  const manufacturedAt = civilOf(value.manufacturedAt);
  const receivedAt = civilOf(value.receivedAt);
  const unit =
    shelfLife.unit === 'day' || shelfLife.unit === 'month'
      ? shelfLife.unit
      : undefined;
  if (
    !text(productID) ||
    !text(quantity) ||
    !quantityPattern.test(quantity) ||
    manufacturedAt === undefined ||
    receivedAt === undefined ||
    !text(shelfLife.value) ||
    unit === undefined
  ) {
    return undefined;
  }
  return {
    productID,
    quantity,
    manufacturedAt,
    receivedAt,
    shelfLife: { value: shelfLife.value, unit },
  };
}

function listOf<T>(
  value: unknown,
  itemOf: (item: unknown) => T | undefined,
): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: T[] = [];
  for (const raw of value as readonly unknown[]) {
    const item = itemOf(raw);
    if (item === undefined) return undefined;
    items.push(item);
  }
  return items;
}

function deliveryOf(value: unknown): DeliveryInput | undefined {
  if (!isObject(value)) return undefined;
  const { deliveryID, number, expectedSettingsVersion } = value;
  const createdAt = civilOf(value.createdAt);
  const lines = listOf(value.lines, lineOf);
  return text(deliveryID) &&
    text(number) &&
    text(expectedSettingsVersion) &&
    createdAt !== undefined &&
    lines !== undefined
    ? { deliveryID, number, createdAt, expectedSettingsVersion, lines }
    : undefined;
}

const unitOf = (value: unknown): BaseUnit | undefined =>
  baseUnits.find((unit) => unit === value);

function productOf(value: unknown): ProductInput | undefined {
  if (!isObject(value)) return undefined;
  const { productID, name } = value;
  const baseUnit = unitOf(value.baseUnit);
  return text(productID) && text(name) && baseUnit !== undefined
    ? { productID, name, baseUnit }
    : undefined;
}

function ingredientOf(
  value: unknown,
): DishInput['ingredients'][number] | undefined {
  if (!isObject(value)) return undefined;
  const { productID, quantity } = value;
  const baseUnit = unitOf(value.baseUnit);
  return text(productID) &&
    text(quantity) &&
    quantityPattern.test(quantity) &&
    baseUnit !== undefined
    ? { productID, quantity, baseUnit }
    : undefined;
}

function dishOf(value: unknown): DishInput | undefined {
  if (!isObject(value)) return undefined;
  const { dishID, name } = value;
  const ingredients = listOf(value.ingredients, ingredientOf);
  return text(dishID) && text(name) && ingredients !== undefined
    ? { dishID, name, ingredients }
    : undefined;
}

// Copies only the fields of the kind: nothing else is ever stored or read.
function bodyOf(kind: AttemptKind, payload: unknown): AttemptBody | undefined {
  if (!isObject(payload)) return undefined;
  switch (kind) {
    case 'delivery': {
      const input = deliveryOf(payload.input);
      return input !== undefined && text(payload.timeZone)
        ? { kind, payload: { input, timeZone: payload.timeZone } }
        : undefined;
    }
    case 'writeoff':
      return isKeyPart(payload.batchID)
        ? { kind, payload: { batchID: payload.batchID } }
        : undefined;
    case 'product': {
      const input = productOf(payload);
      return input === undefined ? undefined : { kind, payload: input };
    }
    case 'dish': {
      const input = dishOf(payload);
      return input === undefined ? undefined : { kind, payload: input };
    }
  }
}

// The value belongs to the key: a record under another user, restaurant,
// kind or batch than the key names is damaged, not someone else's.
function recordOf(value: unknown, ref: AttemptRef): AttemptRecord | undefined {
  if (!isObject(value) || value.v !== version) return undefined;
  const { commandID, epoch, startedAt } = value;
  if (
    value.kind !== ref.kind ||
    value.userID !== ref.userID ||
    value.restaurantID !== ref.restaurantID ||
    !text(commandID) ||
    commandID === '' ||
    (epoch !== undefined && !text(epoch)) ||
    typeof startedAt !== 'number' ||
    !Number.isFinite(startedAt)
  ) {
    return undefined;
  }
  const body = bodyOf(ref.kind, value.payload);
  if (body === undefined) return undefined;
  if (
    ref.kind === 'writeoff' &&
    (body.kind !== 'writeoff' || body.payload.batchID !== ref.batchID)
  ) {
    return undefined;
  }
  return {
    ...body,
    userID: ref.userID,
    restaurantID: ref.restaurantID,
    commandID,
    epoch,
    startedAt,
  };
}

function refOfRecord(record: AttemptRecord): AttemptRef {
  const { userID, restaurantID } = record;
  if (record.kind === 'writeoff') {
    return {
      kind: 'writeoff',
      userID,
      restaurantID,
      batchID: record.payload.batchID,
    };
  }
  return { kind: record.kind, userID, restaurantID };
}

type Parsed =
  | { readonly status: 'ok'; readonly record: AttemptRecord }
  | { readonly status: 'corrupt' };

function parse(raw: string, ref: AttemptRef): Parsed {
  try {
    const record = recordOf(JSON.parse(raw) as unknown, ref);
    return record === undefined
      ? { status: 'corrupt' }
      : { status: 'ok', record };
  } catch {
    return { status: 'corrupt' };
  }
}

// The unsettled commands of one user in one tab: delivery, write-off, product
// and dish. Unlike the order store, an unreadable record is never removed
// here: only discardCorrupt does that, when the user asks for it.
export function createAttemptStore(
  storage: KeyValue | undefined,
): AttemptStore {
  return {
    load(ref): AttemptLoad {
      const key = keyOf(ref);
      if (storage === undefined) return { status: 'unavailable' };
      if (key === undefined) return { status: 'absent' };
      try {
        const raw = storage.getItem(key);
        return raw === null ? { status: 'absent' } : parse(raw, ref);
      } catch {
        return { status: 'unavailable' };
      }
    },
    list(userID): AttemptList {
      if (storage === undefined) return { status: 'unavailable' };
      const entries: AttemptEntry[] = [];
      try {
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          const ref = key === null ? undefined : refOfKey(key, userID);
          if (key === null || ref === undefined) continue;
          const raw = storage.getItem(key);
          if (raw !== null) entries.push({ ref, result: parse(raw, ref) });
        }
      } catch {
        return { status: 'unavailable' };
      }
      return { status: 'ok', entries };
    },
    save(record): AttemptWrite {
      if (storage === undefined) return 'unavailable';
      const ref = refOfRecord(record);
      const key = keyOf(ref);
      // Rebuilt from the known fields, so that nothing else is stored.
      const clean = recordOf({ v: version, ...record }, ref);
      if (key === undefined || clean === undefined) return 'unavailable';
      try {
        storage.setItem(key, JSON.stringify({ v: version, ...clean }));
        return 'ok';
      } catch {
        return 'unavailable';
      }
    },
    remove(ref): AttemptWrite {
      if (storage === undefined) return 'unavailable';
      const key = keyOf(ref);
      if (key === undefined) return 'ok';
      try {
        storage.removeItem(key);
        return 'ok';
      } catch {
        return 'unavailable';
      }
    },
    discardCorrupt(ref): AttemptDiscard {
      if (storage === undefined) return 'unavailable';
      const key = keyOf(ref);
      if (key === undefined) return 'refused';
      try {
        const raw = storage.getItem(key);
        if (raw === null || parse(raw, ref).status === 'ok') return 'refused';
        storage.removeItem(key);
        return 'ok';
      } catch {
        return 'unavailable';
      }
    },
  };
}
