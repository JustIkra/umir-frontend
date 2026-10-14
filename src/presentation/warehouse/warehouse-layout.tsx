import { Flex, Stack } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { PageHeader } from '@/presentation/app-shell/pages';
import { useRestaurantPath } from '@/presentation/app-shell/paths';
import { useSectionDate } from '@/presentation/app-shell/section-date';
import { usePermissions } from '@/presentation/session/hooks';
import { ButtonLink } from '@/presentation/ui/actions';
import { EvaluationStamp } from '@/presentation/ui/evaluation-stamp';
import { TabNav } from '@/presentation/ui/tab-nav';

// Figma S1/S3/H1: «Склад» with the date and zone of the organization,
// «Принять поставку» for delivery.create, the tabs and the stamp of the shown
// read; the controls and the list below sit 16px apart.
export function WarehouseLayout({
  section,
  stamp,
  onRefresh,
  children,
}: {
  section: string;
  stamp: string;
  // «Обновить» next to the stamp re-reads the shown data.
  onRefresh?: () => void;
  children: ReactNode;
}) {
  const path = useRestaurantPath();
  const caption = useSectionDate();
  const canDeliver = usePermissions().has('delivery.create');
  return (
    <Stack gap={{ base: '4', sm: '6' }}>
      <PageHeader
        title="Склад"
        caption={caption}
        documentTitle={`${section} · Склад`}
        action={
          canDeliver ? (
            <ButtonLink to={path('/warehouse/delivery')}>
              Принять поставку
            </ButtonLink>
          ) : undefined
        }
      />
      <Flex
        wrap="wrap"
        align="center"
        justify="space-between"
        columnGap="4"
        rowGap="3"
      >
        <TabNav
          label="Разделы склада"
          tabs={[
            { to: path('/warehouse'), title: 'Остатки' },
            { to: path('/warehouse/expiry'), title: 'Сроки годности' },
            { to: path('/warehouse/history'), title: 'История' },
          ]}
        />
        <EvaluationStamp
          text={stamp}
          {...(onRefresh === undefined ? {} : { onRefresh })}
        />
      </Flex>
      <Stack gap="4">{children}</Stack>
    </Stack>
  );
}
