import type { RestaurantAccess, StaffRoleName } from '@/application/access';
import { sortedRoles, type Outcome } from '@/application/organization-commands';
import type {
  DurableResult,
  Invitation,
  InvitationRow,
  Member,
  RoleGrant,
} from '@/application/organizations';
import { roleTitle } from '@/presentation/app-shell/shell-context';
import { formatInstant } from '@/presentation/ui/time';
import { zoneLabel } from '@/presentation/ui/zones';

export type InvitationTone = 'neutral' | 'success' | 'error';

export interface InvitationStatus {
  readonly label: string;
  readonly tone: InvitationTone;
  readonly actions: readonly ('cancel' | 'resend' | 'reinvite')[];
}

// Auth gives an invitation seven days; the list shows when it was made from
// the end of that term.
export const invitationLifetimeMs = 7 * 24 * 60 * 60 * 1000;

// The status of a row: the state of the invitation, and for a pending one
// the latest delivery of its link. «Принято к отправке» is as far as Auth
// says: the letter is never «доставлено».
export function invitationStatus(row: InvitationRow): InvitationStatus {
  const { invitation, linkDelivery, resendAllowed } = row;
  switch (invitation.state) {
    case 'accepted':
      return { label: 'Принято', tone: 'success', actions: [] };
    case 'expired':
      return { label: 'Истекло', tone: 'neutral', actions: ['reinvite'] };
    case 'revoked':
      return { label: 'Отменено', tone: 'neutral', actions: ['reinvite'] };
    case 'suppressed':
      return {
        label: 'Недействительно',
        tone: 'neutral',
        actions: ['reinvite'],
      };
    case 'pending':
      break;
  }
  const actions: InvitationStatus['actions'] = resendAllowed
    ? ['cancel', 'resend']
    : ['cancel'];
  switch (linkDelivery?.state) {
    case 'pending':
    case 'retry':
      return { label: 'Принято к отправке', tone: 'neutral', actions };
    case 'sending':
      return { label: 'Ожидает доставки', tone: 'neutral', actions };
    case 'sent':
      return { label: 'Ожидает принятия', tone: 'neutral', actions };
    case 'unknown':
      return { label: 'Доставка не подтверждена', tone: 'neutral', actions };
    case 'failed':
      return { label: 'Ошибка отправки', tone: 'error', actions };
    case 'suppressed':
    case undefined:
      return { label: 'Ссылка не отправлена', tone: 'neutral', actions };
  }
}

const moment = (epochMs: number, timeZone: string) =>
  `${formatInstant(epochMs, timeZone, 'date')} ${formatInstant(epochMs, timeZone, 'time')}`;

// When the invitation was made: the term it was given ends at expiresAt.
export const createdAt = (invitation: Invitation) =>
  invitation.expiresAt.epochMs - invitationLifetimeMs;

// The line of dates under a row, in the zone of the organization.
export function invitationDates(row: InvitationRow, timeZone: string): string {
  const { invitation } = row;
  const created = `Создано ${moment(createdAt(invitation), timeZone)}`;
  switch (invitation.state) {
    case 'pending':
      return row.linkDelivery?.state === 'failed'
        ? 'Письмо не отправлено. Проверьте адрес и пригласите повторно.'
        : `${created} · действует до ${moment(invitation.expiresAt.epochMs, timeZone)}`;
    case 'expired':
      return `Истекло ${moment(invitation.expiresAt.epochMs, timeZone)}`;
    case 'accepted':
    case 'revoked':
    case 'suppressed':
      return created;
  }
}

// «Склад и Официант: На Садовой. Официант: На Береговой; На Садовой»:
// restaurants with the same roles stand together, in the order of access.
// A restaurant that access does not list is deleted.
export function grantsLine(
  grants: readonly RoleGrant[],
  restaurants: readonly RestaurantAccess[],
): string {
  const named = grants.flatMap((grant) => {
    const roles = sortedRoles(grant.roles);
    return roles.length > 0 ? [{ grant, roles }] : [];
  });
  const groups = new Map<string, { roles: string; names: string[] }>();
  const add = (roles: string, name: string) => {
    const group = groups.get(roles) ?? { roles, names: [] };
    group.names.push(name);
    groups.set(roles, group);
  };
  const title = (roles: readonly StaffRoleName[]) =>
    roles.map(roleTitle).join(' и ');
  for (const restaurant of restaurants) {
    const found = named.find(
      (item) => item.grant.restaurantID === restaurant.restaurantID,
    );
    if (found !== undefined) add(title(found.roles), restaurant.name);
  }
  for (const item of named) {
    if (
      restaurants.every(
        (restaurant) => restaurant.restaurantID !== item.grant.restaurantID,
      )
    ) {
      add(title(item.roles), 'ресторан удалён');
    }
  }
  return [...groups.values()]
    .map((group) => `${group.roles}: ${group.names.join('; ')}`)
    .join('. ');
}

