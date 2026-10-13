import { Flex, HStack, Stack, Text, chakra } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import { documentLinks } from '@/presentation/documents/links';
import { SkipLink, mainContentId } from '@/presentation/site/skip-link';
import { TextLink } from '@/presentation/ui/actions';
import { LogoMark } from '@/presentation/ui/logo';
import { rem } from '@/presentation/ui/units';
import { AuthBackground } from './auth-background';

// Figma Sign-in form 151:2860 and its siblings: a 440px card on Auth
// background, 32px padding (24px on 390), 24px between blocks.
export function AuthLayout({
  title,
  help,
  children,
}: {
  title: string;
  help: string;
  children: ReactNode;
}) {
  return (
    <Flex
      minH="100dvh"
      direction="column"
      align="center"
      justify={{ base: 'flex-start', sm: 'center' }}
      position="relative"
      overflow="clip"
      bg="bg.canvas"
      px="4"
      py={{ base: '6', sm: '10' }}
    >
      <title>{`${title} — Ровный ход`}</title>
      <SkipLink />
      <AuthBackground />
      <Stack
        as="main"
        id={mainContentId}
        tabIndex={-1}
        position="relative"
        zIndex="content"
        w="full"
        maxW={rem(440)}
        gap="6"
        p={{ base: '6', sm: '8' }}
        bg="bg.surface"
        borderWidth="1px"
        borderColor="border.default"
        borderRadius="md"
        _focusVisible={{ outline: 'none' }}
      >
        <HStack asChild gap="2" alignSelf="flex-start">
          <RouterLink to="/" aria-label="Ровный ход — главная">
            <LogoMark />
            <Text as="span" textStyle="body.strong">
              Ровный ход
            </Text>
          </RouterLink>
        </HStack>
        {children}
        <Text textStyle="caption.default" color="text.secondary">
          {help}
        </Text>
        <Flex
          as="nav"
          aria-label="Документы"
          wrap="wrap"
          columnGap="4"
          rowGap="2"
        >
          {documentLinks.slice(0, 2).map((link) => (
            <TextLink
              key={link.path}
              to={link.path}
              size="caption"
              color="text.secondary"
            >
              {link.title}
            </TextLink>
          ))}
        </Flex>
      </Stack>
    </Flex>
  );
}

export const AuthTitle = chakra('h1', { base: { textStyle: 'heading.h1' } });
export const AuthLead = chakra('p', {
  base: { textStyle: 'body.default', color: 'text.secondary' },
});
