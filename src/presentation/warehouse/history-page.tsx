import { Flex, Grid, Skeleton, Text, chakra } from '@chakra-ui/react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { findRestaurant } from '@/application/access';
import type { ScreenFailure } from '@/application/failure';
import { ReadFailure } from '@/presentation/app-shell/read-failure';
import clockIcon from '@/presentation/assets/icons/clock-24.svg';
import ordersIcon from '@/presentation/assets/icons/orders-24.svg';
import warehouseIcon from '@/presentation/assets/icons/warehouse-24.svg';
import { productMap } from '@/presentation/orders/order-rows';
import {
  useAccess,
  useReadModel,
  useRestaurantData,
  useRestaurantRead,
} from '@/presentation/session/hooks';
import { Button } from '@/presentation/ui/actions';
import { Badge } from '@/presentation/ui/badge';
import { ListCard } from '@/presentation/ui/card';
import { FormMessage } from '@/presentation/ui/form-message';
import { Icon } from '@/presentation/ui/icon';
import { SegmentChoice } from '@/presentation/ui/segment-choice';
import { StateCard } from '@/presentation/ui/states';
import { rem } from '@/presentation/ui/units';
import {
  historyRows,
  historyStamp,
  unreadableHistory,
  type HistoryFilter,
  type HistoryKind,
} from './history-rows';
import { WarehouseLayout } from './warehouse-layout';

const kinds: Record<
  HistoryKind,
  { icon: string; tone: 'neutral' | 'success' | 'expiry' }
> = {
  sale: { icon: ordersIcon, tone: 'neutral' },
  receipt: { icon: warehouseIcon, tone: 'success' },
  pending: { icon: clockIcon, tone: 'expiry' },
  confirmed: { icon: clockIcon, tone: 'neutral' },
  expired: { icon: clockIcon, tone: 'neutral' },
};

const filterOptions: readonly { value: HistoryFilter; title: string }[] = [
  { value: 'all', title: 'Все' },
  { value: 'deliveries', title: 'Поступления' },
  { value: 'sales', title: 'Продажи' },
  { value: 'writeoffs', title: 'Списания' },
];

const pageSize = 100;

const rowGrid = {
  gridTemplateAreas: {
    base: "'id icon badge time' 'text text text text' 'at at at at'",
    sm: "'id icon badge text at'",
  },
  gridTemplateColumns: {
    base: 'auto auto 1fr auto',
    sm: `${rem(56)} ${rem(20)} ${rem(176)} 1fr ${rem(88)}`,
  },
} as const;

// UnknownEventSchema or an event this client cannot decode.
const unreadable = (failure: ScreenFailure | undefined) =>
  failure !== undefined &&
  (failure.kind === 'unavailable' || failure.kind === 'error') &&
  unreadableHistory(failure.failure.code, failure.failure.status);

const failedText =
  'Склад не отдал журнал. Это не пустой журнал: повторите чтение.';

// H7 and the journal this client cannot show; access states go to the shared
// ReadFailure.
function HistoryFailure({
  failure,
  onRetry,
}: {
  failure: ScreenFailure;
  onRetry: () => void;
}) {
  if (unreadable(failure)) {
    return (
      <FormMessage tone="error" title="Не удалось показать историю">
        В журнале есть событие, которое приложение не умеет показать. Журнал не
        показан целиком, чтобы не скрыть его часть.
      </FormMessage>
    );
  }
  if (failure.kind === 'unavailable' || failure.kind === 'error') {
    return (
      <FormMessage
        tone="error"
        title="Не удалось получить историю"
        action={
          <Button variant="secondary" onClick={onRetry}>
            Повторить
          </Button>
        }
      >
        {failedText}
      </FormMessage>
    );
  }
  return (
    <ReadFailure
      failure={failure}
      section="Склад"
      title="Не удалось получить историю"
      onRetry={onRetry}
    >
      {failedText}
    </ReadFailure>
  );
}