// The newest first: the term of the later invitation ends later.
export function newestFirst(
  rows: readonly InvitationRow[],
): readonly InvitationRow[] {
  return [...rows].sort(
    (left, right) =>
      right.invitation.expiresAt.epochMs - left.invitation.expiresAt.epochMs,
  );
}

// An address compared ignoring case and the spaces round it: the check of
// the members (D14) and the search of the invitation (IV04).
export const emailKey = (email: string) => email.trim().toLowerCase();

// IV04: the end of the term of the pending invitation to that address.
export function pendingExpiry(
  email: string,
  rows: readonly InvitationRow[],
): number | undefined {
  const key = emailKey(email);
  const ends = rows
    .filter(
      (row) =>
        row.invitation.state === 'pending' &&
        emailKey(row.invitation.email) === key,
    )
    .map((row) => row.invitation.expiresAt.epochMs);
  return ends.length === 0 ? undefined : Math.max(...ends);
}

export type InviteState =
  | { readonly kind: 'editing' }
  // IV02: nothing is named when the server refused the fields.
  | {
      readonly kind: 'invalid';
      readonly email?: 'required' | 'format';
      readonly roles?: true;
    }
  | { readonly kind: 'member'; readonly membershipID: string } // IV03
  | { readonly kind: 'invited'; readonly expiresAt: number | undefined } // IV04
  | { readonly kind: 'sending' } // IV06
  | { readonly kind: 'unavailable' } // IV08
  | { readonly kind: 'unknown' } // IV09
  | { readonly kind: 'limited'; readonly seconds: number }
  | { readonly kind: 'delivery' }
  | { readonly kind: 'forbidden' };

