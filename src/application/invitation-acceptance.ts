import type { Challenge, UserView, VerifiedChallenge } from './account';
import type { AccessStore } from './access';
import type { ApiFailure } from './api';
import type { CommandResult, CommandRunner } from './commands';
import {
  defaultWaitSeconds,
  nameProblem,
  normalizedCode,
  passwordProblem,
} from './credentials';
import type { Membership } from './organizations';
import type { SessionStore } from './session';

// The invitee's side of an invitation (/invite/:id): a code from the email,
// then a new account (register) or the acceptance by the signed-in user
// (accept). The code is bound to the session or the preauth that asked for
// it, so a change of mode starts the scenario over.

export interface ProofInput {
  readonly challengeID: string;
  readonly proof: string;
}

export interface InvitedUser extends ProofInput {
  readonly password: string;
  readonly displayName: string;
}

export interface InvitationApi {
  begin(invitationID: string, commandID: string): Promise<Challenge>;
  verify(
    challengeID: string,
    code: string,
    commandID: string,
  ): Promise<VerifiedChallenge>;
  resend(challengeID: string, commandID: string): Promise<Challenge>;
  complete(input: InvitedUser, commandID: string): Promise<UserView>;
  accept(
    invitationID: string,
    input: ProofInput,
    commandID: string,
  ): Promise<Membership>;
}

export type AcceptMode = 'register' | 'accept';
// start: the form of the name and the password (register) or «Получить код»
// (accept); code: the code input; details: the proof is held — register asks
// for the name and the password again after a reload, accept offers
// «Принять приглашение»; done: the result.
export type AcceptStep = 'start' | 'code' | 'details' | 'done';
export type AcceptAction =
  'begin' | 'verify' | 'resend' | 'complete' | 'accept';

export type AcceptNotice =
  | {
      readonly kind: 'fields';
      readonly name: 'required' | 'length' | undefined;
      readonly password: 'required' | 'length' | undefined;
      readonly repeat: 'mismatch' | undefined;
    }
  | { readonly kind: 'code-format' }
  | { readonly kind: 'wrong-code' }
  | { readonly kind: 'locked' }
  // The code is past its time: a new one is needed.
  | { readonly kind: 'expired' }
  | { readonly kind: 'resent' }
  | { readonly kind: 'invitation-closed' }
  | { readonly kind: 'scope-closed' }
  | { readonly kind: 'proof-expired' }
  | { readonly kind: 'email-taken' }
  | { readonly kind: 'other-email' }
  | { readonly kind: 'not-accepted' }
  | { readonly kind: 'limited'; readonly untilMs: number }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'unknown'; readonly action: AcceptAction };

// What survives a reload of the tab. Never the password.
export interface AcceptRecord {
  readonly invitationID: string;
  readonly mode: AcceptMode;
  // '' in accept mode.
  readonly displayName: string;
  readonly challenge: Challenge;
  readonly proof: string | undefined;
}

export interface AcceptStorage {
  load(): AcceptRecord | undefined;
  save(record: AcceptRecord): void;
  clear(): void;
}

export interface AcceptSnapshot {
  readonly invitationID: string | undefined;
  readonly mode: AcceptMode;
  readonly step: AcceptStep;
  readonly displayName: string;
  readonly expiresAtMs: number | undefined;
  readonly resendAtMs: number | undefined;
  readonly busy: boolean;
  readonly notice: AcceptNotice | undefined;
  // The result of the acceptance (done in accept mode).
  readonly membership: Membership | undefined;
}

export interface DetailsInput {
  readonly displayName: string;
  readonly password: string;
  readonly repeat: string;
}

export interface InvitationAcceptance {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => AcceptSnapshot;
  // /invite/:id: keeps the saved attempt of the same invitation and mode,
  // otherwise starts over. Opening the same invitation again changes nothing
  // (a finished one stays finished until restart()).
  open(invitationID: string, mode: AcceptMode): void;
  register(input: DetailsInput): Promise<void>;
  requestCode(): Promise<void>;
  verify(code: string): Promise<void>;
  resend(): Promise<void>;
  // Register mode at the details step: the name and the password again after
  // a reload.
  completeDetails(input: DetailsInput): Promise<void>;
  // Accept mode with a proof (after a reload): a new attempt.
  acceptInvitation(): Promise<void>;
  // Repeats the action whose outcome is unknown, with the same commandID.
  check(): Promise<void>;
  restart(): void;
}

export interface AcceptOptions {
  readonly api: InvitationApi;
  readonly commands: CommandRunner;
  readonly session: Pick<SessionStore, 'adopt'>;
  readonly access: Pick<AccessStore, 'refresh'>;
  readonly storage: AcceptStorage;
  readonly now: () => number;
}

