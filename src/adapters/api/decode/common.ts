import {
  ApiError,
  localFailure,
  type ApiFailure,
  type Instant,
  type Outcome,
} from '@/application/api';
import { isEntityId } from '@/domain/ids';

// Decoders return the value or throw DecodeError. Required fields and their
// types are checked; fields the contract may add later are ignored.
export class DecodeError extends Error {
  constructor(path: string, problem: string) {
    super(`${path}: ${problem}`);
    this.name = 'DecodeError';
  }
}

export type Fields = Readonly<Record<string, unknown>>;

export function object(value: unknown, path: string): Fields {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DecodeError(path, 'not an object');
  }
  return value as Fields;
}

export function string(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new DecodeError(path, 'not a string');
  return value;
}

export function nonEmptyString(value: unknown, path: string): string {
  const text = string(value, path);
  if (text === '') throw new DecodeError(path, 'empty');
  return text;
}

export function optionalString(
  value: unknown,
  path: string,
): string | undefined {
  return value === undefined ? undefined : string(value, path);
}

export function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new DecodeError(path, 'not a boolean');
  return value;
}

export function array<T>(
  value: unknown,
  path: string,
  item: (entry: unknown, path: string) => T,
): readonly T[] {
  if (!Array.isArray(value)) throw new DecodeError(path, 'not an array');
  return value.map((entry: unknown, index) =>
    item(entry, `${path}[${String(index)}]`),
  );
}

export function oneOf<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
): T {
  const found = allowed.find((option) => option === value);
  if (found === undefined) {
    throw new DecodeError(path, `not one of ${allowed.join(', ')}`);
  }
  return found;
}

export function entityId(value: unknown, path: string): string {
  if (!isEntityId(value)) throw new DecodeError(path, 'not an entity id');
  return value;
}

const maxInt64 = 9223372036854775807n;
const int64Pattern = /^(?:0|[1-9][0-9]{0,18})$/;

// Integers travel as decimal strings and stay strings: Number would lose
// precision above 2^53.
export function nonNegativeInt64(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    !int64Pattern.test(value) ||
    BigInt(value) > maxInt64
  ) {
    throw new DecodeError(path, 'not a non-negative int64 string');
  }
  return value;
}

export function positiveInt64(value: unknown, path: string): string {
  const text = nonNegativeInt64(value, path);
  if (text === '0') throw new DecodeError(path, 'not positive');
  return text;
}

const instantPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.([0-9]{1,9}))?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

// RFC 3339 with seconds, a real calendar date and an explicit offset. The
// fraction is cut to milliseconds before Date.parse, which reads at most three
// digits reliably.
export function instant(value: unknown, path: string): Instant {
  const text = string(value, path);
  const match = instantPattern.exec(text);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  if (
    !match ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    throw new DecodeError(path, 'not an RFC 3339 instant');
  }
  const fraction = match[4];
  const normalized =
    fraction === undefined
      ? text
      : text.replace(`.${fraction}`, `.${fraction.padEnd(3, '0').slice(0, 3)}`);
  const epochMs = Date.parse(normalized);
  if (Number.isNaN(epochMs)) {
    throw new DecodeError(path, 'not an RFC 3339 instant');
  }
  return { iso: text, epochMs };
}

const outcomes: readonly Outcome[] = [
  'committed',
  'not_committed',
  'unknown',
  'unavailable',
  'indeterminate',
];

// The contract's #Error. An unknown code is kept as text; an unknown outcome
// or a missing retryable makes the answer malformed.
export function decodeFailure(status: number, body: unknown): ApiFailure {
  const error = object(body, 'error');
  const details =
    error.details === undefined ? {} : object(error.details, 'error.details');
  const fields =
    error.fieldErrors === undefined
      ? {}
      : object(error.fieldErrors, 'error.fieldErrors');
  const fieldErrors: Record<string, string> = {};
  for (const [name, message] of Object.entries(fields)) {
    fieldErrors[name] = string(message, `error.fieldErrors.${name}`);
  }
  const retryAfter = details.retryAfterSeconds;
  let retryAfterSeconds: number | undefined;
  if (retryAfter !== undefined) {
    if (
      typeof retryAfter !== 'number' ||
      !Number.isInteger(retryAfter) ||
      retryAfter < 1
    ) {
      throw new DecodeError('error.details.retryAfterSeconds', 'not a count');
    }
    retryAfterSeconds = retryAfter;
  }
  string(error.message, 'error.message');
  return {
    status,
    code: nonEmptyString(error.code, 'error.code'),
    outcome: oneOf(error.outcome, 'error.outcome', outcomes),
    retryable: boolean(error.retryable, 'error.retryable'),
    retryAfterSeconds,
    currentEpoch:
      details.currentEpoch === undefined
        ? undefined
        : entityId(details.currentEpoch, 'error.details.currentEpoch'),
    fieldErrors,
    sessionRevoked:
      error.sessionRevoked === undefined
        ? false
        : boolean(error.sessionRevoked, 'error.sessionRevoked'),
  };
}

// Wraps a decoder for a 2xx body: a contract mismatch becomes ApiError
// Malformed with the outcome the caller states (unavailable for reads,
// unknown for commands).
export function decoded<T>(
  decode: (body: unknown) => T,
  outcome: Outcome,
): (body: unknown) => T {
  return (body) => {
    try {
      return decode(body);
    } catch (error) {
      if (error instanceof DecodeError) {
        throw new ApiError(localFailure('Malformed', outcome, 200));
      }
      throw error;
    }
  };
}
