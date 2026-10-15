import { Flex, Stack, Text, chakra } from '@chakra-ui/react';
import { useEffect, type ReactNode } from 'react';
import { redirect } from 'react-router';
import type {
  DetailsInput,
  RegisterNotice,
  RegisterSnapshot,
  Registration,
} from '@/application/registration';
import { isRegisterCodeExpired } from '@/application/registration';
import {
  AuthLayout,
  AuthLead,
  AuthTitle,
} from '@/presentation/auth/auth-layout';
import { CodeEntry } from '@/presentation/auth/code-entry';
import {
  NameField,
  PasswordFields,
  credentialErrors,
} from '@/presentation/auth/credential-fields';
import {
  useServices,
  type PresentationServices,
} from '@/presentation/services';
import { useStore } from '@/presentation/session/hooks';
import { Button, ButtonLink, TextLink } from '@/presentation/ui/actions';
import { useNow } from '@/presentation/ui/countdown';
import {
  CheckboxField,
  FieldGroup,
  FieldLabel,
  FieldMessage,
  TextInput,
} from '@/presentation/ui/form';
import { FormMessage } from '@/presentation/ui/form-message';
import { UnknownOutcomeAlert } from '@/presentation/ui/states';
import {
  registerCodeError,
  registerFieldErrors,
  registerMessage,
  unknownTexts,
  unknownTitles,
} from './register-messages';

export { registerMessage } from './register-messages';

// /register: a signed-in user has nothing to register.
export function createRegisterLoader(services: PresentationServices) {
  return async () =>
    (await services.session.ensure()).status === 'active'
      ? redirect('/app')
      : null;
}

const field = (value: FormDataEntryValue | null) =>
  typeof value === 'string' ? value : '';

function Message({
  notice,
  nowMs,
  action,
}: {
  notice: RegisterNotice | undefined;
  nowMs: number;
  action?: ReactNode;
}) {
  const message = registerMessage(notice, nowMs);
  if (message === undefined) return null;
  return (
    <FormMessage tone={message.tone} title={message.title} action={action}>
      {message.text}
    </FormMessage>
  );
}

function Unknown({
  flow,
  notice,
}: {
  flow: Registration;
  notice: RegisterNotice | undefined;
}) {
  if (notice?.kind !== 'unknown') return null;
  return (
    <UnknownOutcomeAlert
      title={unknownTitles[notice.action]}
      onCheck={() => {
        void flow.check();
      }}
    >
      {unknownTexts[notice.action]}
    </UnknownOutcomeAlert>
  );
}

// «Войти» and «Восстановить пароль» under the message about a taken address.
function AccountLinks() {
  return (
    <Flex wrap="wrap" align="center" columnGap="4" rowGap="2">
      <ButtonLink to="/login" variant="secondary">
        Войти
      </ButtonLink>
      <TextLink to="/password-reset">Восстановить пароль</TextLink>
    </Flex>
  );
}

function FormStep({
  flow,
  snapshot,
}: {
  flow: Registration;
  snapshot: RegisterSnapshot;
}) {
  const { notice } = snapshot;
  const unknown = notice?.kind === 'unknown';
  const errors = registerFieldErrors(notice);
  const now = useNow(notice?.kind === 'limited');
  const waiting = notice?.kind === 'limited' && registerMessage(notice, now);
  return (
    <>
      <AuthTitle>Регистрация в «Ровном ходе»</AuthTitle>
      <AuthLead>
        Создайте аккаунт: укажите имя, почту и пароль. Потом введите код из
        письма.
      </AuthLead>
      <Unknown flow={flow} notice={notice} />
      <chakra.form
        noValidate
        display="flex"
        flexDirection="column"
        gap="6"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void flow.submit({
            displayName: field(data.get('displayName')),
            email: field(data.get('email')),
            password: field(data.get('password')),
            repeat: field(data.get('repeat')),
            consent: data.get('consent') === 'on',
          });
        }}
      >
        <chakra.fieldset disabled={unknown || snapshot.busy} display="contents">
          <NameField
            idPrefix="register"
            defaultValue={snapshot.displayName}
            error={errors.name}
          />
          <FieldGroup>
            <FieldLabel htmlFor="register-email">Почта</FieldLabel>
            <TextInput
              id="register-email"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={snapshot.email}
              invalid={errors.email !== undefined}
              aria-describedby="register-email-error"
            />
            <FieldMessage id="register-email-error" error={errors.email} />
          </FieldGroup>
          <PasswordFields idPrefix="register" errors={errors} />
          <Stack gap="1.5">
            <CheckboxField
              id="register-consent"
              name="consent"
              label="Даю согласие на обработку персональных данных"
              invalid={errors.consent !== undefined}
              aria-describedby={
                errors.consent === undefined
                  ? undefined
                  : 'register-consent-error'
              }
            />
            <Flex wrap="wrap" columnGap="4" rowGap="1" pl="10">
              <TextLink to="/consent" size="caption">
                Текст согласия
              </TextLink>
              <TextLink to="/privacy" size="caption">
                Политика конфиденциальности
              </TextLink>
            </Flex>
            <FieldMessage
              id="register-consent-error"
              error={errors.consent}
              indent
            />
          </Stack>
        </chakra.fieldset>
        <Button
          type="submit"
          w="full"
          disabled={snapshot.busy || Boolean(waiting) || unknown}
          aria-busy={snapshot.busy}
        >
          {snapshot.busy ? 'Отправляем…' : 'Получить код'}
        </Button>
      </chakra.form>
      <Message
        notice={notice}
        nowMs={now}
        action={notice?.kind === 'email-taken' ? <AccountLinks /> : undefined}
      />
      <Text textStyle="body.default">
        Уже есть аккаунт? <TextLink to="/login">Войти</TextLink>
      </Text>
    </>
  );
}

