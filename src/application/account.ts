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

// Account operations of gateway. Each rejects with ApiError.
export interface AccountApi {
  me(options: { readonly background: boolean }): Promise<UserView>;
  signIn(input: SignInInput, commandID: string): Promise<UserView>;
  signOut(): Promise<void>;
}
