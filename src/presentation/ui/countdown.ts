import { useEffect, useState } from 'react';
import { useServices } from '@/presentation/services';

// Whole seconds left until untilMs, never below zero.
export function secondsLeft(untilMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((untilMs - nowMs) / 1000));
}

// «0:59»: minutes and two-digit seconds, rounded up.
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const seconds = String(total % 60).padStart(2, '0');
  return `${String(Math.floor(total / 60))}:${seconds}`;
}

// The clock of the services. While active, the component renders again
// every second, so countdowns and deadlines move.
export function useNow(active: boolean): number {
  const { now } = useServices();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => {
      setTick((tick) => tick + 1);
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [active]);
  return now();
}
