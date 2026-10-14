import { Skeleton, Text, chakra } from '@chakra-ui/react';
import { useState, type ReactNode } from 'react';
import type { ScreenFailure } from '@/application/failure';
import { ReadFailure } from '@/presentation/app-shell/read-failure';
import { useRestaurantPath } from '@/presentation/app-shell/paths';
import warehouseIcon from '@/presentation/assets/icons/warehouse-24.svg';
import {
  usePermissions,
  useRestaurantData,
  useRestaurantRead,
} from '@/presentation/session/hooks';
import { Button, ButtonLink } from '@/presentation/ui/actions';
import { SearchInput } from '@/presentation/ui/form';
import { FormMessage } from '@/presentation/ui/form-message';
import { StateCard } from '@/presentation/ui/states';
import { DataTable, TableCard, Td, Th } from '@/presentation/ui/table';
import { rem } from '@/presentation/ui/units';
import { formatStamp } from '@/presentation/ui/zones';
import { noMatchText, stockRows, stockStamp } from './stock-rows';
import { WarehouseLayout } from './warehouse-layout';

// The quantity columns; on 390 they are the areas of the card.
const columns = [
  { key: 'available', title: 'Доступно', width: 128 },
  { key: 'pending', title: 'Ожидает списания', width: 152 },
  { key: 'onHand', title: 'В наличии', width: 128 },
  { key: 'expiring', title: 'Истекает за 48 ч', width: 152 },
] as const;

// A quantity cell; on 390 the card repeats the column head above the value.
function AmountCell({
  area,
  label,
  value,
}: {
  area: string;
  label: string;
  value: string;
}) {
  return (
    <Td gridArea={area} textAlign={{ sm: 'end' }} whiteSpace="nowrap">
      <Text
        as="span"
        display={{ base: 'block', sm: 'none' }}
        textStyle="caption.default"
        color="text.secondary"
      >
        {label}
      </Text>
      <Text as="span" textStyle="mono.body">
        {value}
      </Text>
    </Td>
  );
}

const failedText =
  'Склад сейчас не ответил. Это не пустой склад: повторите чтение.';

// S6 with «Повторить»; the access states and the session check of a refused
// read come from ReadFailure.
function StockFailure({
  failure,
  onRetry,
}: {
  failure: ScreenFailure;
  onRetry: () => void;
}) {
  if (failure.kind === 'unavailable' || failure.kind === 'error') {
    return (
      <FormMessage
        tone="error"
        title="Не удалось получить остатки"
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
      title="Не удалось получить остатки"
      onRetry={onRetry}
    >
      {failedText}
    </ReadFailure>
  );
}

// Figma S1 «Остатки» on StockRow: no batches and no nearest date (spec 5).
// S5 skeleton, S6 failure, S7 empty, S8 an older read with a failed re-read.
export function StockPage() {
  const path = useRestaurantPath();
  const data = useRestaurantData();
  const model = data.inventory();
  const { snapshot, failure } = useRestaurantRead(model);
  const canDeliver = usePermissions().has('delivery.create');
  const [query, setQuery] = useState('');
  const value = snapshot.value;
  const refresh = () => {
    model.refresh();
  };
  const page = (children: ReactNode) => (
    <WarehouseLayout
      section="Остатки"
      stamp={
        value === undefined
          ? 'Получаем новую оценку…'
          : stockStamp(
              value.context.evaluatedAt.epochMs,
              value.context.settings.timeZone,
            )
      }
      onRefresh={refresh}
    >
      {children}
    </WarehouseLayout>
  );
  if (value === undefined && failure !== undefined) {
    return page(<StockFailure failure={failure} onRetry={refresh} />);
  }
  if (value?.result.items.length === 0) {
    return page(
      <StateCard
        icon={warehouseIcon}
        title="Остатков нет"
        tile="action"
        actions={
          canDeliver ? (
            <ButtonLink to={path('/warehouse/delivery')}>
              Принять поставку
            </ButtonLink>
          ) : undefined
        }
      >
        На складе нет продуктов с остатком. Примите поставку, чтобы появились
        партии.
      </StateCard>,
    );
  }
  const rows = value === undefined ? [] : stockRows(value.result, query);
  return page(
    <>
      {value !== undefined && failure !== undefined && (
        <FormMessage
          tone="unknown"
          title={`Показаны остатки на ${formatStamp(
            value.context.evaluatedAt.epochMs,
            value.context.settings.timeZone,
          )}.`}
          action={
            <Button variant="secondary" onClick={refresh}>
              Повторить
            </Button>
          }
        >
          Новая оценка не получена — значения могут быть устаревшими.
        </FormMessage>
      )}
      <SearchInput
        label="Найти продукт"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      <TableCard>
        <DataTable mobile="cards">
          <chakra.thead>
            <tr>
              <Th>Продукт</Th>
              {columns.map((column) => (
                <Th
                  key={column.key}
                  w={rem(column.width)}
                  textAlign="end"
                  whiteSpace="nowrap"
                >
                  {column.title}
                </Th>
              ))}
            </tr>
          </chakra.thead>
          <tbody>
            {value === undefined &&
              Array.from({ length: 6 }, (_, index) => (
                <tr key={index} aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((cell) => (
                    <Td key={cell}>
                      <Skeleton h="5" w="full" />
                    </Td>
                  ))}
                </tr>
              ))}
            {value !== undefined && rows.length === 0 && (
              <tr>
                <Td colSpan={5}>
                  <Text textStyle="body.strong">Ничего не найдено</Text>
                  <Text textStyle="caption.default" color="text.secondary">
                    {noMatchText(query)}
                  </Text>
                </Td>
              </tr>
            )}
            {rows.map((row) => (
              <chakra.tr
                key={row.productID}
                gridTemplateAreas="'name name' 'available pending' 'onHand expiring'"
                gridTemplateColumns="1fr 1fr"
              >
                <Td gridArea="name">
                  <Text textStyle="body.strong">{row.name}</Text>
                  {row.note !== undefined && (
                    <Text textStyle="caption.default" color="text.secondary">
                      {row.note}
                    </Text>
                  )}
                </Td>
                {columns.map((column) => (
                  <AmountCell
                    key={column.key}
                    area={column.key}
                    label={column.title}
                    value={row[column.key]}
                  />
                ))}
              </chakra.tr>
            ))}
          </tbody>
        </DataTable>
      </TableCard>
    </>,
  );
}
