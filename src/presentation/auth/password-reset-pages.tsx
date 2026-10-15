import { Text, chakra } from '@chakra-ui/react';
import { useSyncExternalStore, type ReactNode } from 'react';
import { redirect, useNavigate } from 'react-router';
import {
  isCodeExpired,
  type ResetAction,
  type ResetMove,
  type ResetNotice,
  type ResetSnapshot,
  type ResetStep,
} from '@/application/password-reset';
import {
  useServices,
  type PresentationServices,
} from '@/presentation/services';
import { Button, TextLink } from '@/presentation/ui/actions';
import {
  formatCountdown,
  secondsLeft,
  useNow,
} from '@/presentation/ui/countdown';
import {
  CodeInput,
  FieldGroup,
  FieldLabel,
  FieldMessage,
  PasswordInput,
  TextInput,
} from '@/presentation/ui/form';
import { FormMessage } from '@/presentation/ui/form-message';
import { plural } from '@/presentation/ui/plural';
import { UnknownOutcomeAlert } from '@/presentation/ui/states';
import { AuthLayout, AuthLead, AuthTitle } from './auth-layout';

const help = 'Нет доступа к почте — обратитесь к администратору организации.';
const passwordHint =
  'От 8 до 32 символов. Можно вставить пароль из менеджера паролей.';
const stepPaths: Record<ResetStep, string> = {
  email: '/password-reset',
  code: '/password-reset/code',
  password: '/password-reset/new',
};

const lostAnswer =
  'Связь прервалась. Нажмите «Проверить результат» — повторно ничего не отправится.';
const mayHaveSent =
  'Связь прервалась, код мог уже прийти. Нажмите «Проверить результат» — повторно ничего не отправится.';
const unknownTitles: Record<ResetAction, string> = {
  request: 'Не знаем, отправлен ли код',
  renew: 'Не знаем, отправлен ли код',
  verify: 'Не знаем, подошёл ли код',
  resend: 'Не знаем, отправлен ли новый код',
  complete: 'Не знаем, сохранился ли пароль',
};
const unknownTexts: Record<ResetAction, string> = {
  request: mayHaveSent,
  renew: mayHaveSent,
  verify: lostAnswer,
  resend: mayHaveSent,
  complete:
    'Связь прервалась, пароль мог уже смениться. Нажмите «Проверить результат» — повторно ничего не отправится.',
};

export interface ResetMessage {
  readonly tone: 'error' | 'success';
  readonly title: string;
  readonly text: string;
}

const fixedMessages: Partial<Record<ResetNotice['kind'], ResetMessage>> = {
  unavailable: {
    tone: 'error',
    title: 'Не получилось восстановить пароль',
    text: 'Пароль остался прежним. Попробуйте через пару минут.',
  },
  expired: {
    tone: 'error',
    title: 'Срок действия кода истёк',
    text: 'Запросите новый код.',
  },
  resent: {
    tone: 'success',
    title: 'Новый код отправлен',
    text: 'Проверьте почту. Старый код больше не подойдёт.',
  },
  locked: {
    tone: 'error',
    title: 'Код больше не действует',
    text: 'Вы несколько раз ввели неверный код. Запросите новый.',
  },
  'proof-expired': {
    tone: 'error',
    title: 'Время вышло',
    text: 'Запросите новый код и начните заново.',
  },
};

// R03, R04, R06b, R07, «Новый код отправлен» and «Время вышло».
// A wait that has run out says nothing.
export function resetMessage(
  notice: ResetNotice | undefined,
  nowMs: number,
): ResetMessage | undefined {
  if (notice === undefined) return undefined;
  if (notice.kind === 'limited') {
    const seconds = secondsLeft(notice.untilMs, nowMs);
    if (seconds === 0) return undefined;
    return {
      tone: 'error',
      title: 'Слишком много запросов кода',
      text: `Попробуйте через ${String(seconds)}\u00A0${plural(seconds, 'секунду', 'секунды', 'секунд')}.`,
    };
  }
  return fixedMessages[notice.kind];
}

// R01a, R01c and the server's refusal of the address.
export function emailError(
  notice: ResetNotice | undefined,
): string | undefined {
  if (notice?.kind === 'email-required') return 'Введите почту';
  if (notice?.kind === 'not-found') return 'Аккаунта с такой почтой нет.';
  if (notice?.kind === 'invalid-email') return 'Проверьте адрес почты.';
  return undefined;
}

// R05a and R06.
export function codeError(notice: ResetNotice | undefined): string | undefined {
  if (notice?.kind === 'code-format') return 'Введите 6 цифр из письма.';
  if (notice?.kind === 'wrong-code') return 'Неверный код.';
  return undefined;
}

