import { createContext, useContext, type ReactNode } from 'react';
import type { AccountSettings } from '@/application/account-settings';
import type { AccessStore, LastRestaurantStore } from '@/application/access';
import type { CatalogCommands } from '@/application/catalog-commands';
import type { CommandRunner } from '@/application/commands';
import type { CookieNoticeStore } from '@/application/cookie-notice';
import type { DeliveryFlow } from '@/application/delivery-flow';
import type { FeedbackSubmitter } from '@/application/feedback';
import type { LifecycleTracker } from '@/application/lifecycles';
import type { LiveSync } from '@/application/live-sync';
import type { ModelRegistry } from '@/application/models';
import type { OrderFlow } from '@/application/order-flow';
import type { OrganizationCommands } from '@/application/organization-commands';
import type { OrganizationReads } from '@/application/organization-reads';
import type { PasswordResetFlow } from '@/application/password-reset';
import type { RestaurantData } from '@/application/restaurant-data';
import type { SessionStore } from '@/application/session';
import type { WriteoffCommands } from '@/application/writeoff-commands';

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
  // The clock of countdowns; render tests pass a fixed one.
  now: () => number;
  passwordReset: PasswordResetFlow;
  accountSettings: AccountSettings;
  // Organization administration of Auth: the lists and profile per
  // organization, the commands and the follow-up of preparation and deletion.
  organizations: {
    readonly reads: OrganizationReads;
    readonly commands: OrganizationCommands;
    readonly lifecycles: LifecycleTracker;
  };
  restaurantData: (restaurantID: string) => RestaurantData;
  catalogCommands: (restaurantID: string) => CatalogCommands;
  // undefined without a signed-in user.
  orderFlow: (restaurantID: string) => OrderFlow | undefined;
  // One per restaurant; dropped on sign-out and on a user change.
  writeoffCommands: (restaurantID: string) => WriteoffCommands;
  // undefined without a signed-in user.
  deliveryFlow: (restaurantID: string) => DeliveryFlow | undefined;
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
