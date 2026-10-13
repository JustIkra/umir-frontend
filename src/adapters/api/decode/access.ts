import type { AccessView } from '@/application/access';
import {
  array,
  entityId,
  object,
  oneOf,
  positiveInt64,
  string,
} from './common';

export function decodeAccessView(body: unknown): AccessView {
  const view = object(body, 'AccessView');
  return {
    organizations: array(view.organizations, 'organizations', (entry, path) => {
      const organization = object(entry, path);
      const settings = object(organization.settings, `${path}.settings`);
      return {
        orgID: entityId(organization.orgID, `${path}.orgID`),
        name: string(organization.name, `${path}.name`),
        settings: {
          timeZone: string(settings.timeZone, `${path}.settings.timeZone`),
          settingsVersion: positiveInt64(
            settings.settingsVersion,
            `${path}.settings.settingsVersion`,
          ),
        },
        lifecycle: oneOf(organization.lifecycle, `${path}.lifecycle`, [
          'active',
          'deleting',
          'deleted',
        ] as const),
      };
    }),
    restaurants: array(view.restaurants, 'restaurants', (entry, path) => {
      const restaurant = object(entry, path);
      return {
        restaurantID: entityId(restaurant.restaurantID, `${path}.restaurantID`),
        orgID: entityId(restaurant.orgID, `${path}.orgID`),
        name: string(restaurant.name, `${path}.name`),
        lifecycle: oneOf(restaurant.lifecycle, `${path}.lifecycle`, [
          'registering',
          'ready',
          'deleting',
          'deleted',
        ] as const),
      };
    }),
    memberships: array(view.memberships, 'memberships', (entry, path) => {
      const membership = object(entry, path);
      return {
        orgID: entityId(membership.orgID, `${path}.orgID`),
        orgRoles: array(membership.orgRoles, `${path}.orgRoles`, (role, at) =>
          oneOf(role, at, ['Admin'] as const),
        ),
        assignments: array(
          membership.assignments,
          `${path}.assignments`,
          (item, at) => {
            const assignment = object(item, at);
            return {
              restaurantID: entityId(
                assignment.restaurantID,
                `${at}.restaurantID`,
              ),
              roles: array(assignment.roles, `${at}.roles`, (role, rolePath) =>
                oneOf(role, rolePath, ['Warehouse', 'Waiter'] as const),
              ),
            };
          },
        ),
        state: oneOf(membership.state, `${path}.state`, [
          'active',
          'revoked',
        ] as const),
      };
    }),
  };
}
