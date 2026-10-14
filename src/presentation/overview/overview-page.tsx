import { Stack } from '@chakra-ui/react';
import { useLocation, useParams } from 'react-router';
import { findRestaurant, knownOrganizations } from '@/application/access';
import { AccessUnverified } from '@/presentation/app-shell/access-states';
import { PageHeader } from '@/presentation/app-shell/pages';
import {
  missingSectionOf,
  useRestaurantPath,
} from '@/presentation/app-shell/paths';
import { useSectionDate } from '@/presentation/app-shell/section-date';
import { sectionTitle } from '@/presentation/app-shell/sections';
import { useServices } from '@/presentation/services';
import { useAccess, usePermissions } from '@/presentation/session/hooks';
import { ButtonLink } from '@/presentation/ui/actions';
import { InfoNotice } from '@/presentation/ui/states';
import { OverviewTiles } from './tiles';

// Figma W01–W03 «Обзор»: the organization and the restaurant above the title,
// the date in the organization's zone under it; «Собрать заказ» (order.prepare)
// is centred on the heading block. After a switch to a restaurant without the
// section that was open, the overview says so above the tiles (W12).
export function OverviewPage() {
  const path = useRestaurantPath();
  const missing = missingSectionOf(useLocation().state as unknown);
  const { restaurantID = '' } = useParams();
  const access = useAccess();
  const { access: accessStore } = useServices();
  const restaurant = findRestaurant(access, restaurantID);
  const permissions = usePermissions();
  const caption = useSectionDate();
  // Nothing was ever read: the rights are unknown, not absent.
  if (
    access.status === 'unverified' &&
    knownOrganizations(access) === undefined
  ) {
    return (
      <AccessUnverified
        details={`${String(access.failure.status)} ${access.failure.code}`}
        onRetry={() => {
          void accessStore.refresh();
        }}
      />
    );
  }
  return (
    <Stack gap={{ base: '4', sm: '6' }}>
      <PageHeader
        title="Обзор"
        eyebrow={
          restaurant === undefined
            ? undefined
            : `${restaurant.orgName} · ${restaurant.name}`
        }
        caption={caption}
        action={
          permissions.has('order.prepare') ? (
            <ButtonLink to={path('/orders')} alignSelf={{ sm: 'center' }}>
              Собрать заказ
            </ButtonLink>
          ) : undefined
        }
      />
      {missing !== undefined && (
        <InfoNotice
          title={`Раздел «${sectionTitle(missing)}» недоступен в ресторане «${restaurant?.name ?? ''}»`}
        >
          Открыт обзор ресторана. Доступные разделы зависят от ролей в каждом
          ресторане.
        </InfoNotice>
      )}
      <OverviewTiles
        permissions={permissions}
        timeZone={restaurant?.timeZone}
      />
    </Stack>
  );
}
