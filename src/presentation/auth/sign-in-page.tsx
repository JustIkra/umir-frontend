import { Stack, Text, chakra } from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { CommandResult } from '@/application/commands';
import { returnPath, type SignInNotice } from '@/application/session';
import { useSession } from '@/presentation/session/hooks';
import { useServices } from '@/presentation/services';
import { Button, TextLink } from '@/presentation/ui/actions';
import {
  CheckboxField,
  FieldGroup,
  FieldLabel,
  PasswordInput,
  TextInput,
} from '@/presentation/ui/form';
import { FormMessage } from '@/presentation/ui/form-message';
import { plural } from '@/presentation/ui/plural';
import { UnknownOutcomeAlert } from '@/presentation/ui/states';
import { AuthLayout, AuthTitle } from './auth-layout';

export interface SignInMessage {
  readonly tone: 'error' | 'unknown';
  readonly title: string;
  readonly text: string;
  readonly waitSeconds?: number;
}

const rateLimits = new Set(['LoginRateLimited', 'RateLimited']);

// What the form says after an attempt (L05, the C08 pattern for limits, the
// RS06 pattern for a lost answer).
export function signInMessage(
  result: CommandResult<unknown>,
  notice?: SignInNotice,
): SignInMessage | undefined {
  switch (result.kind) {
    case 'committed':
      return undefined;
    case 'unknown':
      return {
        tone: 'unknown',
        title: 'Не знаем, получилось ли войти',
        text: 'Связь прервалась. Нажмите «Проверить результат» — входить заново не нужно.',
      };
    case 'reset':
      break;
    case 'rejected': {
      const { code, status, retryAfterSeconds } = result.failure;
      if (code === 'InvalidCredentials' || code === 'InvalidArgument') {
        return {
          tone: 'error',
          title: 'Не удалось войти',
          text: 'Проверьте логин и пароль и попробуйте снова.',
        };
      }
      if (status === 429 || rateLimits.has(code)) {
        const seconds = retryAfterSeconds ?? 60;
        return {
          tone: 'error',
          title: 'Слишком много попыток входа',
          text: `Попробуйте через ${String(seconds)}\u00A0${plural(seconds, 'секунду', 'секунды', 'секунд')}.`,
          waitSeconds: seconds,
        };
      }
      break;
    }
  }
  // L14: after an unknown password change the valid password is not known
  // until Auth answers again.
  if (notice?.kind === 'password-unknown') {
    return {
      tone: 'error',
      title: 'Не получилось войти',
      text: 'Пока не знаем, какой пароль действует — старый или новый. Попробуйте войти через пару минут.',
    };
  }
  return {
    tone: 'error',
    title: 'Не получилось войти',
    text: 'Попробуйте через пару минут.',
  };
}

// L11, L13 and L10 after «Аккаунт» ended the session, and the notice
// after signing out on every device.
export function noticeMessage(notice: SignInNotice): {
  readonly tone: 'success' | 'unknown';
  readonly title: string;
  readonly text: string;
} {
  switch (notice.kind) {
    case 'password-changed':
      return {
        tone: 'success',
        title: 'Пароль изменён',
        text: 'Вы вышли на всех устройствах. Войдите с новым паролем.',
      };
    case 'password-unknown':
      return {
        tone: 'unknown',
        title: 'Не знаем, сменился ли пароль',
        text: 'Если сменился, подойдёт только новый. Попробуйте войти с ним — менять пароль ещё раз не нужно.',
      };
    case 'password-limit':
      return {
        tone: 'unknown',
        title: 'Вы вышли из аккаунта',
        text: 'Текущий пароль несколько раз ввели неверно. Войдите снова.',
      };
    case 'everywhere':
      return {
        tone: 'success',
        title: 'Вы вышли на всех устройствах',
        text: 'Включая это устройство. Войдите снова.',
      };
  }
}

const field = (value: FormDataEntryValue | null) =>
  typeof value === 'string' ? value : '';

