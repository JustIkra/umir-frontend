import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { filterWorkplaces } from '../../src/presentation/app-shell/workplaces.ts';
import { organizations } from '../../examples/ui-prototype/placeholder-organizations.ts';
import { readyAccess } from './support/render-route.mjs';

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
