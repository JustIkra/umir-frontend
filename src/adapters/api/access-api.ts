import type { AccessApi } from '@/application/access';
import type { GatewayClient } from '@/adapters/http/gateway-client';
import { decodeAccessView } from './decode/access';
import { decoded } from './decode/common';

export const accessPath = '/api/v2/access';

const decodeAccess = decoded(decodeAccessView, 'unavailable');

export function createAccessApi(
  client: Pick<GatewayClient, 'read'>,
): AccessApi {
  return {
    async access() {
      return decodeAccess(await client.read(accessPath, { background: false }));
    },
  };
}
