import { Stack, Text, chakra } from '@chakra-ui/react';
import type { SupplyRow, SupplySuggestions } from '@/application/warehouse';
import { coverageRows, roundTenth, type CoverageRow } from '@/domain/analytics';
import { formatQuantity, unitShort } from '@/domain/quantity';
import { useRestaurantData } from '@/presentation/session/hooks';
import { days, displayDecimal } from '@/presentation/ui/decimals';
import { FormMessage } from '@/presentation/ui/form-message';
import { plural } from '@/presentation/ui/plural';
import {
  DataTable,
  MobileCellLabel,
  TableCard,
  Td,
  Th,
} from '@/presentation/ui/table';
import { WarehouseRead } from '@/presentation/warehouse/warehouse-read';
import { BarChart, type BarDetail, type BarRow } from './bar-chart';
import {
  ChartCard,
  ChartControls,
  useCardView,
  type CardView,
} from './chart-card';

const dishes = (count: number) =>
  `${String(count)} ${plural(count, 'блюдо', 'блюда', 'блюд')}`;
// The supply hint's own numbers, rounded to one place for reading.
const daily = (row: SupplyRow) =>
  `${displayDecimal(roundTenth(row.averageDailyBaseUnits))} ${unitShort(row.baseUnit)}`;
const cover = (row: SupplyRow) =>
  row.coverageDays === null
    ? 'Расхода нет'
    : days(roundTenth(row.coverageDays));

function details(row: SupplyRow): BarDetail[] {
  return [
    {
      value: formatQuantity(row.availableQuantity, row.baseUnit),
      label: 'можно использовать',
    },
    { value: daily(row), label: 'расход в день' },
    ...(row.coverageDays === null
      ? []
      : [{ value: cover(row), label: 'хватит' }]),
    ...(row.blockedDishIDs.length > 0
      ? [{ value: dishes(row.blockedDishIDs.length), label: 'в стоп-листе' }]
      : []),
  ];
}

function bar({ item, reason, fill }: CoverageRow<SupplyRow>): BarRow {
  return {
    id: item.productID,
    name: item.productName,
    figure:
      reason === 'blocking'
        ? `Держит в стоп-листе ${dishes(item.blockedDishIDs.length)}`
        : item.coverageDays === null
          ? 'Расхода нет'
          : `Хватит на ${cover(item)}`,
    segments:
      fill === undefined
        ? []
        : [
            {
              key: 'cover',
              color: reason === 'blocking' ? 'border.error' : 'bg.expiry',
              share: fill,
            },
          ],
    details: details(item),
  };
}

function SupplyTable({ rows }: { rows: readonly CoverageRow<SupplyRow>[] }) {
  return (
    <TableCard>
      <DataTable mobile="cards">
        <chakra.thead>
          <tr>
            <Th>Продукт</Th>
            <Th>Можно использовать</Th>
            <Th>Расход в день</Th>
            <Th>Хватит на</Th>
            <Th>Блюд в стоп-листе</Th>
          </tr>
        </chakra.thead>
        <tbody>
          {rows.map(({ item }) => (
            <chakra.tr
              key={item.productID}
              gridTemplateColumns="1fr 1fr"
              gridTemplateAreas="'product product' 'stock daily' 'cover blocked'"
            >
              <Td gridArea="product" textStyle="body.strong">
                {item.productName}
              </Td>
              <Td gridArea="stock" textStyle="numeric.body">
                <MobileCellLabel aria-hidden="true">
                  Можно использовать
                </MobileCellLabel>
                {formatQuantity(item.availableQuantity, item.baseUnit)}
              </Td>
              <Td gridArea="daily" textStyle="numeric.body">
                <MobileCellLabel aria-hidden="true">
                  Расход в день
                </MobileCellLabel>
                {daily(item)}
              </Td>
              <Td gridArea="cover" textStyle="numeric.body">
                <MobileCellLabel aria-hidden="true">Хватит на</MobileCellLabel>
                {cover(item)}
              </Td>
              <Td gridArea="blocked" textStyle="numeric.body">
                <MobileCellLabel aria-hidden="true">
                  Блюд в стоп-листе
                </MobileCellLabel>
                {String(item.blockedDishIDs.length)}
              </Td>
            </chakra.tr>
          ))}
        </tbody>
      </DataTable>
    </TableCard>
  );
}

function SupplyBody({
  supply,
  view,
  onView,
}: {
  supply: SupplySuggestions;
  view: CardView;
  onView: (view: CardView) => void;
}) {
  const rows = coverageRows(supply.items, supply.policy.targetDays);
  const threshold = days(String(supply.policy.coverageThresholdDays));
  return (
    <Stack gap="4">
      {!supply.coverage.complete && (
        <FormMessage tone="info" title="Данных пока мало">
          Мы знаем расход меньше чем за 7 дней, поэтому подсказка
          приблизительная.
        </FormMessage>
      )}
      {rows.length === 0 ? (
        <Text color="text.secondary">Сейчас ничего докупать не нужно.</Text>
      ) : (
        <>
          <ChartControls
            legend={[
              {
                key: 'low',
                label: `Запаса меньше чем на ${threshold}`,
                color: 'bg.expiry',
              },
              {
                key: 'blocking',
                label: 'Держит блюда в стоп-листе',
                color: 'border.error',
              },
              {
                key: 'line',
                label: `Линия — запас на ${threshold}`,
                color: 'line',
              },
            ]}
            view={view}
            onView={onView}
          />
          {view === 'table' ? (
            <SupplyTable rows={rows} />
          ) : (
            <BarChart
              label="Скоро закончится"
              rows={rows.map(bar)}
              scale
              threshold={
                (100 * supply.policy.coverageThresholdDays) /
                supply.policy.targetDays
              }
            />
          )}
        </>
      )}
    </Stack>
  );
}

export function SupplyCard() {
  const data = useRestaurantData();
  const [view, setView] = useCardView('supply');
  return (
    <ChartCard
      id="supply"
      title="Скоро закончится"
      description="Продукты, которых хватит меньше чем на 3 дня или из-за которых блюда в стоп-листе."
    >
      <WarehouseRead
        model={data.supplySuggestions()}
        section="Аналитика"
        title="Не удалось загрузить подсказку о закупках"
      >
        {(value) => (
          <SupplyBody supply={value.result} view={view} onView={setView} />
        )}
      </WarehouseRead>
    </ChartCard>
  );
}
