import { Box, Flex, Stack, Text } from '@chakra-ui/react';
import { useState, type ReactNode } from 'react';
import type { ScreenFailure } from '@/application/failure';
import type { ReadModelSnapshot } from '@/application/read-model';
import type {
  Menu,
  Product,
  Recommendations as RecommendationsResult,
  StopList as StopListResult,
} from '@/application/restaurant';
import type { Draft } from '@/domain/order-draft';
import { ReadFailure } from '@/presentation/app-shell/read-failure';
import checkIcon from '@/presentation/assets/icons/check-24.svg';
import plusIcon from '@/presentation/assets/icons/plus-24.svg';
import {
  useReadModel,
  useRestaurantData,
  useRestaurantRead,
} from '@/presentation/session/hooks';
import { Button } from '@/presentation/ui/actions';
import { Badge } from '@/presentation/ui/badge';
import { ListCard } from '@/presentation/ui/card';
import { EvaluationStamp } from '@/presentation/ui/evaluation-stamp';
import { FormMessage } from '@/presentation/ui/form-message';
import { Icon, MaskIcon } from '@/presentation/ui/icon';
import { Tabs } from '@/presentation/ui/tabs';
import { formatStamp } from '@/presentation/ui/zones';
import {
  evaluationText,
  menuRows,
  productMap,
  recommendationRows,
  stopRows,
} from './order-rows';

const SHOWN_RECOMMENDATIONS = 4;
const SECTION = 'Новый заказ';

const rowStyles = {
  px: '4',
  py: '3',
  borderBottomWidth: '1px',
  borderColor: 'border.default',
  _last: { borderBottomWidth: '0' },
} as const;

interface Read<T> {
  readonly snapshot: ReadModelSnapshot<{ readonly result: T }>;
  readonly failure: ScreenFailure | undefined;
}

// «…» while the first read is on its way, «—» when it was refused.
function tabTitle<T>(
  name: string,
  read: Read<T>,
  count: (result: T) => number,
): string {
  const value = read.snapshot.value;
  if (value !== undefined) return `${name} · ${String(count(value.result))}`;
  return `${name} · ${read.failure === undefined ? '…' : '—'}`;
}

// Figma E01: placeholder rows while the first read is on its way.
function LoadingRows() {
  return (
    <ListCard p="0">
      <Box as="li" aria-hidden="true" {...rowStyles} minH="16" />
      <Box as="li" aria-hidden="true" {...rowStyles} minH="16" />
      <Box as="li" aria-hidden="true" {...rowStyles} minH="16" />
      <Box as="li" {...rowStyles}>
        <Text textStyle="caption.default" color="text.secondary" role="status">
          Получаем новую оценку…
        </Text>
      </Box>
    </ListCard>
  );
}

// One tab panel: the value, the refused read or the rows still loading.
function ReadPanel<T>({
  read,
  failureTitle,
  failureText,
  onRetry,
  children,
}: {
  read: Read<T>;
  failureTitle: string;
  failureText: string;
  onRetry: () => void;
  children: (result: T) => ReactNode;
}) {
  const value = read.snapshot.value;
  if (value !== undefined) return <>{children(value.result)}</>;
  if (read.failure !== undefined) {
    return (
      <ReadFailure
        failure={read.failure}
        section={SECTION}
        title={failureTitle}
        onRetry={onRetry}
      >
        {failureText}
      </ReadFailure>
    );
  }
  return <LoadingRows />;
}

// Figma «Добавить»: a 40px secondary button with a teal plus.
function AddButton({
  dish,
  canAdd,
  onAdd,
}: {
  dish: { dishID: string; name: string };
  canAdd: boolean;
  onAdd: (dishID: string) => void;
}) {
  return (
    <Button
      variant="secondary"
      px="calc({spacing.3} - 1px)"
      py="calc({spacing.2} - 1px)"
      aria-label={`Добавить: ${dish.name}`}
      disabled={!canAdd}
      onClick={() => {
        onAdd(dish.dishID);
      }}
    >
      <MaskIcon src={plusIcon} size={20} />
      Добавить
    </Button>
  );
}

function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: string;
  action?: ReactNode;
}) {
  return (
    <FormMessage tone="info" title={title} action={action}>
      {children}
    </FormMessage>
  );
}

// Figma E03 «Стоп-лист» rows, also shown under an empty menu search (E10).
function StopRows({ rows }: { rows: ReturnType<typeof stopRows> }) {
  return (
    <ListCard p="0">
      {rows.map((item) => (
        <Flex
          as="li"
          key={item.dishID}
          align="flex-start"
          justify="space-between"
          gap="4"
          {...rowStyles}
        >
          <Stack gap="1" minW="0">
            <Text textStyle="body.default">{item.name}</Text>
            {item.reasons.map((reason) => (
              <Text
                key={reason}
                textStyle="caption.default"
                color="text.secondary"
              >
                {reason}
              </Text>
            ))}
          </Stack>
          <Badge tone="error">Недоступно</Badge>
        </Flex>
      ))}
    </ListCard>
  );
}

