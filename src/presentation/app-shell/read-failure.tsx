import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { findRestaurant } from '@/application/access';
import { defaultWaitSeconds } from '@/application/credentials';
import type { ScreenFailure } from '@/application/failure';
import { useServices } from '@/presentation/services';
import { useAccess } from '@/presentation/session/hooks';
import { Button } from '@/presentation/ui/actions';
import { RateLimitMessage, useDeadline } from '@/presentation/ui/rate-limit';
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
      return <RateLimitedRead failure={failure} onRetry={onRetry} />;
    case 'unavailable':
    case 'error':
      return (
        <ServiceUnavailableAlert title={title} onRetry={onRetry}>
          {children}
        </ServiceUnavailableAlert>
      );
  }
}

// A 429 on a read (C16): nothing is wrong with the data, the screen asks to
// wait and opens the retry when the wait is over.
export function RateLimitedRead({
  failure,
  onRetry,
}: {
  failure: Extract<ScreenFailure, { kind: 'rate-limited' }>;
  onRetry: () => void;
}) {
  const { now } = useServices();
  const seconds = failure.retryAfterSeconds ?? defaultWaitSeconds;
  // The wait starts when this failure first shows.
  const [started, setStarted] = useState({
    failure,
    until: now() + seconds * 1000,
  });
  if (started.failure !== failure) {
    setStarted({ failure, until: now() + seconds * 1000 });
  }
  const wait = useDeadline(started.until, seconds);
  return (
    <>
      <RateLimitMessage wait={wait} />
      <Button variant="secondary" disabled={wait.waiting} onClick={onRetry}>
        Попробовать ещё раз
      </Button>
    </>
  );
}
