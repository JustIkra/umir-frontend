import type {
  DeliveryInput,
  DeliveryLineInput,
  DeliveryStorage,
  ShelfLife,
  StoredDelivery,
  StoredDeliveryAttempt,
  TimeInput,
} from '@/application/warehouse';
import type {
  DeliveryDraft,
  DeliveryLineDraft,
  ShelfLifeUnit,
} from '@/domain/delivery-draft';

export const deliveryKeyPrefix = 'umir.delivery.';

type KeyValue = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key'> & {
  readonly length: number;
};

const units: readonly ShelfLifeUnit[] = ['day', 'month'];
const occurrences = ['earlier', 'later'] as const;
const keyOf = (userID: string, restaurantID: string) =>
  `${deliveryKeyPrefix}${userID}.${restaurantID}`;

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isKey = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

// Every item must pass, otherwise the whole list is damaged.
function listOf<T>(
  value: unknown,
  item: (value: unknown) => T | undefined,
): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: T[] = [];
  for (const entry of value as readonly unknown[]) {
    const parsed = item(entry);
    if (parsed === undefined) return undefined;
    result.push(parsed);
  }
  return result;
}

function lineDraftOf(value: unknown): DeliveryLineDraft | undefined {
  if (!isObject(value)) return undefined;
  const {
    key,
    productID,
    quantity,
    manufacturedAt,
    shelfLifeValue,
    receivedAt,
  } = value;
  const shelfLifeUnit = units.find((unit) => unit === value.shelfLifeUnit);
  if (
    !isKey(key) ||
    typeof productID !== 'string' ||
    typeof quantity !== 'string' ||
    typeof manufacturedAt !== 'string' ||
    typeof shelfLifeValue !== 'string' ||
    shelfLifeUnit === undefined ||
    typeof receivedAt !== 'string'
  ) {
    return undefined;
  }
  return {
    key,
    productID,
    quantity,
    manufacturedAt,
    shelfLifeValue,
    shelfLifeUnit,
    receivedAt,
  };
}

// A draft has at least one line, and nextKey is above every key in use so
// that a new line never reuses one.
function draftOf(value: unknown): DeliveryDraft | undefined {
  if (!isObject(value)) return undefined;
  const { number, createdAt, nextKey } = value;
  const lines = listOf(value.lines, lineDraftOf);
  if (
    typeof number !== 'string' ||
    typeof createdAt !== 'string' ||
    !isKey(nextKey) ||
    lines === undefined ||
    lines.length === 0 ||
    lines.some((line) => line.key >= nextKey)
  ) {
    return undefined;
  }
  return { number, createdAt, lines, nextKey };
}

function timeOf(value: unknown): TimeInput | undefined {
  if (!isObject(value)) return undefined;
  if (typeof value.instant === 'string') return { instant: value.instant };
  const { civil } = value;
  if (!isObject(civil) || typeof civil.localDateTime !== 'string') {
    return undefined;
  }
  const { localDateTime } = civil;
  if (civil.occurrence === undefined) return { civil: { localDateTime } };
  const occurrence = occurrences.find((item) => item === civil.occurrence);
  return occurrence === undefined
    ? undefined
    : { civil: { localDateTime, occurrence } };
}

function shelfLifeOf(value: unknown): ShelfLife | undefined {
  if (!isObject(value) || typeof value.value !== 'string') return undefined;
  const unit = units.find((item) => item === value.unit);
  return unit === undefined ? undefined : { value: value.value, unit };
}

function lineInputOf(value: unknown): DeliveryLineInput | undefined {
  if (!isObject(value)) return undefined;
  const { productID, quantity } = value;
  const manufacturedAt = timeOf(value.manufacturedAt);
  const shelfLife = shelfLifeOf(value.shelfLife);
  const receivedAt = timeOf(value.receivedAt);
  if (
    typeof productID !== 'string' ||
    typeof quantity !== 'string' ||
    manufacturedAt === undefined ||
    shelfLife === undefined ||
    receivedAt === undefined
  ) {
    return undefined;
  }
  return { productID, manufacturedAt, shelfLife, receivedAt, quantity };
}

// The input is resent as is by «Проверить результат», so every field is
// checked: a damaged body must never reach the warehouse.
function inputOf(value: unknown): DeliveryInput | undefined {
  if (!isObject(value)) return undefined;
  const { deliveryID, number, expectedSettingsVersion } = value;
  const createdAt = timeOf(value.createdAt);
  const lines = listOf(value.lines, lineInputOf);
  if (
    typeof deliveryID !== 'string' ||
    typeof number !== 'string' ||
    typeof expectedSettingsVersion !== 'string' ||
    createdAt === undefined ||
    lines === undefined ||
    lines.length === 0
  ) {
    return undefined;
  }
  return { deliveryID, number, createdAt, expectedSettingsVersion, lines };
}

function attemptOf(value: unknown): StoredDeliveryAttempt | undefined {
  if (!isObject(value)) return undefined;
  const { commandID, epoch, startedAt } = value;
  const input = inputOf(value.input);
  if (
    typeof commandID !== 'string' ||
    typeof epoch !== 'string' ||
    typeof startedAt !== 'number' ||
    !Number.isFinite(startedAt) ||
    input === undefined
  ) {
    return undefined;
  }
  return { commandID, epoch, startedAt, input };
}

function recordOf(
  value: unknown,
  userID: string,
  restaurantID: string,
): StoredDelivery | undefined {
  if (!isObject(value) || value.userID !== userID) return undefined;
  if (value.restaurantID !== restaurantID) return undefined;
  const draft = draftOf(value.draft);
  const { deliveryID } = value;
  if (
    draft === undefined ||
    (deliveryID !== undefined && typeof deliveryID !== 'string')
  ) {
    return undefined;
  }
  let attempt: StoredDeliveryAttempt | undefined;
  if (value.attempt !== undefined) {
    attempt = attemptOf(value.attempt);
    if (attempt === undefined) return undefined;
  }
  return { userID, restaurantID, draft, deliveryID, attempt };
}

// The delivery draft and the unsettled receive attempt of one user in one
// restaurant, kept in this tab so that a reload checks the same attempt.
export function createDeliveryStore(
  storage: KeyValue | undefined,
): DeliveryStorage {
  function remove(key: string): void {
    try {
      storage?.removeItem(key);
    } catch {
      // Blocked storage holds nothing to remove.
    }
  }
  return {
    load(userID, restaurantID) {
      const key = keyOf(userID, restaurantID);
      let raw: string | null | undefined;
      try {
        raw = storage?.getItem(key);
      } catch {
        return undefined;
      }
      if (raw === null || raw === undefined) return undefined;
      let record: StoredDelivery | undefined;
      try {
        record = recordOf(JSON.parse(raw) as unknown, userID, restaurantID);
      } catch {
        record = undefined;
      }
      if (record === undefined) remove(key);
      return record;
    },
    save(record) {
      try {
        storage?.setItem(
          keyOf(record.userID, record.restaurantID),
          JSON.stringify(record),
        );
      } catch {
        // The delivery stays in memory only.
      }
    },
    clear(userID, restaurantID) {
      remove(keyOf(userID, restaurantID));
    },
    clearAll() {
      try {
        if (storage === undefined) return;
        for (let index = storage.length - 1; index >= 0; index -= 1) {
          const key = storage.key(index);
          if (key?.startsWith(deliveryKeyPrefix)) remove(key);
        }
      } catch {
        // Blocked storage holds no deliveries.
      }
    },
  };
}