// Figma 01/02 «Меню»: «Добавить» puts the dish into the draft of the flow.
function MenuList({
  menu,
  stopList,
  products,
  draft,
  query,
  canAdd,
  onAdd,
  onOpenStopList,
}: {
  menu: Menu;
  stopList: StopListResult | undefined;
  products: ReadonlyMap<string, Product>;
  draft: Draft;
  query: string;
  canAdd: boolean;
  onAdd: (dishID: string) => void;
  onOpenStopList: () => void;
}) {
  if (menu.dishes.length === 0) {
    return (
      <Empty
        title="Нет блюд, доступных хотя бы для одной порции"
        action={
          <Button variant="secondary" onClick={onOpenStopList}>
            Открыть стоп-лист
          </Button>
        }
      >
        Причины недоступности — в стоп-листе. Пополнить остатки можно приёмом
        поставки.
      </Empty>
    );
  }
  const rows = menuRows(menu, draft, query);
  if (rows.length === 0) {
    const found =
      stopList === undefined ? [] : stopRows(stopList, products, query);
    return (
      <Stack gap="4">
        <Empty title="В меню ничего не найдено">
          {`По запросу «${query.trim()}» нет доступных блюд. Проверьте написание или очистите поиск.`}
        </Empty>
        {found.length > 0 && (
          <Stack gap="2">
            <Text textStyle="caption.strong" color="text.secondary">
              Найдено в стоп-листе — добавить нельзя
            </Text>
            <StopRows rows={found} />
          </Stack>
        )}
      </Stack>
    );
  }
  return (
    <ListCard p="0">
      {rows.map((item) => (
        <Flex
          as="li"
          key={item.dishID}
          align="center"
          justify="space-between"
          gap="4"
          minH="16"
          {...rowStyles}
        >
          <Stack gap="0.5" minW="0">
            <Text textStyle="body.default">{item.name}</Text>
            {item.inDraft !== undefined && (
              <Flex
                align="center"
                gap="1"
                textStyle="caption.default"
                color="text.action"
              >
                <Icon src={checkIcon} size={16} />
                {item.inDraft}
              </Flex>
            )}
          </Stack>
          <AddButton dish={item} canAdd={canAdd} onAdd={onAdd} />
        </Flex>
      ))}
    </ListCard>
  );
}

function StopListPanel({
  stopList,
  products,
  query,
}: {
  stopList: StopListResult;
  products: ReadonlyMap<string, Product>;
  query: string;
}) {
  if (stopList.dishes.length === 0) {
    return (
      <Empty title="Стоп-лист пуст">
        На момент оценки всем блюдам хватает ингредиентов хотя бы на одну
        порцию. Совместную доступность заказа проверяет подготовка.
      </Empty>
    );
  }
  return <StopRows rows={stopRows(stopList, products, query)} />;
}

// Figma E05 «Рекомендации для персонала».
function RecommendationsPanel({
  recommendations,
  timeZone,
  canAdd,
  onAdd,
}: {
  recommendations: RecommendationsResult;
  timeZone: string;
  canAdd: boolean;
  onAdd: (dishID: string) => void;
}) {
  const [all, setAll] = useState(false);
  const rows = recommendationRows(recommendations, timeZone);
  if (rows.length === 0) {
    return (
      <Empty title="Рекомендаций нет">
        Рекомендации строятся только по доступным блюдам, а сейчас нет блюд даже
        на одну порцию.
      </Empty>
    );
  }
  const shown = all ? rows : rows.slice(0, SHOWN_RECOMMENDATIONS);
  return (
    <ListCard p="0">
      {shown.map((item) => (
        <Flex
          as="li"
          key={item.dishID}
          align="flex-start"
          justify="space-between"
          gap="4"
          {...rowStyles}
          py="4"
        >
          <Stack gap="2" minW="0">
            <Stack gap="0.5">
              <Text textStyle="body.strong">{`${String(item.rank)}. ${item.name}`}</Text>
              <Text textStyle="caption.default" color="text.secondary">
                {item.nearest}
              </Text>
            </Stack>
            {item.reasons.map((reason) => (
              <Stack
                key={reason.title}
                gap="1"
                ps="3"
                py="0.5"
                borderStartWidth="2px"
                borderColor="text.secondary"
              >
                <Text textStyle="caption.strong">{reason.title}</Text>
                <Flex align="center" gap="2" wrap="wrap">
                  <Text textStyle="mono.default" color="text.secondary">
                    {reason.perPortion}
                  </Text>
                  <Badge tone="expiry">{reason.expires}</Badge>
                </Flex>
              </Stack>
            ))}
          </Stack>
          <AddButton
            dish={{ dishID: item.dishID, name: item.name }}
            canAdd={canAdd}
            onAdd={onAdd}
          />
        </Flex>
      ))}
      <Flex
        as="li"
        align="center"
        justify="space-between"
        wrap="wrap"
        columnGap="4"
        rowGap="1"
        px="4"
        py="3"
        bg="bg.canvas"
      >
        <Text
          flex="1"
          minW="0"
          textStyle="caption.default"
          color="text.secondary"
        >
          {`Показаны ${String(shown.length)} из ${String(rows.length)}. Ранжируются все доступные блюда — по ближайшему сроку используемых партий.`}
        </Text>
        {!all && rows.length > shown.length && (
          <Button
            variant="link"
            flexShrink="0"
            onClick={() => {
              setAll(true);
            }}
          >
            Показать все
          </Button>
        )}
      </Flex>
    </ListCard>
  );
}

