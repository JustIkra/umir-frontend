import { ChakraProvider } from '@chakra-ui/react';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import {
  MemoryRouter,
  StaticRouterProvider,
  createStaticHandler,
  createStaticRouter,
} from 'react-router';
import { ApiError, localFailure } from '../../../src/application/api.ts';
import { permissionsFor } from '../../../src/domain/access.ts';
import { emptyDeliveryDraft } from '../../../src/domain/delivery-draft.ts';
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

// The fixed clock of render tests.
export const NOW = Date.parse('2026-10-14T07:00:00Z');

export const instantOf = (iso) => ({ iso, epochMs: Date.parse(iso) });

export const readContext = {
  orgID: ORG,
  tenantID: R,
  runtimeEpoch: '44444444-4444-4444-8444-444444444444',
  warehouseEpoch: undefined,
  settings: { timeZone: 'Europe/Moscow', settingsVersion: '1' },
  evaluatedAt: instantOf('2026-10-14T10:00:00+03:00'),
  stateVersion: '1',
};

export const loaded = (result, context = readContext) => ({
  value: { context, result },
  loadedAt: NOW,
  loading: false,
  failed: false,
  failure: undefined,
});

export const loadingRead = {
  value: undefined,
  loadedAt: undefined,
  loading: true,
  failed: false,
  failure: undefined,
};

export const failedRead = (code, status, outcome = 'unavailable') => ({
  value: undefined,
  loadedAt: undefined,
  loading: false,
  failed: true,
  failure: new ApiError({
    ...localFailure(code, outcome, status),
    retryable: true,
  }),
});

export const orderSnapshot = (overrides = {}) => ({
  draft: [],
  phase: { kind: 'compose' },
  notice: undefined,
  locked: false,
  ...overrides,
});

export const deliverySnapshot = (overrides = {}) => ({
  draft: emptyDeliveryDraft(),
  phase: { kind: 'editing' },
  occurrence: undefined,
  notice: undefined,
  locked: false,
  ...overrides,
});

// permissions replaces the rights of every restaurant in access, for pages
// that hide tiles and actions by right; without it the roles decide.
const withPermissions = (state, permissions) =>
  permissions === undefined || state.status !== 'ready'
    ? state
    : {
        ...state,
        organizations: state.organizations.map((organization) => ({
          ...organization,
          restaurants: organization.restaurants.map((restaurant) => ({
            ...restaurant,
            permissions: new Set(permissions),
          })),
        })),
      };

const staticModel = (snapshot) => ({
  subscribe: () => () => {},
  getSnapshot: () => snapshot,
  refresh: () => {},
  markStale: () => {},
});

export const resetSnapshot = (overrides = {}) => ({
  step: 'email',
  email: '',
  expiresAtMs: undefined,
  resendAtMs: undefined,
  busy: false,
  notice: undefined,
  ...overrides,
});

// Screens only read these ports during render; nothing is sent. refresh()
// answers refreshed; accessCalls counts the reads of access; notice is the
// «Данные обновились» notice of models; data.stockReport is keyed by
// riskHours; writeoff overrides confirm, check and pending of the write-off
// commands.
export function fakeServices({
  session = activeSession,
  access: givenAccess = readyAccess(),
  refreshed: givenRefreshed = givenAccess,
  permissions,
  accessCalls = { ensure: 0, refresh: 0 },
  remembered,
  attempts = [],
  notice,
  reset = resetSnapshot(),
  pending = { name: undefined, password: undefined },
  data = {},
  pendingProduct,
  pendingDish,
  order = orderSnapshot(),
  writeoff = {},
  delivery = deliverySnapshot(),
} = {}) {
  const access = withPermissions(givenAccess, permissions);
  const refreshed = withPermissions(givenRefreshed, permissions);
  return {
    now: () => NOW,
    passwordReset: {
      ...store(reset),
      request: () => Promise.resolve('stay'),
      renew: () => Promise.resolve('stay'),
      verify: () => Promise.resolve('stay'),
      resend: () => Promise.resolve('stay'),
      complete: () => Promise.resolve('stay'),
      check: () => Promise.resolve('stay'),
      restart: () => {},
    },
    accountSettings: {
      pending: () => pending,
      rename: () => Promise.reject(new Error('no rename in render tests')),
      checkRename: () => Promise.reject(new Error('no rename in render tests')),
      changePassword: () =>
        Promise.reject(new Error('no password in render tests')),
      checkPassword: () =>
        Promise.reject(new Error('no password in render tests')),
      refreshProfile: () => Promise.resolve(true),
      signInToCheck: () => Promise.resolve('done'),
    },
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
    restaurantData: (restaurantID) => ({
      restaurantID,
      products: () => staticModel(data.products ?? loadingRead),
      dishCatalog: () => staticModel(data.dishCatalog ?? loadingRead),
      dish: () => staticModel(data.dish ?? loadingRead),
      suggestion: (kind) =>
        staticModel(
          (kind === 'product' ? data.productSuggestion : data.dishSuggestion) ??
            loadingRead,
        ),
      servingProducts: () => staticModel(data.servingProducts ?? loadingRead),
      menu: () => staticModel(data.menu ?? loadingRead),
      stopList: () => staticModel(data.stopList ?? loadingRead),
      recommendations: () => staticModel(data.recommendations ?? loadingRead),
      inventory: () => staticModel(data.inventory ?? loadingRead),
      expiringBatches: () => staticModel(data.expiringBatches ?? loadingRead),
      pendingWriteoffs: () => staticModel(data.pendingWriteoffs ?? loadingRead),
      stockReport: (riskHours) =>
        staticModel(data.stockReport?.[riskHours] ?? loadingRead),
      // «Показать ещё» is never pressed during a render.
      stockReportPage: () => staticModel(loadingRead),
      history: () => staticModel(data.history ?? loadingRead),
    }),
    catalogCommands: () => ({
      registerProduct: () =>
        Promise.reject(new Error('no commands in render tests')),
      defineDish: () =>
        Promise.reject(new Error('no commands in render tests')),
      pendingProduct: () => pendingProduct,
      pendingDish: () => pendingDish,
    }),
    orderFlow: () => ({
      subscribe: () => () => {},
      getSnapshot: () => order,
      add() {},
      setPortions() {},
      remove() {},
      prepare: () => Promise.resolve(),
      confirm: () => Promise.resolve(),
      check: () => Promise.resolve(),
      openReplacement() {},
      editAgain() {},
      restart: () => Promise.resolve(),
      dispose() {},
    }),
    writeoffCommands: () => ({
      confirm: () => Promise.reject(new Error('no commands in render tests')),
      check: () => Promise.reject(new Error('no commands in render tests')),
      pending: () => false,
      ...writeoff,
    }),
    deliveryFlow: () => ({
      ...store(delivery),
      edit() {},
      chooseOccurrence() {},
      submit: () => Promise.resolve(),
      check: () => Promise.resolve(),
      restart() {},
      dispose() {},
    }),
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
