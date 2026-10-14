import { failureOf } from './api';
import type { AccountApi, User } from './account';
import type { CommandRunner } from './commands';
import type { SessionStore } from './session';

export interface AccountSettingsOptions {
  readonly api: Pick<AccountApi, 'me' | 'changeDisplayName' | 'changePassword'>;
  readonly commands: CommandRunner;
  readonly session: Pick<
    SessionStore,
    'getSnapshot' | 'check' | 'updateUser' | 'forget' | 'signOut'
  >;
}

export const renameKey = 'account.display-name';
export const passwordKey = 'account.password';

export type RenameOutcome =
  | { readonly kind: 'saved'; readonly user: User }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'storage'; readonly code: string }
  | { readonly kind: 'lost' }
  | { readonly kind: 'recovering'; readonly code: string }
  | { readonly kind: 'ended' };

export type RenameCheck =
  | { readonly kind: 'saved'; readonly user: User }
  | { readonly kind: 'unchanged'; readonly user: User }
  | { readonly kind: 'unreadable'; readonly code: string };

export type PasswordField = 'currentPassword' | 'newPassword' | 'repeat';

export type PasswordFieldError =
  | 'current-required'
  | 'current-wrong'
  | 'new-length'
  | 'new-rejected'
  | 'mismatch';

export interface PasswordInput {
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly repeat: string;
}

export type PasswordOutcome =
  | { readonly kind: 'changed' }
  | {
      readonly kind: 'invalid';
      readonly errors: Readonly<
        Partial<Record<PasswordField, PasswordFieldError>>
      >;
    }
  | { readonly kind: 'limited'; readonly seconds: number }
  | { readonly kind: 'revoked' }
  | { readonly kind: 'storage'; readonly code: string }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'recovering'; readonly code: string }
  | { readonly kind: 'ended' };

export type PasswordCheck = 'changed' | 'unchanged' | 'recovering';

export interface AccountSettings {
  rename(draft: string): Promise<RenameOutcome>;
  checkRename(draft: string): Promise<RenameCheck>;
  changePassword(input: PasswordInput): Promise<PasswordOutcome>;
  checkPassword(): Promise<PasswordCheck>;
  refreshProfile(): Promise<boolean>;
  signInToCheck(): Promise<'done' | 'failed'>;
}

// Auth could not tell whether it stored the change; it answers again after
// its storage recovers (S10, S20).
const recoveringCode = 'AuthUpdateOutcomeUnknown';
const defaultWaitSeconds = 60;
const minName = 2;
const maxName = 80;
const minPassword = 8;
const maxPassword = 32;
const codePoints = (value: string) => Array.from(value).length;

type ProfileRead =
  { readonly user: User } | { readonly code: string; readonly status: number };

function passwordErrors({
  currentPassword,
  newPassword,
  repeat,
}: PasswordInput): Partial<Record<PasswordField, PasswordFieldError>> {
  const errors: Partial<Record<PasswordField, PasswordFieldError>> = {};
  if (currentPassword === '') errors.currentPassword = 'current-required';
  const length = codePoints(newPassword);
  if (length < minPassword || length > maxPassword) {
    errors.newPassword = 'new-length';
  }
  if (repeat !== newPassword) errors.repeat = 'mismatch';
  return errors;
}

