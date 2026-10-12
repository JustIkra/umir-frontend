import { createContext, useContext, type ReactNode } from 'react';
import type { CookieNoticeStore } from '@/application/cookie-notice';
import type { FeedbackSubmitter } from '@/application/feedback';

// Application ports the screens use; the app layer assembles the adapters.
export interface PresentationServices {
  cookieNotice: CookieNoticeStore;
  feedback: FeedbackSubmitter;
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
