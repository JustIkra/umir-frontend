import { Stack } from '@chakra-ui/react';
import { PageHeader } from '@/presentation/app-shell/pages';
import { useRestaurantPath } from '@/presentation/app-shell/paths';
import { placeholderAccount } from '@/presentation/placeholder-account';
import { ButtonLink } from '@/presentation/ui/actions';
import { OverviewTiles } from './tiles';

// Figma W03 «Обзор» for «Склад» and «Официант»; «Собрать заказ» is centred
// on the heading block there.
export function OverviewPage() {
  const path = useRestaurantPath();
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
      <OverviewTiles />
    </Stack>
  );
}
