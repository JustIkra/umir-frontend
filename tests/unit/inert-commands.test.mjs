import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  inertAttemptState,
  inertCatalogCommands,
  inertWarehouseCommands,
} from '../../src/application/inert-commands.ts';

test('the inert attempt state reports nothing and discards nothing', () => {
  const state = inertAttemptState();
  assert.equal(state.notSaved(), false);
  assert.equal(state.damaged(), false);
  assert.equal(state.discardCorrupt(), 'refused');
  let calls = 0;
  const stop = state.subscribe(() => {
    calls += 1;
  });
  stop();
  assert.equal(calls, 0);
});

test('inert warehouse commands end every command and remember nothing', async () => {
  const value = inertWarehouseCommands();
  assert.deepEqual(await value.receiveDelivery({}, 'Europe/Moscow', 'e'), {
    kind: 'ended',
  });
  assert.deepEqual(await value.confirmWriteoff('B', 'e'), { kind: 'ended' });
  assert.equal(value.pendingDelivery(), undefined);
  assert.equal(value.pendingDeliveryTimeZone(), undefined);
  assert.equal(value.pendingWriteoff('B'), false);
  assert.equal(value.deliveryAttempt.damaged(), false);
  assert.equal(value.writeoffAttempt('B').notSaved(), false);
  assert.equal(value.writeoffAttempt('B').discardCorrupt(), 'refused');
});

test('inert catalog commands end every command and remember nothing', async () => {
  const value = inertCatalogCommands();
  assert.deepEqual(await value.registerProduct({}), { kind: 'ended' });
  assert.deepEqual(await value.defineDish({}), { kind: 'ended' });
  assert.equal(value.pendingProduct(), undefined);
  assert.equal(value.pendingDish(), undefined);
  assert.equal(value.productAttempt.notSaved(), false);
  assert.equal(value.dishAttempt.discardCorrupt(), 'refused');
});
