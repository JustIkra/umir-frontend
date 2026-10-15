import { Flex, Stack, Text } from '@chakra-ui/react';
import { useState } from 'react';
import type { HistoryRecord } from '@/application/warehouse';
import { formatQuantity, formatThousandths } from '@/domain/quantity';
import { useReadModel, useRestaurantData } from '@/presentation/session/hooks';
import { Button } from '@/presentation/ui/actions';
import { Badge } from '@/presentation/ui/badge';
import { ListCard } from '@/presentation/ui/card';
import { SegmentChoice } from '@/presentation/ui/segment-choice';
import { formatStamp } from '@/presentation/ui/zones';
import { WarehouseLayout } from './warehouse-layout';
import { WarehouseRead, warehouseStamp } from './warehouse-read';
import { AllocationFacts } from './recorded-allocations';

const label = (fact: HistoryRecord['fact']): string => {
  switch (fact.kind) {
    case 'product':
      return `Добавлен продукт «${fact.name}»`;
    case 'dish':
      return `Добавлено блюдо «${fact.name}»`;
    case 'receipt':
      return `Поставка № ${fact.number} · ${String(fact.batches.length)} партий`;
    case 'sale':
      return `Заказ ${fact.order.orderID}`;
    case 'pending':
      return `Партия ${fact.batchID} ожидает списания`;
    case 'writeoff':
      return `Подтверждено списание партии ${fact.batchID}: ${fact.baseUnit === undefined ? formatThousandths(fact.quantity) : formatQuantity(fact.quantity, fact.baseUnit)}`;
  }
};
type Filter = 'all' | 'receipt' | 'sale' | 'writeoff';
export function HistoryPage() {
  const data = useRestaurantData();
  const model = data.history();
  const snapshot = useReadModel(model);
  const [filter, setFilter] = useState<Filter>('all');
  const [count, setCount] = useState(20);
  const [open, setOpen] = useState<readonly string[]>([]);
  return (
    <WarehouseLayout
      onRefresh={() => {
        model.refresh();
      }}
      section="История"
      stamp={warehouseStamp(snapshot.value?.context)}
    >
      <Flex gap="3" wrap="wrap" justify="space-between">
        <SegmentChoice
          label="Тип событий"
          options={[
            { value: 'all', title: 'Все' },
            { value: 'receipt', title: 'Поступления' },
            { value: 'sale', title: 'Продажи' },
            { value: 'writeoff', title: 'Списания' },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <Button
          variant="secondary"
          onClick={() => {
            model.refresh();
          }}
        >
          Обновить
        </Button>
      </Flex>
      <WarehouseRead model={model} title="Не удалось получить историю">
        {(value) => {
          const events = value.result.events
            .filter(
              (v) =>
                filter === 'all' ||
                v.fact.kind === filter ||
                (filter === 'writeoff' && v.fact.kind === 'pending'),
            )
            .toReversed();
          return (
            <Stack gap="3">
              {events.length === 0 ? (
                <Text color="text.secondary">
                  В текущей истории таких событий нет.
                </Text>
              ) : (
                <ListCard p="0">
                  {events.slice(0, count).map((event, index) => (
                    <Stack
                      as="li"
                      key={event.eventID}
                      p="4"
                      gap="2"
                      borderTopWidth={index === 0 ? '0' : '1px'}
                      borderColor="border.default"
                    >
                      <Flex wrap="wrap" gap="2" justify="space-between">
                        <Badge
                          tone={
                            event.fact.kind === 'receipt'
                              ? 'success'
                              : 'neutral'
                          }
                        >
                          #{event.sequence}
                        </Badge>
                        <Text
                          textStyle="caption.default"
                          color="text.secondary"
                        >
                          {formatStamp(
                            event.recordedAt.epochMs,
                            value.context.settings.timeZone,
                          )}
                        </Text>
                      </Flex>
                      <Text textStyle="body.strong" overflowWrap="anywhere">
                        {label(event.fact)}
                      </Text>
                      {event.fact.kind === 'sale' && (
                        <>
                          <Button
                            variant="link"
                            alignSelf="flex-start"
                            aria-expanded={open.includes(event.eventID)}
                            onClick={() => {
                              setOpen((v) =>
                                v.includes(event.eventID)
                                  ? v.filter((id) => id !== event.eventID)
                                  : [...v, event.eventID],
                              );
                            }}
                          >
                            Фактические партии заказа
                          </Button>
                          {open.includes(event.eventID) && (
                            <AllocationFacts
                              order={event.fact.order}
                              warehouseEpoch={value.context.runtimeEpoch}
                              timeZone={value.context.settings.timeZone}
                            />
                          )}
                        </>
                      )}
                    </Stack>
                  ))}
                </ListCard>
              )}
              {events.length > count && (
                <Button
                  variant="secondary"
                  alignSelf="flex-start"
                  onClick={() => {
                    setCount((v) => v + 20);
                  }}
                >
                  Показать ранние
                </Button>
              )}
            </Stack>
          );
        }}
      </WarehouseRead>
    </WarehouseLayout>
  );
}
