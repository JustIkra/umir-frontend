import analyticsIcon from '@/presentation/assets/icons/analytics-24.svg';
import catalogIcon from '@/presentation/assets/icons/catalog-24.svg';
import ordersIcon from '@/presentation/assets/icons/orders-24.svg';
import overviewIcon from '@/presentation/assets/icons/overview-24-active.svg';
import recommendationsIcon from '@/presentation/assets/icons/menu-24.svg';
import warehouseIcon from '@/presentation/assets/icons/warehouse-24.svg';

// Sidebar of Figma 784:77151, Роль=Обе роли. The sections are empty until the
// business screens are ported.
export const appSections = [
  { path: '/app', title: 'Обзор', icon: overviewIcon },
  { path: '/app/orders', title: 'Заказы', icon: ordersIcon },
  { path: '/app/warehouse', title: 'Склад', icon: warehouseIcon },
  { path: '/app/catalog', title: 'Справочники', icon: catalogIcon },
  {
    path: '/app/menu',
    title: 'Меню и рекомендации',
    icon: recommendationsIcon,
  },
  { path: '/app/analytics', title: 'Аналитика', icon: analyticsIcon },
] as const;
