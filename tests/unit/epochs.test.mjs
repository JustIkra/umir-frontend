import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createEpochRegistry } from '../../src/application/epochs.ts';

const R = '33333333-3333-4333-8333-333333333333';
const Q = '55555555-5555-4555-8555-555555555555';

test('an epoch is first, then the same, then changed', () => {
  const epochs = createEpochRegistry();
  assert.equal(epochs.record(R, 'warehouse', 'e1'), 'first');
  assert.equal(epochs.record(R, 'warehouse', 'e1'), 'same');
  assert.equal(epochs.record(R, 'warehouse', 'e2'), 'changed');
  assert.equal(epochs.get(R, 'warehouse'), 'e2');
});

test('epochs are kept per restaurant and service; clear forgets them', () => {
  const epochs = createEpochRegistry();
  epochs.record(R, 'warehouse', 'w');
  epochs.record(R, 'serving', 's');
  epochs.record(Q, 'warehouse', 'q');
  assert.deepEqual(
    [
      epochs.get(R, 'warehouse'),
      epochs.get(R, 'serving'),
      epochs.get(Q, 'warehouse'),
      epochs.get(Q, 'serving'),
    ],
    ['w', 's', 'q', undefined],
  );
  epochs.clear();
  assert.equal(epochs.get(R, 'warehouse'), undefined);
});
