import { Box, Flex, HStack, Stack, Text, chakra } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import lockIcon from '@/presentation/assets/icons/lock-24.svg';
import userIcon from '@/presentation/assets/icons/user-24.svg';
import { placeholderAccount } from '@/presentation/placeholder-account';
import { Button } from '@/presentation/ui/actions';
import {
  FieldGroup,
  FieldLabel,
  FieldMessage,
  PasswordInput,
  ReadOnlyValue,
} from '@/presentation/ui/form';
import { Icon } from '@/presentation/ui/icon';
import { rem } from '@/presentation/ui/units';
import { PageHeader } from './pages';

function Section({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Stack
      as="section"
      gap="5"
      p="6"
      bg="bg.surface"
      borderWidth="1px"
      borderColor="border.default"
      borderRadius="md"
    >
      <HStack gap="2">
        <Icon src={icon} size={24} />
        <chakra.h2 textStyle="heading.h3">{title}</chakra.h2>
      </HStack>
      {children}
    </Stack>
  );
}

// Figma S01 «Учётная запись». «Изменить имя» does nothing yet; «Изменить
// пароль» leads to sign-in, as every session ends after a password change.
export function AccountSettingsPage() {
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        title="Учётная запись"
        caption="Логин, почта, отображаемое имя и пароль"
      />
      <Stack gap="6" w="full" maxW={rem(640)}>
        <Section icon={userIcon} title="Профиль">
          <ReadOnlyValue
            label="Логин"
            value={placeholderAccount.login}
            note="Логин нельзя изменить. Он нужен для входа."
          />
          <ReadOnlyValue
            label="Почта"
            value={placeholderAccount.email}
            note="Сюда приходят коды для входа и восстановления пароля. Изменить почту может администратор организации."
          />
          <Box h="1px" bg="border.default" />
          <Flex align="center" justify="space-between" gap="4" wrap="wrap">
            <Stack gap="0">
              <Text textStyle="caption.strong">Отображаемое имя</Text>
              <Text textStyle="body.default">
                {placeholderAccount.displayName}
              </Text>
            </Stack>
            <Button variant="link">Изменить имя</Button>
          </Flex>
        </Section>
        <Section icon={lockIcon} title="Пароль">
          <Text textStyle="body.default" color="text.secondary">
            После изменения пароля завершатся все сеансы, включая этот. Затем
            войдите с новым паролем.
          </Text>
          <chakra.form
            noValidate
            display="flex"
            flexDirection="column"
            gap="5"
            onSubmit={(event) => {
              event.preventDefault();
              void navigate('/login');
            }}
          >
            <Stack gap="4">
              <FieldGroup>
                <FieldLabel htmlFor="current-password">
                  Текущий пароль
                </FieldLabel>
                <PasswordInput
                  id="current-password"
                  name="currentPassword"
                  autoComplete="current-password"
                />
              </FieldGroup>
              <FieldGroup>
                <FieldLabel htmlFor="settings-new-password">
                  Новый пароль
                </FieldLabel>
                <PasswordInput
                  id="settings-new-password"
                  name="newPassword"
                  autoComplete="new-password"
                  aria-describedby="settings-new-password-hint"
                />
                <FieldMessage
                  id="settings-new-password-hint"
                  hint="От 8 до 32 символов. Можно вставить пароль из менеджера паролей."
                />
              </FieldGroup>
              <FieldGroup>
                <FieldLabel htmlFor="settings-repeat-password">
                  Повторите новый пароль
                </FieldLabel>
                <PasswordInput
                  id="settings-repeat-password"
                  name="repeatPassword"
                  autoComplete="new-password"
                />
              </FieldGroup>
            </Stack>
            <Button type="submit" alignSelf="flex-start">
              Изменить пароль
            </Button>
          </chakra.form>
        </Section>
      </Stack>
    </>
  );
}
