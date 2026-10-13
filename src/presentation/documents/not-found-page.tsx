import { Box, Flex, Stack, Text, chakra } from '@chakra-ui/react';
import { useRouteError } from 'react-router';
import { SkipLink, mainContentId } from '@/presentation/site/skip-link';
import { ButtonLink } from '@/presentation/ui/actions';
import { DocumentBackground } from './document-background';
import { DocumentFooter, DocumentHeader } from './document-chrome';

// A large «404» in the free space below the message. It sits in the page flow,
// so it never covers the text or the button on short screens, keeps clear of
// the footer, and hides with the rest of the decor in high-contrast modes.
function Numeral() {
  return (
    <Box
      aria-hidden="true"
      position="relative"
      zIndex="decor"
      alignSelf="center"
      mt="auto"
      pt={{ base: '6', md: '10' }}
      pb={{ base: '10', md: '16' }}
      pointerEvents="none"
      userSelect="none"
      css={{
        '@media (forced-colors: active), (prefers-contrast: more)': {
          display: 'none',
        },
      }}
    >
      <Text
        as="span"
        display="block"
        fontFamily="body"
        fontWeight="semibold"
        fontSize={{ base: '10rem', sm: '13rem', md: '16rem', xl: '20rem' }}
        lineHeight="0.8"
        letterSpacing="-0.04em"
        bgImage="linear-gradient(100deg, {colors.decor.tealSoft}, {colors.decor.skySoft} 50%, {colors.decor.violetSoft})"
        bgClip="text"
        color="transparent"
      >
        404
      </Text>
    </Box>
  );
}

// Figma «Страница не найдена» 575:783 (1440), 575:866 (1024) and 575:914
// (390). Unknown addresses reuse the document chrome, and the page fills the
// viewport so the footer stays at the bottom.
export function NotFoundPage() {
  return (
    <Flex direction="column" minH="100dvh">
      <title>Страница не найдена — Ровный ход</title>
      <SkipLink />
      <DocumentHeader variant="plain" />
      <Flex
        direction="column"
        flex="1"
        position="relative"
        bg="bg.canvas"
        overflow="clip"
      >
        <DocumentBackground />
        <Stack
          as="main"
          id={mainContentId}
          tabIndex={-1}
          position="relative"
          zIndex="content"
          gap="4"
          align="flex-start"
          w="full"
          maxW="45rem"
          mx="auto"
          px={{ base: '4', md: '10' }}
          pt={{ base: '12', md: '24' }}
          _focusVisible={{ outline: 'none' }}
        >
          <chakra.h1 textStyle="heading.h1">Страница не найдена</chakra.h1>
          <Text textStyle="body.lead" color="text.secondary">
            Адрес набран с ошибкой или страница ещё не готова.
          </Text>
          <ButtonLink to="/">На главную</ButtonLink>
        </Stack>
        <Numeral />
      </Flex>
      <DocumentFooter />
    </Flex>
  );
}

// Thrown by route loaders for ids outside the sample: the /app boundary shows
// this page instead of an empty shell. Other errors keep propagating.
export class NotFound extends Error {}

export function NotFoundBoundary() {
  const error = useRouteError();
  if (error instanceof NotFound) return <NotFoundPage />;
  throw error;
}
