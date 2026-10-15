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
  'Ответ сервиса не получен. Повторная отправка не требуется: проверка продолжит ту же попытку.';
const mayHaveSent =
  'Ответ сервиса не получен. Код мог быть отправлен. Повторная отправка не требуется: проверка продолжит ту же попытку.';

export const unknownTitles: Record<AcceptAction, string> = {
  begin: 'Результат запроса кода неизвестен',
  verify: 'Результат проверки кода неизвестен',
  resend: 'Результат повторной отправки неизвестен',
  complete: 'Создание учётной записи не подтверждено',
  accept: 'Принятие приглашения не подтверждено',
};

export const unknownTexts: Record<AcceptAction, string> = {
  begin: mayHaveSent,
  verify: lostAnswer,
  resend: mayHaveSent,
  complete:
    'Ответ сервиса не получен, учётная запись могла быть создана. Повторная отправка не требуется: проверка продолжит ту же попытку.',
  accept:
    'Ответ сервиса не получен, приглашение могло быть принято. Повторная отправка не требуется: проверка продолжит ту же попытку.',
};

const fixedMessages: Partial<Record<AcceptNotice['kind'], AcceptMessage>> = {
  'wrong-code': {
    tone: 'error',
    title: 'Неверный код',
    text: 'Проверьте код из последнего письма.',
  },
  unavailable: {
    tone: 'error',
    title: 'Приглашение временно недоступно',
    text: 'Сервис не отвечает, действие не выполнено. Повторите попытку через несколько минут.',
  },
  'proof-expired': {
    tone: 'error',
    title: 'Подтверждение устарело',
    text: 'Получите новый код и повторите попытку.',
  },
  'invitation-closed': {
    tone: 'error',
    title: 'Приглашение недействительно',
    text: 'Срок приглашения истёк, его отменили или уже приняли. Попросите администратора организации отправить новое.',
  },
  'scope-closed': {
    tone: 'error',
    title: 'Приглашение недоступно',
    text: 'Организация или ресторан из приглашения сейчас недоступны. Обратитесь к администратору организации.',
  },
  'email-taken': {
    tone: 'error',
    title: 'Учётная запись уже есть',
    text: 'Пользователь с почтой из приглашения уже зарегистрирован. Войдите и примите приглашение.',
  },
  'other-email': {
    tone: 'error',
    title: 'Приглашение отправлено на другую почту',
    text: 'Почта этой учётной записи не совпадает с почтой из приглашения. Войдите учётной записью, на почту которой пришло письмо.',
  },
  'not-accepted': {
    tone: 'error',
    title: 'Приглашение не принято',
    text: 'Учётная запись уже состоит в этой организации или почта из приглашения принадлежит другой учётной записи.',
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
