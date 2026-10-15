import { Flex, Stack } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { PageHeader } from '@/presentation/app-shell/pages';
import { useRestaurantPath } from '@/presentation/app-shell/paths';
import { useSectionDate } from '@/presentation/app-shell/section-date';
import { Button, ButtonLink } from '@/presentation/ui/actions';
import { EvaluationStamp } from '@/presentation/ui/evaluation-stamp';
import { FormMessage } from '@/presentation/ui/form-message';
import { TabNav } from '@/presentation/ui/tab-nav';
import { useReadModel, useRestaurantData } from '@/presentation/session/hooks';
import { catalogStamp } from './catalog-rows';

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
  const path = useRestaurantPath();
  const data = useRestaurantData();
  const caption = useSectionDate();
  const productsModel = data.products();
  const dishesModel = data.dishCatalog();
  const products = useReadModel(productsModel).value;
  const dishes = useReadModel(dishesModel).value;
  const shown = section === 'Продукты' ? products : dishes;
  const count = (items: readonly unknown[] | undefined) =>
    items === undefined ? '…' : String(items.length);
  return (
    <Stack gap={{ base: '4', sm: '6' }}>
      <PageHeader
        title="Справочники"
        caption={caption}
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
              to: path('/catalog'),
              title: `Продукты · ${count(products?.result.items)}`,
            },
            {
              to: path('/catalog/dishes'),
              title: `Блюда · ${count(dishes?.result.items)}`,
            },
          ]}
        />
        <EvaluationStamp
          text={
            shown === undefined
              ? 'Обновляем…'
              : catalogStamp(
                  shown.result.evaluatedAt.epochMs,
                  shown.context.settings.timeZone,
                )
          }
          onRefresh={() => {
            (section === 'Продукты' ? productsModel : dishesModel).refresh();
          }}
        />
      </Flex>
      <Stack gap="4">{children}</Stack>
    </Stack>
  );
}

// A re-read failed while an older read stays on screen.
export function StaleCatalog({
  stamp,
  onRetry,
}: {
  stamp: string;
  onRetry: () => void;
}) {
  return (
    <FormMessage
      tone="error"
      title="Не удалось обновить"
      action={
        <Button variant="secondary" onClick={onRetry}>
          Попробовать ещё раз
        </Button>
      }
    >
      {`Показаны ${stamp.charAt(0).toLowerCase()}${stamp.slice(1)}.`}
    </FormMessage>
  );
}
