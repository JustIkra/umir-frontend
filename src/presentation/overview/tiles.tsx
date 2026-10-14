import {
  Box,
  Flex,
  Grid,
  Skeleton,
  Stack,
  Text,
  chakra,
} from '@chakra-ui/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { failureOf } from '@/application/api';
import { screenFailure } from '@/application/failure';
import type { OrderFlow } from '@/application/order-flow';
import type { ReadModel, ReadModelSnapshot } from '@/application/read-model';
import type { Permission } from '@/domain/access';
import { useRestaurantPath } from '@/presentation/app-shell/paths';
import analyticsIcon from '@/presentation/assets/icons/analytics-24.svg';
import catalogIcon from '@/presentation/assets/icons/catalog-24.svg';
import clockIcon from '@/presentation/assets/icons/clock-24.svg';
import menuIcon from '@/presentation/assets/icons/menu-24.svg';
import ordersIcon from '@/presentation/assets/icons/orders-24.svg';
import warehouseIcon from '@/presentation/assets/icons/warehouse-24.svg';
import { productMap } from '@/presentation/orders/order-rows';
import { useServices } from '@/presentation/services';
import {
  useReadModel,
  useRestaurantData,
  useStore,
} from '@/presentation/session/hooks';
import { Button, ButtonLink } from '@/presentation/ui/actions';
import { Badge } from '@/presentation/ui/badge';
import { FormMessage } from '@/presentation/ui/form-message';
import { MaskIcon } from '@/presentation/ui/icon';
import { SegmentChoice } from '@/presentation/ui/segment-choice';
import { windowHours } from '@/presentation/warehouse/expiry-rows';
import {
  analyticsFigures,
  attemptOpen,
  batchTile,
  catalogFigures,
  recommendationTile,
  reportTile,
  stopTile,
  tileStamp,
  tileWindows,
  writeoffFigures,
  type Figure,
  type TileRow,
  type TileWindow,
  type WarehouseTileView,
} from './overview-rows';

interface TileProps {
  readonly permissions: ReadonlySet<Permission>;
  // The zone of the organization from access; a read's own settings until
  // access is known.
  readonly timeZone: string | undefined;
}

// Figma Tile (W03): an icon box, the title and the stamp, the body, the links.
// Tiles in a row share the height; the content stays at the top.
function Tile({
  icon,
  title,
  stamp,
  children,
  links,
}: {
  icon: string;
  title: string;
  stamp?: string | undefined;
  children: ReactNode;
  links?: ReactNode;
}) {
  return (
    <Stack
      as="section"
      gap="4"
      p="6"
      bg="bg.surface"
      borderWidth="1px"
      borderColor="border.default"
      borderRadius="md"
    >
      <Flex align="center" gap="3">
        <Flex
          boxSize="8"
          flexShrink="0"
          align="center"
          justify="center"
          borderRadius="md"
          bg="bg.actionSubtle"
          color="icon.action"
        >
          <MaskIcon src={icon} size={20} />
        </Flex>
        <chakra.h2 flex="1" textStyle="heading.h3">
          {title}
        </chakra.h2>
        {stamp !== undefined && (
          <Text textStyle="caption.default" color="text.secondary">
            {stamp}
          </Text>
        )}
      </Flex>
      {children}
      {links !== undefined && (
        <Flex wrap="wrap" align="center" columnGap="4">
          {links}
        </Flex>
      )}
    </Stack>
  );
}

function TileLink({ to, children }: { to: string; children: string }) {
  return (
    <ButtonLink variant="link" to={to}>
      {children}
    </ButtonLink>
  );
}

// Spec 9: a tile without its data shows a skeleton; a refused read shows
// «Данные не получены» with «Повторить» inside the tile. An ended session
// is checked as on every screen (spec 11).
function TileState({
  reads,
  onRetry,
}: {
  reads: readonly ReadModelSnapshot<unknown>[];
  onRetry: () => void;
}) {
  const { session } = useServices();
  const ended = reads.some(
    (read) =>
      read.failed && screenFailure(read.failure).kind === 'session-ended',
  );
  useEffect(() => {
    if (ended) void session.check();
  }, [ended, session]);
  if (reads.some((read) => read.value === undefined && read.failed)) {
    return (
      <FormMessage
        tone="error"
        title="Данные не получены"
        action={
          <Button variant="secondary" onClick={onRetry}>
            Повторить
          </Button>
        }
      />
    );
  }
  return (
    <Stack gap="3" aria-busy="true">
      <Skeleton h="8" w="24" />
      <Skeleton h="4" w="full" />
      <Skeleton h="4" w="60%" />
    </Stack>
  );
}

