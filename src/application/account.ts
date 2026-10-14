import type { Instant } from './api';

export interface User {
  readonly userID: string;
  readonly login: string;
  readonly displayName: string;
  readonly email: string | undefined;
}

export interface SessionInfo {
  readonly expiresAt: Instant;
  readonly idleExpiresAt: Instant;
  readonly absoluteExpiresAt: Instant;
  readonly rememberMe: boolean;
}

// GET /me and a successful sign-in. The CSRF token goes to the HTTP client.
export interface UserView {
  readonly user: User;
  readonly session: SessionInfo;
  readonly csrfToken: string;
}

export interface SignInInput {
  readonly login: string;
  readonly password: string;
  readonly rememberMe: boolean;
}

export type ChallengeState =
  'pending' | 'verified' | 'completed' | 'expired' | 'locked';

// #Challenge: a code sent by email. resendAvailableAt is the earliest moment
// for another code.
export interface Challenge {
  readonly challengeID: string;
  readonly expiresAt: Instant;
  readonly resendAvailableAt: Instant;
  readonly state: ChallengeState;
}

// #VerifiedChallenge: the code was right; proof completes the reset once and
// only in this browser.
export interface VerifiedChallenge {
  readonly challenge: Challenge;
  readonly proof: string;
  readonly retainUntil: Instant;
}

export interface PasswordChange {
  readonly currentPassword: string;
  readonly newPassword: string;
}

export interface ResetCompletion {
  readonly challengeID: string;
  readonly proof: string;
  readonly newPassword: string;
}

// Account operations of gateway. Each rejects with ApiError.
export interface AccountApi {
  me(options: { readonly background: boolean }): Promise<UserView>;
  signIn(input: SignInInput, commandID: string): Promise<UserView>;
  signOut(): Promise<void>;
  changeDisplayName(displayName: string, commandID: string): Promise<User>;
  // 204: every session of the user, this one included, has ended.
  changePassword(input: PasswordChange, commandID: string): Promise<void>;
}

// Password reset by an email code. Each rejects with ApiError.
export interface RecoveryApi {
  begin(email: string, commandID: string): Promise<Challenge>;
  verify(
    challengeID: string,
    code: string,
    commandID: string,
  ): Promise<VerifiedChallenge>;
  resend(challengeID: string, commandID: string): Promise<Challenge>;
  // A new session for the user; the backend ended all the previous ones.
  complete(input: ResetCompletion, commandID: string): Promise<UserView>;
}