function CodeStep({
  flow,
  snapshot,
}: {
  flow: Registration;
  snapshot: RegisterSnapshot;
}) {
  return (
    <CodeEntry
      idPrefix="register"
      lead={
        <>
          {`Если на почту ${snapshot.email} ещё нет аккаунта, мы отправили на неё код. Он действует 10 минут. Уже зарегистрированы? `}
          <TextLink to="/login">Войдите</TextLink> или{' '}
          <TextLink to="/password-reset">восстановите пароль</TextLink>.
        </>
      }
      state={snapshot}
      isExpired={(nowMs) => isRegisterCodeExpired(snapshot, nowMs)}
      notice={snapshot.notice}
      expiredNotice={{ kind: 'expired' }}
      messageOf={registerMessage}
      codeError={registerCodeError(snapshot.notice)}
      unknown={<Unknown flow={flow} notice={snapshot.notice} />}
      onVerify={(code) => {
        void flow.verify(code);
      }}
      onResend={() => {
        void flow.resend();
      }}
      onRenew={() => {
        void flow.requestCode();
      }}
    />
  );
}

function detailsOf(form: HTMLFormElement): DetailsInput {
  const data = new FormData(form);
  return {
    displayName: field(data.get('displayName')),
    password: field(data.get('password')),
    repeat: field(data.get('repeat')),
  };
}

// After a reload the proof is held, but the name and the password are not.
function DetailsStep({
  flow,
  snapshot,
}: {
  flow: Registration;
  snapshot: RegisterSnapshot;
}) {
  const { notice } = snapshot;
  const unknown = notice?.kind === 'unknown';
  const errors = credentialErrors(
    notice?.kind === 'fields' ? notice : undefined,
  );
  const now = useNow(notice?.kind === 'limited');
  return (
    <>
      <AuthTitle>Завершите регистрацию</AuthTitle>
      <AuthLead>
        Почта подтверждена. Укажите имя и пароль. Не перезагружайте страницу,
        пока не закончите.
      </AuthLead>
      <Unknown flow={flow} notice={notice} />
      <chakra.form
        noValidate
        display="flex"
        flexDirection="column"
        gap="6"
        onSubmit={(event) => {
          event.preventDefault();
          void flow.completeDetails(detailsOf(event.currentTarget));
        }}
      >
        <chakra.fieldset disabled={unknown || snapshot.busy} display="contents">
          <NameField
            idPrefix="register"
            defaultValue={snapshot.displayName}
            error={errors.name}
          />
          <PasswordFields idPrefix="register" errors={errors} />
        </chakra.fieldset>
        <Button
          type="submit"
          w="full"
          disabled={snapshot.busy || unknown}
          aria-busy={snapshot.busy}
        >
          {snapshot.busy ? 'Создаём…' : 'Создать аккаунт'}
        </Button>
      </chakra.form>
      <Message notice={notice} nowMs={now} />
    </>
  );
}

function DoneStep() {
  return (
    <>
      <AuthTitle>Аккаунт создан</AuthTitle>
      <AuthLead>
        Вы вошли. Создайте свою организацию или дождитесь приглашения от
        администратора.
      </AuthLead>
      <ButtonLink to="/app/organizations/new" w="full">
        Создать организацию
      </ButtonLink>
      <ButtonLink to="/app" variant="secondary" w="full">
        Перейти к работе
      </ButtonLink>
    </>
  );
}

const titles = {
  form: 'Регистрация',
  code: 'Введите код',
  details: 'Завершите регистрацию',
  done: 'Аккаунт создан',
} as const;

// /register: the name, the email and the password, the code from the email,
// then the new account. A reload keeps the step (without the password).
export function RegisterPage() {
  const { registration: flow } = useServices();
  const snapshot = useStore(flow);
  // A finished registration is not offered again when the page is opened anew.
  useEffect(
    () => () => {
      if (flow.getSnapshot().step === 'done') flow.restart();
    },
    [flow],
  );
  return (
    <AuthLayout title={titles[snapshot.step]}>
      {snapshot.step === 'form' && <FormStep flow={flow} snapshot={snapshot} />}
      {snapshot.step === 'code' && <CodeStep flow={flow} snapshot={snapshot} />}
      {snapshot.step === 'details' && (
        <DetailsStep flow={flow} snapshot={snapshot} />
      )}
      {snapshot.step === 'done' && <DoneStep />}
    </AuthLayout>
  );
}
