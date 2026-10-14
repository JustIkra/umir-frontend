import type {
  Challenge,
  ChallengeState,
  VerifiedChallenge,
} from '@/application/account';
import { entityId, instant, nonEmptyString, object, oneOf } from './common';

const states: readonly ChallengeState[] = [
  'pending',
  'verified',
  'completed',
  'expired',
  'locked',
];

export function decodeChallenge(body: unknown, path = 'Challenge'): Challenge {
  const challenge = object(body, path);
  return {
    challengeID: entityId(challenge.challengeID, `${path}.challengeID`),
    expiresAt: instant(challenge.expiresAt, `${path}.expiresAt`),
    resendAvailableAt: instant(
      challenge.resendAvailableAt,
      `${path}.resendAvailableAt`,
    ),
    state: oneOf(challenge.state, `${path}.state`, states),
  };
}

export function decodeVerifiedChallenge(body: unknown): VerifiedChallenge {
  const verified = object(body, 'VerifiedChallenge');
  return {
    challenge: decodeChallenge(
      verified.challenge,
      'VerifiedChallenge.challenge',
    ),
    proof: nonEmptyString(verified.proof, 'VerifiedChallenge.proof'),
    retainUntil: instant(verified.retainUntil, 'VerifiedChallenge.retainUntil'),
  };
}
