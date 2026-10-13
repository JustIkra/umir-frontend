import { Stack, Text, chakra } from '@chakra-ui/react';
import { useNavigate } from 'react-router';
import { Button, TextLink } from '@/presentation/ui/actions';
import {
  CheckboxField,
  FieldGroup,
  FieldLabel,
  PasswordInput,
  TextInput,
} from '@/presentation/ui/form';
import { AuthLayout, AuthTitle } from './auth-layout';

// Figma L01 «Вход». The form only moves on to the code step: nothing is
// checked or sent until the auth API exists.
export function SignInPage() {
  const navigate = useNavigate();
  return (
    <AuthLayout
      title="Вход"
      help="Нет доступа к почте или учётной записи — обратитесь к администратору организации."
    >
      <AuthTitle>Вход</AuthTitle>
      <chakra.form
        noValidate
        display="flex"
        flexDirection="column"
        gap="6"
        onSubmit={(event) => {
          event.preventDefault();
          void navigate('/login/code');
        }}
      >
        <Stack gap="4">
          <FieldGroup>
            <FieldLabel htmlFor="login">Логин</FieldLabel>
            <TextInput id="login" name="login" autoComplete="username" />
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
        <Button type="submit" w="full">
          Продолжить
        </Button>
      </chakra.form>
    </AuthLayout>
  );
}
