import { Flex } from '@chakra-ui/react';
import { useEffect } from 'react';
import {
  Navigate,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
  useParams,
  useRevalidator,
  type LoaderFunctionArgs,
} from 'react-router';
import { chooseEntry, findRestaurant } from '@/application/access';
import { canOpenSection, type SectionKey } from '@/domain/access';
import { isEntityId } from '@/domain/ids';
import { NotFound } from '@/presentation/documents/not-found-page';
import {
  useServices,
  type PresentationServices,
} from '@/presentation/services';
import { useAccess, useSession } from '@/presentation/session/hooks';
import {
  AccessRevoked,
  AccessUnverified,
  RestaurantPreparing,
  SectionUnavailable,
  SessionUnverified,
} from './access-states';
import { AppShell } from './app-shell';
import { LeaveGuardProvider } from './leave-guard';
import { restaurantPath } from './paths';
import { sectionTitle } from './sections';

export function loginPath(
  location: { readonly pathname: string; readonly search: string },
  expired: boolean,
): string {
  const target = encodeURIComponent(`${location.pathname}${location.search}`);
  return `/login?return=${target}${expired ? '&expired=1' : ''}`;
}

// /app: a guest goes to sign-in with the address to return to. Every page
// of the app reads access before render, also outside a restaurant; the
// entry and restaurant loaders share the same request.
export function createAppLoader(services: PresentationServices) {
  return async ({ request }: LoaderFunctionArgs) => {
    const state = await services.session.ensure();
    if (state.status === 'anonymous') {
      return redirect(loginPath(new URL(request.url), state.expired));
    }
    if (state.status === 'active') await services.access.ensure();
    return null;
  };
}

// /app itself: open a restaurant, «no restaurants», or W17 (rendered by
// AppEntry). Each new opening of /app checks unverified access again.
export function createEntryLoader(services: PresentationServices) {
  return async () => {
    if ((await services.session.ensure()).status !== 'active') return null;
    const access =
      services.access.getSnapshot().status === 'unverified'
        ? await services.access.refresh()
        : await services.access.ensure();
    const entry = chooseEntry(access, services.lastRestaurant.read());
    if (entry.kind === 'restaurant') {
      return redirect(restaurantPath(entry.restaurantID));
    }
    if (entry.kind === 'none') return redirect('/app/no-restaurants');
    return null;
  };
}

// /app/r/:restaurantID: a malformed id is a missing page; access is read
// before the first render so the shell does not flash.
export function createRestaurantLoader(services: PresentationServices) {
  return async ({ params }: LoaderFunctionArgs) => {
    if (!isEntityId(params.restaurantID)) throw new NotFound();
    if ((await services.session.ensure()).status === 'active') {
      await services.access.ensure();
    }
    return null;
  };
}

// Loaders do not re-run when a store changes: after the retry they are run
// again to redirect a guest and to read access. Forms with unsent input
// register under the gate, so the switcher of any shell sees them.
export function AppGate() {
  const session = useSession();
  const location = useLocation();
  const services = useServices();
  const { revalidate } = useRevalidator();
  if (session.status === 'anonymous') {
    return <Navigate to={loginPath(location, session.expired)} replace />;
  }
  if (session.status === 'unavailable') {
    return (
      <Flex minH="100dvh" align="center" justify="center" px="4" bg="bg.canvas">
        <SessionUnverified
          onRetry={() => {
            void services.session.ensure().then(() => revalidate());
          }}
        />
      </Flex>
    );
  }
  return (
    <LeaveGuardProvider>
      <Outlet />
    </LeaveGuardProvider>
  );
}

// Rendered only when the entry loader did not redirect: W17.
export function AppEntry() {
  const access = useAccess();
  const services = useServices();
  const navigate = useNavigate();
  if (access.status !== 'unverified') return null;
  const retry = () => {
    void services.access.refresh().then((state) => {
      const entry = chooseEntry(state, services.lastRestaurant.read());
      if (entry.kind === 'restaurant') {
        void navigate(restaurantPath(entry.restaurantID));
      } else if (entry.kind === 'none') {
        void navigate('/app/no-restaurants');
      }
    });
  };
  return (
    <AppShell mode="unverified">
      <AccessUnverified
        details={`${String(access.failure.status)} ${access.failure.code}`}
        onRetry={retry}
      />
    </AppShell>
  );
}

export function RestaurantScope() {
  const { restaurantID = '' } = useParams();
  const services = useServices();
  const access = useAccess();
  const restaurant = findRestaurant(access, restaurantID);
  const revoked = access.status === 'ready' && restaurant === undefined;
  const preparing = restaurant?.lifecycle === 'registering';
  const open = !revoked && !preparing;
  useEffect(() => {
    if (!open) return;
    services.lastRestaurant.write(restaurantID);
    services.live.start(restaurantID);
    return () => {
      services.live.stop();
    };
  }, [open, restaurantID, services]);
  if (revoked) {
    return (
      <AppShell mode="revoked">
        <AccessRevoked restaurantName={services.access.nameOf(restaurantID)} />
      </AppShell>
    );
  }
  if (restaurant && preparing) {
    return (
      <AppShell mode="preparing">
        <RestaurantPreparing
          restaurantName={restaurant.name}
          onRetry={() => {
            void services.access.refresh();
          }}
        />
      </AppShell>
    );
  }
  return <AppShell />;
}

export function SectionGate({ section }: { section: SectionKey }) {
  const { restaurantID = '' } = useParams();
  const access = useAccess();
  const restaurant = findRestaurant(access, restaurantID);
  if (restaurant && !canOpenSection(section, restaurant.permissions)) {
    return (
      <SectionUnavailable
        section={sectionTitle(section)}
        restaurantName={restaurant.name}
        overviewPath={restaurantPath(restaurantID)}
      />
    );
  }
  return <Outlet />;
}