// R08a and R09.
export function newPasswordErrors(notice: ResetNotice | undefined): {
  readonly newPassword: string | undefined;
  readonly repeat: string | undefined;
} {
  if (notice?.kind !== 'password-fields') {
    return { newPassword: undefined, repeat: undefined };
  }
  let newPassword: string | undefined;
  if (notice.newPassword === 'required') newPassword = 'Введите новый пароль';
  if (notice.newPassword === 'length') {
    newPassword = 'Нужно от 8 до 32 символов.';
  }
  return {
    newPassword,
    repeat: notice.repeat === 'mismatch' ? 'Пароли не совпадают.' : undefined,
  };
}

// /password-reset/code and /new open only on their own step.
export function createResetStepLoader(
  services: PresentationServices,
  step: Exclude<ResetStep, 'email'>,
) {
  return () => {
    const current = services.passwordReset.getSnapshot().step;
    return current === step ? null : redirect(stepPaths[current]);
  };
}

function useReset(): ResetSnapshot {
  const { passwordReset } = useServices();
  return useSyncExternalStore(
    passwordReset.subscribe,
    passwordReset.getSnapshot,
    passwordReset.getSnapshot,
  );
}

function useMove(): (move: ResetMove) => void {
  const navigate = useNavigate();
  return (move) => {
    if (move === 'stay') return;
    if (move === 'done') {
      void navigate('/app', { replace: true });
      return;
    }
    void navigate(stepPaths[move]);
  };
}

const field = (value: FormDataEntryValue | null) =>
  typeof value === 'string' ? value : '';

function Message({
  message,
  action,
}: {
  message: ResetMessage | undefined;
  action?: ReactNode;
}) {
  if (message === undefined) return null;
  return (
    <FormMessage tone={message.tone} title={message.title} action={action}>
      {message.text}
    </FormMessage>
  );
}

function Unknown({
  notice,
  onCheck,
  extra,
}: {
  notice: ResetNotice | undefined;
  onCheck: () => void;
  extra?: ReactNode;
}) {
  if (notice?.kind !== 'unknown') return null;
  if (extra === undefined) {
    return (
      <UnknownOutcomeAlert
        title={unknownTitles[notice.action]}
        onCheck={onCheck}
      >
        {unknownTexts[notice.action]}
      </UnknownOutcomeAlert>
    );
  }
  return (
    <FormMessage
      tone="unknown"
      title={unknownTitles[notice.action]}
      action={
        <>
          <Button type="button" variant="secondary" onClick={onCheck}>
            Проверить результат
          </Button>
          {extra}
        </>
      }
    >
      {unknownTexts[notice.action]}
    </FormMessage>
  );
}

// Figma R01–R04, R01c, R01d.
export function PasswordResetRequestPage() {
  const { passwordReset: flow } = useServices();
  const reset = useReset();
  const move = useMove();
  const now = useNow(reset.notice?.kind === 'limited');
  const message = resetMessage(reset.notice, now);
  const waiting = reset.notice?.kind === 'limited' && message !== undefined;
  const unknown = reset.notice?.kind === 'unknown';
  const error = emailError(reset.notice);
  return (
    <AuthLayout title="Восстановление пароля" help={help}>
      <AuthTitle>Восстановление пароля</AuthTitle>
      <AuthLead>Укажите почту от аккаунта. Отправим на неё код.</AuthLead>
      <Unknown
        notice={reset.notice}
        onCheck={() => {
          void flow.check().then(move);
        }}
      />
      <chakra.form
        noValidate
        display="flex"
        flexDirection="column"
        gap="6"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void flow.request(field(data.get('email'))).then(move);
        }}
      >
        <chakra.fieldset disabled={unknown || reset.busy} display="contents">
          <FieldGroup>
            <FieldLabel htmlFor="reset-email">Почта</FieldLabel>
            <TextInput
              id="reset-email"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={reset.email}
              invalid={error !== undefined}
              aria-describedby={
                error === undefined ? undefined : 'reset-email-error'
              }
            />
            <FieldMessage id="reset-email-error" error={error} />
          </FieldGroup>
        </chakra.fieldset>
        <Button
          type="submit"
          w="full"
          disabled={reset.busy || waiting || unknown}
          aria-busy={reset.busy}
        >
          {reset.busy ? 'Отправляем…' : 'Получить код'}
        </Button>
        <Message message={message} />
      </chakra.form>
      <TextLink
        to="/login"
        alignSelf="flex-start"
        onClick={() => {
          flow.restart(false);
        }}
      >
        Вернуться ко входу
      </TextLink>
    </AuthLayout>
  );
}

