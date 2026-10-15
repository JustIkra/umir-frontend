import type {
  RegisterNotice,
  RegisterAction,
} from '@/application/registration';
import {
  credentialErrors,
  type CredentialErrors,
} from '@/presentation/auth/credential-fields';
import { resetMessage } from '@/presentation/auth/password-reset-pages';
import {
  acceptMessage,
  unknownTexts as inviteTexts,
  unknownTitles as inviteTitles,
} from '@/presentation/invite/invite-messages';

export interface RegisterMessage {
  readonly tone: 'error' | 'success';
  readonly title: string;
  readonly text: string;
}

// A lost answer is worded as on the invitation page.
export const unknownTitles: Record<RegisterAction, string> = inviteTitles;
export const unknownTexts: Record<RegisterAction, string> = inviteTexts;

export const consentError =
  'Подтвердите согласие на обработку персональных данных';

const fixedMessages: Partial<Record<RegisterNotice['kind'], RegisterMessage>> =
  {
    closed: {
      tone: 'error',
      title: 'Регистрация недоступна',
      text: 'Сейчас создать учётную запись нельзя. Доступ предоставляет администратор организации по приглашению.',
    },
    'email-taken': {
      tone: 'error',
      title: 'Учётная запись уже есть',
      text: 'Пользователь с этой почтой уже зарегистрирован. Войдите или восстановите пароль.',
    },
    unavailable: {
      tone: 'error',
      title: 'Регистрация временно недоступна',
      text: 'Сервис не отвечает, действие не выполнено. Повторите попытку через несколько минут.',
    },
  };

// The notice as a message above or below the form. The code that ran out, the
// code that was locked, the new code and a wait are worded as on the password
// reset, a wrong code and an old proof as on the invitation; a wait that has
// run out says nothing. Field faults and a lost answer have their own places.
export function registerMessage(
  notice: RegisterNotice | undefined,
  nowMs: number,
): RegisterMessage | undefined {
  if (notice === undefined) return undefined;
  if (notice.kind === 'limited') return resetMessage(notice, nowMs);
  if (
    notice.kind === 'expired' ||
    notice.kind === 'resent' ||
    notice.kind === 'locked'
  ) {
    return resetMessage({ kind: notice.kind }, nowMs);
  }
  if (notice.kind === 'wrong-code' || notice.kind === 'proof-expired') {
    return acceptMessage({ kind: notice.kind }, nowMs);
  }
  return fixedMessages[notice.kind];
}

export interface RegisterFieldErrors extends CredentialErrors {
  readonly email: string | undefined;
  readonly consent: string | undefined;
}

// The faults of the fields of the form.
export function registerFieldErrors(
  notice: RegisterNotice | undefined,
): RegisterFieldErrors {
  const fields = notice?.kind === 'fields' ? notice : undefined;
  let email: string | undefined;
  if (fields?.email === 'required') email = 'Введите почту';
  if (fields?.email === 'format') email = 'Проверьте адрес почты.';
  return {
    ...credentialErrors(fields),
    email,
    consent: notice?.kind === 'consent' ? consentError : undefined,
  };
}

export function registerCodeError(
  notice: RegisterNotice | undefined,
): string | undefined {
  return notice?.kind === 'code-format'
    ? 'Введите 6 цифр из письма.'
    : undefined;
}