function Figures({ figures }: { figures: readonly Figure[] }) {
  return (
    <Flex columnGap="8" rowGap="4" wrap="wrap">
      {figures.map((item) => (
        <Stack key={item.label} gap="1">
          <Text textStyle="heading.h2">{item.value}</Text>
          <Text textStyle="caption.default" color="text.secondary">
            {item.label}
          </Text>
        </Stack>
      ))}
    </Flex>
  );
}

function SubHeading({
  title,
  stamp,
}: {
  title: string;
  stamp: string | undefined;
}) {
  return (
    <Flex justify="space-between" gap="3" color="text.secondary">
      <chakra.h3 textStyle="caption.strong">{title}</chakra.h3>
      {stamp !== undefined && <Text textStyle="caption.default">{stamp}</Text>}
    </Flex>
  );
}

// A batch or a product with its expiry mark; on 390 the mark goes under the
// text.
function RowView({ row, first }: { row: TileRow; first: boolean }) {
  return (
    <Flex
      direction={{ base: 'column', sm: 'row' }}
      align={{ base: 'flex-start', sm: 'center' }}
      justify="space-between"
      gap={{ base: '1', sm: '3' }}
      py="2.5"
      borderTopWidth={first ? '0' : '1px'}
      borderColor="border.default"
    >
      <Stack gap="0.5" minW="0">
        <Text textStyle="body.default">{row.title}</Text>
        <Text textStyle="mono.default" color="text.secondary">
          {row.detail}
        </Text>
      </Stack>
      {row.badge !== undefined && <Badge tone="expiry">{row.badge}</Badge>}
    </Flex>
  );
}

const productNames = (items: readonly { productID: string; name: string }[]) =>
  new Map(items.map((item) => [item.productID, item.name]));

interface WindowProps {
  readonly choice: ReactNode;
  readonly links: ReactNode;
  readonly timeZone: string | undefined;
}

function WarehouseFrame({
  view,
  choice,
  links,
  reads,
  onRetry,
}: {
  view: WarehouseTileView | undefined;
  choice: ReactNode;
  links: ReactNode;
  reads: readonly ReadModelSnapshot<unknown>[];
  onRetry: () => void;
}) {
  return (
    <Tile icon={warehouseIcon} title="Склад" stamp={view?.stamp} links={links}>
      <Stack gap="2">
        {choice}
        {view !== undefined && (
          <Text textStyle="caption.default" color="text.secondary">
            {view.boundary}
          </Text>
        )}
      </Stack>
      {view === undefined ? (
        <TileState reads={reads} onRetry={onRetry} />
      ) : (
        <>
          <Stack gap="1">
            <Text textStyle="heading.h2">{view.count}</Text>
            <Text textStyle="caption.default" color="text.secondary">
              {view.note}
            </Text>
          </Stack>
          {view.rows.length > 0 && (
            <Box>
              {view.rows.map((row, index) => (
                <RowView key={row.key} row={row} first={index === 0} />
              ))}
              {view.more !== undefined && (
                <Text pt="3" textStyle="caption.default" color="text.secondary">
                  {view.more}
                </Text>
              )}
            </Box>
          )}
        </>
      )}
    </Tile>
  );
}

// 24 h: batches of expiring-batches; names come from the warehouse catalog.
function BatchWindow({ choice, links, timeZone }: WindowProps) {
  const data = useRestaurantData();
  const model = data.expiringBatches();
  const read = useReadModel(model);
  const products = useReadModel(data.products()).value;
  const value = read.value;
  return (
    <WarehouseFrame
      view={
        value === undefined
          ? undefined
          : batchTile(
              value.result,
              productNames(products?.result.items ?? []),
              timeZone ?? value.context.settings.timeZone,
            )
      }
      choice={choice}
      links={links}
      reads={[read]}
      onRetry={() => {
        model.refresh();
      }}
    />
  );
}

