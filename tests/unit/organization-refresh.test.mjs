import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { refreshWhenOpened } from '../../src/presentation/organizations/refresh.tsx';

const model = (loading) => {
  const calls = [];
  return {
    calls,
    getSnapshot: () => ({ loading }),
    refresh: () => calls.push('refresh'),
  };
};

test('opening a view over a model that was read reads it again', () => {
  const read = model(false);
  refreshWhenOpened(read);
  assert.deepEqual(read.calls, ['refresh']);
});

test('a model that is loading already is not read twice', () => {
  const loading = model(true);
  refreshWhenOpened(loading);
  assert.deepEqual(loading.calls, []);
});
