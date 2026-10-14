import type { Challenge, RecoveryApi } from './account';
import type { CommandResult, CommandRunner } from './commands';
import type { SessionStore } from './session';

export type ResetStep = 'email' | 'code' | 'password';
// The page to open after an action.
export type ResetMove = ResetStep | 'stay' | 'done';
export type ResetAction =
  'request' | 'renew' | 'verify' | 'resend' | 'complete';

// What R01, R05 and R08 say.
export type ResetNotice =
  | { readonly kind: 'email-required' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'invalid-email' }
  | { readonly kind: 'code-format' }
  | { readonly kind: 'wrong-code' }
  | { readonly kind: 'locked' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'resent' }
  | {
      readonly kind: 'password-fields';
      readonly newPassword: 'required' | 'length' | undefined;
      readonly repeat: 'mismatch' | undefined;
    }
  | { readonly kind: 'proof-expired' }
  | { readonly kind: 'limited'; readonly untilMs: number }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'unknown'; readonly action: ResetAction };

// What survives a reload of the tab.
export interface ResetRecord {
  readonly email: string;
  readonly challenge: Challenge;
  readonly proof: string | undefined;
}

export interface ResetStorage {
  load(): ResetRecord | undefined;
  save(record: ResetRecord): void;
  clear(): void;
}

export interface ResetSnapshot {
  readonly step: ResetStep;
  readonly email: string;
  readonly expiresAtMs: number | undefined;
  readonly resendAtMs: number | undefined;
  readonly busy: boolean;
  readonly notice: ResetNotice | undefined;
}

export interface PasswordResetFlow {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => ResetSnapshot;
  request(email: string): Promise<ResetMove>;
  renew(): Promise<ResetMove>;
  verify(code: string): Promise<ResetMove>;
  resend(): Promise<ResetMove>;
  complete(newPassword: string, repeat: string): Promise<ResetMove>;
  check(): Promise<ResetMove>;
  restart(keepEmail: boolean): void;
}

export interface ResetOptions {
  readonly api: RecoveryApi;
  readonly commands: CommandRunner;
  readonly session: Pick<SessionStore, 'adopt'>;
  readonly storage: ResetStorage;
  readonly now: () => number;
}

export const resetKeys = {
  begin: 'reset.begin',
  verify: 'reset.verify',
  resend: 'reset.resend',
  complete: 'reset.complete',
} as const;

// Labels name the action in W11 if an attempt is still unchecked.
const labels: Record<ResetAction, string> = {
  request: 'запроса кода',
  renew: 'запроса кода',
  verify: 'проверки кода',
  resend: 'повторной отправки кода',
  complete: 'сохранения пароля',
};

// The backend counts Unicode code points, not UTF-16 units; the password is
// counted as typed (no trim, no normalization).
const codePoints = (value: string) => value.match(/./gsu)?.length ?? 0;
const defaultWaitSeconds = 60;
const codePattern = /^[0-9]{6}$/;
const minPassword = 8;
const maxPassword = 32;

type Refusal = Exclude<CommandResult<unknown>, { readonly kind: 'committed' }>;

// R05 turns into R07 at expiresAt without a request.
export function isCodeExpired(snapshot: ResetSnapshot, nowMs: number): boolean {
  return (
    snapshot.step === 'code' &&
    snapshot.expiresAtMs !== undefined &&
    nowMs >= snapshot.expiresAtMs
  );
}

function passwordFields(
  newPassword: string,
  repeat: string,
): ResetNotice | undefined {
  const length = codePoints(newPassword);
  let fresh: 'required' | 'length' | undefined;
  if (newPassword === '') fresh = 'required';
  else if (length < minPassword || length > maxPassword) fresh = 'length';
  const again = repeat === newPassword ? undefined : 'mismatch';
  if (fresh === undefined && again === undefined) return undefined;
  return { kind: 'password-fields', newPassword: fresh, repeat: again };
}

