import { Flex, Stack } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { PageHeader } from '@/presentation/app-shell/pages';
import { useRestaurantPath } from '@/presentation/app-shell/paths';
import { placeholderAccount } from '@/presentation/placeholder-account';
import { ButtonLink } from '@/presentation/ui/actions';
import { EvaluationStamp } from '@/presentation/ui/evaluation-stamp';
import { TabNav } from '@/presentation/ui/tab-nav';

// Figma S1/S3/H1: «Склад» with «Принять поставку», the tabs and the stamp;
// the controls and the list below sit 16px apart.
export function WarehouseLayout({
  section,
  stamp,
  children,
}: {
  section: string;
  stamp: string;
  children: ReactNode;
}) {
  const path = useRestaurantPath();
  return (
    <Stack gap={{ base: '4', sm: '6' }}>
      <PageHeader
        title="Склад"
        caption={placeholderAccount.today}
        documentTitle={`${section} · Склад`}
        action={
          <ButtonLink to={path('/warehouse/delivery')}>
            Принять поставку
          </ButtonLink>
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
        <EvaluationStamp text={stamp} />
      </Flex>
      <Stack gap="4">{children}</Stack>
    </Stack>
  );
}
