import { useParams } from 'react-router';
import { findRestaurant } from '@/application/access';
import { useServices } from '@/presentation/services';
import { useAccess } from '@/presentation/session/hooks';
import { formatSectionDate } from '@/presentation/ui/zones';

// The caption of a section header in the zone of the restaurant's
// organization; nothing while access is not known.
export function useSectionDate(): string | undefined {
  const { restaurantID } = useParams();
  const access = useAccess();
  const { now } = useServices();
  if (restaurantID === undefined) return undefined;
  const restaurant = findRestaurant(access, restaurantID);
  return restaurant === undefined
    ? undefined
    : formatSectionDate(now(), restaurant.timeZone);
}
