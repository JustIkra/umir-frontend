import { Flex, Grid, Text } from '@chakra-ui/react';
import { useParams } from 'react-router';
import { findRestaurant } from '@/application/access';
import type { Envelope } from '@/application/api';
import type { ReadModel } from '@/application/read-model';
import type { StopList } from '@/application/restaurant';
import type { ExpiringBatches, PendingBatches } from '@/application/warehouse';
import { canOpenSection } from '@/domain/access';
import { useRestaurantPath } from '@/presentation/app-shell/paths';
import { useAccess, useReadModel } from '@/presentation/session/hooks';
import { Button, TextLink } from '@/presentation/ui/actions';
import { Card } from '@/presentation/ui/card';
import { plural } from '@/presentation/ui/plural';

type Forms = readonly [string, string, string];

// A number with its noun, the read's own state, and where to act on it.
function Tile<T>({
  label,
  model,
  count,
  forms,
  link,
}: {
  label: string;
  model: ReadModel<Envelope<T>>;
  count: (result: T) => number;
  forms: Forms;
  link: { readonly to: string; readonly text: string } | undefined;
}) {
  const snapshot = useReadModel(model);
  const value = snapshot.value;
  const n = value === undefined ? 0 : count(value.result);
  return (
    <Card gap="2" p={{ base: '4', sm: '6' }}>
      <Text textStyle="caption.strong" color="text.secondary">
        {label}
      </Text>
      {value !== undefined ? (
        <Text textStyle="heading.h2">{`${String(n)} ${plural(n, ...forms)}`}</Text>
      ) : snapshot.failed ? (
        <Flex align="center" gap="3" wrap="wrap">
          <Text textStyle="heading.h2">—</Text>
          <Button
            variant="secondary"
            onClick={() => {
              model.refresh();
            }}
          >
            Повторить
          </Button>
        </Flex>
      ) : (
        <Text role="status" color="text.secondary">
          Получаем данные…
        </Text>
      )}
      {link !== undefined && (
        <TextLink to={link.to} alignSelf="flex-start">
          {link.text}
        </TextLink>
      )}
    </Card>
  );
}

const batches: Forms = ['партия', 'партии', 'партий'];

export function AnalyticsTiles({
  stop,
  pending,
  expiring,
}: {
  stop: ReadModel<Envelope<StopList>>;
  pending: ReadModel<Envelope<PendingBatches>>;
  expiring: ReadModel<Envelope<ExpiringBatches>>;
}) {
  const { restaurantID = '' } = useParams();
  const restaurant = findRestaurant(useAccess(), restaurantID);
  const path = useRestaurantPath();
  // The stop list lives in «Заказы», which the warehouse role cannot open.
  const expiry = canOpenSection('warehouse', restaurant?.permissions)
    ? { to: path('/warehouse/expiry'), text: 'Открыть сроки годности' }
    : undefined;
  return (
    <Grid
      templateColumns={{ base: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }}
      gap="4"
    >
      <Tile
        label="В стоп-листе"
        model={stop}
        count={(result) => result.dishes.length}
        forms={['блюдо', 'блюда', 'блюд']}
        link={undefined}
      />
      <Tile
        label="Ждут списания"
        model={pending}
        count={(result) => result.items.length}
        forms={batches}
        link={expiry}
      />
      <Tile
        label="Испортится за 2 дня"
        model={expiring}
        count={(result) =>
          result.items.filter((batch) => !batch.isExpired).length
        }
        forms={batches}
        link={expiry}
      />
    </Grid>
  );
}
