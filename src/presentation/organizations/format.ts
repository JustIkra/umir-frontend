import { type OrganizationAccess } from '@/application/access';
import { type Role } from '@/domain/access';
import { rolesCaption } from '@/presentation/app-shell/shell-context';
import { plural } from '@/presentation/ui/plural';
import { zoneCity } from '@/presentation/ui/zones';

export const organizationPath = (orgID: string) =>
  `/app/organizations/${orgID}`;

export const restaurantCount = (count: number) =>
  `${String(count)} ${plural(count, 'ресторан', 'ресторана', 'ресторанов')}`;

// «Ваша роль: Склад», «Ваши роли: Склад, Официант». The administrator's role
// covers the staff roles, so it stands alone.
export const rolesLine = (roles: readonly Role[]) =>
  `${roles.length > 1 && !roles.includes('Admin') ? 'Ваши роли' : 'Ваша роль'}: ${rolesCaption(roles)}`;

// «Администратор · 4 ресторана · Москва» for the administrator, «Сотрудник ·
// 2 ресторана» for staff.
export function organizationCaption(organization: OrganizationAccess): string {
  const count = restaurantCount(organization.restaurants.length);
  return organization.admin
    ? `Администратор · ${count} · ${zoneCity(organization.settings.timeZone)}`
    : `Сотрудник · ${count}`;
}
