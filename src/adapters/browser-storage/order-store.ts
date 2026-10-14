import type {
  AttemptState,
  OrderStorage,
  StoredAttempt,
  StoredOrder,
} from '@/application/restaurant';
import type { DraftLine } from '@/domain/order-draft';

export const orderKeyPrefix = 'umir.order.';

type KeyValue = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key'> & {
  readonly length: number;
};

const states: readonly AttemptState[] = ['sent', 'pending', 'conflict'];
const keyOf = (userID: string, restaurantID: string) =>
  `${orderKeyPrefix}${userID}.${restaurantID}`;

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function lineOf(value: unknown): DraftLine | undefined {
  if (!isObject(value)) return undefined;
  const { lineNo, dishID, portions } = value;
  return typeof lineNo === 'number' &&
    Number.isInteger(lineNo) &&
    lineNo > 0 &&
    typeof dishID === 'string' &&
    typeof portions === 'string'
    ? { lineNo, dishID, portions }
    : undefined;
}

// The proposal is this tab's own copy of a decoded answer; its top-level
// shape is checked so that a damaged record never reaches the screens.
function attemptOf(value: unknown): StoredAttempt | undefined {
  if (!isObject(value)) return undefined;
  const { commandID, proposalID, runtimeEpoch, startedAt, proposal } = value;
  const state = states.find((item) => item === value.state);
  if (
    typeof commandID !== 'string' ||
    typeof proposalID !== 'string' ||
    typeof runtimeEpoch !== 'string' ||
    typeof startedAt !== 'number' ||
    !Number.isFinite(startedAt) ||
    state === undefined ||
    !isObject(proposal) ||
    typeof proposal.proposalID !== 'string' ||
    !Array.isArray(proposal.acceptedPositions) ||
    !Array.isArray(proposal.requestedPositions) ||
    !Array.isArray(proposal.changes)
  ) {
    return undefined;
  }
  return {
    commandID,
    proposalID,
    runtimeEpoch,
    startedAt,
    state,
    proposal: proposal as unknown as StoredAttempt['proposal'],
  };
}

function recordOf(
  value: unknown,
  userID: string,
  restaurantID: string,
): StoredOrder | undefined {
  if (!isObject(value) || value.userID !== userID) return undefined;
  if (value.restaurantID !== restaurantID || !Array.isArray(value.lines)) {
    return undefined;
  }
  const lines: DraftLine[] = [];
  for (const item of value.lines as readonly unknown[]) {
    const line = lineOf(item);
    if (line === undefined) return undefined;
    lines.push(line);
  }
  let attempt: StoredAttempt | undefined;
  if (value.attempt !== undefined) {
    attempt = attemptOf(value.attempt);
    if (attempt === undefined) return undefined;
  }
  return { userID, restaurantID, lines, attempt };
}

// The order draft and the unsettled confirmation of one user in one
// restaurant, kept in this tab so that a reload checks the same attempt.
export function createOrderStore(storage: KeyValue | undefined): OrderStorage {
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
      let record: StoredOrder | undefined;
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
        // The order stays in memory only.
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
          if (key?.startsWith(orderKeyPrefix)) remove(key);
        }
      } catch {
        // Blocked storage holds no orders.
      }
    },
  };
}
