import {
  findRestaurant,
  type AccessState,
  type RestaurantAccess,
} from '@/application/access';
import { canOpenSection, type Role, type SectionKey } from '@/domain/access';
import { appSections } from './sections';

export type ShellMode =
  'restaurant' | 'none' | 'unverified' | 'revoked' | 'preparing';

// What the shell shows around a page: links target, App bar title (390),
// the second line of the account trigger, the sidebar sections.
export interface ShellContext {
  readonly restaurantID: string | undefined;
  readonly restaurant: RestaurantAccess | undefined;
  readonly title: string;
  readonly caption: string;
  readonly sections: readonly SectionKey[];
}

const roleTitles: Readonly<Record<Role, string>> = {
  Warehouse: 'Склад',
  Waiter: 'Официант',
  Admin: 'Администратор',
};

export function roleTitle(role: Role): string {
  return roleTitles[role];
}

export function rolesCaption(roles: readonly Role[]): string {
  return roles.includes('Admin')
    ? roleTitles.Admin
    : roles.map((role) => roleTitles[role]).join(', ');
}

const brand = 'Ровный ход';
const allSections = appSections.map((section) => section.key);

function empty(caption: string, restaurantID?: string): ShellContext {
  return {
    restaurantID,
    restaurant: undefined,
    title: brand,
    caption,
    sections: [],
  };
}

export function shellContext(
  access: AccessState,
  mode: ShellMode,
  restaurantID: string | undefined,
): ShellContext {
  const restaurant =
    restaurantID === undefined
      ? undefined
      : findRestaurant(access, restaurantID);
  switch (mode) {
    case 'none':
      return empty('Нет доступных ресторанов');
    case 'unverified':
      return empty('Не удалось загрузить рестораны');
    case 'revoked':
      return empty('Доступ к ресторану отозван', restaurantID);
    case 'preparing':
      return {
        restaurantID,
        restaurant,
        title: restaurant?.name ?? brand,
        caption: `${restaurant?.name ?? 'Ресторан'} · настраивается`,
        sections: [],
      };
    case 'restaurant': {
      if (restaurantID === undefined) {
        if (access.status === 'ready') return empty('Нет доступных ресторанов');
        return empty(
          access.status === 'unverified'
            ? 'Не удалось загрузить рестораны'
            : '',
        );
      }
      if (!restaurant) {
        return {
          restaurantID,
          restaurant: undefined,
          title: brand,
          caption:
            access.status === 'unverified'
              ? 'Не удалось загрузить рестораны'
              : '',
          sections: allSections,
        };
      }
      return {
        restaurantID,
        restaurant,
        title: restaurant.name,
        caption: `${restaurant.name} · ${rolesCaption(restaurant.roles)}`,
        sections: allSections.filter((section) =>
          canOpenSection(section, restaurant.permissions),
        ),
      };
    }
  }
}
