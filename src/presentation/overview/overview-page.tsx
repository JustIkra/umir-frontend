import { Stack } from '@chakra-ui/react';
import { useLocation, useParams } from 'react-router';
import { findRestaurant } from '@/application/access';
import { PageHeader } from '@/presentation/app-shell/pages';
import {
  missingSectionOf,
  useRestaurantPath,
} from '@/presentation/app-shell/paths';
import { sectionTitle } from '@/presentation/app-shell/sections';
import { placeholderAccount } from '@/presentation/placeholder-account';
import { useAccess } from '@/presentation/session/hooks';
import { ButtonLink } from '@/presentation/ui/actions';
import { InfoNotice } from '@/presentation/ui/states';
import { OverviewTiles } from './tiles';

// Figma W03 «Обзор» for «Склад» and «Официант»; «Собрать заказ» is centred
// on the heading block there. After a switch to a restaurant without the
// section that was open, the overview says so above the tiles (W12).
export function OverviewPage() {
  const path = useRestaurantPath();
  const missing = missingSectionOf(useLocation().state as unknown);
  const { restaurantID = '' } = useParams();
  const restaurant = findRestaurant(useAccess(), restaurantID);
  return (
    <Stack gap={{ base: '4', sm: '6' }}>
      <PageHeader
        title="Обзор"
        eyebrow={`${placeholderAccount.organization} · ${placeholderAccount.restaurant}`}
        caption={placeholderAccount.today}
        action={
          <ButtonLink to={path('/orders')} alignSelf={{ sm: 'center' }}>
            Собрать заказ
          </ButtonLink>
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
      <OverviewTiles />
    </Stack>
  );
}
