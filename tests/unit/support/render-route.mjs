import { ChakraProvider } from '@chakra-ui/react';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import {
  StaticRouterProvider,
  createStaticHandler,
  createStaticRouter,
} from 'react-router';
import { routes } from '../../../src/presentation/routes.tsx';
import { ServicesProvider } from '../../../src/presentation/services.tsx';
import { system } from '../../../src/presentation/theme/system.ts';

// Screens only read these ports during render; nothing is sent.
const services = {
  cookieNotice: { isClosed: () => true, close: () => {} },
  feedback: {},
  live: {},
};

export async function renderRoute(path) {
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request(`http://localhost${path}`));
  if (context instanceof Response)
    throw new Error(`${path}: ${context.status}`);
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
