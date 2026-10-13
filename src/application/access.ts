import type { Settings } from './api';

export type OrgLifecycle = 'active' | 'deleting' | 'deleted';
export type RestaurantLifecycle =
  'registering' | 'ready' | 'deleting' | 'deleted';
export type StaffRoleName = 'Warehouse' | 'Waiter';

export interface AccessOrganization {
  readonly orgID: string;
  readonly name: string;
  readonly settings: Settings;
  readonly lifecycle: OrgLifecycle;
}

export interface AccessRestaurant {
  readonly restaurantID: string;
  readonly orgID: string;
  readonly name: string;
  readonly lifecycle: RestaurantLifecycle;
}

export interface AccessAssignment {
  readonly restaurantID: string;
  readonly roles: readonly StaffRoleName[];
}

export interface AccessMembership {
  readonly orgID: string;
  readonly orgRoles: readonly 'Admin'[];
  readonly assignments: readonly AccessAssignment[];
  readonly state: 'active' | 'revoked';
}

// GET /api/v2/access: the signed-in user's own memberships and what they
// reach. Gateway does not route it at the checkpoint (404).
export interface AccessView {
  readonly organizations: readonly AccessOrganization[];
  readonly restaurants: readonly AccessRestaurant[];
  readonly memberships: readonly AccessMembership[];
}

export interface AccessApi {
  access(): Promise<AccessView>;
}
