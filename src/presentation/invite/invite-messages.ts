import type {
  AcceptAction,
  AcceptNotice,
} from '@/application/invitation-acceptance';
import {
  credentialErrors,
  type CredentialErrors,
} from '@/presentation/auth/credential-fields';
import { resetMessage } from '@/presentation/auth/password-reset-pages';

export interface AcceptMessage {
  readonly tone: 'error' | 'success';
  readonly title: string;
  readonly text: string;
}

const lostAnswer =
  'Связь прервалась. Нажмите «Проверить результат» — повторно ничего не отправится.';
const mayHaveSent =
  'Связь прервалась, код мог уже прийти. Нажмите «Проверить результат» — повторно ничего не отправится.';

export const unknownTitles: Record<AcceptAction, string> = {
  begin: 'Не знаем, отправлен ли код',
  verify: 'Не знаем, подошёл ли код',
  resend: 'Не знаем, отправлен ли новый код',
  complete: 'Не знаем, создан ли аккаунт',
  accept: 'Не знаем, принято ли приглашение',
};

export const unknownTexts: Record<AcceptAction, string> = {
  begin: mayHaveSent,
  verify: lostAnswer,
  resend: mayHaveSent,
  complete:
    'Связь прервалась. Нажмите «Проверить результат» — второй аккаунт не появится.',
  accept: lostAnswer,
};

const fixedMessages: Partial<Record<AcceptNotice['kind'], AcceptMessage>> = {
  'wrong-code': {
    tone: 'error',
    title: 'Неверный код',
    text: 'Проверьте код из последнего письма.',
  },
  unavailable: {
    tone: 'error',
    title: 'Не получилось продолжить',
    text: 'Ничего не изменилось. Попробуйте через пару минут.',
  },
  'proof-expired': {
    tone: 'error',
    title: 'Время вышло',
    text: 'Запросите новый код и попробуйте ещё раз.',
  },
  'invitation-closed': {
    tone: 'error',
    title: 'Приглашение больше не действует',
    text: 'Срок приглашения истёк, его отменили или уже приняли. Попросите администратора организации прислать новое.',
  },
  'scope-closed': {
    tone: 'error',
    title: 'Приглашение недоступно',
    text: 'Организация или ресторан из приглашения сейчас недоступны. Обратитесь к администратору организации.',
  },
  'email-taken': {
    tone: 'error',
    title: 'Аккаунт уже есть',
    text: 'У вас уже есть аккаунт на эту почту. Войдите и примите приглашение.',
  },
  'other-email': {
    tone: 'error',
    title: 'Приглашение отправлено на другую почту',
    text: 'У этого аккаунта другая почта. Войдите в аккаунт с той почтой, на которую пришло приглашение.',
  },
  'not-accepted': {
    tone: 'error',
    title: 'Приглашение не принято',
    text: 'Вы уже состоите в этой организации, или почта из приглашения привязана к другому аккаунту.',
  },
};

// The notice as a message above the form. The code that ran out, the code
// that was locked, the new code and a wait are worded as on the password
// reset; a wait that has run out says nothing. Field faults and a lost
// answer have their own places.
export function acceptMessage(
  notice: AcceptNotice | undefined,
  nowMs: number,
): AcceptMessage | undefined {
  if (notice === undefined) return undefined;
  if (notice.kind === 'limited') return resetMessage(notice, nowMs);
  if (
    notice.kind === 'expired' ||
    notice.kind === 'resent' ||
    notice.kind === 'locked'
  ) {
    return resetMessage({ kind: notice.kind }, nowMs);
  }
  return fixedMessages[notice.kind];
}

export type DetailsErrors = CredentialErrors;

// The faults of the name and the password fields.
export function detailsErrors(notice: AcceptNotice | undefined): DetailsErrors {
  return credentialErrors(notice?.kind === 'fields' ? notice : undefined);
}

export function codeError(
  notice: AcceptNotice | undefined,
): string | undefined {
  return notice?.kind === 'code-format'
    ? 'Введите 6 цифр из письма.'
    : undefined;
}
