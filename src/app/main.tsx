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
import { createAccountApi } from '@/adapters/api/account-api';
import { createTimerScheduler } from '@/adapters/browser-page/scheduler';
import { createPageVisibility } from '@/adapters/browser-page/visibility';
import { createCookieNoticeStore } from '@/adapters/browser-storage/cookie-notice-store';
import { createLastRestaurantStore } from '@/adapters/browser-storage/last-restaurant-store';
import { notConnectedFeedbackSender } from '@/adapters/feedback/not-connected-sender';
import { createGatewayClient } from '@/adapters/http/gateway-client';
import { createEventSourceFeed } from '@/adapters/live/event-source-feed';
import { createAccessStore } from '@/application/access';
import { createCommandRunner } from '@/application/commands';
import { createEpochRegistry } from '@/application/epochs';
import { createFeedbackSubmitter } from '@/application/feedback';
import { createLiveSync } from '@/application/live-sync';
import { createModelRegistry } from '@/application/models';
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
const access = createAccessStore(createAccessApi(client));
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
  // ConfirmationPending attempts are resolved in subproject 3.
  resolvePending: () => Promise.resolve(),
});
const session = createSessionStore({
  api: createAccountApi(client),
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
});

const services: PresentationServices = {
  cookieNotice: createCookieNoticeStore(browserLocalStorage()),
  feedback: createFeedbackSubmitter(notConnectedFeedbackSender, () =>
    crypto.randomUUID(),
  ),
  session,
  access,
  lastRestaurant: createLastRestaurantStore(browserLocalStorage()),
  live,
  models,
  commands,
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
