import { Box, Flex, HStack, Stack, Text, chakra } from '@chakra-ui/react';
import { NavLink, Link as RouterLink } from 'react-router';
import chevronIcon from '@/presentation/assets/icons/chevron-down-24.svg';
import userIcon from '@/presentation/assets/icons/user-24.svg';
import { placeholderAccount } from '@/presentation/placeholder-account';
import { Icon, MaskIcon } from '@/presentation/ui/icon';
import { LogoMark } from '@/presentation/ui/logo';
import { appSections } from './sections';

const NavAnchor = chakra(NavLink);

// Figma Nav item: 40px rows (two lines wrap), 8/12 padding, 12px gap; the
// current page is teal on bg.actionSubtle.
export function SectionNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Stack as="nav" aria-label="Разделы" gap="1">
      {appSections.map((section) => (
        <NavAnchor
          key={section.path}
          to={section.path}
          end
          onClick={onNavigate}
          display="flex"
          alignItems="center"
          gap="3"
          minH="10"
          px="3"
          py="2"
          borderRadius="md"
          textStyle="body.default"
          color="text.primary"
          _hover={{ bg: 'bg.subtle' }}
          _currentPage={{
            bg: 'bg.actionSubtle',
            color: 'text.action',
            textStyle: 'label.default',
            '& [data-nav-icon]': { color: 'icon.action' },
          }}
        >
          <MaskIcon
            src={section.icon}
            size={24}
            color="icon.secondary"
            data-nav-icon=""
          />
          {section.title}
        </NavAnchor>
      ))}
    </Stack>
  );
}

export function AccountTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <chakra.button
      type="button"
      display="flex"
      alignItems="center"
      gap="3"
      w="full"
      px="3"
      py="2"
      borderRadius="md"
      textAlign="start"
      cursor="pointer"
      _hover={{ bg: 'bg.subtle' }}
      aria-haspopup="dialog"
      onClick={onOpen}
    >
      <Icon src={userIcon} size={24} />
      <Stack gap="0" flex="1" minW="0">
        <Text textStyle="body.strong">{placeholderAccount.displayName}</Text>
        <Text textStyle="caption.default" color="text.secondary">
          {`${placeholderAccount.restaurant} · ${placeholderAccount.roles}`}
        </Text>
      </Stack>
      <Icon src={chevronIcon} size={20} />
    </chakra.button>
  );
}

// Figma Sidebar 784:77151: 240px, logo, sections, the account at the bottom.
export function SidebarContent({
  onOpenAccount,
  onNavigate,
}: {
  onOpenAccount: () => void;
  onNavigate?: () => void;
}) {
  return (
    <Flex direction="column" h="full" px="3" py="4" gap="6">
      <HStack asChild gap="2" px="3" py="1">
        <RouterLink to="/app" aria-label="Ровный ход — обзор">
          <LogoMark />
          <Text as="span" textStyle="body.strong">
            Ровный ход
          </Text>
        </RouterLink>
      </HStack>
      <SectionNav {...(onNavigate ? { onNavigate } : {})} />
      <Box mt="auto" pt="3" borderTopWidth="1px" borderColor="border.default">
        <AccountTrigger onOpen={onOpenAccount} />
      </Box>
    </Flex>
  );
}