// «Учётная запись»: the display name (S02–S12) and the password (S13–S22).
// A lost answer is checked as the Figma frames say: the name by reading the
// profile, the password by signing in with the new one.
export function createAccountSettings({
  api,
  commands,
  session,
}: AccountSettingsOptions): AccountSettings {
  const login = (): string => {
    const state = session.getSnapshot();
    return state.status === 'active' ? state.user.login : '';
  };

  async function readProfile(): Promise<ProfileRead> {
    try {
      const { user } = await api.me({ background: false });
      session.updateUser(user);
      return { user };
    } catch (error) {
      const failure = failureOf(error);
      if (failure === undefined) throw error;
      return { code: failure.code, status: failure.status };
    }
  }

  async function rename(draft: string): Promise<RenameOutcome> {
    const name = draft.trim();
    const length = codePoints(name);
    if (length < minName || length > maxName) return { kind: 'invalid' };
    const result = await commands.run({
      key: renameKey,
      label: 'изменения имени',
      execute: (commandID) => api.changeDisplayName(name, commandID),
    });
    if (result.kind === 'committed') {
      session.updateUser(result.value);
      return { kind: 'saved', user: result.value };
    }
    if (result.kind === 'unknown') {
      return result.failure.code === recoveringCode
        ? { kind: 'recovering', code: result.failure.code }
        : { kind: 'lost' };
    }
    const { failure } = result;
    if (failure.status === 401) {
      void session.check();
      return { kind: 'ended' };
    }
    if (
      failure.code === 'InvalidDisplayName' ||
      failure.code === 'InvalidArgument' ||
      failure.fieldErrors.displayName !== undefined
    ) {
      return { kind: 'invalid' };
    }
    return { kind: 'storage', code: failure.code };
  }

  async function checkRename(draft: string): Promise<RenameCheck> {
    const read = await readProfile();
    if (!('user' in read)) {
      if (read.status === 401) void session.check();
      return { kind: 'unreadable', code: read.code };
    }
    commands.discard(renameKey);
    return read.user.displayName === draft.trim()
      ? { kind: 'saved', user: read.user }
      : { kind: 'unchanged', user: read.user };
  }

  async function changePassword(
    input: PasswordInput,
  ): Promise<PasswordOutcome> {
    const errors = passwordErrors(input);
    if (Object.keys(errors).length > 0) return { kind: 'invalid', errors };
    const who = login();
    const result = await commands.run({
      key: passwordKey,
      label: 'изменения пароля',
      execute: (commandID) =>
        api.changePassword(
          {
            currentPassword: input.currentPassword,
            newPassword: input.newPassword,
          },
          commandID,
        ),
    });
    if (result.kind === 'committed') {
      session.forget({ kind: 'password-changed', login: who });
      return { kind: 'changed' };
    }
    if (result.kind === 'unknown') {
      return result.failure.code === recoveringCode
        ? { kind: 'recovering', code: result.failure.code }
        : { kind: 'unknown' };
    }
    const { failure } = result;
    if (failure.status === 429) {
      if (failure.sessionRevoked) {
        session.forget({ kind: 'password-limit' });
        return { kind: 'revoked' };
      }
      return {
        kind: 'limited',
        seconds: failure.retryAfterSeconds ?? defaultWaitSeconds,
      };
    }
    if (failure.status === 401) {
      void session.check();
      return { kind: 'ended' };
    }
    if (
      failure.code === 'CurrentPasswordIncorrect' ||
      failure.fieldErrors.currentPassword !== undefined
    ) {
      return { kind: 'invalid', errors: { currentPassword: 'current-wrong' } };
    }
    if (
      failure.code === 'PasswordRejected' ||
      failure.code === 'InvalidArgument' ||
      failure.fieldErrors.newPassword !== undefined
    ) {
      return { kind: 'invalid', errors: { newPassword: 'new-rejected' } };
    }
    return { kind: 'storage', code: failure.code };
  }

  // A password change ends every session at once, so after Auth recovers a
  // live session means the change did not apply, and 401 means it did.
  async function checkPassword(): Promise<PasswordCheck> {
    const who = login();
    const read = await readProfile();
    if ('user' in read) {
      commands.discard(passwordKey);
      return 'unchanged';
    }
    if (read.status === 401) {
      session.forget({ kind: 'password-changed', login: who });
      return 'changed';
    }
    return 'recovering';
  }

  async function refreshProfile(): Promise<boolean> {
    const read = await readProfile();
    if ('user' in read) return true;
    if (read.status === 401) void session.check();
    return false;
  }

  return {
    rename,
    checkRename,
    changePassword,
    checkPassword,
    refreshProfile,
    signInToCheck: () =>
      session.signOut({ kind: 'password-unknown', login: login() }),
  };
}
