import type {
  AcceptMode,
  AcceptRecord,
  AcceptStorage,
} from '@/application/invitation-acceptance';
import { isEntityId } from '@/domain/ids';
import {
  challengeOf,
  isObject,
  proofOf,
  type KeyValue,
} from './challenge-record';

export const invitationKey = 'umir.invite';

const modes: readonly AcceptMode[] = ['register', 'accept'];

// A record of another shape (an older build, a hand edit) counts as none.
function recordOf(value: unknown): AcceptRecord | undefined {
  if (!isObject(value)) return undefined;
  const { invitationID, displayName } = value;
  const mode = modes.find((item) => item === value.mode);
  const challenge = challengeOf(value.challenge);
  const proof = proofOf(value.proof);
  if (
    !isEntityId(invitationID) ||
    mode === undefined ||
    typeof displayName !== 'string' ||
    challenge === undefined ||
    proof === undefined
  ) {
    return undefined;
  }
  return { invitationID, mode, displayName, challenge, proof: proof.proof };
}

// The invitation step of this tab: a reload opens the same step. The proof
// works only in this browser (the code is bound to its session or preauth).
// The record is written field by field: the password the caller may hold
// never reaches the storage.
export function createInvitationStore(
  storage: KeyValue | undefined,
): AcceptStorage {
  function remove(): void {
    try {
      storage?.removeItem(invitationKey);
    } catch {
      // Blocked storage holds nothing to remove.
    }
  }
  return {
    load() {
      let raw: string | null | undefined;
      try {
        raw = storage?.getItem(invitationKey);
      } catch {
        return undefined;
      }
      if (raw === null || raw === undefined) return undefined;
      let record: AcceptRecord | undefined;
      try {
        record = recordOf(JSON.parse(raw) as unknown);
      } catch {
        record = undefined;
      }
      if (record === undefined) remove();
      return record;
    },
    save({ invitationID, mode, displayName, challenge, proof }) {
      try {
        storage?.setItem(
          invitationKey,
          JSON.stringify({ invitationID, mode, displayName, challenge, proof }),
        );
      } catch {
        // The flow keeps the step in memory only.
      }
    },
    clear: remove,
  };
}