// 3 and 7 days: products of analytics/stock. Spec 6.1: SettingsChanged
// re-reads access and repeats the report once; a second refusal stays a
// failure of the tile.
function ReportWindow({
  hours,
  choice,
  links,
  timeZone,
}: WindowProps & { hours: number }) {
  const { access } = useServices();
  const model = useRestaurantData().stockReport(hours);
  const read = useReadModel(model);
  const changed =
    read.failed && failureOf(read.failure)?.code === 'SettingsChanged';
  const repeated = useRef<ReadModel<unknown> | undefined>(undefined);
  useEffect(() => {
    if (!changed || repeated.current === model) return;
    repeated.current = model;
    void access.refresh().then(() => {
      model.refresh();
    });
  }, [changed, model, access]);
  const value = read.value;
  return (
    <WarehouseFrame
      view={
        value === undefined
          ? undefined
          : reportTile(value, timeZone ?? value.context.settings.timeZone)
      }
      choice={choice}
      links={links}
      reads={[read]}
      onRetry={() => {
        if (changed) {
          void access.refresh().then(() => {
            model.refresh();
          });
        } else {
          model.refresh();
        }
      }}
    />
  );
}

// Spec 9 «Склад»: «24 ч» always, «3 дня» and «7 дней» with analytics.read.
function WarehouseTile({ permissions, timeZone }: TileProps) {
  const path = useRestaurantPath();
  const options = tileWindows(permissions.has('analytics.read'));
  const [chosen, setChosen] = useState<TileWindow>('24h');
  const period = options.some((option) => option.value === chosen)
    ? chosen
    : '24h';
  const choice = (
    <SegmentChoice
      label="Окно сроков"
      options={options}
      value={period}
      onChange={setChosen}
    />
  );
  const links = (
    <>
      {permissions.has('delivery.create') && (
        <ButtonLink variant="secondary" to={path('/warehouse/delivery')}>
          Принять поставку
        </ButtonLink>
      )}
      <TileLink to={path('/warehouse')}>Все партии и остатки</TileLink>
    </>
  );
  return period === '24h' ? (
    <BatchWindow choice={choice} links={links} timeZone={timeZone} />
  ) : (
    <ReportWindow
      hours={windowHours[period]}
      choice={choice}
      links={links}
      timeZone={timeZone}
    />
  );
}

function StopListPart({
  timeZone,
  divided,
}: {
  timeZone: string | undefined;
  divided: boolean;
}) {
  const data = useRestaurantData();
  const model = data.stopList();
  const read = useReadModel(model);
  const products = useReadModel(data.servingProducts()).value;
  const value = read.value;
  const view =
    value === undefined
      ? undefined
      : stopTile(value.result, productMap(products?.result.items ?? []));
  return (
    <Stack
      gap="3"
      pb={divided ? '4' : '0'}
      borderBottomWidth={divided ? '1px' : '0'}
      borderColor="border.default"
    >
      <SubHeading
        title="Стоп-лист"
        stamp={
          value === undefined
            ? undefined
            : tileStamp(
                value.result.evaluatedAt.epochMs,
                timeZone ?? value.context.settings.timeZone,
              )
        }
      />
      {view === undefined ? (
        <TileState
          reads={[read]}
          onRetry={() => {
            model.refresh();
          }}
        />
      ) : (
        <>
          <Text textStyle="body.strong">{view.unavailable}</Text>
          {view.dishes.map((dish) => (
            <Stack key={dish.dishID} gap="0.5">
              <Text textStyle="body.default">{dish.name}</Text>
              {dish.reasons.map((reason) => (
                <Text
                  key={reason}
                  textStyle="caption.default"
                  color="text.secondary"
                >
                  {reason}
                </Text>
              ))}
            </Stack>
          ))}
        </>
      )}
    </Stack>
  );
}

function RecommendationPart({ timeZone }: { timeZone: string | undefined }) {
  const model = useRestaurantData().recommendations();
  const read = useReadModel(model);
  const value = read.value;
  const zone = timeZone ?? value?.context.settings.timeZone;
  const view =
    value === undefined || zone === undefined
      ? undefined
      : recommendationTile(value.result, zone);
  return (
    <Stack gap="2">
      <SubHeading
        title="Рекомендуем продать"
        stamp={
          value === undefined || zone === undefined
            ? undefined
            : tileStamp(value.result.evaluatedAt.epochMs, zone)
        }
      />
      {value === undefined ? (
        <TileState
          reads={[read]}
          onRetry={() => {
            model.refresh();
          }}
        />
      ) : view === undefined ? (
        <Text textStyle="body.strong">Рекомендаций нет</Text>
      ) : (
        <>
          <Text textStyle="body.strong">{view.title}</Text>
          <Text textStyle="caption.default" color="text.secondary">
            {view.note}
          </Text>
          <Box>
            {view.reasons.map((row, index) => (
              <RowView key={row.key} row={row} first={index === 0} />
            ))}
          </Box>
        </>
      )}
    </Stack>
  );
}