// Figma H1, H6, H7 «История»: the journal of the warehouse epoch from the
// newest event, a hundred rows at a time. On 390 the time moves up beside the
// badge and the date goes under the text.
export function HistoryPage() {
  const { restaurantID = '' } = useParams();
  const access = useAccess();
  const data = useRestaurantData();
  const model = data.history();
  const { snapshot, failure } = useRestaurantRead(model);
  const productItems = useReadModel(data.products()).value?.result.items;
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [limit, setLimit] = useState(pageSize);
  const value = snapshot.value;
  const timeZone =
    findRestaurant(access, restaurantID)?.timeZone ??
    value?.context.settings.timeZone ??
    'UTC';
  const retry = () => {
    model.refresh();
  };
  const stamp =
    value === undefined
      ? 'Получаем журнал…'
      : historyStamp(value.result, value.context.evaluatedAt.epochMs, timeZone);
  // Without a journal, or with one that cannot be shown whole, only the
  // failure stands.
  if (failure !== undefined && (value === undefined || unreadable(failure))) {
    return (
      <WarehouseLayout section="История" stamp={stamp} onRefresh={retry}>
        <HistoryFailure failure={failure} onRetry={retry} />
      </WarehouseLayout>
    );
  }
  const rows =
    value === undefined
      ? undefined
      : historyRows(
          value.result,
          productMap(productItems ?? []),
          filter,
          timeZone,
        );
  return (
    <WarehouseLayout section="История" stamp={stamp} onRefresh={retry}>
      {failure !== undefined && (
        <HistoryFailure failure={failure} onRetry={retry} />
      )}
      <SegmentChoice
        label="Тип событий"
        options={filterOptions}
        value={filter}
        onChange={(next) => {
          setFilter(next);
          setLimit(pageSize);
        }}
      />
      {rows?.length === 0 ? (
        <StateCard icon={clockIcon} title="Событий пока нет">
          Здесь появятся поставки, продажи и списания.
        </StateCard>
      ) : (
        <ListCard p="0">
          <Flex as="li" px="4" pt={{ base: '3', sm: '4' }} pb="2">
            <Text textStyle="caption.default" color="text.secondary">
              События от новых к старым
            </Text>
          </Flex>
          {rows === undefined &&
            Array.from({ length: 6 }, (_, index) => (
              <Grid
                as="li"
                key={index}
                aria-hidden="true"
                {...rowGrid}
                alignItems="center"
                columnGap={{ base: '2', sm: '3' }}
                rowGap="1"
                px="4"
                py="3"
                borderTopWidth="1px"
                borderColor="border.default"
              >
                <Skeleton gridArea="id" h="4" w="10" />
                <Skeleton gridArea="badge" h="5" w="24" />
                <Skeleton gridArea="text" h="5" w="full" />
              </Grid>
            ))}
          {rows?.slice(0, limit).map((row) => {
            const kind = kinds[row.kind];
            return (
              <Grid
                as="li"
                key={row.sequence}
                {...rowGrid}
                alignItems="center"
                columnGap={{ base: '2', sm: '3' }}
                rowGap="1"
                px="4"
                py="3"
                borderTopWidth="1px"
                borderColor="border.default"
              >
                <Text
                  gridArea="id"
                  textStyle="mono.default"
                  color="text.secondary"
                >
                  {row.sequence}
                </Text>
                <Icon gridArea="icon" src={kind.icon} size={20} />
                <Badge
                  gridArea="badge"
                  justifySelf="start"
                  ms={{ sm: '-2' }}
                  tone={kind.tone}
                >
                  {row.label}
                </Badge>
                <chakra.span
                  gridArea="time"
                  display={{ sm: 'none' }}
                  textStyle="mono.default"
                  color="text.secondary"
                >
                  {row.time}
                </chakra.span>
                <Text gridArea="text" textStyle="body.default">
                  {row.text}
                </Text>
                <Text
                  gridArea="at"
                  textAlign={{ sm: 'end' }}
                  textStyle="caption.default"
                  color="text.secondary"
                >
                  {row.at}
                </Text>
              </Grid>
            );
          })}
          {rows !== undefined && rows.length > limit && (
            <Flex
              as="li"
              justify="center"
              px="4"
              py="3"
              borderTopWidth="1px"
              borderColor="border.default"
            >
              <Button
                variant="link"
                onClick={() => {
                  setLimit((shown) => shown + pageSize);
                }}
              >
                Показать ещё 100
              </Button>
            </Flex>
          )}
        </ListCard>
      )}
    </WarehouseLayout>
  );
}
