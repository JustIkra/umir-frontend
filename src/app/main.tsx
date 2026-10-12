import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import { ChakraProvider } from '@chakra-ui/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createCookieNoticeStore } from '@/adapters/browser-storage/cookie-notice-store';
import { notConnectedFeedbackSender } from '@/adapters/feedback/not-connected-sender';
import { createFeedbackSubmitter } from '@/application/feedback';
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