// W03 puts the stamps beside the two subheadings, not in the tile header.
function MenuTile({ permissions, timeZone }: TileProps) {
  const path = useRestaurantPath();
  const menu = permissions.has('menu.read');
  const recommendations = permissions.has('recommendations.read');
  return (
    <Tile
      icon={menuIcon}
      title="Меню и рекомендации"
      links={
        <>
          {menu && <TileLink to={path('/menu')}>Меню и стоп-лист</TileLink>}
          {recommendations && (
            <TileLink to={path('/menu')}>Все рекомендации</TileLink>
          )}
        </>
      }
    >
      {menu && <StopListPart timeZone={timeZone} divided={recommendations} />}
      {recommendations && <RecommendationPart timeZone={timeZone} />}
    </Tile>
  );
}

// Overview 43:1829: an order attempt of this tab whose outcome is open.
function OrderAttempt({ flow }: { flow: OrderFlow }) {
  const path = useRestaurantPath();
  const { phase } = useStore(flow);
  if (!attemptOpen(phase)) return null;
  return (
    <FormMessage
      tone="unknown"
      title="Результат оформления неизвестен"
      action={
        <ButtonLink variant="secondary" to={path('/orders')}>
          Открыть заказ
        </ButtonLink>
      }
    />
  );
}

// W03 «Заказы»; «История продаж» is the warehouse history (stock.read).
function OrdersTile({ permissions }: TileProps) {
  const path = useRestaurantPath();
  const { restaurantID } = useParams();
  const { orderFlow } = useServices();
  const flow = restaurantID === undefined ? undefined : orderFlow(restaurantID);
  return (
    <Tile
      icon={ordersIcon}
      title="Заказы"
      links={
        permissions.has('stock.read') ? (
          <TileLink to={path('/warehouse/history')}>История продаж</TileLink>
        ) : undefined
      }
    >
      {flow !== undefined && <OrderAttempt flow={flow} />}
      <Text textStyle="body.default">
        Сформируйте список позиций, проверьте корректность предложения и
        подтвердите финальную комплектацию.
      </Text>
      <Stack as="ol" gap="1.5" listStyleType="none">
        {[
          'Состав: блюда и целые порции в нужном порядке',
          'Предложение: что принято, что сокращено и почему',
          'Подтверждение: заказ оформлен только по ответу сервера',
        ].map((step, index) => (
          <Flex as="li" key={step} gap="3" align="center">
            <Text
              as="span"
              display="inline-flex"
              alignItems="center"
              justifyContent="center"
              boxSize="6"
              flexShrink="0"
              bg="bg.actionSubtle"
              color="text.action"
              borderRadius="sm"
              textStyle="caption.strong"
            >
              {index + 1}
            </Text>
            <Text as="span" textStyle="body.default">
              {step}
            </Text>
          </Flex>
        ))}
      </Stack>
      <Text textStyle="caption.default" color="text.secondary">
        Подготовка не резервирует остатки.
      </Text>
    </Tile>
  );
}

function CatalogTile({ permissions, timeZone }: TileProps) {
  const path = useRestaurantPath();
  const data = useRestaurantData();
  const productsModel = data.products();
  const dishesModel = data.dishCatalog();
  const products = useReadModel(productsModel);
  const dishes = useReadModel(dishesModel);
  const productsValue = products.value;
  const dishesValue = dishes.value;
  return (
    <Tile
      icon={catalogIcon}
      title="Справочники"
      stamp={
        productsValue === undefined
          ? undefined
          : tileStamp(
              productsValue.context.evaluatedAt.epochMs,
              timeZone ?? productsValue.context.settings.timeZone,
            )
      }
      links={
        permissions.has('catalog.write') ? (
          <>
            <TileLink to={path('/catalog/products/new')}>
              Добавить продукт
            </TileLink>
            <TileLink to={path('/catalog/dishes/new')}>
              Определить блюдо
            </TileLink>
          </>
        ) : undefined
      }
    >
      {productsValue === undefined || dishesValue === undefined ? (
        <TileState
          reads={[products, dishes]}
          onRetry={() => {
            productsModel.refresh();
            dishesModel.refresh();
          }}
        />
      ) : (
        <>
          <Figures
            figures={catalogFigures(productsValue.result, dishesValue.result)}
          />
          <Text textStyle="caption.default" color="text.secondary">
            Блюда из стоп-листа по-прежнему отображаются в общем каталоге.
          </Text>
        </>
      )}
    </Tile>
  );
}

