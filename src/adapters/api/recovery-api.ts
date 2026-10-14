import type { RecoveryApi } from '@/application/account';
import type { GatewayClient } from '@/adapters/http/gateway-client';
import type { components } from './backend-v2';
import { decodeUserView } from './decode/account';
import { decodeChallenge, decodeVerifiedChallenge } from './decode/challenge';
import { decoded } from './decode/common';

export const emailChallengesPath = '/api/v2/email-challenges';
const challengePath = (challengeID: string) =>
  `/api/v2/challenges/${encodeURIComponent(challengeID)}`;

const issued = decoded((body) => decodeChallenge(body), 'unknown');
const verified = decoded(decodeVerifiedChallenge, 'unknown');
const signedIn = decoded(decodeUserView, 'unknown');

// Password reset only: the code login of the contract is not used (decision
// of 13.10).
export function createRecoveryApi(
  client: Pick<GatewayClient, 'send'>,
): RecoveryApi {
  return {
    async begin(email, commandID) {
      const body: components['schemas']['EmailChallengeBegin'] = {
        commandID,
        email,
        purpose: 'password_reset',
      };
      return issued(await client.send('POST', emailChallengesPath, { body }));
    },
    async verify(challengeID, code, commandID) {
      const body: components['schemas']['ChallengeVerify'] = {
        commandID,
        challengeID,
        code,
      };
      return verified(
        await client.send('POST', `${challengePath(challengeID)}/verify`, {
          body,
        }),
      );
    },
    async resend(challengeID, commandID) {
      const body: components['schemas']['Command'] = { commandID };
      return issued(
        await client.send('POST', `${challengePath(challengeID)}/resend`, {
          body,
        }),
      );
    },
    async complete({ challengeID, proof, newPassword }, commandID) {
      const body: components['schemas']['EmailChallengeComplete'] = {
        commandID,
        challengeID,
        proof,
        purpose: 'password_reset',
        newPassword,
      };
      return signedIn(
        await client.send(
          'POST',
          `${emailChallengesPath}/${encodeURIComponent(challengeID)}/complete`,
          { body },
        ),
      );
    },
  };
}
