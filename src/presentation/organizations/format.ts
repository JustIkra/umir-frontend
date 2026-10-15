import { type OrganizationAccess } from '@/application/access';
import { type Role } from '@/domain/access';
import { rolesCaption } from '@/presentation/app-shell/shell-context';
import { plural } from '@/presentation/ui/plural';
import { formatOffset } from '@/presentation/ui/time';
import { zoneCity } from '@/presentation/ui/zones';

export const organizationPath = (orgID: string) =>
  `/app/organizations/${orgID}`;

export const restaurantCount = (count: number) =>
  `${String(count)} ${plural(count, 'ресторан', 'ресторана', 'ресторанов')}`;

// «Ваша роль: Склад», «Ваши роли: Склад, Официант». The administrator's role
// covers the staff roles, so it stands alone.
export const rolesLine = (roles: readonly Role[]) =>
  `${roles.length > 1 && !roles.includes('Admin') ? 'Ваши роли' : 'Ваша роль'}: ${rolesCaption(roles)}`;

// Captions write the zone with a comma, the zone field with a middle dot. The
// offset is the one at nowMs: it changes with summer time.
export const zoneLine = (timeZone: string, nowMs: number) =>
  `${zoneCity(timeZone)} — ${timeZone}, ${formatOffset(nowMs, timeZone)}`;
export const zoneValue = (timeZone: string, nowMs: number) =>
  `${zoneCity(timeZone)} — ${timeZone} · ${formatOffset(nowMs, timeZone)}`;

// «Администратор · 4 ресторана · Москва — Europe/Moscow, UTC+3» for the
// administrator, «Сотрудник · 2 ресторана» for staff.
export function organizationCaption(
  organization: OrganizationAccess,
  nowMs: number,
): string {
  const count = restaurantCount(organization.restaurants.length);
  return organization.admin
    ? `Администратор · ${count} · ${zoneLine(organization.settings.timeZone, nowMs)}`
    : `Сотрудник · ${count}`;
}
