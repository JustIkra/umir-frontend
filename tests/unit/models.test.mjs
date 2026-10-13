import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { createEpochRegistry } from '../../src/application/epochs.ts';
import { createModelRegistry } from '../../src/application/models.ts';

const R = '33333333-3333-4333-8333-333333333333';
const Q = '55555555-5555-4555-8555-555555555555';
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

function counter(value = 'v') {
  const loader = {
    calls: 0,
    load: () => {
      loader.calls += 1;
      return Promise.resolve(value);
    },
  };
  return loader;
}

const registry = (epochs = createEpochRegistry()) =>
  createModelRegistry({ now: () => 0, epochs });

const watch = (models, key, loader) =>
  models.model(key, loader.load).subscribe(() => undefined);

test('the same key gives the same model', () => {
  const models = registry();
  const key = {
    restaurantID: R,
    resource: 'warehouse/inventory',
    topics: ['stock'],
  };
  assert.equal(
    models.model(key, counter().load),
    models.model(key, counter().load),
  );
});

test('a change marks only the models of its topics and restaurant', async () => {
  const models = registry();
  const stock = counter();
  const menu = counter();
  const other = counter();
  watch(
    models,
    { restaurantID: R, resource: 'stock', topics: ['stock'] },
    stock,
  );
  watch(models, { restaurantID: R, resource: 'menu', topics: ['menu'] }, menu);
  watch(
    models,
    { restaurantID: Q, resource: 'stock', topics: ['stock'] },
    other,
  );
  await settled();
  models.markStale(R, ['stock']);
  await settled();
  assert.deepEqual([stock.calls, menu.calls, other.calls], [2, 1, 1]);
  models.markStale(R, 'all');
  await settled();
  assert.deepEqual([stock.calls, menu.calls, other.calls], [3, 2, 1]);
});

test('time marks re-read only models that depend on time', async () => {
  const models = registry();
  const timed = counter();
  const plain = counter();
  watch(
    models,
    {
      restaurantID: R,
      resource: 'expiry',
      topics: ['stock'],
      refreshOnTick: true,
    },
    timed,
  );
  watch(
    models,
    { restaurantID: R, resource: 'products', topics: ['catalog'] },
    plain,
  );
  await settled();
  models.markTime(R);
  await settled();
  assert.deepEqual([timed.calls, plain.calls], [2, 1]);
});

test('a scoped read records the epoch; a new epoch re-reads the rest and raises the notice', async () => {
  const epochs = createEpochRegistry();
  const models = registry(epochs);
  let epoch = 'e1';
  const scoped = {
    calls: 0,
    load: () => {
      scoped.calls += 1;
      return Promise.resolve({ context: { runtimeEpoch: epoch }, result: 'r' });
    },
  };
  const plain = counter();
  models
    .scoped(
      {
        restaurantID: R,
        resource: 'inventory',
        topics: ['stock'],
        service: 'warehouse',
      },
      scoped.load,
    )
    .subscribe(() => undefined);
  watch(
    models,
    { restaurantID: R, resource: 'products', topics: ['catalog'] },
    plain,
  );
  await settled();
  assert.equal(epochs.get(R, 'warehouse'), 'e1');
  assert.equal(models.getNotice(), undefined);
  epoch = 'e2';
  models.markStale(R, ['stock']);
  await settled();
  assert.equal(epochs.get(R, 'warehouse'), 'e2');
  assert.deepEqual(models.getNotice(), { restaurantID: R });
  assert.deepEqual([scoped.calls, plain.calls], [2, 2]);
});

test('reset marks the restaurant stale and raises the notice; dismiss and clear drop it', async () => {
  const models = registry();
  const plain = counter();
  let notices = 0;
  models.subscribeNotice(() => {
    notices += 1;
  });
  watch(
    models,
    { restaurantID: R, resource: 'products', topics: ['catalog'] },
    plain,
  );
  await settled();
  models.reset(R);
  await settled();
  assert.equal(plain.calls, 2);
  assert.deepEqual(models.getNotice(), { restaurantID: R });
  models.dismissNotice();
  assert.equal(models.getNotice(), undefined);
  models.reset(R);
  models.clear();
  assert.equal(models.getNotice(), undefined);
  assert.ok(notices >= 3);
  const fresh = counter();
  watch(
    models,
    { restaurantID: R, resource: 'products', topics: ['catalog'] },
    fresh,
  );
  await settled();
  assert.equal(fresh.calls, 1, 'clear() forgets cached models');
});
