import { Flex, Stack } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { PageHeader } from '@/presentation/app-shell/pages';
import { placeholderAccount } from '@/presentation/placeholder-account';
import {
  catalogStamp,
  dishes,
  products,
} from '@/presentation/placeholder-catalog';
import { ButtonLink } from '@/presentation/ui/actions';
import { EvaluationStamp } from '@/presentation/ui/evaluation-stamp';
import { TabNav } from '@/presentation/ui/tab-nav';

// Figma K01/K12: the title with its action, the tabs and the catalog stamp;
// the search, the note and the table below sit 16px apart.
export function CatalogLayout({
  section,
  action,
  children,
}: {
  section: 'Продукты' | 'Блюда';
  action: { to: string; title: string };
  children: ReactNode;
}) {
  return (
    <Stack gap={{ base: '4', sm: '6' }}>
      <PageHeader
        title="Справочники"
        caption={placeholderAccount.today}
        documentTitle={`${section} · Справочники`}
        action={<ButtonLink to={action.to}>{action.title}</ButtonLink>}
      />
      <Flex
        wrap="wrap"
        align="center"
        justify="space-between"
        columnGap="4"
        rowGap="3"
      >
        <TabNav
          label="Справочники"
          tabs={[
            {
              to: '/app/catalog',
              title: `Продукты · ${String(products.length)}`,
            },
            {
              to: '/app/catalog/dishes',
              title: `Блюда · ${String(dishes.length)}`,
            },
          ]}
        />
        <EvaluationStamp text={`Справочник на ${catalogStamp}`} />
      </Flex>
      <Stack gap="4">{children}</Stack>
    </Stack>
  );
}
