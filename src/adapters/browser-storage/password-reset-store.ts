import type { ResetRecord, ResetStorage } from '@/application/password-reset';
import {
  challengeOf,
  isObject,
  proofOf,
  type KeyValue,
} from './challenge-record';

export const passwordResetKey = 'umir.passwordReset';

// A record of another shape (an older build, a hand edit) counts as none.
function recordOf(value: unknown): ResetRecord | undefined {
  if (!isObject(value)) return undefined;
  const { email } = value;
  const challenge = challengeOf(value.challenge);
  const proof = proofOf(value.proof);
  if (
    typeof email !== 'string' ||
    challenge === undefined ||
    proof === undefined
  ) {
    return undefined;
  }
  return { email, challenge, proof: proof.proof };
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