// Figma 01, E03, E05: «Меню», «Стоп-лист», «Рекомендации» with the menu stamp
// beside the tabs. The tab panels follow the tab row in the page stack.
export function MenuTabs({
  draft,
  query,
  canAdd,
  onAdd,
  timeZone,
}: {
  draft: Draft;
  query: string;
  canAdd: boolean;
  onAdd: (dishID: string) => void;
  timeZone: string;
}) {
  const data = useRestaurantData();
  const menuModel = data.menu();
  const stopModel = data.stopList();
  const recommendationsModel = data.recommendations();
  const menu = useRestaurantRead(menuModel);
  const stop = useRestaurantRead(stopModel);
  const recommendations = useRestaurantRead(recommendationsModel);
  const productsRead = useReadModel(data.servingProducts());
  const [tab, setTab] = useState(0);
  const products = productMap(productsRead.value?.result.items ?? []);
  const refreshAll = () => {
    menuModel.refresh();
    stopModel.refresh();
    recommendationsModel.refresh();
  };
  const menuValue = menu.snapshot.value;
  // E06: the re-read failed while an earlier value is shown.
  const stale = menu.snapshot.failed && menuValue !== undefined;
  const stamp =
    menuValue === undefined ? undefined : (
      <EvaluationStamp
        text={
          stale
            ? `Устарело: оценка ${formatStamp(menuValue.result.evaluatedAt.epochMs, timeZone)}`
            : evaluationText(menuValue.result.evaluatedAt.epochMs, timeZone)
        }
        icon="narrow"
        onRefresh={refreshAll}
      />
    );
  return (
    <Tabs
      label="Меню"
      extra={stamp}
      value={tab}
      onValueChange={setTab}
      tabs={[
        {
          id: 'menu',
          title: tabTitle('Меню', menu, (result) => result.dishes.length),
          content: (
            <Stack gap="3">
              {stale && (
                <FormMessage
                  tone="error"
                  title="Данные не обновлены"
                  action={
                    <Button variant="secondary" onClick={refreshAll}>
                      Обновить ещё раз
                    </Button>
                  }
                >
                  {`Показана оценка ${formatStamp(menuValue.result.evaluatedAt.epochMs, timeZone)}. Не используйте её как актуальную: доступность всего заказа проверится при подготовке.`}
                </FormMessage>
              )}
              <ReadPanel
                read={menu}
                failureTitle="Не удалось получить меню"
                failureText="Склад сейчас не может подготовить остатки. Это не значит, что доступных блюд нет. Повторите чтение."
                onRetry={refreshAll}
              >
                {(result) => (
                  <MenuList
                    menu={result}
                    stopList={stop.snapshot.value?.result}
                    products={products}
                    draft={draft}
                    query={query}
                    canAdd={canAdd}
                    onAdd={onAdd}
                    onOpenStopList={() => {
                      setTab(1);
                    }}
                  />
                )}
              </ReadPanel>
            </Stack>
          ),
        },
        {
          id: 'stop',
          title: tabTitle('Стоп-лист', stop, (result) => result.dishes.length),
          content: (
            <ReadPanel
              read={stop}
              failureTitle="Не удалось получить стоп-лист"
              failureText="Это техническая ошибка, а не пустой стоп-лист: недоступные блюда сейчас не показаны. Повторите чтение."
              onRetry={() => {
                stopModel.refresh();
              }}
            >
              {(result) => (
                <StopListPanel
                  stopList={result}
                  products={products}
                  query={query}
                />
              )}
            </ReadPanel>
          ),
        },
        {
          id: 'recommended',
          title: tabTitle(
            'Рекомендации',
            recommendations,
            (result) => result.items.length,
          ),
          content: (
            <ReadPanel
              read={recommendations}
              failureTitle="Не удалось получить рекомендации"
              failureText="Это техническая ошибка, а не пустой список. Повторите чтение."
              onRetry={() => {
                recommendationsModel.refresh();
              }}
            >
              {(result) => (
                <RecommendationsPanel
                  recommendations={result}
                  timeZone={timeZone}
                  canAdd={canAdd}
                  onAdd={onAdd}
                />
              )}
            </ReadPanel>
          ),
        },
      ]}
    />
  );
}
