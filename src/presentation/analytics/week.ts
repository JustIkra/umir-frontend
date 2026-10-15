import { useParams } from 'react-router';
import { findRestaurant } from '@/application/access';
import { analyticsWeek, type AnalyticsWeek } from '@/domain/analytics';
import { useServices } from '@/presentation/services';
import { useAccess } from '@/presentation/session/hooks';

// The week of «Куда ушли продукты»: today in the restaurant's zone; Moscow
// while access is not known (AGENTS.md).
export function useAnalyticsWeek(): AnalyticsWeek {
  const { restaurantID = '' } = useParams();
  const restaurant = findRestaurant(useAccess(), restaurantID);
  const { now } = useServices();
  return analyticsWeek(now(), restaurant?.timeZone ?? 'Europe/Moscow');
}
