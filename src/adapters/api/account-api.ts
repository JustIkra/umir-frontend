import type { AccountApi } from '@/application/account';
import type { GatewayClient } from '@/adapters/http/gateway-client';
import type { components } from './backend-v2';
import { decodeUser, decodeUserView } from './decode/account';
import { decoded } from './decode/common';

export const mePath = '/api/v2/me';
export const sessionPath = '/api/v2/session';

const readUser = decoded(decodeUserView, 'unavailable');
const signedInUser = decoded(decodeUserView, 'unknown');
const savedUser = decoded((body) => decodeUser(body), 'unknown');

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
    async changeDisplayName(displayName, commandID) {
      const body: components['schemas']['DisplayNameRequestV2'] = {
        displayName,
        commandID,
      };
      return savedUser(
        await client.send('PATCH', `${mePath}/display-name`, { body }),
      );
    },
    async changePassword({ currentPassword, newPassword }, commandID) {
      // Both passwords go as typed: never trimmed or normalized.
      const body: components['schemas']['PasswordChangeRequestV2'] = {
        currentPassword,
        newPassword,
        commandID,
      };
      await client.send('PATCH', `${mePath}/password`, { body });
    },
  };
}
