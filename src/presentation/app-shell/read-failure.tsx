import { useEffect, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { findRestaurant } from '@/application/access';
import type { ScreenFailure } from '@/application/failure';
import { useServices } from '@/presentation/services';
import { useAccess } from '@/presentation/session/hooks';
import { ServiceUnavailableAlert } from '@/presentation/ui/states';
import {
  AccessRevoked,
  RestaurantPreparing,
  SectionUnavailable,
} from './access-states';
import { useRestaurantPath } from './paths';

// A refused restaurant read: the access states of the foundation (W14–W16),
// a session check for 401, otherwise the alert of the screen (K04, E02…).
export function ReadFailure({
  failure,
  section,
  title,
  children,
  onRetry,
}: {
  failure: ScreenFailure;
  section: string;
  title: string;
  children: ReactNode;
  onRetry: () => void;
}) {
  const { session } = useServices();
  const access = useAccess();
  const { restaurantID } = useParams();
  const path = useRestaurantPath();
  const restaurant =
    restaurantID === undefined
      ? undefined
      : findRestaurant(access, restaurantID);
  const ended = failure.kind === 'session-ended';
  useEffect(() => {
    if (ended) void session.check();
  }, [ended, session]);
  switch (failure.kind) {
    case 'session-ended':
      return null;
    case 'forbidden':
      return (
        <SectionUnavailable
          section={section}
          restaurantName={restaurant?.name}
          overviewPath={path()}
        />
      );
    case 'restaurant-gone':
      return <AccessRevoked restaurantName={restaurant?.name} />;
    case 'not-ready':
      return (
        <RestaurantPreparing
          restaurantName={restaurant?.name ?? ''}
          onRetry={onRetry}
        />
      );
    case 'rate-limited':
    case 'unavailable':
    case 'error':
      return (
        <ServiceUnavailableAlert title={title} onRetry={onRetry}>
          {children}
        </ServiceUnavailableAlert>
      );
  }
}
