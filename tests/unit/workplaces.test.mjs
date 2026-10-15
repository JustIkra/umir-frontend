import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { filterWorkplaces } from '../../src/presentation/app-shell/workplaces.ts';
import { readyAccess, sampleRestaurant } from './support/render-route.mjs';

const south = {
  ...readyAccess([
    sampleRestaurant({
      name: 'Ресторан „Тургеневский дворик“ на улице Тургеневской, 10/6',
    }),
    sampleRestaurant({ name: 'На Садовой' }),
  ]).organizations[0],
  name: 'Сеть ресторанов Южного федерального округа',
};
const east = {
  ...readyAccess([
    sampleRestaurant({ name: 'На Тургеневской' }),
    sampleRestaurant({ name: 'На Пушкинской' }),
  ]).organizations[0],
  orgID: '44444444-4444-4444-8444-444444444444',
};
const organizations = [south, east];

const names = (list) =>
  list.map((o) => [o.name, o.restaurants.map((r) => r.name)]);

test('an empty query keeps every workplace', () => {
  assert.equal(filterWorkplaces(organizations, '  '), organizations);
});

test('the query matches restaurant names regardless of case', () => {
  assert.deepEqual(names(filterWorkplaces(organizations, 'тургенев')), [
    [
      'Сеть ресторанов Южного федерального округа',
      ['Ресторан „Тургеневский дворик“ на улице Тургеневской, 10/6'],
    ],
    ['Восток Фуд', ['На Тургеневской']],
  ]);
});

test('organizations without matches disappear', () => {
  assert.deepEqual(filterWorkplaces(organizations, 'Сидоров'), []);
});

test('organizations from access keep their own fields', () => {
  const [organization] = readyAccess().organizations;
  const [found] = filterWorkplaces([organization], 'пушкин');
  assert.equal(found.orgID, organization.orgID);
  assert.deepEqual(found.restaurants, organization.restaurants);
});
