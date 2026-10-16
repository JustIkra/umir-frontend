import { Stack, Text, chakra } from '@chakra-ui/react';
import type { Inventory, StockRow } from '@/application/warehouse';
import {
  percentText,
  riskChart,
  segmentShares,
  type RiskRow,
} from '@/domain/analytics';
import { formatQuantity } from '@/domain/quantity';
import { useRestaurantData } from '@/presentation/session/hooks';
import { plural } from '@/presentation/ui/plural';
import {
  DataTable,
  MobileCellLabel,
  TableCard,
  Td,
  Th,
} from '@/presentation/ui/table';
import { WarehouseRead } from '@/presentation/warehouse/warehouse-read';
import { BarChart, type BarRow } from './bar-chart';
import {
  ChartCard,
  ChartControls,
  MoreRows,
  useCardView,
  visibleRows,
  type CardView,
} from './chart-card';

const quantity = (value: bigint, row: RiskRow<StockRow>) =>
  formatQuantity(value.toString(), row.item.baseUnit);

function bar(row: RiskRow<StockRow>): BarRow {
  const [safe, expiring, pending] = segmentShares([
    row.safe,
    row.expiring,
    row.pending,
  ]);
  return {
    id: row.item.productID,
    name: row.item.name,
    figure: `Риск ${percentText(row.riskTenths)}`,
    segments: [
      { key: 'safe', color: 'bg.action', share: safe ?? 0 },
      { key: 'expiring', color: 'bg.expiry', share: expiring ?? 0 },
      { key: 'pending', color: 'border.error', share: pending ?? 0 },
    ],
    details: [
      ...(row.safe > 0n
        ? [{ value: quantity(row.safe, row), label: 'не испортится за 2 дня' }]
        : []),
      ...(row.expiring > 0n
        ? [{ value: quantity(row.expiring, row), label: 'испортится за 2 дня' }]
        : []),
      ...(row.pending > 0n
        ? [{ value: quantity(row.pending, row), label: 'ждёт списания' }]
        : []),
    ],
  };
}

function RiskTable({ rows }: { rows: readonly RiskRow<StockRow>[] }) {
  return (
    <TableCard>
      <DataTable mobile="cards">
        <chakra.thead>
          <tr>
            <Th>Продукт</Th>
            <Th>Можно использовать</Th>
            <Th>Испортится за 2 дня</Th>
            <Th>Ждёт списания</Th>
            <Th>Риск</Th>
          </tr>
        </chakra.thead>
        <tbody>
          {rows.map((row) => (
            <chakra.tr
              key={row.item.productID}
              gridTemplateColumns="1fr 1fr"
              gridTemplateAreas="'product product' 'stock expiring' 'pending risk'"
            >
              <Td gridArea="product" textStyle="body.strong">
                {row.item.name}
              </Td>
              <Td gridArea="stock" textStyle="numeric.body">
                <MobileCellLabel aria-hidden="true">
                  Можно использовать
                </MobileCellLabel>
                {formatQuantity(row.item.availableQuantity, row.item.baseUnit)}
              </Td>
              <Td gridArea="expiring" textStyle="numeric.body">
                <MobileCellLabel aria-hidden="true">
                  Испортится за 2 дня
                </MobileCellLabel>
                {quantity(row.expiring, row)}
              </Td>
              <Td gridArea="pending" textStyle="numeric.body">
                <MobileCellLabel aria-hidden="true">
                  Ждёт списания
                </MobileCellLabel>
                {quantity(row.pending, row)}
              </Td>
              <Td gridArea="risk" textStyle="numeric.body">
                <MobileCellLabel aria-hidden="true">Риск</MobileCellLabel>
                {percentText(row.riskTenths)}
              </Td>
            </chakra.tr>
          ))}
        </tbody>
      </DataTable>
    </TableCard>
  );
}

function RiskBody({
  inventory,
  view,
  onView,
}: {
  inventory: Inventory;
  view: CardView;
  onView: (view: CardView) => void;
}) {
  const chart = riskChart(inventory.items);
  if (chart.stocked === 0)
    return <Text color="text.secondary">На складе пока ничего нет.</Text>;
  if (chart.rows.length === 0)
    return (
      <Text color="text.secondary">
        В ближайшие 2 дня ничего не испортится, списаний нет.
      </Text>
    );
  return (
    <Stack gap="4">
      <ChartControls
        legend={[
          { key: 'safe', label: 'Не испортится за 2 дня', color: 'bg.action' },
          { key: 'expiring', label: 'Испортится за 2 дня', color: 'bg.expiry' },
          { key: 'pending', label: 'Ждёт списания', color: 'border.error' },
        ]}
        view={view}
        onView={onView}
      />
      {view === 'table' ? (
        <RiskTable rows={chart.rows} />
      ) : (
        <BarChart
          label="Что может испортиться"
          rows={visibleRows(chart.rows, view).map(bar)}
        />
      )}
      <MoreRows total={chart.rows.length} view={view} onView={onView} />
      {chart.calm > 0 && (
        <Text color="text.secondary">
          {`Без риска: ещё ${String(chart.calm)} ${plural(chart.calm, 'продукт', 'продукта', 'продуктов')}`}
        </Text>
      )}
    </Stack>
  );
}

export function RiskCard() {
  const data = useRestaurantData();
  const [view, setView] = useCardView('risk');
  return (
    <ChartCard
      id="risk"
      title="Что может испортиться"
      description="Какая часть остатка испортится за 2 дня или уже ждёт списания."
    >
      <WarehouseRead
        model={data.inventory()}
        section="Аналитика"
        title="Не удалось загрузить остатки под риском"
      >
        {(value) => (
          <RiskBody inventory={value.result} view={view} onView={setView} />
        )}
      </WarehouseRead>
    </ChartCard>
  );
}
