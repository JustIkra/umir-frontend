import type { InvitationApi } from '@/application/invitation-acceptance';
import type { GatewayClient } from '@/adapters/http/gateway-client';
import type { components } from './backend-v2';
import { decodeUserView } from './decode/account';
import { decodeChallenge, decodeVerifiedChallenge } from './decode/challenge';
import { decoded } from './decode/common';
import { decodeMembership } from './decode/organizations';

const invitationPath = (invitationID: string) =>
  `/api/v2/invitations/${encodeURIComponent(invitationID)}`;
const challengePath = (challengeID: string) =>
  `/api/v2/challenges/${encodeURIComponent(challengeID)}`;

// A command's answer that is not the contract's leaves its outcome unknown.
const issued = decoded((body) => decodeChallenge(body), 'unknown');
const verified = decoded(decodeVerifiedChallenge, 'unknown');
const signedIn = decoded(decodeUserView, 'unknown');
const membershipOf = decoded((body) => decodeMembership(body), 'unknown');

// The invitee's side of an invitation: a code to the invited address, then
// either a new account (anonymous) or the acceptance (signed in).
export function createInvitationApi(
  client: Pick<GatewayClient, 'send'>,
): InvitationApi {
  return {
    async begin(invitationID, commandID) {
      const body: components['schemas']['ChallengeBegin'] = {
        commandID,
        invitationID,
      };
      return issued(
        await client.send(
          'POST',
          `${invitationPath(invitationID)}/challenges`,
          {
            body,
          },
        ),
      );
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
    async complete({ challengeID, proof, password, displayName }, commandID) {
      const body: components['schemas']['ChallengeComplete'] = {
        commandID,
        challengeID,
        proof,
        password,
        displayName,
      };
      return signedIn(
        await client.send('POST', `${challengePath(challengeID)}/complete`, {
          body,
        }),
      );
    },
    async accept(invitationID, { challengeID, proof }, commandID) {
      const body: components['schemas']['AcceptInvitation'] = {
        commandID,
        challengeID,
        proof,
      };
      return membershipOf(
        await client.send('POST', `${invitationPath(invitationID)}/accept`, {
          body,
        }),
      );
    },
  };
}
