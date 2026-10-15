import type {
  RegisterRecord,
  RegisterStorage,
} from '@/application/registration';
import {
  challengeOf,
  isObject,
  proofOf,
  type KeyValue,
} from './challenge-record';

export const registrationKey = 'umir.register';

// A record of another shape (an older build, a hand edit) counts as none.
function recordOf(value: unknown): RegisterRecord | undefined {
  if (!isObject(value)) return undefined;
  const { email, displayName } = value;
  const challenge = challengeOf(value.challenge);
  const proof = proofOf(value.proof);
  if (
    typeof email !== 'string' ||
    typeof displayName !== 'string' ||
    challenge === undefined ||
    proof === undefined
  ) {
    return undefined;
  }
  return { email, displayName, challenge, proof: proof.proof };
}

// The registration step of this tab: a reload opens the same step. The proof
// works only in this browser (the code is bound to its preauth). The record
// is written field by field: the password the caller may hold never reaches
// the storage.
export function createRegistrationStore(
  storage: KeyValue | undefined,
): RegisterStorage {
  function remove(): void {
    try {
      storage?.removeItem(registrationKey);
    } catch {
      // Blocked storage holds nothing to remove.
    }
  }
  return {
    load() {
      let raw: string | null | undefined;
      try {
        raw = storage?.getItem(registrationKey);
      } catch {
        return undefined;
      }
      if (raw === null || raw === undefined) return undefined;
      let record: RegisterRecord | undefined;
      try {
        record = recordOf(JSON.parse(raw) as unknown);
      } catch {
        record = undefined;
      }
      if (record === undefined) remove();
      return record;
    },
    save({ email, displayName, challenge, proof }) {
      try {
        storage?.setItem(
          registrationKey,
          JSON.stringify({ email, displayName, challenge, proof }),
        );
      } catch {
        // The flow keeps the step in memory only.
      }
    },
    clear: remove,
  };
}
