// Roles and permissions of backend v2 (contract backend-v2.md:23-29). Roles of
// different restaurants never add up: permissions are computed per restaurant.

export type StaffRole = 'Warehouse' | 'Waiter';
export type Role = StaffRole | 'Admin';

export type Permission =
  | 'catalog.read'
  | 'catalog.write'
  | 'stock.read'
  | 'delivery.create'
  | 'analytics.read'
  | 'writeoff.confirm'
  | 'menu.read'
  | 'recommendations.read'
  | 'feedback.submit'
  | 'order.prepare'
  | 'order.confirm'
  | 'order.read'
  | 'org.read'
  | 'org.settings.write'
  | 'restaurant.create'
  | 'restaurant.delete'
  | 'org.delete'
  | 'membership.manage'
  | 'invitation.manage'
  | 'org.summary.read'
  | 'feedback.read'
  | 'feedback.export';

const warehouse: readonly Permission[] = [
  'catalog.read',
  'catalog.write',
  'stock.read',
  'delivery.create',
  'analytics.read',
  'writeoff.confirm',
  'menu.read',
  'recommendations.read',
  'feedback.submit',
];
const waiter: readonly Permission[] = [
  'menu.read',
  'recommendations.read',
  'order.prepare',
  'order.confirm',
  'order.read',
  'feedback.submit',
];
const admin: readonly Permission[] = [
  ...warehouse,
  ...waiter,
  'org.read',
  'org.settings.write',
  'restaurant.create',
  'restaurant.delete',
  'org.delete',
  'membership.manage',
  'invitation.manage',
  'org.summary.read',
  'feedback.read',
  'feedback.export',
];

const rolePermissions: Readonly<Record<Role, readonly Permission[]>> = {
  Warehouse: warehouse,
  Waiter: waiter,
  Admin: admin,
};

export function permissionsFor(
  roles: readonly Role[],
): ReadonlySet<Permission> {
  return new Set(roles.flatMap((role) => rolePermissions[role]));
}

export type SectionKey =
  'overview' | 'orders' | 'warehouse' | 'catalog' | 'menu' | 'analytics';

// The permission a section needs; the overview opens with any permission of
// the restaurant.
export const sectionPermission: Readonly<
  Record<Exclude<SectionKey, 'overview'>, Permission>
> = {
  orders: 'order.prepare',
  warehouse: 'stock.read',
  catalog: 'catalog.read',
  menu: 'menu.read',
  analytics: 'analytics.read',
};

// undefined: access is not verified. Gateway still authorizes every request,
// so the section opens and a 403 shows «Нет доступа к разделу».
export function canOpenSection(
  section: SectionKey,
  permissions: ReadonlySet<Permission> | undefined,
): boolean {
  if (permissions === undefined) return true;
  return section === 'overview'
    ? permissions.size > 0
    : permissions.has(sectionPermission[section]);
}

export interface MembershipRoles {
  readonly orgRoles: readonly 'Admin'[];
  readonly assignments: readonly {
    readonly restaurantID: string;
    readonly roles: readonly StaffRole[];
  }[];
}

// Staff roles come from the restaurant's assignment. An organization Admin
// also acts in every ready restaurant of the organization.
export function rolesInRestaurant(
  membership: MembershipRoles,
  restaurant: { readonly restaurantID: string; readonly lifecycle: string },
): readonly Role[] {
  const staff = membership.assignments
    .filter((assignment) => assignment.restaurantID === restaurant.restaurantID)
    .flatMap((assignment) => assignment.roles);
  const roles: Role[] = (['Warehouse', 'Waiter'] as const).filter((role) =>
    staff.includes(role),
  );
  if (
    membership.orgRoles.includes('Admin') &&
    restaurant.lifecycle === 'ready'
  ) {
    roles.push('Admin');
  }
  return roles;
}
