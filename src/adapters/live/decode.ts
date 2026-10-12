import type { LiveEvent, SessionEndReason } from '@/application/live-feed';

export const liveEventNames = [
  'change',
  'tick',
  'session',
  'session-ended',
  'upstream',
] as const;

export type LiveEventName = (typeof liveEventNames)[number];

type Fields = Record<string, unknown>;

const maxInt64 = 9223372036854775807n;
const nonNegativeInt64 = /^(?:0|[1-9][0-9]{0,18})$/;
const moscowTimestamp =
  /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.[0-9]{1,9})?\+03:00$/;
const endReasons: readonly SessionEndReason[] = [
  'signed_out',
  'revoked',
  'expired',
];

// Accepts an object with exactly the given keys, like the contract's
// additionalProperties: false.
function fields(value: unknown, keys: readonly string[]): Fields | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const actual = Object.keys(value);
  return actual.length === keys.length &&
    keys.every((key) => actual.includes(key))
    ? (value as Fields)
    : undefined;
}

function decodeSeq(value: unknown): bigint | undefined {
  if (typeof value !== 'string' || !nonNegativeInt64.test(value)) {
    return undefined;
  }
  const seq = BigInt(value);
  return seq <= maxInt64 ? seq : undefined;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

// MoscowTimestamp: full RFC 3339 time with the +03:00 offset and a real date.
function isMoscowTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = moscowTimestamp.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return (
    month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
  );
}

function isEpoch(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const length = Array.from(value).length;
  return length >= 1 && length <= 64;
}

function isEndReason(value: unknown): value is SessionEndReason {
  return endReasons.some((reason) => reason === value);
}

// Returns undefined for anything the contract does not allow: invalid JSON,
// missing, extra or mistyped fields.
export function decodeLiveEvent(
  name: LiveEventName,
  data: unknown,
): LiveEvent | undefined {
  if (typeof data !== 'string') return undefined;
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return undefined;
  }
  switch (name) {
    case 'change': {
      const event = fields(value, ['epoch', 'seq']);
      const seq = decodeSeq(event?.seq);
      return event && isEpoch(event.epoch) && seq !== undefined
        ? { type: 'change', epoch: event.epoch, seq }
        : undefined;
    }
    case 'tick': {
      const event = fields(value, ['serverTime']);
      return event && isMoscowTimestamp(event.serverTime)
        ? { type: 'tick', serverTime: event.serverTime }
        : undefined;
    }
    case 'session': {
      const event = fields(value, ['idleExpiresAt', 'absoluteExpiresAt']);
      return event &&
        isMoscowTimestamp(event.idleExpiresAt) &&
        isMoscowTimestamp(event.absoluteExpiresAt)
        ? {
            type: 'session',
            idleExpiresAt: event.idleExpiresAt,
            absoluteExpiresAt: event.absoluteExpiresAt,
          }
        : undefined;
    }
    case 'session-ended': {
      const event = fields(value, ['reason']);
      return event && isEndReason(event.reason)
        ? { type: 'session-ended', reason: event.reason }
        : undefined;
    }
    case 'upstream': {
      const event = fields(value, ['available']);
      return event && typeof event.available === 'boolean'
        ? { type: 'upstream', available: event.available }
        : undefined;
    }
  }
}
