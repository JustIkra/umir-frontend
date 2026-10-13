import { createContext, useContext, type ReactNode } from 'react';
import type { AccessStore, LastRestaurantStore } from '@/application/access';
import type { CommandRunner } from '@/application/commands';
import type { CookieNoticeStore } from '@/application/cookie-notice';
import type { FeedbackSubmitter } from '@/application/feedback';
import type { LiveSync } from '@/application/live-sync';
import type { ModelRegistry } from '@/application/models';
import type { SessionStore } from '@/application/session';

// Application ports the screens use; the app layer assembles the adapters.
export interface PresentationServices {
  cookieNotice: CookieNoticeStore;
  feedback: FeedbackSubmitter;
  session: SessionStore;
  access: AccessStore;
  lastRestaurant: LastRestaurantStore;
  // Started by the restaurant scope for the restaurant in the address.
  live: LiveSync;
  models: ModelRegistry;
  commands: CommandRunner;
}

const ServicesContext = createContext<PresentationServices | null>(null);

export function ServicesProvider({
  services,
  children,
}: {
  services: PresentationServices;
  children: ReactNode;
}) {
  return <ServicesContext value={services}>{children}</ServicesContext>;
}

export function useServices(): PresentationServices {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('ServicesProvider is missing');
  return services;
}
