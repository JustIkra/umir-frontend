import { Flex, Stack, Text, chakra } from '@chakra-ui/react';
import userIcon from '@/presentation/assets/icons/user-24.svg';
import { ButtonLink } from '@/presentation/ui/actions';
import { Icon } from '@/presentation/ui/icon';
import { rem } from '@/presentation/ui/units';

// Figma W13 (Access state «Нет ресторанов») in the middle of the free space.
// «Обновить список» opens /app: access is not checked yet.
export function NoRestaurantsPage() {
  return (
    <Stack
      as="section"
      alignSelf="center"
      my="auto"
      gap="4"
      w="full"
      maxW={rem(560)}
      p={{ base: '6', sm: '8' }}
      bg="bg.surface"
      borderWidth="1px"
      borderColor="border.default"
      borderRadius="md"
    >
      <title>Нет доступных ресторанов — Ровный ход</title>
      <Flex
        boxSize="10"
        align="center"
        justify="center"
        bg="bg.actionSubtle"
        borderRadius="md"
      >
        <Icon src={userIcon} size={24} />
      </Flex>
      <chakra.h1 textStyle="heading.h2">Нет доступных ресторанов</chakra.h1>
      <Text textStyle="body.default" color="text.secondary">
        Учётная запись не связана ни с одним рестораном. Доступ предоставляет
        администратор организации: приглашение приходит на почту. Также можно
        создать собственное предприятие.
      </Text>
      <Flex direction={{ base: 'column', sm: 'row' }} gap="2">
        <ButtonLink to="/app/organizations/new">Создать предприятие</ButtonLink>
        <ButtonLink variant="secondary" to="/app">
          Обновить список
        </ButtonLink>
      </Flex>
    </Stack>
  );
}