export interface InviteInput {
  readonly email: string;
  readonly grants: readonly RoleGrant[];
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The checks before anything is sent: an empty address, its shape, no role at
// all, an address of a member (D14: Auth would take the invitation and then
// fail to accept it). undefined: it can be sent.
export function validateInvite(
  input: InviteInput,
  members: readonly Member[] | undefined,
): Extract<InviteState, { kind: 'invalid' } | { kind: 'member' }> | undefined {
  const email = input.email.trim();
  const problem =
    email === ''
      ? ('required' as const)
      : emailPattern.test(email)
        ? undefined
        : ('format' as const);
  const roles = !input.grants.some((grant) => grant.roles.length > 0);
  if (problem !== undefined || roles) {
    return {
      kind: 'invalid',
      ...(problem === undefined ? {} : { email: problem }),
      ...(roles ? { roles: true as const } : {}),
    };
  }
  const key = emailKey(email);
  const member = members?.find(
    (item) => item.email !== undefined && emailKey(item.email) === key,
  );
  return member === undefined
    ? undefined
    : { kind: 'member', membershipID: member.membership.membershipID };
}

// «Приглашение действует 7 дней: до 21.10.2026 10:00 (Москва, UTC+3).»
export function inviteTerm(nowMs: number, timeZone: string): string {
  const until = nowMs + invitationLifetimeMs;
  return `Приглашение действует 7 дней: до ${moment(until, timeZone)} (${zoneLabel(timeZone, until)}).`;
}

const emailMessages = {
  required: 'Укажите почту',
  format: 'Проверьте адрес почты',
} as const;
export const rolesRequired =
  'Выберите хотя бы одну роль хотя бы в одном ресторане';
export const memberMessage =
  'Пользователь с этой почтой уже состоит в организации. Назначения меняются на вкладке «Участники».';

// The texts under the fields of a form that was not filled right (IV02).
export function inviteFieldErrors(state: InviteState): {
  readonly email?: string;
  readonly roles?: string;
} {
  if (state.kind !== 'invalid') return {};
  return {
    ...(state.email === undefined ? {} : { email: emailMessages[state.email] }),
    ...(state.roles === undefined ? {} : { roles: rolesRequired }),
  };
}

const notSent = 'Приглашение не отправлено';

// What the form says (IV02 to IV09 and the refusals). A message without a
// title is the text of a field (IV03, IV04, under the address) or a status
// (IV06); the dates are in the zone of the organization.
export function inviteMessage(
  state: InviteState,
  timeZone: string,
): { title?: string; text: string } | undefined {
  switch (state.kind) {
    case 'editing':
      return undefined;
    case 'member':
      return { text: memberMessage };
    case 'invited':
      return {
        text:
          state.expiresAt === undefined
            ? 'На эту почту уже отправлено приглашение. Отмените его, чтобы отправить новое.'
            : `На эту почту уже отправлено приглашение, оно действует до ${moment(state.expiresAt, timeZone)} (${zoneLabel(timeZone, state.expiresAt)}). Отмените его, чтобы отправить новое.`,
      };
    case 'invalid':
      return {
        title: notSent,
        text:
          state.email === undefined && state.roles === undefined
            ? 'Проверьте почту и назначения и повторите отправку.'
            : 'Заполните поля, отмеченные ниже.',
      };
    case 'sending':
      return { text: 'Отправляем…' };
    case 'unavailable':
      return {
        title: notSent,
        text: 'Сервис авторизации не отвечает. Данные сохранены в форме, повторите отправку через несколько минут.',
      };
    case 'unknown':
      return {
        title: 'Результат отправки неизвестен',
        text: 'Ответ сервиса не получен. Приглашение могло быть создано. Повторная отправка не требуется: проверка продолжит ту же попытку.',
      };
    case 'limited':
      return {
        title: notSent,
        text: `Превышен лимит приглашений на эту почту. Повторите через ${String(Math.ceil(state.seconds / 60))} мин.`,
      };
    case 'delivery':
      return {
        title: notSent,
        text: 'Отправка писем не настроена. Обратитесь к администратору сервиса.',
      };
    case 'forbidden':
      return {
        title: notSent,
        text: 'Выбранный ресторан ещё не готов или роль администратора снята.',
      };
  }
}

// The frame after the answer of Auth to «Отправить приглашение». 'invited'
// takes its date from the invitations read again, so none is given here.
export function inviteOutcomeState(
  outcome: Outcome<Invitation>,
): InviteState | 'done' {
  switch (outcome.kind) {
    case 'done':
      return 'done';
    case 'invited':
      return { kind: 'invited', expiresAt: undefined };
    case 'limited':
      return { kind: 'limited', seconds: outcome.seconds };
    case 'delivery':
      return { kind: 'delivery' };
    case 'forbidden':
      return { kind: 'forbidden' };
    case 'unknown':
      return { kind: 'unknown' };
    case 'ended':
      return { kind: 'editing' };
    case 'invalid':
      return { kind: 'invalid' };
    case 'conflict':
    case 'last-admin':
    case 'closed':
    case 'gone':
    case 'unavailable':
      return { kind: 'unavailable' };
  }
}

// IV10: what the form says over a copy of an old invitation.
export function reinviteNotice(
  row: InvitationRow,
  timeZone: string,
): { title: string; text: string } {
  return {
    title: 'Повторное приглашение',
    text: `Почта, рестораны и роли взяты из приглашения от ${formatInstant(createdAt(row.invitation), timeZone, 'date')}. Проверьте их перед отправкой.`,
  };
}

// IV07: the router state the form leaves for the list, the address.
export interface InvitedState {
  readonly invited: string;
}

export function invitedEmail(state: unknown): string | undefined {
  if (typeof state !== 'object' || state === null) return undefined;
  const email: unknown = (state as { invited?: unknown }).invited;
  return typeof email === 'string' ? email : undefined;
}

export interface InvitationNotice {
  readonly title: string;
  readonly text: string;
}

export const invitedNotice = (email: string): InvitationNotice => ({
  title: `Приглашение для ${email} принято к отправке`,
  text: 'Статус доставки обновится в списке.',
});

// IN05.
export const cancelledNotice = (email: string): InvitationNotice => ({
  title: `Приглашение для ${email} отменено`,
  text: 'Ссылка из письма больше не действует.',
});

export const resentNotice = (email: string): InvitationNotice => ({
  title: `Ссылка для ${email} принята к отправке`,
  text: 'Статус доставки обновится в списке.',
});

const notResent = 'Ссылка не отправлена';
export const invalidInvitation = 'Приглашение уже недействительно';

// The answer of Auth to «Отправить ссылку повторно»: the notice of success,
// an error notice, or nothing to say (unknown has its own alert, the
// sign-out leaves the page).
export function resendResult(
  outcome: Outcome<DurableResult>,
  email: string,
):
  | { readonly tone: 'success' | 'error'; readonly notice: InvitationNotice }
  | undefined {
  switch (outcome.kind) {
    case 'done':
      return { tone: 'success', notice: resentNotice(email) };
    case 'limited':
      return {
        tone: 'error',
        notice: {
          title: notResent,
          text: `Повторная отправка будет доступна через ${String(outcome.seconds)} с.`,
        },
      };
    case 'closed':
      return {
        tone: 'error',
        notice: {
          title: invalidInvitation,
          text: `Приглашение для ${email} уже отменено, принято или истекло.`,
        },
      };
    case 'delivery':
      return {
        tone: 'error',
        notice: {
          title: notResent,
          text: 'Отправка писем не настроена. Обратитесь к администратору сервиса.',
        },
      };
    case 'forbidden':
      return {
        tone: 'error',
        notice: {
          title: notResent,
          text: 'Выбранный ресторан ещё не готов или роль администратора снята.',
        },
      };
    case 'unknown':
    case 'ended':
      return undefined;
    case 'invalid':
    case 'conflict':
    case 'last-admin':
    case 'invited':
    case 'gone':
    case 'unavailable':
      return {
        tone: 'error',
        notice: {
          title: notResent,
          text: 'Сервис авторизации не отвечает. Повторите через несколько минут.',
        },
      };
  }
}

export type CancelState =
  | { readonly kind: 'confirm' } // CX01
  | { readonly kind: 'cancelling' } // CX02
  | { readonly kind: 'accepted' } // CX03
  | { readonly kind: 'closed' }
  | { readonly kind: 'unavailable' } // CX04
  | { readonly kind: 'unknown' } // CX05
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'limited'; readonly seconds: number };

