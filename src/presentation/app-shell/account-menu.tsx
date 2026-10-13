import { Box, Flex, Stack, Text, chakra } from '@chakra-ui/react';
import { useState, type RefObject } from 'react';
import { Link as RouterLink } from 'react-router';
import type {
  OrganizationAccess,
  RestaurantAccess,
} from '@/application/access';
import type { User } from '@/application/account';
import type { SectionKey } from '@/domain/access';
import closeIcon from '@/presentation/assets/icons/close-24.svg';
import organizationIcon from '@/presentation/assets/icons/organization-24.svg';
import settingsIcon from '@/presentation/assets/icons/settings-24.svg';
import signOutIcon from '@/presentation/assets/icons/sign-out-24.svg';
import { documentLinks } from '@/presentation/documents/links';
import { media, scrim } from '@/presentation/theme/system';
import { TextLink } from '@/presentation/ui/actions';
import { Badge } from '@/presentation/ui/badge';
import { Dialog } from '@/presentation/ui/dialog';
import { SearchInput } from '@/presentation/ui/form';
import { Icon } from '@/presentation/ui/icon';
import { rem } from '@/presentation/ui/units';
import { roleTitle } from './shell-context';
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
const OptionButton = chakra('button', {
  base: {
    ...optionStyles,
    w: 'full',
    textAlign: 'start',
    cursor: 'pointer',
    color: 'text.primary',
    _hover: { bg: 'bg.subtle' },
  },
});

// Figma Restaurant option: a radio mark, the name and role chips. The current
// restaurant is marked. A preparing restaurant cannot be chosen.
function RestaurantOption({
  restaurant,
  current,
  onSwitch,
}: {
  restaurant: RestaurantAccess;
  current: boolean;
  onSwitch: (restaurant: RestaurantAccess) => void;
}) {
  const preparing = restaurant.lifecycle === 'registering';
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
            : preparing
              ? 'border.default'
              : 'border.strong'
        }
      />
      <Stack gap="1" flex="1" minW="0">
        <Text
          textStyle={current ? 'body.strong' : 'body.default'}
          color={preparing ? 'text.disabled' : 'text.primary'}
          lineClamp={2}
          title={restaurant.name}
        >
          {restaurant.name}
        </Text>
        <Flex gap="1" wrap="wrap">
          {restaurant.roles.map((role) => (
            <Badge key={role}>{roleTitle(role)}</Badge>
          ))}
        </Flex>
        {preparing && (
          <Text textStyle="caption.default" color="text.secondary">
            Подготавливается
          </Text>
        )}
      </Stack>
    </>
  );
  return (
    <li>
      {preparing ? (
        <Flex {...optionStyles}>{body}</Flex>
      ) : (
        <OptionButton
          type="button"
          aria-current={current ? 'true' : undefined}
          bg={current ? 'bg.actionSubtle' : undefined}
          onClick={() => {
            onSwitch(restaurant);
          }}
        >
          {body}
        </OptionButton>
      )}
    </li>
  );
}

// The organization of the current restaurant goes first, as in W08. The search
// filters only the list already in the menu.
function Workplaces({
  organizations,
  currentID,
  onSwitch,
}: {
  organizations: readonly OrganizationAccess[];
  currentID: string | undefined;
  onSwitch: (restaurant: RestaurantAccess) => void;
}) {
  const [query, setQuery] = useState('');
  const holdsCurrent = (organization: OrganizationAccess) =>
    Number(
      organization.restaurants.some((item) => item.restaurantID === currentID),
    );
  const ordered = [...organizations].sort(
    (a, b) => holdsCurrent(b) - holdsCurrent(a),
  );
  const shown = filterWorkplaces(ordered, query);
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
            <Stack as="li" key={organization.orgID} gap="1">
              <Text px="3" textStyle="caption.strong" color="text.secondary">
                {organization.name}
              </Text>
              <Stack as="ul" gap="1" listStyleType="none">
                {organization.restaurants.map((restaurant) => (
                  <RestaurantOption
                    key={restaurant.restaurantID}
                    restaurant={restaurant}
                    current={restaurant.restaurantID === currentID}
                    onSwitch={onSwitch}
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
// scrolls, so the menu fits the window. Without restaurants in access (W13,
// W17) the workplace block is absent.
// Links leave through onLeave, which also closes the 390 navigation drawer the
// menu may have been opened from; «Закрыть» only closes the menu. Choosing a
// restaurant goes through onSwitch.
export function AccountMenu({
  dialogRef,
  onLeave,
  user,
  organizations,
  currentID,
  onSwitch,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onLeave: () => void;
  user: User | undefined;
  organizations: readonly OrganizationAccess[] | undefined;
  currentID: string | undefined;
  onSwitch: (restaurant: RestaurantAccess) => void;
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
          <Text textStyle="body.strong">{user?.displayName}</Text>
          <Text textStyle="mono.default" color="text.secondary">
            {user?.login}
          </Text>
        </Stack>
        <Box h="1px" bg="border.default" />
        {organizations && organizations.length > 0 && (
          <>
            <Workplaces
              organizations={organizations}
              currentID={currentID}
              onSwitch={onSwitch}
            />
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
        <MenuItem to="/logout" onClick={onLeave}>
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
  name,
  context,
  sections,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onOpenAccount: () => void;
  name: string;
  context: string;
  sections: readonly SectionKey[];
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
          name={name}
          context={context}
          sections={sections}
        />
      </Box>
    </Dialog>
  );
}
