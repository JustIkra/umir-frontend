import { Stack, Text, chakra } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Button, TextLink } from '@/presentation/ui/actions';
import {
  CodeInput,
  FieldGroup,
  FieldLabel,
  FieldMessage,
  PasswordInput,
  TextInput,
} from '@/presentation/ui/form';
import { AuthLayout, AuthLead, AuthTitle } from './auth-layout';

const help = 'Нет доступа к почте — обратитесь к администратору организации.';
const codeLead =
  'Если логин указан верно, отправили код на почту учётной записи. Код действует 10 минут.';
const passwordHint =
  'От 8 до 32 символов. Можно вставить пароль из менеджера паролей.';

// The R steps share one layout: title, lead, fields, a primary button that only
// moves to the next step, and a link back.
function ResetStep({
  title,
  lead,
  submit,
  next,
  back,
  children,
}: {
  title: string;
  lead: string;
  submit: string;
  next: string;
  back: { to: string; label: string };
  children: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <AuthLayout title={title} help={help}>
      <AuthTitle>{title}</AuthTitle>
      <AuthLead>{lead}</AuthLead>
      <chakra.form
        noValidate
        display="flex"
        flexDirection="column"
        gap="6"
        onSubmit={(event) => {
          event.preventDefault();
          void navigate(next);
        }}
      >
        <Stack gap="4">{children}</Stack>
        <Button type="submit" w="full">
          {submit}
        </Button>
      </chakra.form>
      <TextLink to={back.to} alignSelf="flex-start">
        {back.label}
      </TextLink>
    </AuthLayout>
  );
}

// Figma R01 «Восстановление: логин».
export function PasswordResetRequestPage() {
  return (
    <ResetStep
      title="Восстановление пароля"
      lead="Укажите логин. Отправим код на почту, привязанную к учётной записи."
      submit="Получить код"
      next="/password-reset/code"
      back={{ to: '/login', label: 'Вернуться ко входу' }}
    >
      <FieldGroup>
        <FieldLabel htmlFor="reset-login">Логин</FieldLabel>
        <TextInput id="reset-login" name="login" autoComplete="username" />
      </FieldGroup>
    </ResetStep>
  );
}

// Figma R05 «Восстановление: код».
export function PasswordResetCodePage() {
  return (
    <ResetStep
      title="Введите код"
      lead={codeLead}
      submit="Продолжить"
      next="/password-reset/new"
      back={{ to: '/password-reset', label: 'Указать другой логин' }}
    >
      <FieldGroup>
        <FieldLabel htmlFor="reset-code">Код из письма</FieldLabel>
        <CodeInput
          id="reset-code"
          name="code"
          aria-describedby="reset-code-hint"
        />
        <FieldMessage
          id="reset-code-hint"
          hint="6 цифр из письма. Код можно вставить целиком."
        />
      </FieldGroup>
      <Text textStyle="caption.default" color="text.secondary">
        Отправить код ещё раз можно через 0:59
      </Text>
    </ResetStep>
  );
}

// Figma R08 «Новый пароль». The lead repeats R05, as in the frame.
export function PasswordResetNewPage() {
  return (
    <ResetStep
      title="Новый пароль"
      lead={codeLead}
      submit="Сохранить пароль"
      next="/login"
      back={{ to: '/login', label: 'Вернуться ко входу' }}
    >
      <FieldGroup>
        <FieldLabel htmlFor="new-password">Новый пароль</FieldLabel>
        <PasswordInput
          id="new-password"
          name="newPassword"
          autoComplete="new-password"
          aria-describedby="new-password-hint"
        />
        <FieldMessage id="new-password-hint" hint={passwordHint} />
      </FieldGroup>
      <FieldGroup>
        <FieldLabel htmlFor="repeat-password">
          Повторите новый пароль
        </FieldLabel>
        <PasswordInput
          id="repeat-password"
          name="repeatPassword"
          autoComplete="new-password"
        />
      </FieldGroup>
    </ResetStep>
  );
}
