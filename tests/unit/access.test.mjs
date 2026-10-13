import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { ApiError, localFailure } from '../../src/application/api.ts';
import {
  chooseEntry,
  createAccessStore,
  findRestaurant,
  organizationsFrom,
} from '../../src/application/access.ts';
import { createAccessApi } from '../../src/adapters/api/access-api.ts';
import { createLastRestaurantStore } from '../../src/adapters/browser-storage/last-restaurant-store.ts';
import {
  canOpenSection,
  permissionsFor,
  rolesInRestaurant,
} from '../../src/domain/access.ts';

const ORG = '22222222-2222-4222-8222-222222222222';
const ORG2 = '88888888-8888-4888-8888-888888888888';
const PUSHKIN = '33333333-3333-4333-8333-333333333333';
const CHEKHOV = '55555555-5555-4555-8555-555555555555';
const TURGENEV = '99999999-9999-4999-8999-999999999999';

const organization = (orgID, name, lifecycle = 'active') => ({
  orgID,
  name,
  settings: { timeZone: 'Europe/Moscow', settingsVersion: '1' },
  lifecycle,
});
const restaurant = (restaurantID, orgID, name, lifecycle = 'ready') => ({
  restaurantID,
  orgID,
  name,
  lifecycle,
});

const view = {
  organizations: [organization(ORG, 'Восток Фуд'), organization(ORG2, 'Юг')],
  restaurants: [
    restaurant(PUSHKIN, ORG, 'На Пушкинской'),
    restaurant(CHEKHOV, ORG, 'На Чехова', 'registering'),
    restaurant(TURGENEV, ORG2, 'На Тургеневской'),
  ],
  memberships: [
    {
      orgID: ORG,
      orgRoles: ['Admin'],
      assignments: [{ restaurantID: PUSHKIN, roles: ['Warehouse'] }],
      state: 'active',
    },
    {
      orgID: ORG2,
      orgRoles: [],
      assignments: [{ restaurantID: TURGENEV, roles: ['Waiter'] }],
      state: 'active',
    },
  ],
};

test('permissions follow the contract role table', () => {
  const waiter = permissionsFor(['Waiter']);
  assert.ok(waiter.has('order.prepare'));
  assert.ok(waiter.has('menu.read'));
  assert.equal(waiter.has('stock.read'), false);
  const warehouse = permissionsFor(['Warehouse']);
  assert.ok(warehouse.has('writeoff.confirm'));
  assert.equal(warehouse.has('order.prepare'), false);
  const admin = permissionsFor(['Admin']);
  for (const permission of [
    'stock.read',
    'order.confirm',
    'membership.manage',
    'org.summary.read',
  ]) {
    assert.ok(admin.has(permission), permission);
  }
});

test('sections open by permission; without verified access every section opens', () => {
  const waiter = permissionsFor(['Waiter']);
  assert.equal(canOpenSection('orders', waiter), true);
  assert.equal(canOpenSection('warehouse', waiter), false);
  assert.equal(canOpenSection('analytics', waiter), false);
  assert.equal(canOpenSection('overview', waiter), true);
  assert.equal(canOpenSection('overview', permissionsFor([])), false);
  assert.equal(canOpenSection('warehouse', undefined), true);
});

test('roles come from the assignment plus Admin in ready restaurants', () => {
  const membership = view.memberships[0];
  assert.deepEqual(rolesInRestaurant(membership, view.restaurants[0]), [
    'Warehouse',
    'Admin',
  ]);
  assert.deepEqual(rolesInRestaurant(membership, view.restaurants[1]), []);
  assert.deepEqual(
    rolesInRestaurant(view.memberships[1], view.restaurants[2]),
    ['Waiter'],
  );
});

test('the access view becomes organizations with their own restaurants and rights', () => {
  const organizations = organizationsFrom(view);
  assert.deepEqual(
    organizations.map((item) => [item.name, item.admin]),
    [
      ['Восток Фуд', true],
      ['Юг', false],
    ],
  );
  const vostok = organizations[0].restaurants;
  assert.deepEqual(
    vostok.map((item) => [item.name, item.lifecycle, item.roles]),
    [
      ['На Пушкинской', 'ready', ['Warehouse', 'Admin']],
      ['На Чехова', 'registering', []],
    ],
  );
  assert.equal(vostok[0].orgName, 'Восток Фуд');
  assert.equal(vostok[0].timeZone, 'Europe/Moscow');
  assert.ok(vostok[0].permissions.has('order.confirm'));
});

test('roles of one restaurant do not reach another', () => {
  const turgenev = findRestaurant(
    { status: 'ready', organizations: organizationsFrom(view) },
    TURGENEV,
  );
  assert.deepEqual(turgenev.roles, ['Waiter']);
  assert.equal(turgenev.permissions.has('stock.read'), false);
});

