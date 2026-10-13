import { Stack, Text, chakra } from '@chakra-ui/react';
import { useNavigate } from 'react-router';
import { placeholderAccount } from '@/presentation/placeholder-account';
import { Button, TextLink } from '@/presentation/ui/actions';
import {
  CodeInput,
  FieldGroup,
  FieldLabel,
  FieldMessage,
} from '@/presentation/ui/form';
import { AuthLayout, AuthLead, AuthTitle } from './auth-layout';

// Figma C01 «Код отправлен». The resend timer is the static Figma text.
export function SignInCodePage() {
  const navigate = useNavigate();
  return (
    <AuthLayout
      title="Введите код"
      help="Письмо не пришло — проверьте папку «Спам». Нет доступа к почте — обратитесь к администратору организации."
    >
      <AuthTitle>Введите код</AuthTitle>
      <AuthLead>
        {`6-значный код отправлен на ${placeholderAccount.maskedEmail}. Код действует 10 минут.`}
      </AuthLead>
      <chakra.form
        noValidate
        display="flex"
        flexDirection="column"
        gap="6"
        onSubmit={(event) => {
          event.preventDefault();
          void navigate('/app');
        }}
      >
        <Stack gap="4">
          <FieldGroup>
            <FieldLabel htmlFor="code">Код из письма</FieldLabel>
            <CodeInput id="code" name="code" aria-describedby="code-hint" />
            <FieldMessage
              id="code-hint"
              hint="6 цифр из письма. Код можно вставить целиком."
            />
          </FieldGroup>
          <Text textStyle="caption.default" color="text.secondary">
            Отправить код ещё раз можно через 0:59
          </Text>
        </Stack>
        <Button type="submit" w="full">
          Войти
        </Button>
      </chakra.form>
      <TextLink to="/login" alignSelf="flex-start">
        Назад к логину и паролю
      </TextLink>
    </AuthLayout>
  );
}
