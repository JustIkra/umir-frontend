import type { Scheduler } from '@/application/live-sync';

export type Timers = Pick<Window, 'setTimeout' | 'clearTimeout'>;

export function createTimerScheduler(timers: Timers): Scheduler {
  return {
    schedule(delayMs, callback) {
      const id = timers.setTimeout(callback, delayMs);
      return () => {
        timers.clearTimeout(id);
      };
    },
  };
}