export const acceptKeys = {
  begin: 'invite.begin',
  verify: 'invite.verify',
  resend: 'invite.resend',
  complete: 'invite.complete',
  accept: 'invite.accept',
} as const;

// Labels name the action in W11 if an attempt is still unchecked.
const labels: Record<AcceptAction, string> = {
  begin: 'запроса кода',
  verify: 'проверки кода',
  resend: 'повторной отправки кода',
  complete: 'создания учётной записи',
  accept: 'принятия приглашения',
};

type Refusal = Exclude<CommandResult<unknown>, { readonly kind: 'committed' }>;

// The code turns into «expired» at expiresAt without a request.
export function isAcceptCodeExpired(
  snapshot: AcceptSnapshot,
  nowMs: number,
): boolean {
  return (
    snapshot.step === 'code' &&
    snapshot.expiresAtMs !== undefined &&
    nowMs >= snapshot.expiresAtMs
  );
}

export function createInvitationAcceptance({
  api,
  commands,
  session,
  access,
  storage,
  now,
}: AcceptOptions): InvitationAcceptance {
  const listeners = new Set<() => void>();
  let invitationID: string | undefined;
  let mode: AcceptMode = 'register';
  let record: AcceptRecord | undefined;
  let displayName = '';
  let finished = false;
  let membership: Membership | undefined;
  let busy = false;
  let notice: AcceptNotice | undefined;
  // restart() and open() start a new generation; answers of an older one are
  // dropped.
  let generation = 0;
  // The inputs of the last attempts live in memory only: «Проверить
  // результат» repeats them, and a reload loses them.
  let password = '';
  let lastCode = '';

  function view(): AcceptSnapshot {
    let step: AcceptStep = 'start';
    if (finished) step = 'done';
    else if (record !== undefined) {
      step = record.proof === undefined ? 'code' : 'details';
    }
    return {
      invitationID,
      mode,
      step,
      displayName,
      expiresAtMs: record?.challenge.expiresAt.epochMs,
      resendAtMs: record?.challenge.resendAvailableAt.epochMs,
      busy,
      notice,
      membership,
    };
  }
  let snapshot = view();

  function show(next: AcceptNotice | undefined): void {
    notice = next;
    snapshot = view();
    for (const listener of listeners) listener();
  }

  function discardAttempts(): void {
    for (const key of Object.values(acceptKeys)) commands.discard(key);
  }

  // Another challenge makes the attempts of the previous one meaningless.
  function keep(next: AcceptRecord | undefined): void {
    if (next?.challenge.challengeID !== record?.challenge.challengeID) {
      commands.discard(acceptKeys.verify);
      commands.discard(acceptKeys.resend);
      commands.discard(acceptKeys.complete);
      commands.discard(acceptKeys.accept);
    }
    record = next;
    if (next === undefined) storage.clear();
    else storage.save(next);
  }

  function forgetInputs(): void {
    password = '';
    lastCode = '';
  }

  // Back to the start, without a notification. The saved record is removed
  // unless open() has just read it.
  function clear(keepName: boolean, wipeStorage = true): void {
    generation += 1;
    discardAttempts();
    if (wipeStorage) keep(undefined);
    else record = undefined;
    if (!keepName) displayName = '';
    forgetInputs();
    finished = false;
    membership = undefined;
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
    action: AcceptAction,
    execute: (commandID: string) => Promise<T>,
  ): Promise<CommandResult<T>> {
    busy = true;
    show(undefined);
    const result = await commands.run({
      key: acceptKeys[action],
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
    action: AcceptAction,
    specific: (failure: ApiFailure) => AcceptNotice | 'silent' | undefined,
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

  // The attempt is dead: back to the start with the reason.
  function startOver(reason: AcceptNotice): AcceptNotice {
    clear(true);
    return reason;
  }

  async function begin(): Promise<void> {
    const id = invitationID;
    if (id === undefined) return;
    const own = generation;
    const kind = mode;
    const result = await send(own, 'begin', (commandID) =>
      api.begin(id, commandID),
    );
    if (dropped(own)) return;
    if (result.kind === 'committed') {
      keep({
        invitationID: id,
        mode: kind,
        displayName: kind === 'register' ? displayName : '',
        challenge: result.value,
        proof: undefined,
      });
      show(undefined);
      return;
    }
    refused(result, 'begin', ({ code }) => {
      if (code === 'NotFound' || code === 'InvalidArgument') {
        return { kind: 'invitation-closed' };
      }
      return code === 'Forbidden' ? { kind: 'scope-closed' } : undefined;
    });
  }

  function requestCode(): Promise<void> {
    return begin();
  }

  function detailsNotice(input: DetailsInput): AcceptNotice | undefined {
    const name = nameProblem(input.displayName.trim());
    const secret = passwordProblem(input.password);
    const again = input.repeat === input.password ? undefined : 'mismatch';
    if (name === undefined && secret === undefined && again === undefined) {
      return undefined;
    }
    return { kind: 'fields', name, password: secret, repeat: again };
  }

  function register(input: DetailsInput): Promise<void> {
    const problem = detailsNotice(input);
    if (problem !== undefined) {
      show(problem);
      return Promise.resolve();
    }
    displayName = input.displayName.trim();
    password = input.password;
    return begin();
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
  async function sendCode(current: AcceptRecord, code: string): Promise<void> {
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
      // The proof is spent at once if the scenario holds what it needs.
      if (next.mode === 'accept') {
        busy = true;
        await acceptNow(next);
      } else if (password !== '') {
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
      commands.discard(acceptKeys.verify);
      keep({ ...current, challenge: result.value });
      show({ kind: 'resent' });
      return;
    }
    refused(result, 'resend', ({ code }) =>
      code === 'NotFound' ? startOver({ kind: 'expired' }) : undefined,
    );
  }

  function proofOf(current: AcceptRecord): ProofInput | undefined {
    return current.proof === undefined
      ? undefined
      : { challengeID: current.challenge.challengeID, proof: current.proof };
  }

  function finish(next: Membership | undefined): void {
    generation += 1;
    keep(undefined);
    forgetInputs();
    membership = next;
    finished = true;
    busy = false;
  }

  async function completeNow(current: AcceptRecord): Promise<void> {
    const proof = proofOf(current);
    if (proof === undefined || password === '') return;
    const own = generation;
    const invited = { ...proof, password, displayName };
    const result = await send(own, 'complete', (commandID) =>
      api.complete(invited, commandID),
    );
    if (dropped(own)) return;
    if (result.kind === 'committed') {
      finish(undefined);
      session.adopt(result.value);
      void access.refresh();
      show(undefined);
      return;
    }
    refused(result, 'complete', ({ code }) => {
      if (code === 'NotFound') return startOver({ kind: 'proof-expired' });
      if (code === 'CommandConflict') return startOver({ kind: 'email-taken' });
      if (code === 'Forbidden') {
        // Signed in meanwhile: the page opens again in accept mode.
        clear(true);
        return 'silent';
      }
      if (code === 'InvalidArgument') {
        return {
          kind: 'fields',
          name: 'length',
          password: 'length',
          repeat: undefined,
        };
      }
      return undefined;
    });
  }

  async function acceptNow(current: AcceptRecord): Promise<void> {
    const proof = proofOf(current);
    const id = invitationID;
    if (proof === undefined || id === undefined) return;
    const own = generation;
    const result = await send(own, 'accept', (commandID) =>
      api.accept(id, proof, commandID),
    );
    if (dropped(own)) return;
    if (result.kind === 'committed') {
      finish(result.value);
      void access.refresh();
      show(undefined);
      return;
    }
    refused(result, 'accept', ({ code }) => {
      if (code === 'NotFound') return startOver({ kind: 'proof-expired' });
      if (code === 'Forbidden') return startOver({ kind: 'other-email' });
      if (code === 'CommandConflict')
        return startOver({ kind: 'not-accepted' });
      return undefined;
    });
  }

  async function completeDetails(input: DetailsInput): Promise<void> {
    const current = record;
    if (mode !== 'register' || current?.proof === undefined) return;
    const problem = detailsNotice(input);
    if (problem !== undefined) {
      show(problem);
      return;
    }
    displayName = input.displayName.trim();
    password = input.password;
    await completeNow(current);
  }

  async function acceptInvitation(): Promise<void> {
    const current = record;
    if (mode !== 'accept' || current?.proof === undefined) return;
    await acceptNow(current);
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
      case 'accept':
        return acceptInvitation();
    }
  }

  function open(id: string, next: AcceptMode): void {
    if (invitationID === id && (finished || mode === next)) return;
    const saved = storage.load();
    clear(false, false);
    invitationID = id;
    mode = next;
    if (saved?.invitationID === id && saved.mode === next) {
      record = saved;
      displayName = saved.displayName;
    } else if (saved !== undefined) {
      storage.clear();
    }
    show(undefined);
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
    open,
    register,
    requestCode,
    verify,
    resend,
    completeDetails,
    acceptInvitation,
    check,
    restart,
  };
}
