import type { Challenge, UserView, VerifiedChallenge } from './account';
import type { AccessStore } from './access';
import type { ApiFailure } from './api';
import type { CommandResult, CommandRunner } from './commands';
import {
  defaultWaitSeconds,
  emailProblem,
  nameProblem,
  normalizedCode,
  passwordProblem,
} from './credentials';
import type { SessionStore } from './session';

// Open registration (/register, proposal umir-factory#14): the name, the
// email and the password, a code from the email, then the new account and its
// session. The password lives in memory only, so a reload after the code asks
// for the name and the password again.

export interface NewUser {
  readonly challengeID: string;
  readonly proof: string;
  readonly displayName: string;
  readonly password: string;
}

export interface RegistrationApi {
  begin(email: string, commandID: string): Promise<Challenge>;
  verify(
    challengeID: string,
    code: string,
    commandID: string,
  ): Promise<VerifiedChallenge>;
  resend(challengeID: string, commandID: string): Promise<Challenge>;
  complete(input: NewUser, commandID: string): Promise<UserView>;
}

// form: the fields; code: the code input; details: the proof is held and the
// name and the password are asked again (after a reload); done: the result.
export type RegisterStep = 'form' | 'code' | 'details' | 'done';
export type RegisterAction = 'begin' | 'verify' | 'resend' | 'complete';

export type RegisterNotice =
  | {
      readonly kind: 'fields';
      readonly name: 'required' | 'length' | undefined;
      readonly email: 'required' | 'format' | undefined;
      readonly password: 'required' | 'length' | undefined;
      readonly repeat: 'mismatch' | undefined;
    }
  | { readonly kind: 'consent' }
  | { readonly kind: 'code-format' }
  | { readonly kind: 'wrong-code' }
  | { readonly kind: 'locked' }
  // The code is past its time: a new one is needed.
  | { readonly kind: 'expired' }
  | { readonly kind: 'resent' }
  // Registration is switched off in Auth.
  | { readonly kind: 'closed' }
  | { readonly kind: 'proof-expired' }
  | { readonly kind: 'email-taken' }
  | { readonly kind: 'limited'; readonly untilMs: number }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'unknown'; readonly action: RegisterAction };

// What survives a reload of the tab. Never the password.
export interface RegisterRecord {
  readonly email: string;
  readonly displayName: string;
  readonly challenge: Challenge;
  readonly proof: string | undefined;
}

export interface RegisterStorage {
  load(): RegisterRecord | undefined;
  save(record: RegisterRecord): void;
  clear(): void;
}

export interface RegisterSnapshot {
  readonly step: RegisterStep;
  readonly email: string;
  readonly displayName: string;
  readonly expiresAtMs: number | undefined;
  readonly resendAtMs: number | undefined;
  readonly busy: boolean;
  readonly notice: RegisterNotice | undefined;
}

export interface RegistrationInput {
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
  readonly repeat: string;
  readonly consent: boolean;
}

export interface DetailsInput {
  readonly displayName: string;
  readonly password: string;
  readonly repeat: string;
}

export interface Registration {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => RegisterSnapshot;
  // The form: checks the fields and asks for the code.
  submit(input: RegistrationInput): Promise<void>;
  // A new code for the address of the saved attempt.
  requestCode(): Promise<void>;
  verify(code: string): Promise<void>;
  resend(): Promise<void>;
  // The details step: the name and the password again after a reload.
  completeDetails(input: DetailsInput): Promise<void>;
  // Repeats the action whose outcome is unknown, with the same commandID.
  check(): Promise<void>;
  restart(): void;
}

export interface RegisterOptions {
  readonly api: RegistrationApi;
  readonly commands: CommandRunner;
  readonly session: Pick<SessionStore, 'adopt'>;
  readonly access: Pick<AccessStore, 'refresh'>;
  readonly storage: RegisterStorage;
  readonly now: () => number;
}

export const registerKeys = {
  begin: 'register.begin',
  verify: 'register.verify',
  resend: 'register.resend',
  complete: 'register.complete',
} as const;

// Labels name the action in W11 if an attempt is still unchecked.
const labels: Record<RegisterAction, string> = {
  begin: 'запроса кода',
  verify: 'проверки кода',
  resend: 'повторной отправки кода',
  complete: 'создания учётной записи',
};

type Refusal = Exclude<CommandResult<unknown>, { readonly kind: 'committed' }>;

// The code turns into «expired» at expiresAt without a request.
export function isRegisterCodeExpired(
  snapshot: RegisterSnapshot,
  nowMs: number,
): boolean {
  return (
    snapshot.step === 'code' &&
    snapshot.expiresAtMs !== undefined &&
    nowMs >= snapshot.expiresAtMs
  );
}

