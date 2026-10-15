import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import { ChakraProvider } from '@chakra-ui/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createAccessApi } from '@/adapters/api/access-api';
import {
  createWarehouseReads,
  createWarehouseApi,
} from '@/adapters/api/warehouse-api';
import {
  createCatalogApi,
  createOrderApi,
  createRestaurantReads,
} from '@/adapters/api/restaurant-api';
import { createInvitationApi } from '@/adapters/api/invitation-api';
import { createRegistrationApi } from '@/adapters/api/registration-api';
import { createRecoveryApi } from '@/adapters/api/recovery-api';
import { createAccountApi } from '@/adapters/api/account-api';
import { createOrganizationsApi } from '@/adapters/api/organizations-api';
import { createTimerScheduler } from '@/adapters/browser-page/scheduler';
import { createPageVisibility } from '@/adapters/browser-page/visibility';
import { createCookieNoticeStore } from '@/adapters/browser-storage/cookie-notice-store';
import { createAttemptStore } from '@/adapters/browser-storage/attempt-store';
import { createOrderStore } from '@/adapters/browser-storage/order-store';
import { createInvitationStore } from '@/adapters/browser-storage/invitation-store';
import { createRegistrationStore } from '@/adapters/browser-storage/registration-store';
import { createPasswordResetStore } from '@/adapters/browser-storage/password-reset-store';
import { createLastRestaurantStore } from '@/adapters/browser-storage/last-restaurant-store';
import { createAppFeedbackApiSender } from '@/adapters/feedback/app-feedback-sender';
import { createFeedbackApiSender } from '@/adapters/feedback/feedback-api-sender';
import { createGatewayClient } from '@/adapters/http/gateway-client';
import { createEventSourceFeed } from '@/adapters/live/event-source-feed';
import { createAccountSettings } from '@/application/account-settings';
import { createAccessStore } from '@/application/access';
import {
  restoreAttempts,
  restoreWhenActive,
} from '@/application/attempts-restore';
import {
  createCatalogCommands,
  type CatalogCommands,
} from '@/application/catalog-commands';
import { createCommandRunner } from '@/application/commands';
import { createEpochRegistry } from '@/application/epochs';
import {
  createFeedbackSubmitter,
  type FeedbackSubmitter,
} from '@/application/feedback';
import { createLifecycleTracker } from '@/application/lifecycles';
import { createLiveSync } from '@/application/live-sync';
import { createModelRegistry } from '@/application/models';
import { createOrderFlow } from '@/application/order-flow';
import { createOrderFlowRegistry } from '@/application/order-flows';
import { createInvitationAcceptance } from '@/application/invitation-acceptance';
import { createRegistration } from '@/application/registration';
import { createOrganizationCommands } from '@/application/organization-commands';
import { createOrganizationReads } from '@/application/organization-reads';
import { createPasswordResetFlow } from '@/application/password-reset';
import {
  createRestaurantData,
  type RestaurantData,
} from '@/application/restaurant-data';
import { createSessionStore } from '@/application/session';
import {
  createWarehouseCommands,
  type WarehouseCommands,
} from '@/application/warehouse-commands';
import { createRoutes } from '@/presentation/routes';
import {
  ServicesProvider,
  type PresentationServices,
} from '@/presentation/services';
import { system } from '@/presentation/theme/system';

// Reading window.localStorage itself throws when site data is blocked.
function browserLocalStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

