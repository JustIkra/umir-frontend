import type { Topic } from '@/application/api';
import type { AccessEndReason, LiveEvent } from '@/application/live-feed';
import { isEntityId } from '@/domain/ids';

export const liveEventNames = [
  'change',
  'refresh-required',
  'access-ended',
] as const;

export type LiveEventName = (typeof liveEventNames)[number];

type Fields = Readonly<Record<string, unknown>>;

const maxInt64 = 9223372036854775807n;
const positiveInt64 = /^[1-9][0-9]{0,18}$/;
const topics: readonly Topic[] = [
  'catalog',
  'stock',
  'menu',
  'orders',
  'analytics',
];
const reasons: readonly AccessEndReason[] = [
  'revoked',
  'deleted',
  'session-expired',
  'auth-unavailable',
];

function fieldsOf(value: unknown): Fields | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Fields)
    : undefined;
}

function sequenceOf(value: unknown): bigint | undefined {
  if (typeof value !== 'string' || !positiveInt64.test(value)) return undefined;
  const sequence = BigInt(value);
  return sequence <= maxInt64 ? sequence : undefined;
}

// 1–5 known topics, none repeated.
function topicsOf(value: unknown): readonly Topic[] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5)
    return undefined;
  const list = value.map((item: unknown) =>
    topics.find((topic) => topic === item),
  );
  if (list.some((item) => item === undefined)) return undefined;
  const known = list.filter((item): item is Topic => item !== undefined);
  return new Set(known).size === known.length ? known : undefined;
}

// Returns undefined for anything the contract does not allow: invalid JSON,
// a type other than the SSE event name, missing or mistyped fields. Fields
// the contract may add later are ignored.
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
  const event = fieldsOf(value);
  if (event?.type !== name || !isEntityId(event.tenantID)) return undefined;
  const tenantID = event.tenantID;
  switch (name) {
    case 'change': {
      const sequence = sequenceOf(event.sequence);
      const list = topicsOf(event.topics);
      return isEntityId(event.epoch) && sequence !== undefined && list
        ? {
            type: 'change',
            tenantID,
            epoch: event.epoch,
            sequence,
            topics: list,
          }
        : undefined;
    }
    case 'refresh-required':
      return isEntityId(event.epoch)
        ? { type: 'refresh-required', tenantID, epoch: event.epoch }
        : undefined;
    case 'access-ended': {
      const reason = reasons.find((item) => item === event.reason);
      return reason ? { type: 'access-ended', tenantID, reason } : undefined;
    }
  }
}
