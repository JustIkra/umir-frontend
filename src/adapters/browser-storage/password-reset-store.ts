import type { Challenge, ChallengeState } from '@/application/account';
import type { Instant } from '@/application/api';
import type { ResetRecord, ResetStorage } from '@/application/password-reset';
import { isEntityId } from '@/domain/ids';

export const passwordResetKey = 'umir.passwordReset';

type KeyValue = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const states: readonly ChallengeState[] = [
  'pending',
  'verified',
  'completed',
  'expired',
  'locked',
];

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
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

function challengeOf(value: unknown): Challenge | undefined {
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

// A record of another shape (an older build, a hand edit) counts as none.
function recordOf(value: unknown): ResetRecord | undefined {
  if (!isObject(value)) return undefined;
  const { email, proof } = value;
  const challenge = challengeOf(value.challenge);
  if (typeof email !== 'string' || challenge === undefined) return undefined;
  if (proof !== undefined && (typeof proof !== 'string' || proof === '')) {
    return undefined;
  }
  return {
    email,
    challenge,
    proof: typeof proof === 'string' ? proof : undefined,
  };
}

// The reset step of this tab: a reload opens the same step. The proof works
// only in this browser (it is bound to the preauth cookie).
export function createPasswordResetStore(
  storage: KeyValue | undefined,
): ResetStorage {
  function remove(): void {
    try {
      storage?.removeItem(passwordResetKey);
    } catch {
      // Blocked storage holds nothing to remove.
    }
  }
  return {
    load() {
      let raw: string | null | undefined;
      try {
        raw = storage?.getItem(passwordResetKey);
      } catch {
        return undefined;
      }
      if (raw === null || raw === undefined) return undefined;
      let record: ResetRecord | undefined;
      try {
        record = recordOf(JSON.parse(raw) as unknown);
      } catch {
        record = undefined;
      }
      if (record === undefined) remove();
      return record;
    },
    save(record) {
      try {
        storage?.setItem(passwordResetKey, JSON.stringify(record));
      } catch {
        // The flow keeps the step in memory only.
      }
    },
    clear: remove,
  };
}