// Reading window.sessionStorage itself throws when site data is blocked.
function browserSessionStorage(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element is missing');

const client = createGatewayClient((url, init) => window.fetch(url, init));
const scheduler = createTimerScheduler(window);
const visibility = createPageVisibility(document);
const now = () => Date.now();
const epochs = createEpochRegistry();
const models = createModelRegistry({
  now,
  epochs,
  createCancellation: () => new AbortController(),
});
const commands = createCommandRunner({
  newId: () => crypto.randomUUID(),
  now,
  epochs,
  onReset: (restaurantID) => {
    if (restaurantID !== undefined) models.reset(restaurantID);
  },
});
// 401 on /access: the session check sends an ended session to sign-in.
const access = createAccessStore(createAccessApi(client), {
  onUnauthenticated: () => session.check(),
});
const organizationsApi = createOrganizationsApi(client);
const organizationReads = createOrganizationReads({
  api: organizationsApi,
  now,
  createCancellation: () => new AbortController(),
});
const lifecycles = createLifecycleTracker({
  api: organizationsApi,
  scheduler,
  now,
  onSettled: () => {
    void access.refresh();
  },
});
const live = createLiveSync({
  feed: createEventSourceFeed((url) => new EventSource(url)),
  scheduler,
  visibility,
  sessionCheck: { check: () => session.check() },
  models,
  onAccessEnded: (_restaurantID, reason) => {
    if (reason === 'session-expired') session.expire();
    else if (reason !== 'auth-unavailable') void access.refresh();
  },
  // A refused stream may mean ended access: W15 then stops the stream.
  onRefused: () => {
    void access.refresh();
  },
  // ConfirmationPending attempts are checked by the order flow (once after
  // 3 s, then by «Проверить результат»); live signals do not resolve them
  // (spec 3, section 6).
  resolvePending: () => Promise.resolve(),
});
const restaurantReads = {
  ...createRestaurantReads(client),
  ...createWarehouseReads(client),
};
const catalogApi = createCatalogApi(client);
const warehouseApi = createWarehouseApi(client);
// The factories of warehouse and catalog commands, one per user and
// restaurant. Their saved attempts are not erased with them.
const warehouseCommands = new Map<string, WarehouseCommands>();
const orderApi = createOrderApi(client);
const orderStore = createOrderStore(browserSessionStorage());
const attemptStore = createAttemptStore(browserSessionStorage());
// The user of the active session. The warehouse and catalog screens sit
// behind the session gate, which sends everyone else to sign-in before they
// render; a factory for nobody would write attempts under an empty user.
const activeUserID = (): string => {
  const state = session.getSnapshot();
  if (state.status !== 'active') {
    throw new Error('Commands need a signed-in user');
  }
  return state.user.userID;
};
const restaurantData = new Map<string, RestaurantData>();
const catalogCommands = new Map<string, CatalogCommands>();
const restaurantFeedback = new Map<string, FeedbackSubmitter>();
const orderFlows = createOrderFlowRegistry((userID, restaurantID) =>
  createOrderFlow({
    api: orderApi,
    commands,
    epochs,
    storage: orderStore,
    scheduler,
    now,
    restaurantID,
    userID,
    onReset: () => {
      models.reset(restaurantID);
    },
    onOrdered: () => {
      models.markStale(restaurantID, ['orders', 'stock', 'menu']);
    },
    onUnauthenticated: () => {
      void session.check();
    },
  }),
);
const accountApi = createAccountApi(client);
const session = createSessionStore({
  api: accountApi,
  commands,
  scheduler,
  visibility,
  now,
  setCsrfToken: (token) => {
    client.setCsrfToken(token);
  },
  onSignedOut: () => {
    live.stop();
    models.clear();
    commands.clear();
    epochs.clear();
    access.clear();
    orderFlows.forget();
    catalogCommands.clear();
    warehouseCommands.clear();
    restaurantFeedback.clear();
    organizationReads.clear();
    organizationCommands.clear();
    lifecycles.clear();
    client.clearCsrfToken();
  },
  onExpired: () => {
    live.stop();
    models.clear();
    organizationReads.clear();
    lifecycles.clear();
    access.clear();
    client.clearCsrfToken();
  },
  // Another user signed in, here or in another tab. The shown restaurant
  // reads that user's access again.
  onUserChanged: () => {
    models.clear();
    commands.clear();
    epochs.clear();
    access.clear();
    orderFlows.forget();
    catalogCommands.clear();
    warehouseCommands.clear();
    restaurantFeedback.clear();
    organizationReads.clear();
    organizationCommands.clear();
    lifecycles.clear();
    void access.refresh();
  },
  // L13: the server ended the session while a password change is pending,
  // probably because the change applied. The session is still active here,
  // so its login is the one to fill in.
  expiryNotice: () => {
    const state = session.getSnapshot();
    if (state.status !== 'active') return undefined;
    return accountSettings.pending().password === undefined
      ? undefined
      : { kind: 'password-unknown', login: state.user.login };
  },
});
const organizationCommands = createOrganizationCommands({
  api: organizationsApi,
  commands,
  accessChanged: () => {
    void access.refresh();
  },
  membersChanged: (orgID) => {
    organizationReads.members(orgID).refresh();
  },
  invitationsChanged: (orgID) => {
    organizationReads.invitations(orgID).refresh();
  },
  profileChanged: (orgID) => {
    organizationReads.profile(orgID).refresh();
  },
  started: (kind, name, lifecycle) => {
    lifecycles.follow(kind, name, lifecycle);
  },
  onUnauthenticated: () => {
    void session.check();
  },
});
const passwordReset = createPasswordResetFlow({
  api: createRecoveryApi(client),
  commands,
  session,
  storage: createPasswordResetStore(browserSessionStorage()),
  now,
});
const invitationAcceptance = createInvitationAcceptance({
  api: createInvitationApi(client),
  commands,
  session,
  access,
  storage: createInvitationStore(browserSessionStorage()),
  now,
});
const registration = createRegistration({
  api: createRegistrationApi(client),
  commands,
  session,
  access,
  storage: createRegistrationStore(browserSessionStorage()),
  now,
});
const accountSettings = createAccountSettings({
  api: accountApi,
  commands,
  session,
});

const services: PresentationServices = {
  cookieNotice: createCookieNoticeStore(browserLocalStorage()),
  feedback: createFeedbackSubmitter(createFeedbackApiSender(client), () =>
    crypto.randomUUID(),
  ),
  restaurantFeedback: (restaurantID) => {
    let feedback = restaurantFeedback.get(restaurantID);
    if (feedback === undefined) {
      feedback = createFeedbackSubmitter(
        createAppFeedbackApiSender(client, restaurantID),
        () => crypto.randomUUID(),
      );
      restaurantFeedback.set(restaurantID, feedback);
    }
    return feedback;
  },
  session,
  access,
  lastRestaurant: createLastRestaurantStore(browserLocalStorage()),
  live,
  models,
  commands,
  now,
  passwordReset,
  invitationAcceptance,
  registration,
  accountSettings,
  organizations: {
    reads: organizationReads,
    commands: organizationCommands,
    lifecycles,
  },
  restaurantData: (restaurantID) => {
    let data = restaurantData.get(restaurantID);
    if (data === undefined) {
      data = createRestaurantData(models, restaurantReads, restaurantID);
      restaurantData.set(restaurantID, data);
    }
    return data;
  },
  catalogCommands: (restaurantID) => {
    const userID = activeUserID();
    const key = `${userID}/${restaurantID}`;
    let catalog = catalogCommands.get(key);
    if (catalog === undefined) {
      catalog = createCatalogCommands({
        api: catalogApi,
        commands,
        restaurantID,
        userID,
        attempts: attemptStore,
        now,
        markStale: (topics) => {
          models.markStale(restaurantID, topics);
        },
        onUnauthenticated: () => {
          void session.check();
        },
      });
      catalogCommands.set(key, catalog);
    }
    return catalog;
  },
  warehouseCommands: (restaurantID) => {
    const userID = activeUserID();
    const key = `${userID}/${restaurantID}`;
    let value = warehouseCommands.get(key);
    if (value === undefined) {
      value = createWarehouseCommands({
        api: warehouseApi,
        commands,
        restaurantID,
        userID,
        attempts: attemptStore,
        now,
        newID: () => crypto.randomUUID(),
        markStale: (topics) => {
          models.markStale(restaurantID, topics);
        },
        onUnauthenticated: () => {
          void session.check();
        },
      });
      warehouseCommands.set(key, value);
    }
    return value;
  },
  orderFlow: (restaurantID) => {
    const state = session.getSnapshot();
    return state.status === 'active'
      ? orderFlows.get(state.user.userID, restaurantID)
      : undefined;
  },
};
// After sign-in the saved attempts of the user come back without an open
// page: W11 lists them and they hold the restaurant switch.
restoreWhenActive(session, (userID) => {
  restoreAttempts({
    store: attemptStore,
    userID,
    warehouseCommands: services.warehouseCommands,
    catalogCommands: services.catalogCommands,
  });
});
const router = createBrowserRouter(createRoutes(services));

createRoot(root).render(
  <StrictMode>
    <ChakraProvider value={system}>
      <ServicesProvider services={services}>
        <RouterProvider router={router} />
      </ServicesProvider>
    </ChakraProvider>
  </StrictMode>,
);