test('organizations that are not active and revoked memberships are left out', () => {
  const organizations = organizationsFrom({
    ...view,
    organizations: [
      organization(ORG, 'Восток Фуд', 'deleting'),
      organization(ORG2, 'Юг'),
    ],
    memberships: [
      view.memberships[0],
      { ...view.memberships[1], state: 'revoked' },
    ],
  });
  assert.deepEqual(organizations, []);
});

test('the entry prefers the remembered ready restaurant, then the first ready one', () => {
  const ready = { status: 'ready', organizations: organizationsFrom(view) };
  assert.deepEqual(chooseEntry(ready, TURGENEV), {
    kind: 'restaurant',
    restaurantID: TURGENEV,
  });
  assert.deepEqual(chooseEntry(ready, CHEKHOV), {
    kind: 'restaurant',
    restaurantID: PUSHKIN,
  });
  assert.deepEqual(chooseEntry(ready, undefined), {
    kind: 'restaurant',
    restaurantID: PUSHKIN,
  });
});

test('only preparing restaurants lead to the first of them; none leads to «no restaurants»', () => {
  const preparing = organizationsFrom({
    ...view,
    restaurants: [restaurant(CHEKHOV, ORG, 'На Чехова', 'registering')],
    memberships: [view.memberships[0]],
  });
  assert.deepEqual(
    chooseEntry({ status: 'ready', organizations: preparing }, undefined),
    {
      kind: 'restaurant',
      restaurantID: CHEKHOV,
    },
  );
  assert.deepEqual(
    chooseEntry({ status: 'ready', organizations: [] }, undefined),
    { kind: 'none' },
  );
});

test('without verified access the remembered restaurant opens, otherwise W17', () => {
  const failure = localFailure('NotFound', 'not_committed', 404);
  const unverified = { status: 'unverified', failure };
  assert.deepEqual(chooseEntry(unverified, PUSHKIN), {
    kind: 'restaurant',
    restaurantID: PUSHKIN,
  });
  assert.deepEqual(chooseEntry(unverified, undefined), {
    kind: 'unverified',
    failure,
  });
});

test('the store reads access once, refreshes on demand and remembers names', async () => {
  let calls = 0;
  let answer = view;
  const store = createAccessStore({
    access: () => {
      calls += 1;
      return Promise.resolve(answer);
    },
  });
  assert.equal(store.getSnapshot().status, 'loading');
  const first = await store.ensure();
  assert.equal(first.status, 'ready');
  await store.ensure();
  assert.equal(calls, 1);
  answer = { ...view, restaurants: [view.restaurants[0]] };
  await store.refresh();
  assert.equal(calls, 2);
  assert.equal(findRestaurant(store.getSnapshot(), TURGENEV), undefined);
  assert.equal(store.nameOf(TURGENEV), 'На Тургеневской');
});

test('a refused access read is unverified, not empty', async () => {
  const failure = localFailure('NotFound', 'not_committed', 404);
  const store = createAccessStore({
    access: () => Promise.reject(new ApiError(failure)),
  });
  assert.deepEqual(await store.ensure(), { status: 'unverified', failure });
});

test('clear() drops the state and ignores a read still in flight', async () => {
  let release;
  const store = createAccessStore({
    access: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const pending = store.ensure();
  store.clear();
  release(view);
  await pending;
  assert.equal(store.getSnapshot().status, 'loading');
  assert.equal(store.nameOf(PUSHKIN), undefined);
});

test('the access adapter reads GET /api/v2/access and decodes it', async () => {
  const calls = [];
  const api = createAccessApi({
    read: (path, options) => {
      calls.push([path, options]);
      return Promise.resolve({
        organizations: [],
        restaurants: [],
        memberships: [],
      });
    },
  });
  assert.deepEqual(await api.access(), {
    organizations: [],
    restaurants: [],
    memberships: [],
  });
  assert.deepEqual(calls, [['/api/v2/access', { background: false }]]);
  const broken = createAccessApi({ read: () => Promise.resolve({}) });
  await assert.rejects(
    broken.access(),
    (error) => error.failure.code === 'Malformed',
  );
});

test('the last restaurant survives in storage and blocked storage is ignored', () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  const store = createLastRestaurantStore(storage);
  assert.equal(store.read(), undefined);
  store.write(PUSHKIN);
  assert.equal(data.get('umir.lastRestaurant'), PUSHKIN);
  assert.equal(store.read(), PUSHKIN);
  data.set('umir.lastRestaurant', 'not-an-id');
  assert.equal(store.read(), undefined);
  const blocked = createLastRestaurantStore({
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('SecurityError');
    },
  });
  assert.equal(blocked.read(), undefined);
  blocked.write(PUSHKIN);
  assert.equal(createLastRestaurantStore(undefined).read(), undefined);
});
