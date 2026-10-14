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
import { createRecoveryApi } from '@/adapters/api/recovery-api';
import { createAccountApi } from '@/adapters/api/account-api';
import { createTimerScheduler } from '@/adapters/browser-page/scheduler';
import { createPageVisibility } from '@/adapters/browser-page/visibility';
import { createCookieNoticeStore } from '@/adapters/browser-storage/cookie-notice-store';
import { createPasswordResetStore } from '@/adapters/browser-storage/password-reset-store';
import { createLastRestaurantStore } from '@/adapters/browser-storage/last-restaurant-store';
import { createFeedbackApiSender } from '@/adapters/feedback/feedback-api-sender';
import { createGatewayClient } from '@/adapters/http/gateway-client';
import { createEventSourceFeed } from '@/adapters/live/event-source-feed';
import { createAccountSettings } from '@/application/account-settings';
import { createAccessStore } from '@/application/access';
import { createCommandRunner } from '@/application/commands';
import { createEpochRegistry } from '@/application/epochs';
import { createFeedbackSubmitter } from '@/application/feedback';
import { createLiveSync } from '@/application/live-sync';
import { createModelRegistry } from '@/application/models';
import { createPasswordResetFlow } from '@/application/password-reset';
import { createSessionStore } from '@/application/session';
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
const models = createModelRegistry({ now, epochs });
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
  // ConfirmationPending attempts are resolved in subproject 3.
  resolvePending: () => Promise.resolve(),
});
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
    client.clearCsrfToken();
  },
  onExpired: () => {
    live.stop();
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
    void access.refresh();
  },
});
const passwordReset = createPasswordResetFlow({
  api: createRecoveryApi(client),
  commands,
  session,
  storage: createPasswordResetStore(browserSessionStorage()),
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
  session,
  access,
  lastRestaurant: createLastRestaurantStore(browserLocalStorage()),
  live,
  models,
  commands,
  now,
  passwordReset,
  accountSettings,
};
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
