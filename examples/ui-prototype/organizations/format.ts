import {
  type Organization,
  type Restaurant,
  type Zone,
} from '../placeholder-organizations';

// Captions write the zone with a comma, the zone field with a middle dot.
export const zoneLine = (zone: Zone) =>
  `${zone.city} — ${zone.id}, ${zone.offset}`;
export const zoneValue = (zone: Zone) =>
  `${zone.city} — ${zone.id} · ${zone.offset}`;

export const organizationPath = (organization: Organization) =>
  `/app/organizations/${organization.id}`;

export const rolesLine = (restaurant: Restaurant) =>
  `${restaurant.roles.length > 1 ? 'Ваши роли' : 'Ваша роль'}: ${restaurant.roles.join(', ')}`;