// Figma R05–R07, R06b and the states of checking and resending the code.
export function PasswordResetCodePage() {
  const { passwordReset: flow } = useServices();
  const reset = useReset();
  const move = useMove();
  const navigate = useNavigate();
  const now = useNow(true);
  const expired = isCodeExpired(reset, now) || reset.notice?.kind === 'expired';
  const locked = reset.notice?.kind === 'locked';
  const unknown = reset.notice?.kind === 'unknown';
  // The notice's own message wins over the expiry text.
  const own = resetMessage(reset.notice, now);
  const message =
    own ?? (expired ? resetMessage({ kind: 'expired' }, now) : undefined);
  const limited = reset.notice?.kind === 'limited' && own !== undefined;
  const error = codeError(reset.notice);
  const resendIn = (reset.resendAtMs ?? now) - now;
  const closed = unknown || reset.busy || locked || expired;
  return (
    <AuthLayout title="Введите код" help={help}>
      <AuthTitle>Введите код</AuthTitle>
      <AuthLead>{`Отправили код на ${reset.email}. Код действует 10 минут.`}</AuthLead>
      <Unknown
        notice={reset.notice}
        onCheck={() => {
          void flow.check().then(move);
        }}
      />
      <chakra.form
        noValidate
        display="flex"
        flexDirection="column"
        gap="6"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void flow.verify(field(data.get('code'))).then(move);
        }}
      >
        <chakra.fieldset disabled={closed} display="contents">
          <FieldGroup>
            <FieldLabel htmlFor="reset-code">Код из письма</FieldLabel>
            <CodeInput
              id="reset-code"
              name="code"
              aria-invalid={error === undefined ? undefined : true}
              aria-describedby="reset-code-hint"
            />
            <FieldMessage
              id="reset-code-hint"
              error={error}
              hint="6 цифр из письма. Код можно вставить целиком."
            />
          </FieldGroup>
        </chakra.fieldset>
        {!expired && resendIn > 0 ? (
          <Text textStyle="caption.default" color="text.secondary">
            {`Отправить код ещё раз можно через ${formatCountdown(resendIn)}`}
          </Text>
        ) : (
          <Button
            type="button"
            variant="link"
            alignSelf="flex-start"
            disabled={unknown || reset.busy || locked || limited}
            onClick={() => {
              void (expired ? flow.renew() : flow.resend()).then(move);
            }}
          >
            Отправить код ещё раз
          </Button>
        )}
        <Button type="submit" w="full" disabled={closed} aria-busy={reset.busy}>
          {reset.busy ? 'Проверяем…' : 'Продолжить'}
        </Button>
        <Message
          message={message}
          action={
            locked ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  flow.restart(true);
                  void navigate('/password-reset');
                }}
              >
                Запросить новый код
              </Button>
            ) : undefined
          }
        />
      </chakra.form>
      <TextLink
        to="/password-reset"
        alignSelf="flex-start"
        onClick={() => {
          flow.restart(false);
        }}
      >
        Указать другую почту
      </TextLink>
    </AuthLayout>
  );
}

// Figma R08–R11.
export function PasswordResetNewPage() {
  const { passwordReset: flow } = useServices();
  const reset = useReset();
  const move = useMove();
  const navigate = useNavigate();
  const now = useNow(false);
  const unknown = reset.notice?.kind === 'unknown';
  const errors = newPasswordErrors(reset.notice);
  const message = resetMessage(reset.notice, now);
  const leave = () => {
    flow.restart(false);
    void navigate('/login');
  };
  return (
    <AuthLayout title="Новый пароль" help={help}>
      <AuthTitle>Новый пароль</AuthTitle>
      <AuthLead>
        После сохранения вы выйдете на всех устройствах и сразу войдёте здесь с
        новым паролем.
      </AuthLead>
      <Unknown
        notice={reset.notice}
        onCheck={() => {
          void flow.check().then(move);
        }}
        extra={
          <Button type="button" variant="secondary" onClick={leave}>
            Перейти ко входу
          </Button>
        }
      />
      <chakra.form
        noValidate
        display="flex"
        flexDirection="column"
        gap="6"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void flow
            .complete(
              field(data.get('newPassword')),
              field(data.get('repeatPassword')),
            )
            .then(move);
        }}
      >
        <chakra.fieldset disabled={unknown || reset.busy} display="contents">
          <FieldGroup>
            <FieldLabel htmlFor="new-password">Новый пароль</FieldLabel>
            <PasswordInput
              id="new-password"
              name="newPassword"
              autoComplete="new-password"
              aria-describedby="new-password-hint"
            />
            <FieldMessage
              id="new-password-hint"
              error={errors.newPassword}
              hint={passwordHint}
            />
          </FieldGroup>
          <FieldGroup>
            <FieldLabel htmlFor="repeat-password">
              Повторите новый пароль
            </FieldLabel>
            <PasswordInput
              id="repeat-password"
              name="repeatPassword"
              autoComplete="new-password"
              aria-describedby={
                errors.repeat === undefined
                  ? undefined
                  : 'repeat-password-error'
              }
            />
            <FieldMessage id="repeat-password-error" error={errors.repeat} />
          </FieldGroup>
        </chakra.fieldset>
        <Button
          type="submit"
          w="full"
          disabled={unknown || reset.busy}
          aria-busy={reset.busy}
        >
          {reset.busy ? 'Сохраняем…' : 'Сохранить пароль'}
        </Button>
        <Message message={message} />
      </chakra.form>
      <TextLink
        to="/login"
        alignSelf="flex-start"
        onClick={() => {
          flow.restart(false);
        }}
      >
        Вернуться ко входу
      </TextLink>
    </AuthLayout>
  );
}
