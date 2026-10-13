import { useParams } from 'react-router';
import { chooseEntry } from '@/application/access';
import type { SectionKey } from '@/domain/access';
import { useServices } from '@/presentation/services';
import { useAccess } from '@/presentation/session/hooks';
import { appSections } from './sections';

export function restaurantPath(restaurantID: string, suffix = ''): string {
  return `/app/r/${restaurantID}${suffix}`;
}

// The section of an address inside a restaurant.
export function sectionOfPath(pathname: string): SectionKey {
  const segment = /^\/app\/r\/[^/]+(\/[^/?#]+)?/.exec(pathname)?.[1] ?? '';
  return (
    appSections.find((section) => section.suffix === segment)?.key ?? 'overview'
  );
}

// W12: the switcher passes the section missing in the new restaurant in the
// navigation state.
export function missingSectionOf(state: unknown): SectionKey | undefined {
  if (
    typeof state !== 'object' ||
    state === null ||
    !('missingSection' in state)
  ) {
    return undefined;
  }
  const value: unknown = state.missingSection;
  return appSections.find((section) => section.key === value)?.key;
}

// The restaurant the shell links to: the one in the address, otherwise the
// one /app would open (organization and account pages).
export function useCurrentRestaurantID(): string | undefined {
  const { restaurantID } = useParams();
  const { lastRestaurant } = useServices();
  const access = useAccess();
  if (restaurantID !== undefined) return restaurantID;
  const entry = chooseEntry(access, lastRestaurant.read());
  return entry.kind === 'restaurant' ? entry.restaurantID : undefined;
}

// Builds links inside the current restaurant: path('/catalog/dishes').
export function useRestaurantPath(): (suffix?: string) => string {
  const restaurantID = useCurrentRestaurantID();
  return (suffix = '') =>
    restaurantID === undefined ? '/app' : restaurantPath(restaurantID, suffix);
}
