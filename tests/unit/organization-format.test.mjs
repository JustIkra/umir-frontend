import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  organizationCaption,
  organizationPath,
  restaurantCount,
  rolesLine,
} from '../../src/presentation/organizations/format.ts';
import {
  organizationZones,
  zoneCity,
  zoneLabel,
} from '../../src/presentation/ui/zones.ts';
import { NOW, ORG, R, sampleRestaurant } from './support/render-route.mjs';

test('restaurantCount declines the noun', () => {
  assert.equal(restaurantCount(0), '0 ресторанов');
  assert.equal(restaurantCount(1), '1 ресторан');
  assert.equal(restaurantCount(2), '2 ресторана');
  assert.equal(restaurantCount(5), '5 ресторанов');
  assert.equal(restaurantCount(11), '11 ресторанов');
  assert.equal(restaurantCount(21), '21 ресторан');
});

test('rolesLine names one role or several', () => {
  assert.equal(rolesLine(['Warehouse']), 'Ваша роль: Склад');
  assert.equal(
    rolesLine(['Warehouse', 'Waiter']),
    'Ваши роли: Склад, Официант',
  );
  assert.equal(rolesLine(['Admin']), 'Ваша роль: Администратор');
  assert.equal(rolesLine(['Waiter', 'Admin']), 'Ваша роль: Администратор');
});

test('the zone is the city with its offset, without the IANA id', () => {
  assert.equal(zoneLabel('Europe/Moscow', NOW), 'Москва (UTC+3)');
  assert.equal(zoneLabel('Asia/Yekaterinburg', NOW), 'Екатеринбург (UTC+5)');
  assert.equal(zoneCity('Etc/GMT-3'), 'Etc/GMT-3');
  assert.equal(zoneCity('Europe/Berlin'), 'Берлин');
});

test('the zone list starts with Moscow and has unique ids', () => {
  assert.equal(organizationZones[0], 'Europe/Moscow');
  assert.equal(new Set(organizationZones).size, organizationZones.length);
  assert.equal(organizationZones.length, 15);
});

const organization = (admin, count) => ({
  orgID: ORG,
  name: 'Восток Фуд',
  settings: { timeZone: 'Europe/Moscow', settingsVersion: '1' },
  admin,
  restaurants: Array.from({ length: count }, () => sampleRestaurant()),
});

test('the organization caption differs for the administrator and staff', () => {
  assert.equal(
    organizationCaption(organization(true, 4)),
    'Администратор · 4 ресторана · Москва',
  );
  assert.equal(
    organizationCaption(organization(false, 2)),
    'Сотрудник · 2 ресторана',
  );
});

test('organizationPath is the address of the organization', () => {
  assert.equal(organizationPath(ORG), `/app/organizations/${ORG}`);
  assert.ok(R);
});
