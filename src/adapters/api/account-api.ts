import type { AccountApi } from '@/application/account';
import type { GatewayClient } from '@/adapters/http/gateway-client';
import type { components } from './backend-v2';
import { decodeUserView } from './decode/account';
import { decoded } from './decode/common';

export const mePath = '/api/v2/me';
export const sessionPath = '/api/v2/session';

const readUser = decoded(decodeUserView, 'unavailable');
const signedInUser = decoded(decodeUserView, 'unknown');

export function createAccountApi(
  client: Pick<GatewayClient, 'read' | 'send'>,
): AccountApi {
  return {
    async me({ background }) {
      return readUser(await client.read(mePath, { background }));
    },
    async signIn({ login, password, rememberMe }, commandID) {
      // The password goes as typed: never trimmed or normalized.
      const body: components['schemas']['LoginRequestV2'] = {
        login,
        password,
        rememberMe,
        commandID,
      };
      return signedInUser(await client.send('POST', sessionPath, { body }));
    },
    async signOut() {
      await client.send('DELETE', sessionPath);
    },
  };
}
