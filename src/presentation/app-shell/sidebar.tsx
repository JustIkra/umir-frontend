import { Box, Flex, HStack, Stack, Text, chakra } from '@chakra-ui/react';
import { NavLink, Link as RouterLink } from 'react-router';
import type { SectionKey } from '@/domain/access';
import chevronIcon from '@/presentation/assets/icons/chevron-down-24.svg';
import userIcon from '@/presentation/assets/icons/user-24.svg';
import { Icon, MaskIcon } from '@/presentation/ui/icon';
import { LogoMark } from '@/presentation/ui/logo';
import { useRestaurantPath } from './paths';
import { appSections } from './sections';

const NavAnchor = chakra(NavLink);

// Figma Nav item: 40px rows (two lines wrap), 8/12 padding, 12px gap; the
// current page is teal on bg.actionSubtle. Subpages keep their section item
// current; only «Обзор» matches its address exactly. Only the sections the
// restaurant's roles open are listed.
export function SectionNav({
  sections,
  onNavigate,
}: {
  sections: readonly SectionKey[];
  onNavigate?: () => void;
}) {
  const path = useRestaurantPath();
  return (
    <Stack as="nav" aria-label="Разделы" gap="1">
      {appSections
        .filter((section) => sections.includes(section.key))
        .map((section) => (
          <NavAnchor
            key={section.key}
            to={path(section.suffix)}
            end={section.key === 'overview'}
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

// Figma Account trigger: the name and «Ресторан · роли» or the access state.
// The chevron points up: the menu opens above the trigger.
export function AccountTrigger({
  onOpen,
  name,
  context,
}: {
  onOpen: () => void;
  name: string;
  context: string;
}) {
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
        <Text textStyle="body.strong">{name}</Text>
        <Text textStyle="caption.default" color="text.secondary">
          {context}
        </Text>
      </Stack>
      <Icon src={chevronIcon} size={20} transform="rotate(180deg)" />
    </chakra.button>
  );
}

// Figma Sidebar 784:77151: 240px, logo, sections, the account at the bottom.
// Without sections (W13, W15–W17) only the logo and the account remain.
export function SidebarContent({
  onOpenAccount,
  onNavigate,
  name,
  context,
  sections,
}: {
  onOpenAccount: () => void;
  onNavigate?: () => void;
  name: string;
  context: string;
  sections: readonly SectionKey[];
}) {
  const path = useRestaurantPath();
  return (
    <Flex direction="column" h="full" px="3" py="4" gap="6">
      <HStack asChild gap="2" px="3" py="1">
        <RouterLink to={path()} aria-label="Ровный ход — обзор">
          <LogoMark />
          <Text as="span" textStyle="body.strong">
            Ровный ход
          </Text>
        </RouterLink>
      </HStack>
      {sections.length > 0 && (
        <SectionNav
          sections={sections}
          {...(onNavigate ? { onNavigate } : {})}
        />
      )}
      <Box mt="auto" pt="3" borderTopWidth="1px" borderColor="border.default">
        <AccountTrigger onOpen={onOpenAccount} name={name} context={context} />
      </Box>
    </Flex>
  );
}
