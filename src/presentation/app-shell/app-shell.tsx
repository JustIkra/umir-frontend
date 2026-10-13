import { Box, Flex, Stack } from '@chakra-ui/react';
import { useRef, type ReactNode } from 'react';
import { Outlet } from 'react-router';
import { DocumentFooter } from '@/presentation/documents/document-chrome';
import { placeholderAccount } from '@/presentation/placeholder-account';
import { SkipLink, mainContentId } from '@/presentation/site/skip-link';
import { rem } from '@/presentation/ui/units';
import { AccountMenu, NavigationDrawer } from './account-menu';
import { AppBackground } from './app-background';
import { AppBar } from './app-bar';
import { SidebarContent } from './sidebar';

// Figma W03 shell: 240px sidebar from 1024, the App bar and Doc footer on 390.
// Without a restaurant (W13) the sidebar has no sections and the menu no
// workplaces.
export function AppShell({
  restaurant = true,
  children,
}: {
  restaurant?: boolean;
  children?: ReactNode;
}) {
  const context = restaurant
    ? `${placeholderAccount.restaurant} · ${placeholderAccount.roles}`
    : 'Нет доступных ресторанов';
  const menu = useRef<HTMLDialogElement>(null);
  const drawer = useRef<HTMLDialogElement>(null);
  const openAccount = () => menu.current?.showModal();
  const openNav = () => drawer.current?.showModal();
  const leave = () => {
    menu.current?.close();
    drawer.current?.close();
  };
  return (
    <Flex minH="100dvh" bg="bg.canvas">
      <SkipLink />
      <Box
        as="aside"
        display={{ base: 'none', sm: 'block' }}
        position="sticky"
        top="0"
        h="100dvh"
        w={rem(240)}
        flexShrink="0"
        bg="bg.surface"
        borderRightWidth="1px"
        borderColor="border.default"
      >
        <SidebarContent
          onOpenAccount={openAccount}
          context={context}
          sections={restaurant}
        />
      </Box>
      <Flex direction="column" flex="1" minW="0">
        <AppBar
          onOpenNav={openNav}
          onOpenAccount={openAccount}
          title={restaurant ? placeholderAccount.restaurant : 'Ровный ход'}
        />
        <Box
          position="relative"
          flex="1"
          overflow="clip"
          display="flex"
          flexDirection="column"
        >
          <AppBackground />
          <Stack
            as="main"
            id={mainContentId}
            tabIndex={-1}
            position="relative"
            zIndex="content"
            flex="1"
            gap="6"
            pt={{ base: '6', sm: '8', xl: '10' }}
            px={{ base: '4', sm: '8', xl: '10' }}
            pb={{ base: '12', sm: '16' }}
            _focusVisible={{ outline: 'none' }}
          >
            {children ?? <Outlet />}
          </Stack>
        </Box>
        <Box display={{ base: 'block', sm: 'none' }}>
          <DocumentFooter />
        </Box>
      </Flex>
      <AccountMenu dialogRef={menu} onLeave={leave} workplaces={restaurant} />
      <NavigationDrawer
        dialogRef={drawer}
        onOpenAccount={openAccount}
        context={context}
        sections={restaurant}
      />
    </Flex>
  );
}