export interface CancelMessage {
  readonly title: string;
  readonly text: string;
}

export const cancelTitle = 'Отменить приглашение?';
const notCancelled = 'Приглашение не отменено';

// What the frames CX03 to CX05 say in the dialog. The confirmation and the
// progress have their own copy in the dialog.
export function cancelMessage(
  state: CancelState,
  email: string,
): CancelMessage | undefined {
  switch (state.kind) {
    case 'confirm':
    case 'cancelling':
      return undefined;
    case 'accepted':
      return {
        title: 'Приглашение уже принято',
        text: `Пользователь с почтой ${email} уже стал участником организации. Чтобы закрыть доступ, отзовите его на вкладке «Участники».`,
      };
    case 'closed':
      return {
        title: invalidInvitation,
        text: `Приглашение для ${email} уже отменено или истекло.`,
      };
    case 'unavailable':
      return {
        title: notCancelled,
        text: 'Сервис авторизации не отвечает. Повторите через несколько минут.',
      };
    case 'unknown':
      return {
        title: 'Результат отмены неизвестен',
        text: 'Ответ сервиса не получен. Приглашение могло быть отменено. Проверка продолжит ту же попытку.',
      };
    case 'forbidden':
      return {
        title: notCancelled,
        text: 'Отменять приглашения может администратор организации.',
      };
    case 'limited':
      return {
        title: notCancelled,
        text: `Повторите через ${String(state.seconds)} с.`,
      };
  }
}

// The answer of Auth to «Отменить приглашение»: 'done' closes the dialog and
// shows IN05, a refusal is a frame of the dialog.
export function cancelOutcomeState(
  outcome: Outcome<DurableResult>,
): CancelState | 'done' {
  switch (outcome.kind) {
    case 'done':
      return 'done';
    case 'closed':
      return { kind: 'closed' };
    case 'forbidden':
      return { kind: 'forbidden' };
    case 'limited':
      return { kind: 'limited', seconds: outcome.seconds };
    case 'unknown':
      return { kind: 'unknown' };
    case 'ended':
      return { kind: 'confirm' };
    case 'invalid':
    case 'conflict':
    case 'last-admin':
    case 'invited':
    case 'gone':
    case 'delivery':
    case 'unavailable':
      return { kind: 'unavailable' };
  }
}
