import { Box, Flex, Grid, Text } from '@chakra-ui/react';
import { useState, type KeyboardEvent } from 'react';
import cookieIcon from '@/presentation/assets/icons/cookie.svg';
import { Button, TextLink } from '@/presentation/ui/actions';
import { useServices } from '@/presentation/services';
import { Icon } from '@/presentation/ui/icon';
import { mainContentId } from './skip-link';

const titleId = 'cookie-notice-title';

// Figma Cookie banner 21:69: Floating on tablet and desktop, Bottom bar on mobile.
// It is the last block of the page and sticks to the viewport bottom, so at the
// end of the page it sits below the footer instead of covering it.
export function CookieBanner() {
  const store = useServices().cookieNotice;
  const [open, setOpen] = useState(() => !store.isClosed());
  if (!open) return null;

  const close = () => {
    store.close();
    setOpen(false);
    document.getElementById(mainContentId)?.focus({ preventScroll: true });
  };
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };

  return (
    <Box
      position="sticky"
      bottom="0"
      zIndex="banner"
      px={{ sm: '6' }}
      pb={{ sm: '6' }}
      pointerEvents="none"
    >
      <Grid
        as="section"
        aria-labelledby={titleId}
        onKeyDown={closeOnEscape}
        pointerEvents="auto"
        maxW={{ sm: '52.5rem' }}
        mx="auto"
        templateColumns={{ base: '2.5rem 1fr', sm: '2.5rem 1fr auto' }}
        templateAreas={{
          base: '"icon title" "text text" "actions actions"',
          sm: '"icon title actions" "icon text actions"',
        }}
        alignItems="center"
        columnGap={{ base: '3', sm: '4' }}
        rowGap={{ base: '3', sm: '1' }}
        px={{ base: '4', sm: '6' }}
        py="4"
        bg="bg.surface"
        borderColor="border.default"
        borderTopWidth="1px"
        borderWidth={{ sm: '1px' }}
        borderRadius={{ sm: 'md' }}
        boxShadow="overlay"
      >
        <Flex
          gridArea="icon"
          boxSize="10"
          align="center"
          justify="center"
          bg="bg.actionSubtle"
          borderRadius="md"
        >
          <Icon src={cookieIcon} size={24} />
        </Flex>
        <Text
          id={titleId}
          gridArea="title"
          alignSelf={{ sm: 'end' }}
          textStyle="body.strong"
        >
          Мы используем только нужные cookie
        </Text>
        <Text
          gridArea="text"
          alignSelf={{ sm: 'start' }}
          textStyle="caption.default"
          color="text.secondary"
        >
          Они нужны, чтобы вы оставались в аккаунте и не теряли начатый заказ.
          Аналитики и рекламы нет.
        </Text>
        <Flex
          gridArea="actions"
          gap="2"
          align="center"
          direction={{ base: 'row-reverse', sm: 'row' }}
        >
          <TextLink to="/cookies" size="label" px="1" py="3" flexShrink="0">
            Политика cookie
          </TextLink>
          <Button flex={{ base: '1', sm: 'none' }} onClick={close}>
            Понятно
          </Button>
        </Flex>
      </Grid>
    </Box>
  );
}
