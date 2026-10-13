import analyticsIcon from '@/presentation/assets/icons/analytics-24.svg';
import catalogIcon from '@/presentation/assets/icons/catalog-24.svg';
import ordersIcon from '@/presentation/assets/icons/orders-24.svg';
import overviewIcon from '@/presentation/assets/icons/overview-24-active.svg';
import recommendationsIcon from '@/presentation/assets/icons/menu-24.svg';
import warehouseIcon from '@/presentation/assets/icons/warehouse-24.svg';
import type { SectionKey } from '@/domain/access';

// Sidebar of Figma 784:77151. Each section lives under /app/r/{restaurantID}
// at its suffix.
export const appSections: readonly {
  readonly key: SectionKey;
  readonly suffix: string;
  readonly title: string;
  readonly icon: string;
}[] = [
  { key: 'overview', suffix: '', title: 'Обзор', icon: overviewIcon },
  { key: 'orders', suffix: '/orders', title: 'Заказы', icon: ordersIcon },
  {
    key: 'warehouse',
    suffix: '/warehouse',
    title: 'Склад',
    icon: warehouseIcon,
  },
  {
    key: 'catalog',
    suffix: '/catalog',
    title: 'Справочники',
    icon: catalogIcon,
  },
  {
    key: 'menu',
    suffix: '/menu',
    title: 'Меню и рекомендации',
    icon: recommendationsIcon,
  },
  {
    key: 'analytics',
    suffix: '/analytics',
    title: 'Аналитика',
    icon: analyticsIcon,
  },
];

export function sectionTitle(key: SectionKey): string {
  return appSections.find((section) => section.key === key)?.title ?? '';
}

export function sectionSuffix(key: SectionKey): string {
  return appSections.find((section) => section.key === key)?.suffix ?? '';
}
