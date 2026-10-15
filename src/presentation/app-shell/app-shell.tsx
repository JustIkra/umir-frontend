import { Box, Flex, Stack } from '@chakra-ui/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router';
import type { RestaurantAccess } from '@/application/access';
import {
  decideSwitch,
  type SwitchDecision,
  type SwitchTarget,
} from '@/application/switching';
import { DocumentFooter } from '@/presentation/documents/document-chrome';
import { useServices } from '@/presentation/services';
import {
  useAccess,
  useAttempts,
  useRefreshNotice,
  useSession,
} from '@/presentation/session/hooks';
import { SkipLink, mainContentId } from '@/presentation/site/skip-link';
import { InfoNotice } from '@/presentation/ui/states';
import { rem } from '@/presentation/ui/units';
import { AccountMenu, NavigationDrawer } from './account-menu';
import { AppBackground } from './app-background';
import { AppBar } from './app-bar';
import { useUnsavedForm } from './leave-guard';
import { restaurantPath, sectionOfPath, useCurrentRestaurantID } from './paths';
import { sectionSuffix } from './sections';
import { shellContext, type ShellMode } from './shell-context';
import { SidebarContent } from './sidebar';
import { UnknownAttemptDialog, UnsavedFormDialog } from './switch-dialogs';

// Figma W03 shell: 240px sidebar from 1024, the App bar and Doc footer on 390.
// The mode follows the access state (W13, W15–W17); the restaurant mode shows
// the sections its roles open.
export function AppShell({
  mode = 'restaurant',
  children,
}: {
  mode?: ShellMode;
  children?: ReactNode;
}) {
  const services = useServices();
  const session = useSession();
  const access = useAccess();
  const attempts = useAttempts();
  const unsavedForm = useUnsavedForm();
  const notice = useRefreshNotice();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // The restaurant in the address: the one the switcher leaves. Outside a
  // restaurant the shell still links to the one /app would open.
  const { restaurantID: currentID } = useParams();
  const context = shellContext(access, mode, useCurrentRestaurantID());
  const currentName =
    currentID === undefined
      ? ''
      : (context.restaurant?.name ?? services.access.nameOf(currentID) ?? '');
  const user = session.status === 'active' ? session.user : undefined;
  // An organization of an active membership may have no restaurants (W13).
  const workplaces =
    access.status === 'ready'
      ? access.organizations.filter(
          (organization) => organization.restaurants.length > 0,
        )
      : [];
  const organizations = workplaces.length > 0 ? workplaces : undefined;
  const menu = useRef<HTMLDialogElement>(null);
  const drawer = useRef<HTMLDialogElement>(null);
  const unsavedDialog = useRef<HTMLDialogElement>(null);
  const unknownDialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState<SwitchDecision | undefined>();

  // A notice belongs to the page it appeared on.
  useEffect(() => {
    services.models.dismissNotice();
  }, [pathname, services.models]);
  // A dialog exists only while its decision is pending; it opens once rendered.
  useEffect(() => {
    if (pending?.kind === 'confirm-unsaved') unsavedDialog.current?.showModal();
    if (pending?.kind === 'blocked-unknown') unknownDialog.current?.showModal();
  }, [pending]);

  const openAccount = () => menu.current?.showModal();
  const openNav = () => drawer.current?.showModal();
  const leave = () => {
    menu.current?.close();
    drawer.current?.close();
  };
  const go = (to: SwitchTarget) => {
    void navigate(
      restaurantPath(to.restaurantID, sectionSuffix(to.section)),
      to.missing === undefined ? {} : { state: { missingSection: to.missing } },
    );
  };
  // Outside a restaurant the path has no section: the overview opens.
  const onSwitch = (target: RestaurantAccess) => {
    leave();
    if (target.restaurantID === currentID) return;
    const decision = decideSwitch({
      target,
      section: sectionOfPath(pathname),
      currentID,
      attempts,
      unsavedForm,
    });
    if (decision.kind === 'go') go(decision.to);
    else setPending(decision);
  };
  const name = user?.displayName ?? '';

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
          name={name}
          context={context.caption}
          sections={context.sections}
        />
      </Box>
      <Flex direction="column" flex="1" minW="0">
        <AppBar
          onOpenNav={openNav}
          onOpenAccount={openAccount}
          title={context.title}
          name={name}
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
            {mode === 'restaurant' &&
              notice !== undefined &&
              notice.restaurantID === context.restaurantID && (
                <InfoNotice title="Данные обновлены">
                  Была короткая техническая пауза. Если вы что-то отправляли,
                  проверьте, сохранилось ли.
                </InfoNotice>
              )}
            {children ?? <Outlet />}
          </Stack>
        </Box>
        <Box display={{ base: 'block', sm: 'none' }}>
          <DocumentFooter />
        </Box>
      </Flex>
      <AccountMenu
        dialogRef={menu}
        onLeave={leave}
        user={user}
        organizations={organizations}
        currentID={currentID}
        feedbackPath={
          mode === 'restaurant' && currentID !== undefined && context.restaurant
            ? restaurantPath(currentID, '/feedback')
            : undefined
        }
        onSwitch={onSwitch}
      />
      <NavigationDrawer
        dialogRef={drawer}
        onOpenAccount={openAccount}
        name={name}
        context={context.caption}
        sections={context.sections}
      />
      {pending?.kind === 'confirm-unsaved' && (
        <UnsavedFormDialog
          dialogRef={unsavedDialog}
          form={pending.form}
          restaurantName={currentName}
          onLeave={() => {
            go(pending.to);
          }}
        />
      )}
      {pending?.kind === 'blocked-unknown' && (
        <UnknownAttemptDialog
          dialogRef={unknownDialog}
          attempt={pending.attempt}
          restaurantName={currentName}
          timeZone={context.restaurant?.timeZone ?? 'Europe/Moscow'}
          onCheck={() => {
            void services.commands.retry(pending.attempt.key);
          }}
        />
      )}
    </Flex>
  );
}
