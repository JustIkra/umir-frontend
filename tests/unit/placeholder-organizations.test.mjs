import assert from 'node:assert/strict';
import { test } from 'bun:test';
import {
  findOrganization,
  organizations,
  zones,
} from '../../src/presentation/placeholder-organizations.ts';

test('the sample has one administered organization with its members and invitations', () => {
  assert.deepEqual(
    organizations.map((organization) => organization.id),
    ['yug', 'vostok-food', 'ural-kitchen', 'vostok-food-europe'],
  );
  assert.deepEqual(
    organizations.filter((organization) => organization.admin).map((o) => o.id),
    ['yug'],
  );
  const yug = findOrganization('yug');
  assert.equal(yug?.members.length, 5);
  assert.equal(yug?.invitations.length, 7);
  assert.equal(new Set(yug?.invitations.map((i) => i.status)).size, 7);
  assert.equal(findOrganization('nobody'), undefined);
  assert.equal(findOrganization(undefined), undefined);
});

test('member roles name only restaurants of their organization', () => {
  for (const organization of organizations) {
    const names = new Set(organization.restaurants.map((r) => r.name));
    for (const member of organization.members)
      for (const name of Object.keys(member.roles))
        assert.ok(names.has(name), `${member.id}: ${name}`);
  }
});

test('the zone list starts with Moscow and has unique ids', () => {
  assert.equal(zones[0]?.id, 'Europe/Moscow');
  assert.equal(new Set(zones.map((zone) => zone.id)).size, zones.length);
});
