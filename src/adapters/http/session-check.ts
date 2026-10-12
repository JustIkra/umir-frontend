import { readRequestInit } from '@/adapters/http/read-request';
import type { SessionCheck } from '@/application/live-sync';

export const sessionCheckPath = '/api/operator/me';

export type SendRequest = (
  path: string,
  init: RequestInit,
) => Promise<{ readonly status: number }>;

// A background read of the operator profile: 401 means the session ended.
// Any other answer, or none, leaves the state unknown. The read never extends
// the session.
export function createSessionCheck(send: SendRequest): SessionCheck {
  return {
    async check() {
      try {
        const { status } = await send(
          sessionCheckPath,
          readRequestInit({ background: true }),
        );
        if (status === 200) return 'active';
        return status === 401 ? 'ended' : 'unknown';
      } catch {
        return 'unknown';
      }
    },
  };
}
