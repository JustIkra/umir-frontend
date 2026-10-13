import { Flex, Stack, Text, chakra } from '@chakra-ui/react';
import { type ReactNode } from 'react';
import { Button } from './actions';
import { FormMessage } from './form-message';
import { Icon } from './icon';
import { rem } from './units';

// Figma Access state card (W13–W17): a card in the middle of the free space
// with an icon tile, a title, the text and the actions.
export function StateCard({
  icon,
  title,
  tile = 'neutral',
  children,
  actions,
}: {
  icon: string;
  title: string;
  tile?: 'neutral' | 'action';
  children: ReactNode;
  actions?: ReactNode;
}) {
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
      <title>{`${title} — Ровный ход`}</title>
      <Flex
        boxSize="10"
        align="center"
        justify="center"
        bg={tile === 'action' ? 'bg.actionSubtle' : 'bg.subtle'}
        borderRadius="md"
      >
        <Icon src={icon} size={24} />
      </Flex>
      <chakra.h1 textStyle="heading.h2">{title}</chakra.h1>
      <Text textStyle="body.default" color="text.secondary">
        {children}
      </Text>
      {actions && (
        <Flex
          direction={{ base: 'column', sm: 'row' }}
          align={{ base: 'stretch', sm: 'center' }}
          gap={{ base: '2', sm: '4' }}
        >
          {actions}
        </Flex>
      )}
    </Stack>
  );
}

// MN04: the data area could not be read; the page around it stays.
export function ServiceUnavailableAlert({
  title,
  children,
  onRetry,
}: {
  title: string;
  children: ReactNode;
  onRetry: () => void;
}) {
  return (
    <FormMessage
      tone="error"
      title={title}
      action={
        <Button variant="secondary" onClick={onRetry}>
          Повторить загрузку
        </Button>
      }
    >
      {children}
    </FormMessage>
  );
}

// RS06, NE07: the answer to a command was lost; checking continues the same
// attempt and never sends a new one.
export function UnknownOutcomeAlert({
  title,
  children,
  onCheck,
  details,
}: {
  title: string;
  children: ReactNode;
  onCheck: () => void;
  details?: string | undefined;
}) {
  return (
    <FormMessage
      tone="unknown"
      title={title}
      details={details}
      action={
        <Button variant="secondary" onClick={onCheck}>
          Проверить результат
        </Button>
      }
    >
      {children}
    </FormMessage>
  );
}

// W12: information without actions.
export function InfoNotice({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <FormMessage tone="info" title={title}>
      {children}
    </FormMessage>
  );
}