// Figma L01: a password opens the app at once; there is no code step
// (decision of 13.10).
export function SignInPage() {
  const { session } = useServices();
  const sessionState = useSession();
  const notice =
    sessionState.status === 'anonymous' ? sessionState.notice : undefined;
  const shown = notice === undefined ? undefined : noticeMessage(notice);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const target = returnPath(params.get('return'));
  const expired = params.get('expired') === '1';
  const [message, setMessage] = useState<SignInMessage | undefined>();
  const [sending, setSending] = useState(false);
  // A new object per refusal restarts the wait even for the same seconds.
  const [wait, setWait] = useState<{ readonly seconds: number } | undefined>();
  useEffect(() => {
    if (wait === undefined) return;
    const id = setTimeout(() => {
      setWait(undefined);
    }, wait.seconds * 1000);
    return () => {
      clearTimeout(id);
    };
  }, [wait]);

  const attempt = async (form: HTMLFormElement) => {
    const data = new FormData(form);
    setSending(true);
    const result = await session.signIn({
      login: field(data.get('login')),
      password: field(data.get('password')),
      rememberMe: data.get('remember') === 'on',
    });
    setSending(false);
    if (result.kind === 'committed') {
      void navigate(target, { replace: true });
      return;
    }
    const next = signInMessage(result, notice);
    setMessage(next);
    if (next?.waitSeconds !== undefined) setWait({ seconds: next.waitSeconds });
  };
  const unknownMessage = message?.tone === 'unknown' ? message : undefined;
  const errorMessage = message?.tone === 'error' ? message : undefined;
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <AuthLayout
      title="Вход"
      help="Нет доступа к почте или аккаунту — обратитесь к администратору организации."
    >
      <AuthTitle>Вход</AuthTitle>
      {shown && (
        <FormMessage tone={shown.tone} title={shown.title}>
          {shown.text}
        </FormMessage>
      )}
      {expired && notice === undefined && !message && (
        <FormMessage tone="unknown" title="Вы вышли из аккаунта">
          Войдите снова — после входа откроется та же страница.
        </FormMessage>
      )}
      {unknownMessage && (
        <UnknownOutcomeAlert
          title={unknownMessage.title}
          onCheck={() => {
            if (formRef.current) void attempt(formRef.current);
          }}
        >
          {unknownMessage.text}
        </UnknownOutcomeAlert>
      )}
      <chakra.form
        ref={formRef}
        noValidate
        display="flex"
        flexDirection="column"
        gap="6"
        onSubmit={(event) => {
          event.preventDefault();
          void attempt(event.currentTarget);
        }}
      >
        <chakra.fieldset
          disabled={unknownMessage !== undefined || sending}
          display="contents"
        >
          <Stack gap="4">
            <FieldGroup>
              <FieldLabel htmlFor="login">Логин</FieldLabel>
              <TextInput
                id="login"
                name="login"
                autoComplete="username"
                defaultValue={
                  notice !== undefined && 'login' in notice
                    ? notice.login
                    : undefined
                }
              />
            </FieldGroup>
            <FieldGroup>
              <FieldLabel htmlFor="password">Пароль</FieldLabel>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="current-password"
              />
            </FieldGroup>
            <TextLink to="/password-reset" alignSelf="flex-start">
              Забыли пароль?
            </TextLink>
            <Stack gap="0">
              <CheckboxField
                id="remember"
                name="remember"
                label="Запомнить меня"
                aria-describedby="remember-hint"
              />
              <Text
                id="remember-hint"
                pl="10"
                textStyle="caption.default"
                color="text.secondary"
              >
                Не отмечайте на общем компьютере
              </Text>
            </Stack>
          </Stack>
        </chakra.fieldset>
        <Button
          type="submit"
          w="full"
          disabled={
            sending || wait !== undefined || unknownMessage !== undefined
          }
          aria-busy={sending}
        >
          Продолжить
        </Button>
        {errorMessage && (
          <FormMessage tone="error" title={errorMessage.title}>
            {errorMessage.text}
          </FormMessage>
        )}
      </chakra.form>
      <Text textStyle="body.default">
        Нет аккаунта? <TextLink to="/register">Зарегистрироваться</TextLink>
      </Text>
    </AuthLayout>
  );
}
