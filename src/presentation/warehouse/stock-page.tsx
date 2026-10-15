import { Flex, Grid, Stack, Text, chakra } from '@chakra-ui/react';
import { Fragment, useId, useState } from 'react';
import type { BaseUnit } from '@/domain/quantity';
import { formatQuantity } from '@/domain/quantity';
import chevronIcon from '@/presentation/assets/icons/chevron-right-24.svg';
import { useReadModel, useRestaurantData } from '@/presentation/session/hooks';
import { formatStamp } from '@/presentation/ui/zones';
import { SearchInput } from '@/presentation/ui/form';
import { Badge } from '@/presentation/ui/badge';
import { Icon } from '@/presentation/ui/icon';
import {
  MobileCellLabel,
  DataTable,
  TableCard,
  Td,
  Th,
} from '@/presentation/ui/table';
import { rem } from '@/presentation/ui/units';
import { WarehouseLayout } from './warehouse-layout';
import { WarehouseRead, warehouseStamp } from './warehouse-read';
import { SupplyPanel } from './supply-panel';
import { remainingTime } from './warehouse-time';

function ProductBatches({
  productID,
  unit,
  epoch,
}: {
  productID: string;
  unit: BaseUnit;
  epoch: string;
}) {
  const data = useRestaurantData();
  return (
    <Stack p="4" ps={{ sm: '12' }} gap="3">
      <WarehouseRead
        model={data.productBatches(productID)}
        title="Не удалось получить партии"
      >
        {(value) =>
          value.context.runtimeEpoch !== epoch ||
          value.result.items.some((row) => row.baseUnit !== unit) ? (
            <Text color="text.secondary">
              Данные склада изменились. Обновляем остатки перед показом партий.
            </Text>
          ) : (
            <>
              <Text textStyle="caption.default" color="text.secondary">
                {warehouseStamp(value.context)} · Порядок FEFO
              </Text>
              {value.result.items.length === 0 ? (
                <Text color="text.secondary">
                  Партий с положительным остатком нет.
                </Text>
              ) : (
                value.result.items.map(({ batch, status }, i) => (
                  <Grid
                    key={batch.batchID}
                    gridTemplateColumns={{
                      base: '1fr auto',
                      sm: `minmax(${rem(100)}, 1fr) auto 2fr`,
                    }}
                    gap="3"
                    py="3"
                    borderTopWidth={i === 0 ? '0' : '1px'}
                    borderColor="border.default"
                    alignItems="start"
                  >
                    <Text
                      textStyle="mono.default"
                      color="text.secondary"
                      overflowWrap="anywhere"
                    >
                      Партия {batch.batchID}
                    </Text>
                    <Text textStyle="mono.body" overflowWrap="anywhere">
                      {formatQuantity(batch.remainingQuantity, unit)}
                    </Text>
                    <Stack gridColumn={{ base: '1 / -1', sm: 'auto' }} gap="1">
                      <Flex gap="2" wrap="wrap" align="center">
                        <Text>
                          Годна до{' '}
                          {formatStamp(
                            batch.expiresAt.epochMs,
                            value.context.settings.timeZone,
                          )}
                        </Text>
                        <Badge tone="expiry">
                          {status === 'pending_writeoff'
                            ? 'Ожидает списания'
                            : remainingTime(
                                batch.expiresAt.epochMs,
                                value.context.evaluatedAt.epochMs,
                              )}
                        </Badge>
                      </Flex>
                      <Text textStyle="caption.default" color="text.secondary">
                        Поступила{' '}
                        {formatStamp(
                          batch.receivedAt.epochMs,
                          value.context.settings.timeZone,
                        )}{' '}
                        · поставка {batch.deliveryID}, строка {batch.lineNo}
                      </Text>
                    </Stack>
                  </Grid>
                ))
              )}
            </>
          )
        }
      </WarehouseRead>
    </Stack>
  );
}

