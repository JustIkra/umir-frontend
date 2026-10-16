import { useParams } from 'react-router';
import { knownOrganizations } from '@/application/access';
import type { MovementQuery } from '@/application/warehouse';
import { analyticsWeek } from '@/domain/analytics';
import { useServices } from '@/presentation/services';
import { useAccess } from '@/presentation/session/hooks';

// The query of «Куда ушли продукты»: the seven days that end today in the
// restaurant's zone and the organization settings version the warehouse
// checks; undefined while no answer of /access is known.
export function useMovementQuery(): MovementQuery | undefined {
  const { restaurantID = '' } = useParams();
  const organizations = knownOrganizations(useAccess());
  const { now } = useServices();
  for (const organization of organizations ?? []) {
    const restaurant = organization.restaurants.find(
      (item) => item.restaurantID === restaurantID,
    );
    if (restaurant !== undefined)
      return {
        ...analyticsWeek(now(), restaurant.timeZone),
        expectedSettingsVersion: organization.settings.settingsVersion,
      };
  }
  return undefined;
}