function WriteoffTile({ timeZone }: TileProps) {
  const path = useRestaurantPath();
  const model = useRestaurantData().pendingWriteoffs();
  const read = useReadModel(model);
  const value = read.value;
  return (
    <Tile
      icon={clockIcon}
      title="Под списание"
      stamp={
        value === undefined
          ? undefined
          : tileStamp(
              value.context.evaluatedAt.epochMs,
              timeZone ?? value.context.settings.timeZone,
            )
      }
      links={
        <TileLink to={path('/warehouse/expiry')}>Перейти к списанию</TileLink>
      }
    >
      {value === undefined ? (
        <TileState
          reads={[read]}
          onRetry={() => {
            model.refresh();
          }}
        />
      ) : (
        <>
          <Figures figures={writeoffFigures(value.result)} />
          <Text textStyle="caption.default" color="text.secondary">
            Срок годности истёк. Партии не используются в заказах и остаются на
            складе до подтверждения списания.
          </Text>
        </>
      )}
    </Tile>
  );
}

function AnalyticsTile({ timeZone }: TileProps) {
  const path = useRestaurantPath();
  const data = useRestaurantData();
  const inventoryModel = data.inventory();
  const expiringModel = data.expiringBatches();
  const pendingModel = data.pendingWriteoffs();
  const inventory = useReadModel(inventoryModel);
  const expiring = useReadModel(expiringModel);
  const pending = useReadModel(pendingModel);
  const inventoryValue = inventory.value;
  const expiringValue = expiring.value;
  const pendingValue = pending.value;
  return (
    <Tile
      icon={analyticsIcon}
      title="Аналитика"
      stamp={
        inventoryValue === undefined
          ? undefined
          : tileStamp(
              inventoryValue.context.evaluatedAt.epochMs,
              timeZone ?? inventoryValue.context.settings.timeZone,
            )
      }
      links={<TileLink to={path('/analytics')}>Открыть аналитику</TileLink>}
    >
      {inventoryValue === undefined ||
      expiringValue === undefined ||
      pendingValue === undefined ? (
        <TileState
          reads={[inventory, expiring, pending]}
          onRetry={() => {
            inventoryModel.refresh();
            expiringModel.refresh();
            pendingModel.refresh();
          }}
        />
      ) : (
        <>
          <Figures
            figures={analyticsFigures(
              inventoryValue.result,
              expiringValue.result,
              pendingValue.result,
            )}
          />
          <Text textStyle="caption.default" color="text.secondary">
            Склад сейчас и движения за выбранный период по каждому продукту:
            приход, расход на блюда, списано.
          </Text>
        </>
      )}
    </Tile>
  );
}

// Spec 9: the tiles a role's permissions open (W01–W03); two columns from
// 1201, one below. Every tile reads, loads and fails on its own.
export function OverviewTiles({ permissions, timeZone }: TileProps) {
  const can = (permission: Permission) => permissions.has(permission);
  const props = { permissions, timeZone };
  return (
    <Grid
      templateColumns={{
        base: 'minmax(0, 1fr)',
        xl: 'repeat(2, minmax(0, 1fr))',
      }}
      gap="6"
    >
      {can('stock.read') && <WarehouseTile {...props} />}
      {(can('menu.read') || can('recommendations.read')) && (
        <MenuTile {...props} />
      )}
      {can('order.prepare') && <OrdersTile {...props} />}
      {can('catalog.read') && <CatalogTile {...props} />}
      {can('stock.read') && <WriteoffTile {...props} />}
      {can('analytics.read') && <AnalyticsTile {...props} />}
    </Grid>
  );
}