export function StockPage() {
  const data = useRestaurantData();
  const model = data.inventory();
  const snapshot = useReadModel(model);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<readonly string[]>([]);
  const base = useId();
  const toggle = (id: string) => {
    setOpen((value) =>
      value.includes(id) ? value.filter((v) => v !== id) : [...value, id],
    );
  };
  return (
    <WarehouseLayout
      section="Остатки"
      stamp={warehouseStamp(snapshot.value?.context)}
    >
      <SearchInput
        label="Найти продукт по названию или коду"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      <WarehouseRead model={model} title="Не удалось получить остатки">
        {(value) => {
          const search = query.trim().toLocaleLowerCase('ru-RU');
          const rows = value.result.items.filter((row) =>
            `${row.name} ${row.productID}`
              .toLocaleLowerCase('ru-RU')
              .includes(search),
          );
          return rows.length === 0 ? (
            <Text color="text.secondary">
              {value.result.items.length === 0
                ? 'Продуктов пока нет. Добавьте продукты в справочнике и примите поставку.'
                : 'По запросу продуктов нет.'}
            </Text>
          ) : (
            <TableCard>
              <DataTable mobile="cards">
                <chakra.thead>
                  <tr>
                    <Th>Продукт</Th>
                    <Th textAlign="end">Пригодный остаток</Th>
                    <Th>Ожидает списания</Th>
                    <Th>Код</Th>
                  </tr>
                </chakra.thead>
                <tbody>
                  {rows.map((row, index) => {
                    const expanded = open.includes(row.productID);
                    const id = `${base}-${String(index)}`;
                    return (
                      <Fragment key={row.productID}>
                        <chakra.tr
                          bg={expanded ? 'bg.subtle' : undefined}
                          gridTemplateAreas="'product product' 'quantity pending' 'code code'"
                          gridTemplateColumns="minmax(0, 1fr) minmax(0, 1fr)"
                        >
                          <Td gridArea="product">
                            <chakra.button
                              type="button"
                              display="flex"
                              alignItems="center"
                              gap="2"
                              textStyle="body.strong"
                              textAlign="start"
                              cursor="pointer"
                              aria-expanded={expanded}
                              aria-controls={id}
                              onClick={() => {
                                toggle(row.productID);
                              }}
                            >
                              <Icon
                                src={chevronIcon}
                                size={24}
                                transform={
                                  expanded ? 'rotate(90deg)' : undefined
                                }
                              />
                              <span>{row.name}</span>
                            </chakra.button>
                          </Td>
                          <Td
                            gridArea="quantity"
                            textStyle="mono.body"
                            textAlign={{ sm: 'end' }}
                            overflowWrap="anywhere"
                          >
                            <MobileCellLabel aria-hidden="true">
                              Пригодно
                            </MobileCellLabel>
                            {formatQuantity(
                              row.availableQuantity,
                              row.baseUnit,
                            )}
                          </Td>
                          <Td
                            gridArea="pending"
                            textStyle="mono.body"
                            overflowWrap="anywhere"
                            color={
                              row.pendingWriteoffQuantity === '0'
                                ? 'text.secondary'
                                : 'text.primary'
                            }
                          >
                            <MobileCellLabel aria-hidden="true">
                              К списанию
                            </MobileCellLabel>
                            {row.pendingWriteoffQuantity === '0'
                              ? '—'
                              : formatQuantity(
                                  row.pendingWriteoffQuantity,
                                  row.baseUnit,
                                )}
                          </Td>
                          <Td
                            gridArea="code"
                            textStyle="mono.default"
                            color="text.secondary"
                            overflowWrap="anywhere"
                          >
                            {row.productID}
                          </Td>
                        </chakra.tr>
                        {expanded && (
                          <tr id={id}>
                            <Td colSpan={4} p="0">
                              <ProductBatches
                                productID={row.productID}
                                unit={row.baseUnit}
                                epoch={value.context.runtimeEpoch}
                              />
                            </Td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </DataTable>
            </TableCard>
          );
        }}
      </WarehouseRead>
      <SupplyPanel />
    </WarehouseLayout>
  );
}