// Password reset by an email code: R01 (email), R05 (code), R08 (new
// password). The step survives a reload through the storage; an unknown
// outcome is checked by repeating the same attempt.
export function createPasswordResetFlow({
  api,
  commands,
  session,
  storage,
  now,
}: ResetOptions): PasswordResetFlow {
  const listeners = new Set<() => void>();
  let record = storage.load();
  let email = record?.email ?? '';
  let busy = false;
  let notice: ResetNotice | undefined;
  // restart() starts a new generation; answers of an older one are dropped.
  let generation = 0;
  // Inputs of the last attempt: «Проверить результат» repeats it.
  let lastCode = '';
  let lastPassword = '';

  // The code and the password are not kept once the reset is done or
  // started over.
  function forgetInputs(): void {
    lastCode = '';
    lastPassword = '';
  }

  function view(): ResetSnapshot {
    let step: ResetStep = 'email';
    if (record !== undefined) {
      step = record.proof === undefined ? 'code' : 'password';
    }
    return {
      step,
      email,
      expiresAtMs: record?.challenge.expiresAt.epochMs,
      resendAtMs: record?.challenge.resendAvailableAt.epochMs,
      busy,
      notice,
    };
  }
  let snapshot = view();

  function show(next: ResetNotice | undefined): void {
    notice = next;
    snapshot = view();
    for (const listener of listeners) listener();
  }

  // Another challenge makes the attempts of the previous one meaningless.
  function keep(next: ResetRecord | undefined): void {
    if (next?.challenge.challengeID !== record?.challenge.challengeID) {
      commands.discard(resetKeys.verify);
      commands.discard(resetKeys.resend);
      commands.discard(resetKeys.complete);
    }
    record = next;
    if (next === undefined) storage.clear();
    else storage.save(next);
  }

  function dropped(own: number): boolean {
    if (own === generation) return false;
    show(notice);
    return true;
  }

  // Refusals every step shares: a wait, a lost answer, a service that did
  // not run the command.
  function shared(result: Refusal, action: ResetAction): ResetNotice {
    if (result.kind === 'unknown') return { kind: 'unknown', action };
    const { failure } = result;
    if (failure.status === 429) {
      const seconds = failure.retryAfterSeconds ?? defaultWaitSeconds;
      return { kind: 'limited', untilMs: now() + seconds * 1000 };
    }
    return { kind: 'unavailable' };
  }

  // own is the generation of the action: a stale answer leaves busy to the
  // newer action that runs after restart().
  async function send<T>(
    own: number,
    action: ResetAction,
    key: string,
    execute: (commandID: string) => Promise<T>,
  ): Promise<CommandResult<T>> {
    busy = true;
    show(undefined);
    const result = await commands.run({ key, label: labels[action], execute });
    if (own === generation) busy = false;
    return result;
  }

  async function begin(
    action: 'request' | 'renew',
    address: string,
  ): Promise<ResetMove> {
    const own = generation;
    const result = await send(own, action, resetKeys.begin, (commandID) =>
      api.begin(address, commandID),
    );
    if (dropped(own)) return 'stay';
    if (result.kind === 'committed') {
      keep({ email: address, challenge: result.value, proof: undefined });
      show(action === 'renew' ? { kind: 'resent' } : undefined);
      return action === 'request' ? 'code' : 'stay';
    }
    if (result.kind === 'rejected') {
      const { failure } = result;
      if (failure.code === 'NotFound') {
        show({ kind: 'not-found' });
        return 'stay';
      }
      if (
        failure.code === 'InvalidArgument' ||
        failure.fieldErrors.email !== undefined
      ) {
        show({ kind: 'invalid-email' });
        return 'stay';
      }
    }
    show(shared(result, action));
    return 'stay';
  }

  function request(input: string): Promise<ResetMove> {
    email = input.trim();
    if (email === '') {
      show({ kind: 'email-required' });
      return Promise.resolve('stay');
    }
    return begin('request', email);
  }

  function renew(): Promise<ResetMove> {
    if (record === undefined) return Promise.resolve('stay');
    return begin('renew', record.email);
  }

  async function verify(input: string): Promise<ResetMove> {
    const current = record;
    if (current === undefined) return 'stay';
    if (now() >= current.challenge.expiresAt.epochMs) {
      show({ kind: 'expired' });
      return 'stay';
    }
    // The email shows the code as «482 913».
    const code = input.replace(/\s/g, '');
    if (!codePattern.test(code)) {
      show({ kind: 'code-format' });
      return 'stay';
    }
    lastCode = code;
    return sendCode(current, code);
  }

  // check() repeats a lost verify without the clock pre-check: the server
  // answers for an expired code itself, and a proof issued before expiry
  // must not be lost.
  async function sendCode(
    current: ResetRecord,
    code: string,
  ): Promise<ResetMove> {
    const own = generation;
    const { challengeID } = current.challenge;
    const result = await send(own, 'verify', resetKeys.verify, (commandID) =>
      api.verify(challengeID, code, commandID),
    );
    if (dropped(own)) return 'stay';
    if (result.kind === 'committed') {
      keep({
        email: current.email,
        challenge: result.value.challenge,
        proof: result.value.proof,
      });
      show(undefined);
      return 'password';
    }
    if (result.kind === 'rejected') {
      const { code: refusal } = result.failure;
      // A wrong code is committed: the attempt counts against the five.
      if (refusal === 'InvalidArgument') {
        show({ kind: 'wrong-code' });
        return 'stay';
      }
      if (refusal === 'ChallengeLocked') {
        show({ kind: 'locked' });
        return 'stay';
      }
      if (refusal === 'NotFound') {
        show({ kind: 'expired' });
        return 'stay';
      }
    }
    show(shared(result, 'verify'));
    return 'stay';
  }

  async function resend(): Promise<ResetMove> {
    const current = record;
    if (current === undefined) return 'stay';
    const own = generation;
    const result = await send(own, 'resend', resetKeys.resend, (commandID) =>
      api.resend(current.challenge.challengeID, commandID),
    );
    if (dropped(own)) return 'stay';
    if (result.kind === 'committed') {
      // The previous code no longer works.
      commands.discard(resetKeys.verify);
      keep({ ...current, challenge: result.value });
      show({ kind: 'resent' });
      return 'stay';
    }
    if (result.kind === 'rejected' && result.failure.code === 'NotFound') {
      show({ kind: 'expired' });
      return 'stay';
    }
    show(shared(result, 'resend'));
    return 'stay';
  }

  async function complete(
    newPassword: string,
    repeat: string,
  ): Promise<ResetMove> {
    const current = record;
    const proof = current?.proof;
    if (current === undefined || proof === undefined) return 'stay';
    const fields = passwordFields(newPassword, repeat);
    if (fields !== undefined) {
      show(fields);
      return 'stay';
    }
    lastPassword = newPassword;
    const own = generation;
    const completion = {
      challengeID: current.challenge.challengeID,
      proof,
      newPassword,
    };
    const result = await send(
      own,
      'complete',
      resetKeys.complete,
      (commandID) => api.complete(completion, commandID),
    );
    if (dropped(own)) return 'stay';
    if (result.kind === 'committed') {
      session.adopt(result.value);
      generation += 1;
      keep(undefined);
      email = '';
      forgetInputs();
      show(undefined);
      return 'done';
    }
    if (result.kind === 'rejected') {
      const { failure } = result;
      if (failure.code === 'NotFound') {
        keep(undefined);
        show({ kind: 'proof-expired' });
        return 'email';
      }
      if (
        failure.code === 'PasswordRejected' ||
        failure.code === 'InvalidArgument' ||
        failure.fieldErrors.newPassword !== undefined
      ) {
        show({
          kind: 'password-fields',
          newPassword: 'length',
          repeat: undefined,
        });
        return 'stay';
      }
    }
    show(shared(result, 'complete'));
    return 'stay';
  }

  function check(): Promise<ResetMove> {
    if (notice?.kind !== 'unknown') return Promise.resolve('stay');
    switch (notice.action) {
      case 'request':
        return begin('request', email);
      case 'renew':
        return renew();
      case 'verify':
        return record === undefined
          ? Promise.resolve('stay')
          : sendCode(record, lastCode);
      case 'resend':
        return resend();
      case 'complete':
        return complete(lastPassword, lastPassword);
    }
  }

  function restart(keepEmail: boolean): void {
    generation += 1;
    for (const key of Object.values(resetKeys)) commands.discard(key);
    keep(undefined);
    if (!keepEmail) email = '';
    forgetInputs();
    busy = false;
    show(undefined);
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    request,
    renew,
    verify,
    resend,
    complete,
    check,
    restart,
  };
}
