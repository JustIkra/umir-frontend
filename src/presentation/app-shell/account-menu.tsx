import {
  Box,
  Flex,
  Stack,
  Text,
  chakra,
  type SystemStyleObject,
} from '@chakra-ui/react';
import type { ReactNode, RefObject } from 'react';
import { Link as RouterLink } from 'react-router';
import closeIcon from '@/presentation/assets/icons/close-24.svg';
import settingsIcon from '@/presentation/assets/icons/settings-24.svg';
import signOutIcon from '@/presentation/assets/icons/sign-out-24.svg';
import { documentLinks } from '@/presentation/documents/links';
import { placeholderAccount } from '@/presentation/placeholder-account';
import { TextLink } from '@/presentation/ui/actions';
import { Icon } from '@/presentation/ui/icon';
import { rem } from '@/presentation/ui/units';
import { SidebarContent } from './sidebar';

// A modal <dialog>: the browser traps focus, closes on Esc and returns focus to
// the opener. A click on the backdrop (the dialog box itself) closes it too.
function Sheet({
  dialogRef,
  label,
  children,
  css,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  label: string;
  children: ReactNode;
  css: SystemStyleObject;
}) {
  return (
    <chakra.dialog
      ref={dialogRef}
      aria-label={label}
      p="0"
      m="0"
      border="0"
      bg="transparent"
      maxW="100vw"
      maxH="100dvh"
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      css={css}
    >
      {children}
    </chakra.dialog>
  );
}

const MenuItem = chakra(RouterLink, {
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: '3',
    px: '3',
    py: '2.5',
    borderRadius: 'sm',
    textStyle: 'body.default',
    color: 'text.primary',
    _hover: { bg: 'bg.subtle' },
  },
});

// Figma Account menu, Рабочие места=Один: 280px above the sidebar trigger on
// wide screens, a bottom sheet on 390.
// Links leave through onLeave, which also closes the 390 navigation drawer the
// menu may have been opened from; «Закрыть» only closes the menu.
export function AccountMenu({
  dialogRef,
  onLeave,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onLeave: () => void;
}) {
  const close = () => dialogRef.current?.close();
  return (
    <Sheet
      dialogRef={dialogRef}
      label="Учётная запись"
      css={{
        position: 'fixed',
        insetInline: '0',
        insetBlockEnd: '0',
        insetBlockStart: 'auto',
        width: '100%',
        '&::backdrop': { background: 'rgba(23, 43, 77, 0.32)' },
        '@media (min-width: 768px)': {
          insetInlineStart: '0.75rem',
          insetInlineEnd: 'auto',
          insetBlockEnd: rem(66),
          width: rem(280),
          '&::backdrop': { background: 'transparent' },
        },
      }}
    >
      <Stack
        gap="1"
        p="2"
        bg="bg.surface"
        borderWidth="1px"
        borderColor="border.default"
        borderTopRadius={{ base: 'xl', sm: 'md' }}
        borderBottomRadius={{ base: '0', sm: 'md' }}
        boxShadow="overlay"
      >
        {/* Figma W06 on 390: a bottom sheet with a handle, a title and «Закрыть». */}
        <Box display={{ base: 'block', sm: 'none' }}>
          <Box
            mx="auto"
            mb="2"
            w="10"
            h="1"
            borderRadius="full"
            bg="border.default"
          />
          <Flex align="center" justify="space-between" gap="2" pl="3">
            <Text textStyle="heading.h3">Учётная запись</Text>
            <chakra.button
              type="button"
              display="flex"
              alignItems="center"
              justifyContent="center"
              boxSize="11"
              borderRadius="md"
              cursor="pointer"
              aria-label="Закрыть"
              onClick={close}
            >
              <Icon src={closeIcon} size={24} />
            </chakra.button>
          </Flex>
        </Box>
        <Stack gap="0.5" px="3" py="2">
          <Text textStyle="body.strong">{placeholderAccount.displayName}</Text>
          <Text textStyle="caption.default" color="text.secondary">
            {placeholderAccount.login}
          </Text>
        </Stack>
        <Box h="1px" bg="border.default" />
        <Stack gap="1" py="2">
          <Text px="3" textStyle="caption.default" color="text.secondary">
            Рабочее место
          </Text>
          <Text px="3" textStyle="caption.strong" color="text.secondary">
            {placeholderAccount.organization}
          </Text>
          <Stack gap="1" px="3" py="2" bg="bg.actionSubtle" borderRadius="md">
            <Text textStyle="body.strong">{placeholderAccount.restaurant}</Text>
            <Text textStyle="caption.default" color="text.secondary">
              {placeholderAccount.roles}
            </Text>
          </Stack>
        </Stack>
        <Box h="1px" bg="border.default" />
        <MenuItem to="/app/settings" onClick={onLeave}>
          <Icon src={settingsIcon} size={20} />
          Учётная запись
        </MenuItem>
        <MenuItem to="/login" onClick={onLeave}>
          <Icon src={signOutIcon} size={20} />
          Выйти
        </MenuItem>
        <Box h="1px" bg="border.default" />
        <Stack gap="1.5" px="3" py="2">
          {documentLinks.slice(0, 2).map((link) => (
            <TextLink
              key={link.path}
              to={link.path}
              size="caption"
              color="text.secondary"
              onClick={onLeave}
            >
              {link.title}
            </TextLink>
          ))}
        </Stack>
      </Stack>
    </Sheet>
  );
}

// Figma W20: the sidebar over a scrim on 390, with «Закрыть навигацию».
export function NavigationDrawer({
  dialogRef,
  onOpenAccount,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onOpenAccount: () => void;
}) {
  const close = () => dialogRef.current?.close();
  return (
    <Sheet
      dialogRef={dialogRef}
      label="Навигация"
      css={{
        position: 'fixed',
        insetBlock: '0',
        insetInlineStart: '0',
        height: '100dvh',
        width: rem(280),
        '&::backdrop': { background: 'rgba(23, 43, 77, 0.32)' },
      }}
    >
      <Box position="relative" h="full" bg="bg.surface">
        <chakra.button
          type="button"
          position="absolute"
          top="3"
          right="3"
          zIndex="content"
          display="flex"
          alignItems="center"
          justifyContent="center"
          boxSize="11"
          borderRadius="md"
          cursor="pointer"
          aria-label="Закрыть навигацию"
          onClick={close}
        >
          <Icon src={closeIcon} size={24} />
        </chakra.button>
        <SidebarContent onNavigate={close} onOpenAccount={onOpenAccount} />
      </Box>
    </Sheet>
  );
}
