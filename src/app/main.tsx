import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import { ChakraProvider } from '@chakra-ui/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createTimerScheduler } from '@/adapters/browser-page/scheduler';
import { createPageVisibility } from '@/adapters/browser-page/visibility';
import { createCookieNoticeStore } from '@/adapters/browser-storage/cookie-notice-store';
import { notConnectedFeedbackSender } from '@/adapters/feedback/not-connected-sender';
import { createSessionCheck } from '@/adapters/http/session-check';
import { createEventSourceFeed } from '@/adapters/live/event-source-feed';
import { createFeedbackSubmitter } from '@/application/feedback';
import { createLiveSync } from '@/application/live-sync';
import { routes } from '@/presentation/routes';
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

const services: PresentationServices = {
  cookieNotice: createCookieNoticeStore(browserLocalStorage()),
  feedback: createFeedbackSubmitter(notConnectedFeedbackSender, () =>
    crypto.randomUUID(),
  ),
  // /app starts the stream after sign-in. No command client exists yet, so no
  // ConfirmationPending attempt waits for resolution.
  live: createLiveSync({
    feed: createEventSourceFeed((url) => new EventSource(url)),
    scheduler: createTimerScheduler(window),
    visibility: createPageVisibility(document),
    sessionCheck: createSessionCheck((path, init) => fetch(path, init)),
    resolvePending: () => Promise.resolve(),
  }),
};
const router = createBrowserRouter(routes);

createRoot(root).render(
  <StrictMode>
    <ChakraProvider value={system}>
      <ServicesProvider services={services}>
        <RouterProvider router={router} />
      </ServicesProvider>
    </ChakraProvider>
  </StrictMode>,
);
