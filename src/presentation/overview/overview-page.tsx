import { Grid, Stack, Text } from '@chakra-ui/react';
import { useLocation, useParams } from 'react-router';
import { findRestaurant } from '@/application/access';
import { canOpenSection, type SectionKey } from '@/domain/access';
import { PageHeader } from '@/presentation/app-shell/pages';
import {
  missingSectionOf,
  useRestaurantPath,
} from '@/presentation/app-shell/paths';
import { appSections, sectionTitle } from '@/presentation/app-shell/sections';
import { useSectionDate } from '@/presentation/app-shell/section-date';
import { useAccess } from '@/presentation/session/hooks';
import { ButtonLink } from '@/presentation/ui/actions';
import { InfoNotice } from '@/presentation/ui/states';
import { Card } from '@/presentation/ui/card';

// One line under each tile title: what the section holds.
const descriptions: Readonly<Partial<Record<SectionKey, string>>> = {
  orders: 'Меню, стоп-лист и новый заказ',
  warehouse: 'Остатки, сроки годности, поставки и списания',
  catalog: 'Продукты, блюда и рецепты',
  analytics:
    'Что скоро закончится, что может испортиться и куда уходят продукты',
};

export function OverviewPage() {
  const { restaurantID = '' } = useParams();
  const restaurant = findRestaurant(useAccess(), restaurantID);
  const path = useRestaurantPath();
  const missing = missingSectionOf(useLocation().state as unknown);
  const caption = useSectionDate();
  const sections = appSections.filter(
    (section) =>
      section.key !== 'overview' &&
      canOpenSection(section.key, restaurant?.permissions),
  );
  return (
    <Stack gap="6">
      <PageHeader
        title="Обзор"
        eyebrow={
          restaurant === undefined
            ? undefined
            : `${restaurant.orgName} · ${restaurant.name}`
        }
        caption={caption}
      />
      {missing !== undefined && (
        <InfoNotice
          title={`В ресторане «${restaurant?.name ?? ''}» у вас нет доступа к разделу «${sectionTitle(missing)}»`}
        >
          Мы открыли обзор. Доступ к разделам настраивает администратор.
        </InfoNotice>
      )}
      <Grid
        templateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }}
        gap="4"
      >
        {sections.map((section) => (
          <Card key={section.key} p="6">
            <Stack gap="3">
              <Stack gap="1">
                <Text textStyle="heading.h3">{section.title}</Text>
                {descriptions[section.key] !== undefined && (
                  <Text textStyle="body.default" color="text.secondary">
                    {descriptions[section.key]}
                  </Text>
                )}
              </Stack>
              <ButtonLink
                variant="secondary"
                to={path(section.suffix)}
                alignSelf="flex-start"
              >
                Открыть раздел
              </ButtonLink>
            </Stack>
          </Card>
        ))}
      </Grid>
    </Stack>
  );
}