export function createRegistration({
  api,
  commands,
  session,
  access,
  storage,
  now,
}: RegisterOptions): Registration {
  const listeners = new Set<() => void>();
  let record = storage.load();
  let email = record?.email ?? '';
  let displayName = record?.displayName ?? '';
  let finished = false;
  let busy = false;
  let notice: RegisterNotice | undefined;
  // restart() and a dead attempt start a new generation; answers of an older
  // one are dropped.
  let generation = 0;
  // The inputs of the last attempts live in memory only: «Проверить
  // результат» repeats them, and a reload loses them.
  let password = '';
  let lastCode = '';

  function view(): RegisterSnapshot {
    let step: RegisterStep = 'form';
    if (finished) step = 'done';
    else if (record !== undefined) {
      step = record.proof === undefined ? 'code' : 'details';
    }
    return {
      step,
      email,
      displayName,
      expiresAtMs: record?.challenge.expiresAt.epochMs,
      resendAtMs: record?.challenge.resendAvailableAt.epochMs,
      busy,
      notice,
    };
  }
  let snapshot = view();

  function show(next: RegisterNotice | undefined): void {
    notice = next;
    snapshot = view();
    for (const listener of listeners) listener();
  }

  // Another challenge makes the attempts of the previous one meaningless.
  function keep(next: RegisterRecord | undefined): void {
    if (next?.challenge.challengeID !== record?.challenge.challengeID) {
      commands.discard(registerKeys.verify);
      commands.discard(registerKeys.resend);
      commands.discard(registerKeys.complete);
    }
    record = next;
    if (next === undefined) storage.clear();
    else storage.save(next);
  }

  function forgetInputs(): void {
    password = '';
    lastCode = '';
  }

  // Back to the form, without a notification. The typed name and email stay
  // when the form is to be shown again.
  function clear(keepInputs: boolean): void {
    generation += 1;
    for (const key of Object.values(registerKeys)) commands.discard(key);
    keep(undefined);
    if (!keepInputs) {
      email = '';
      displayName = '';
    }
    forgetInputs();
    finished = false;
    busy = false;
  }

  function dropped(own: number): boolean {
    if (own === generation) return false;
    show(notice);
    return true;
  }

  // own is the generation of the action: a stale answer leaves busy to the
  // newer action.
  async function send<T>(
    own: number,
    action: RegisterAction,
    execute: (commandID: string) => Promise<T>,
  ): Promise<CommandResult<T>> {
    busy = true;
    show(undefined);
    const result = await commands.run({
      key: registerKeys[action],
      label: labels[action],
      execute,
    });
    if (own === generation) busy = false;
    return result;
  }

  // Refusals every step shares. specific answers for the codes of the
  // action; 401 means the session the code was bound to is gone.
  function refused(
    result: Refusal,
    action: RegisterAction,
    specific: (failure: ApiFailure) => RegisterNotice | 'silent' | undefined,
  ): void {
    if (result.kind === 'unknown') {
      show({ kind: 'unknown', action });
      return;
    }
    const { failure } = result;
    if (failure.status === 401) {
      clear(true);
      show(undefined);
      return;
    }
    const own = specific(failure);
    if (own !== undefined) {
      show(own === 'silent' ? undefined : own);
      return;
    }
    if (failure.status === 429) {
      const seconds = failure.retryAfterSeconds ?? defaultWaitSeconds;
      show({ kind: 'limited', untilMs: now() + seconds * 1000 });
      return;
    }
    show({ kind: 'unavailable' });
  }

  // The attempt is dead: back to the form with the reason.
  function startOver(reason: RegisterNotice): RegisterNotice {
    clear(true);
    return reason;
  }

  async function begin(): Promise<void> {
    const address = email;
    const own = generation;
    const result = await send(own, 'begin', (commandID) =>
      api.begin(address, commandID),
    );
    if (dropped(own)) return;
    if (result.kind === 'committed') {
      keep({
        email: address,
        displayName,
        challenge: result.value,
        proof: undefined,
      });
      show(undefined);
      return;
    }
    refused(result, 'begin', ({ code }) => {
      if (code === 'Forbidden') return { kind: 'closed' };
      // Auth judges the address (or does not know the purpose yet).
      if (code === 'InvalidArgument') {
        return {
          kind: 'fields',
          name: undefined,
          email: 'format',
          password: undefined,
          repeat: undefined,
        };
      }
      return undefined;
    });
  }

  function passwordNotice(
    input: Pick<DetailsInput, 'password' | 'repeat'>,
    name: 'required' | 'length' | undefined,
    mail: 'required' | 'format' | undefined,
  ): RegisterNotice | undefined {
    const secret = passwordProblem(input.password);
    const again = input.repeat === input.password ? undefined : 'mismatch';
    if (
      name === undefined &&
      mail === undefined &&
      secret === undefined &&
      again === undefined
    ) {
      return undefined;
    }
    return {
      kind: 'fields',
      name,
      email: mail,
      password: secret,
      repeat: again,
    };
  }

  function submit(input: RegistrationInput): Promise<void> {
    displayName = input.displayName.trim();
    email = input.email.trim();
    const problem = passwordNotice(
      input,
      nameProblem(displayName),
      emailProblem(email),
    );
    if (problem !== undefined) {
      show(problem);
      return Promise.resolve();
    }
    if (!input.consent) {
      show({ kind: 'consent' });
      return Promise.resolve();
    }
    password = input.password;
    return begin();
  }

  function requestCode(): Promise<void> {
    return email === '' ? Promise.resolve() : begin();
  }

  async function verify(input: string): Promise<void> {
    const current = record;
    if (current === undefined) return;
    if (now() >= current.challenge.expiresAt.epochMs) {
      show({ kind: 'expired' });
      return;
    }
    const code = normalizedCode(input);
    if (code === undefined) {
      show({ kind: 'code-format' });
      return;
    }
    lastCode = code;
    await sendCode(current, code);
  }

  // check() repeats a lost verify without the clock pre-check: the server
  // answers for an expired code itself, and a proof issued before expiry
  // must not be lost.
  async function sendCode(
    current: RegisterRecord,
    code: string,
  ): Promise<void> {
    const own = generation;
    const { challengeID } = current.challenge;
    const result = await send(own, 'verify', (commandID) =>
      api.verify(challengeID, code, commandID),
    );
    if (dropped(own)) return;
    if (result.kind === 'committed') {
      const next = {
        ...current,
        challenge: result.value.challenge,
        proof: result.value.proof,
      };
      keep(next);
      lastCode = '';
      // The proof is spent at once if the scenario holds the password.
      if (password !== '') {
        busy = true;
        await completeNow(next);
      } else {
        show(undefined);
      }
      return;
    }
    refused(result, 'verify', ({ code: refusal }) => {
      // A wrong code is committed: the attempt counts against the five.
      if (refusal === 'InvalidArgument') return { kind: 'wrong-code' };
      if (refusal === 'ChallengeLocked') return { kind: 'locked' };
      return refusal === 'NotFound' ? { kind: 'expired' } : undefined;
    });
  }

  async function resend(): Promise<void> {
    const current = record;
    if (current === undefined) return;
    const own = generation;
    const result = await send(own, 'resend', (commandID) =>
      api.resend(current.challenge.challengeID, commandID),
    );
    if (dropped(own)) return;
    if (result.kind === 'committed') {
      // The previous code no longer works.
      commands.discard(registerKeys.verify);
      keep({ ...current, challenge: result.value });
      show({ kind: 'resent' });
      return;
    }
    refused(result, 'resend', ({ code }) =>
      code === 'NotFound' ? startOver({ kind: 'expired' }) : undefined,
    );
  }

  async function completeNow(current: RegisterRecord): Promise<void> {
    if (current.proof === undefined || password === '') return;
    const own = generation;
    const user = {
      challengeID: current.challenge.challengeID,
      proof: current.proof,
      password,
      displayName,
    };
    const result = await send(own, 'complete', (commandID) =>
      api.complete(user, commandID),
    );
    if (dropped(own)) return;
    if (result.kind === 'committed') {
      generation += 1;
      keep(undefined);
      forgetInputs();
      finished = true;
      busy = false;
      session.adopt(result.value);
      void access.refresh();
      show(undefined);
      return;
    }
    refused(result, 'complete', ({ code }) => {
      if (code === 'NotFound') return startOver({ kind: 'proof-expired' });
      if (code === 'CommandConflict') return startOver({ kind: 'email-taken' });
      if (code === 'Forbidden') {
        // Signed in meanwhile: nothing to register.
        clear(true);
        return 'silent';
      }
      if (code === 'InvalidArgument') {
        return {
          kind: 'fields',
          name: 'length',
          email: undefined,
          password: 'length',
          repeat: undefined,
        };
      }
      return undefined;
    });
  }

  async function completeDetails(input: DetailsInput): Promise<void> {
    const current = record;
    if (current?.proof === undefined) return;
    const name = input.displayName.trim();
    const problem = passwordNotice(input, nameProblem(name), undefined);
    displayName = name;
    if (problem !== undefined) {
      show(problem);
      return;
    }
    password = input.password;
    await completeNow(current);
  }

  async function check(): Promise<void> {
    if (notice?.kind !== 'unknown') return;
    switch (notice.action) {
      case 'begin':
        return begin();
      case 'verify':
        if (record !== undefined) await sendCode(record, lastCode);
        return;
      case 'resend':
        return resend();
      case 'complete':
        if (record !== undefined) await completeNow(record);
        return;
    }
  }

  function restart(): void {
    clear(false);
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
    submit,
    requestCode,
    verify,
    resend,
    completeDetails,
    check,
    restart,
  };
}
