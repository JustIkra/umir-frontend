import type { Challenge, UserView, VerifiedChallenge } from './account';
import type { AccessStore } from './access';
import { createChallengeFlow } from './challenge-flow';
import type { CommandRunner } from './commands';
import { nameProblem, normalizedCode, passwordProblem } from './credentials';
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
  complete: 'создания аккаунта',
  accept: 'принятия приглашения',
};

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
  let invitationID: string | undefined;
  let mode: AcceptMode = 'register';
  let displayName = '';
  let membership: Membership | undefined;

  function view(): AcceptSnapshot {
    const { record } = core;
    let step: AcceptStep = 'start';
    if (core.finished) step = 'done';
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
      busy: core.busy,
      notice: core.notice,
      membership,
    };
  }

  // Back to the start, without a notification. The saved record is removed
  // unless open() has just read it.
  function clear(keepName: boolean, wipeStorage = true): void {
    core.reset(wipeStorage);
    if (!keepName) displayName = '';
    membership = undefined;
  }

  const core = createChallengeFlow<
    AcceptAction,
    AcceptNotice,
    AcceptRecord,
    AcceptSnapshot
  >({
    commands,
    now,
    storage,
    initial: undefined,
    keys: acceptKeys,
    labels,
    notices: {
      unknown: (action) => ({ kind: 'unknown', action }),
      limited: (untilMs) => ({ kind: 'limited', untilMs }),
      unavailable: { kind: 'unavailable' },
    },
    view,
    abandon: () => {
      clear(true);
    },
  });
  const { memory } = core;

  async function begin(): Promise<void> {
    const id = invitationID;
    if (id === undefined) return;
    const own = core.generation;
    const kind = mode;
    const result = await core.send(own, 'begin', (commandID) =>
      api.begin(id, commandID),
    );
    if (core.dropped(own)) return;
    if (result.kind === 'committed') {
      core.keep({
        invitationID: id,
        mode: kind,
        displayName: kind === 'register' ? displayName : '',
        challenge: result.value,
        proof: undefined,
      });
      core.show(undefined);
      return;
    }
    core.refused(result, 'begin', ({ code }) => {
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
      core.show(problem);
      return Promise.resolve();
    }
    displayName = input.displayName.trim();
    memory.password = input.password;
    return begin();
  }

  async function verify(input: string): Promise<void> {
    const current = core.record;
    if (current === undefined) return;
    if (now() >= current.challenge.expiresAt.epochMs) {
      core.show({ kind: 'expired' });
      return;
    }
    const code = normalizedCode(input);
    if (code === undefined) {
      core.show({ kind: 'code-format' });
      return;
    }
    memory.lastCode = code;
    await sendCode(current, code);
  }

  // check() repeats a lost verify without the clock pre-check: the server
  // answers for an expired code itself, and a proof issued before expiry
  // must not be lost.
  async function sendCode(current: AcceptRecord, code: string): Promise<void> {
    const own = core.generation;
    const { challengeID } = current.challenge;
    const result = await core.send(own, 'verify', (commandID) =>
      api.verify(challengeID, code, commandID),
    );
    if (core.dropped(own)) return;
    if (result.kind === 'committed') {
      const next = {
        ...current,
        challenge: result.value.challenge,
        proof: result.value.proof,
      };
      core.keep(next);
      memory.lastCode = '';
      // The proof is spent at once if the scenario holds what it needs.
      if (next.mode === 'accept') {
        core.hold();
        await acceptNow(next);
      } else if (memory.password !== '') {
        core.hold();
        await completeNow(next);
      } else {
        core.show(undefined);
      }
      return;
    }
    core.refused(result, 'verify', ({ code: refusal }) => {
      // A wrong code is committed: the attempt counts against the five.
      if (refusal === 'InvalidArgument') return { kind: 'wrong-code' };
      if (refusal === 'ChallengeLocked') return { kind: 'locked' };
      return refusal === 'NotFound' ? { kind: 'expired' } : undefined;
    });
  }

  async function resend(): Promise<void> {
    const current = core.record;
    if (current === undefined) return;
    const own = core.generation;
    const result = await core.send(own, 'resend', (commandID) =>
      api.resend(current.challenge.challengeID, commandID),
    );
    if (core.dropped(own)) return;
    if (result.kind === 'committed') {
      // The previous code no longer works.
      commands.discard(acceptKeys.verify);
      core.keep({ ...current, challenge: result.value });
      core.show({ kind: 'resent' });
      return;
    }
    core.refused(result, 'resend', ({ code }) =>
      code === 'NotFound' ? core.startOver({ kind: 'expired' }) : undefined,
    );
  }

  function proofOf(current: AcceptRecord): ProofInput | undefined {
    return current.proof === undefined
      ? undefined
      : { challengeID: current.challenge.challengeID, proof: current.proof };
  }

  function finish(next: Membership | undefined): void {
    core.finish();
    membership = next;
  }

  async function completeNow(current: AcceptRecord): Promise<void> {
    const proof = proofOf(current);
    if (proof === undefined || memory.password === '') return;
    const own = core.generation;
    const invited = { ...proof, password: memory.password, displayName };
    const result = await core.send(own, 'complete', (commandID) =>
      api.complete(invited, commandID),
    );
    if (core.dropped(own)) return;
    if (result.kind === 'committed') {
      finish(undefined);
      session.adopt(result.value);
      void access.refresh();
      core.show(undefined);
      return;
    }
    core.refused(result, 'complete', ({ code }) => {
      if (code === 'NotFound') {
        return core.startOver({ kind: 'proof-expired' });
      }
      if (code === 'CommandConflict') {
        return core.startOver({ kind: 'email-taken' });
      }
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
    const own = core.generation;
    const result = await core.send(own, 'accept', (commandID) =>
      api.accept(id, proof, commandID),
    );
    if (core.dropped(own)) return;
    if (result.kind === 'committed') {
      finish(result.value);
      void access.refresh();
      core.show(undefined);
      return;
    }
    core.refused(result, 'accept', ({ code }) => {
      if (code === 'NotFound') {
        return core.startOver({ kind: 'proof-expired' });
      }
      if (code === 'Forbidden') {
        return core.startOver({ kind: 'other-email' });
      }
      if (code === 'CommandConflict') {
        return core.startOver({ kind: 'not-accepted' });
      }
      return undefined;
    });
  }

  async function completeDetails(input: DetailsInput): Promise<void> {
    const current = core.record;
    if (mode !== 'register' || current?.proof === undefined) return;
    const problem = detailsNotice(input);
    if (problem !== undefined) {
      core.show(problem);
      return;
    }
    displayName = input.displayName.trim();
    memory.password = input.password;
    await completeNow(current);
  }

  async function acceptInvitation(): Promise<void> {
    const current = core.record;
    if (mode !== 'accept' || current?.proof === undefined) return;
    await acceptNow(current);
  }

  async function check(): Promise<void> {
    const { notice, record } = core;
    if (notice?.kind !== 'unknown') return;
    switch (notice.action) {
      case 'begin':
        return begin();
      case 'verify':
        if (record !== undefined) await sendCode(record, memory.lastCode);
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
    if (invitationID === id && (core.finished || mode === next)) return;
    const saved = storage.load();
    clear(false, false);
    invitationID = id;
    mode = next;
    if (saved?.invitationID === id && saved.mode === next) {
      core.adopt(saved);
      displayName = saved.displayName;
    } else if (saved !== undefined) {
      storage.clear();
    }
    core.show(undefined);
  }

  function restart(): void {
    clear(false);
    core.show(undefined);
  }

  return {
    subscribe: core.subscribe,
    getSnapshot: core.getSnapshot,
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
