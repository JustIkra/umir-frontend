import { ChakraProvider } from '@chakra-ui/react';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import {
  MemoryRouter,
  StaticRouterProvider,
  createStaticHandler,
  createStaticRouter,
} from 'react-router';
import { permissionsFor } from '../../../src/domain/access.ts';
import { createRoutes } from '../../../src/presentation/routes.tsx';
import { ServicesProvider } from '../../../src/presentation/services.tsx';
import { system } from '../../../src/presentation/theme/system.ts';

export const R = '33333333-3333-4333-8333-333333333333';
export const ORG = '22222222-2222-4222-8222-222222222222';

const store = (snapshot) => ({
  subscribe: () => () => {},
  getSnapshot: () => snapshot,
});

export const sampleRestaurant = (overrides = {}) => {
  const roles = overrides.roles ?? ['Warehouse', 'Waiter'];
  return {
    restaurantID: R,
    orgID: ORG,
    orgName: 'Восток Фуд',
    name: 'На Пушкинской',
    lifecycle: 'ready',
    timeZone: 'Europe/Moscow',
    ...overrides,
    roles,
    permissions: permissionsFor(roles),
  };
};

export const readyAccess = (restaurants = [sampleRestaurant()]) => ({
  status: 'ready',
  organizations:
    restaurants.length === 0
      ? []
      : [
          {
            orgID: ORG,
            name: 'Восток Фуд',
            settings: { timeZone: 'Europe/Moscow', settingsVersion: '1' },
            admin: false,
            restaurants,
          },
        ],
});

export const activeSession = {
  status: 'active',
  user: {
    userID: 'u',
    login: 'm.belova',
    displayName: 'Марина Белова',
    email: 'm.belova@restoran.example',
  },
  session: {
    expiresAt: { iso: '2026-10-10T23:00:00+03:00', epochMs: 0 },
    idleExpiresAt: { iso: '2026-10-10T16:00:00+03:00', epochMs: 0 },
    absoluteExpiresAt: { iso: '2026-10-10T23:00:00+03:00', epochMs: 0 },
    rememberMe: false,
  },
};

// Screens only read these ports during render; nothing is sent. refresh()
// answers refreshed; accessCalls counts the reads of access; notice is the
// «Данные обновились» notice of models.
export function fakeServices({
  session = activeSession,
  access = readyAccess(),
  refreshed = access,
  accessCalls = { ensure: 0, refresh: 0 },
  remembered,
  attempts = [],
  notice,
} = {}) {
  return {
    cookieNotice: { isClosed: () => true, close: () => {} },
    feedback: {},
    session: {
      ...store(session),
      ensure: () => Promise.resolve(session),
      check: () => Promise.resolve('active'),
      signIn: () => Promise.reject(new Error('no sign-in in render tests')),
      signOut: () => Promise.resolve('done'),
      adopt: () => {},
      updateUser: () => {},
      forget: () => {},
      expire: () => {},
    },
    access: {
      ...store(access),
      ensure: () => {
        accessCalls.ensure += 1;
        return Promise.resolve(access);
      },
      refresh: () => {
        accessCalls.refresh += 1;
        return Promise.resolve(refreshed);
      },
      nameOf: () => undefined,
      clear: () => {},
    },
    lastRestaurant: { read: () => remembered, write: () => {} },
    live: {
      ...store({ connection: 'closed', stale: false, restaurantID: undefined }),
      start: () => {},
      stop: () => {},
    },
    models: {
      subscribeNotice: () => () => {},
      getNotice: () => notice,
      dismissNotice: () => {},
    },
    commands: {
      ...store(attempts),
      run: () => Promise.reject(new Error('no commands')),
      retry: () => undefined,
      discard: () => {},
      clear: () => {},
    },
  };
}

async function query(path, services) {
  const handler = createStaticHandler(createRoutes(services));
  return {
    handler,
    context: await handler.query(new Request(`http://localhost${path}`)),
  };
}

// The Location of a redirect answer, or undefined when the page renders.
export async function redirectOf(path, options = {}) {
  const { context } = await query(path, fakeServices(options));
  return context instanceof Response
    ? context.headers.get('Location')
    : undefined;
}

// Renders the page at path, following redirects (at most five).
export async function renderRoute(path, options = {}) {
  const services = fakeServices(options);
  let target = path;
  for (let hop = 0; hop < 5; hop += 1) {
    const { handler, context } = await query(target, services);
    if (context instanceof Response) {
      target = context.headers.get('Location');
      continue;
    }
    const router = createStaticRouter(handler.dataRoutes, context);
    return renderToString(
      h(
        ChakraProvider,
        { value: system },
        h(
          ServicesProvider,
          { services },
          h(StaticRouterProvider, { router, context }),
        ),
      ),
    );
  }
  throw new Error(`${path}: too many redirects`);
}

// Emotion inlines <style> elements next to the markup during server rendering.
const plain = (fragment) =>
  fragment
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
export const h1 = (html) => {
  const match = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
  return match ? plain(match[1]) : undefined;
};
export const labels = (html) =>
  [...html.matchAll(/<label[^>]*>([\s\S]*?)<\/label>/g)].map((m) =>
    plain(m[1]),
  );
// Links only: SVG <image href> and similar point at bundled files.
export const hrefs = (html) =>
  [...html.matchAll(/<a\s[^>]*?href="([^"]+)"/g)].map((m) => m[1]);

// Renders a component with the theme and a router, for state components.
export function renderElement(element) {
  return renderToString(
    h(ChakraProvider, { value: system }, h(MemoryRouter, null, element)),
  );
}
export const text = (html) => plain(html);
