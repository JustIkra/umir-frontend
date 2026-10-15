import { Grid, Stack, Text } from '@chakra-ui/react';
import { useLocation, useParams } from 'react-router';
import { findRestaurant } from '@/application/access';
import { canOpenSection } from '@/domain/access';
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
          title={`Раздел «${sectionTitle(missing)}» недоступен в ресторане «${restaurant?.name ?? ''}»`}
        >
          Открыт обзор ресторана. Доступные разделы зависят от ролей в каждом
          ресторане.
        </InfoNotice>
      )}
      <Grid
        templateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }}
        gap="4"
      >
        {sections.map((section) => (
          <Card key={section.key} p="6">
            <Stack gap="3">
              <Text textStyle="heading.h3">{section.title}</Text>
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
