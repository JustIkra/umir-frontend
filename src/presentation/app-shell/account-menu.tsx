import { Box, Flex, Stack, Text, chakra } from '@chakra-ui/react';
import { useState, type RefObject } from 'react';
import { Link as RouterLink } from 'react-router';
import closeIcon from '@/presentation/assets/icons/close-24.svg';
import organizationIcon from '@/presentation/assets/icons/organization-24.svg';
import settingsIcon from '@/presentation/assets/icons/settings-24.svg';
import signOutIcon from '@/presentation/assets/icons/sign-out-24.svg';
import { documentLinks } from '@/presentation/documents/links';
import { placeholderAccount } from '@/presentation/placeholder-account';
import {
  organizations,
  type Organization,
  type Restaurant,
} from '@/presentation/placeholder-organizations';
import { media, scrim } from '@/presentation/theme/system';
import { TextLink } from '@/presentation/ui/actions';
import { Badge } from '@/presentation/ui/badge';
import { Dialog } from '@/presentation/ui/dialog';
import { SearchInput } from '@/presentation/ui/form';
import { Icon } from '@/presentation/ui/icon';
import { rem } from '@/presentation/ui/units';
import { SidebarContent } from './sidebar';
import { filterWorkplaces } from './workplaces';

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

const optionStyles = {
  display: 'flex',
  alignItems: 'center',
  gap: '3',
  px: '3',
  py: '2',
  borderRadius: 'md',
} as const;
const OptionLink = chakra(RouterLink, {
  base: { ...optionStyles, color: 'text.primary', _hover: { bg: 'bg.subtle' } },
});

// Figma Restaurant option: a radio mark, the name and role chips. The current
// restaurant is marked; choosing another closes the menu and opens /app (the
// context does not switch yet). A preparing restaurant cannot be chosen.
function RestaurantOption({
  organization,
  restaurant,
  onLeave,
}: {
  organization: Organization;
  restaurant: Restaurant;
  onLeave: () => void;
}) {
  const current =
    organization.name === placeholderAccount.organization &&
    restaurant.name === placeholderAccount.restaurant;
  const body = (
    <>
      <Box
        aria-hidden="true"
        boxSize="4"
        flexShrink="0"
        borderRadius="full"
        borderWidth={current ? rem(5) : '1.5px'}
        borderColor={
          current
            ? 'border.action'
            : restaurant.preparing
              ? 'border.default'
              : 'border.strong'
        }
      />
      <Stack gap="1" flex="1" minW="0">
        <Text
          textStyle={current ? 'body.strong' : 'body.default'}
          color={restaurant.preparing ? 'text.disabled' : 'text.primary'}
          lineClamp={2}
          title={restaurant.name}
        >
          {restaurant.name}
        </Text>
        <Flex gap="1" wrap="wrap">
          {restaurant.roles.map((role) => (
            <Badge key={role}>{role}</Badge>
          ))}
        </Flex>
        {restaurant.preparing && (
          <Text textStyle="caption.default" color="text.secondary">
            Подготавливается
          </Text>
        )}
      </Stack>
    </>
  );
  return (
    <li>
      {restaurant.preparing ? (
        <Flex {...optionStyles}>{body}</Flex>
      ) : (
        <OptionLink
          to="/app"
          aria-current={current ? 'true' : undefined}
          bg={current ? 'bg.actionSubtle' : undefined}
          onClick={onLeave}
        >
          {body}
        </OptionLink>
      )}
    </li>
  );
}

// The current organization goes first, as in W08.
const menuOrganizations = [...organizations].sort(
  (a, b) =>
    Number(b.name === placeholderAccount.organization) -
    Number(a.name === placeholderAccount.organization),
);

// The search filters only the list already in the menu; with many restaurants
// the API will search on the server.
function Workplaces({ onLeave }: { onLeave: () => void }) {
  const [query, setQuery] = useState('');
  const shown = filterWorkplaces(menuOrganizations, query);
  return (
    // Shrinks with the window down to the heading, the search and about two
    // options; below that the whole panel scrolls (landscape phones, zoom).
    <Stack gap="1" py="2" flex="1 1 auto" minH={rem(228)}>
      <Text px="3" textStyle="caption.default" color="text.secondary">
        Рабочее место
      </Text>
      <SearchInput
        label="Найти ресторан"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      {shown.length === 0 ? (
        <Text px="3" py="2" textStyle="body.default" color="text.secondary">
          Ничего не найдено
        </Text>
      ) : (
        <Stack
          as="ul"
          gap="1"
          flex="1"
          minH="0"
          overflowY="auto"
          listStyleType="none"
        >
          {shown.map((organization) => (
            <Stack as="li" key={organization.id} gap="1">
              <Text px="3" textStyle="caption.strong" color="text.secondary">
                {organization.name}
              </Text>
              <Stack as="ul" gap="1" listStyleType="none">
                {organization.restaurants.map((restaurant) => (
                  <RestaurantOption
                    key={restaurant.name}
                    organization={organization}
                    restaurant={restaurant}
                    onLeave={onLeave}
                  />
                ))}
              </Stack>
            </Stack>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

// Figma Account menu W08 (several organizations): 280px above the sidebar
// trigger on wide screens, a bottom sheet on 390. Only the workplace list
// scrolls, so the menu fits the window. Without a restaurant (W13) the
// workplace block is absent.
// Links leave through onLeave, which also closes the 390 navigation drawer the
// menu may have been opened from; «Закрыть» only closes the menu.
export function AccountMenu({
  dialogRef,
  onLeave,
  workplaces = true,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onLeave: () => void;
  workplaces?: boolean;
}) {
  const close = () => dialogRef.current?.close();
  return (
    <Dialog
      dialogRef={dialogRef}
      label="Учётная запись"
      css={{
        position: 'fixed',
        insetInline: '0',
        insetBlockEnd: '0',
        insetBlockStart: 'auto',
        width: '100%',
        '&::backdrop': { background: scrim },
        [media.sm]: {
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
        maxH={{ base: '90dvh', sm: `calc(100dvh - ${rem(78)})` }}
        overflowY="auto"
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
          <Text textStyle="mono.default" color="text.secondary">
            {placeholderAccount.login}
          </Text>
        </Stack>
        <Box h="1px" bg="border.default" />
        {workplaces && (
          <>
            <Workplaces onLeave={onLeave} />
            <Box h="1px" bg="border.default" />
          </>
        )}
        <MenuItem to="/app/settings" onClick={onLeave}>
          <Icon src={settingsIcon} size={20} />
          Учётная запись
        </MenuItem>
        <MenuItem to="/app/organizations" onClick={onLeave}>
          <Icon src={organizationIcon} size={20} />
          Организации и рестораны
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
    </Dialog>
  );
}

// Figma W20: the sidebar over a scrim on 390, with «Закрыть навигацию».
export function NavigationDrawer({
  dialogRef,
  onOpenAccount,
  context,
  sections,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onOpenAccount: () => void;
  context: string;
  sections: boolean;
}) {
  const close = () => dialogRef.current?.close();
  return (
    <Dialog
      dialogRef={dialogRef}
      label="Навигация"
      css={{
        position: 'fixed',
        insetBlock: '0',
        insetInlineStart: '0',
        height: '100dvh',
        width: rem(280),
        '&::backdrop': { background: scrim },
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
        <SidebarContent
          onNavigate={close}
          onOpenAccount={onOpenAccount}
          context={context}
          sections={sections}
        />
      </Box>
    </Dialog>
  );
}
