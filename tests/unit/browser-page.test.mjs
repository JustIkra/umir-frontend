import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createTimerScheduler } from '../../src/adapters/browser-page/scheduler.ts';
import { createPageVisibility } from '../../src/adapters/browser-page/visibility.ts';

test('visibility follows the document and its visibilitychange event', () => {
  const listeners = new Set();
  const page = {
    visibilityState: 'visible',
    addEventListener: (type, listener) => {
      assert.equal(type, 'visibilitychange');
      listeners.add(listener);
    },
    removeEventListener: (type, listener) => {
      assert.equal(type, 'visibilitychange');
      listeners.delete(listener);
    },
  };
  const visibility = createPageVisibility(page);
  let changes = 0;
  const unsubscribe = visibility.subscribe(() => {
    changes += 1;
  });
  assert.equal(visibility.isVisible(), true);
  page.visibilityState = 'hidden';
  for (const listener of listeners) listener();
  assert.equal(visibility.isVisible(), false);
  assert.equal(changes, 1);
  unsubscribe();
  assert.equal(listeners.size, 0);
});

test('the scheduler cancels the timer it started', () => {
  const started = [];
  const cleared = [];
  const scheduler = createTimerScheduler({
    setTimeout: (callback, delay) => {
      started.push({ callback, delay });
      return 41;
    },
    clearTimeout: (id) => cleared.push(id),
  });
  const callback = () => undefined;
  const cancel = scheduler.schedule(3000, callback);
  assert.deepEqual(started, [{ callback, delay: 3000 }]);
  cancel();
  assert.deepEqual(cleared, [41]);
});
