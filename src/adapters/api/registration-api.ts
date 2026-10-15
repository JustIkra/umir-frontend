import type { RegistrationApi } from '@/application/registration';
import type { GatewayClient } from '@/adapters/http/gateway-client';
import type { components } from './backend-v2';
import { decodeUserView } from './decode/account';
import { decodeChallenge, decodeVerifiedChallenge } from './decode/challenge';
import { decoded } from './decode/common';

const emailChallengesPath = '/api/v2/email-challenges';
const challengePath = (challengeID: string) =>
  `/api/v2/challenges/${encodeURIComponent(challengeID)}`;

// A command's answer that is not the contract's leaves its outcome unknown.
const issued = decoded((body) => decodeChallenge(body), 'unknown');
const verified = decoded(decodeVerifiedChallenge, 'unknown');
const signedIn = decoded(decodeUserView, 'unknown');

// Open registration: a code to the address, then the new account and its
// session. verify and resend are the operations password reset and the
// invitation use.
export function createRegistrationApi(
  client: Pick<GatewayClient, 'send'>,
): RegistrationApi {
  return {
    async begin(email, commandID) {
      const body: components['schemas']['EmailChallengeBegin'] = {
        commandID,
        email,
        purpose: 'registration',
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
    async complete({ challengeID, proof, displayName, password }, commandID) {
      const body: components['schemas']['EmailChallengeComplete'] = {
        commandID,
        challengeID,
        proof,
        purpose: 'registration',
        displayName,
        password,
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
