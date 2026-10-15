import type { Challenge, ChallengeState } from '@/application/account';
import type { Instant } from '@/application/api';
import { isEntityId } from '@/domain/ids';

// Reading a saved email-code challenge back: shared by the stores of the
// password reset and of the invitation.

export type KeyValue = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const states: readonly ChallengeState[] = [
  'pending',
  'verified',
  'completed',
  'expired',
  'locked',
];

export const isObject = (
  value: unknown,
): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function instantOf(value: unknown): Instant | undefined {
  if (!isObject(value)) return undefined;
  const { iso, epochMs } = value;
  return typeof iso === 'string' &&
    typeof epochMs === 'number' &&
    Number.isFinite(epochMs)
    ? { iso, epochMs }
    : undefined;
}

export function challengeOf(value: unknown): Challenge | undefined {
  if (!isObject(value)) return undefined;
  const { challengeID } = value;
  const expiresAt = instantOf(value.expiresAt);
  const resendAvailableAt = instantOf(value.resendAvailableAt);
  const state = states.find((item) => item === value.state);
  if (
    !isEntityId(challengeID) ||
    expiresAt === undefined ||
    resendAvailableAt === undefined ||
    state === undefined
  ) {
    return undefined;
  }
  return { challengeID, expiresAt, resendAvailableAt, state };
}

// The proof of a verified challenge: absent, or a non-empty string.
export function proofOf(
  value: unknown,
): { readonly proof: string | undefined } | undefined {
  if (value === undefined) return { proof: undefined };
  return typeof value === 'string' && value !== ''
    ? { proof: value }
    : undefined;
}
