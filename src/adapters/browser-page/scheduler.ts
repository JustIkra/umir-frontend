import type { Scheduler } from '@/application/live-sync';

export type Timers = Pick<Window, 'setTimeout' | 'clearTimeout'>;

// Browsers run a longer setTimeout delay at once.
const maxTimerDelayMs = 2 ** 31 - 1;

export function createTimerScheduler(timers: Timers): Scheduler {
  return {
    schedule(delayMs, callback) {
      const id = timers.setTimeout(
        callback,
        Math.min(delayMs, maxTimerDelayMs),
      );
      return () => {
        timers.clearTimeout(id);
      };
    },
  };
}
