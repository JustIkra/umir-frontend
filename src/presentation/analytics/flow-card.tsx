import { Stack, Text, chakra } from '@chakra-ui/react';
import type { MovementReport, MovementRow } from '@/application/warehouse';
import {
  flowRows,
  percentText,
  segmentShares,
  type FlowRow,
} from '@/domain/analytics';
import { formatQuantity } from '@/domain/quantity';
import { useRestaurantData } from '@/presentation/session/hooks';
import { FormMessage } from '@/presentation/ui/form-message';
import {
  DataTable,
  MobileCellLabel,
  TableCard,
  Td,
  Th,
} from '@/presentation/ui/table';
import { formatStamp } from '@/presentation/ui/zones';
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
import { useAnalyticsWeek } from './week';

const quantity = (value: string, row: FlowRow<MovementRow>) =>
  formatQuantity(value, row.item.baseUnit);

function bar(row: FlowRow<MovementRow>): BarRow {
  const [ordered, writtenOff] = segmentShares([row.ordered, row.writtenOff]);
  return {
    id: row.item.productID,
    name: row.item.name,
    figure: `Списано ${percentText(row.writtenOffTenths)}`,
    segments: [
      { key: 'ordered', color: 'bg.action', share: ordered ?? 0 },
      { key: 'written-off', color: 'border.error', share: writtenOff ?? 0 },
    ],
    details: [
      { value: quantity(row.item.orderedQuantity, row), label: 'ушло в блюда' },
      { value: quantity(row.item.writtenOffQuantity, row), label: 'списано' },
      { value: quantity(row.item.receivedQuantity, row), label: 'поступило' },
    ],
  };
}

function FlowTable({ rows }: { rows: readonly FlowRow<MovementRow>[] }) {
  return (
    <TableCard>
      <DataTable mobile="cards">
        <chakra.thead>
          <tr>
            <Th>Продукт</Th>
            <Th>Поступило</Th>
            <Th>Ушло в блюда</Th>
            <Th>Списано</Th>
            <Th>Доля списаний</Th>
          </tr>
        </chakra.thead>
        <tbody>
          {rows.map((row) => (
            <chakra.tr
              key={row.item.productID}
              gridTemplateColumns="1fr 1fr"
              gridTemplateAreas="'product product' 'received ordered' 'written share'"
            >
              <Td gridArea="product" textStyle="body.strong">
                {row.item.name}
              </Td>
              <Td gridArea="received" textStyle="numeric.body">
                <MobileCellLabel aria-hidden="true">Поступило</MobileCellLabel>
                {quantity(row.item.receivedQuantity, row)}
              </Td>
              <Td gridArea="ordered" textStyle="numeric.body">
                <MobileCellLabel aria-hidden="true">
                  Ушло в блюда
                </MobileCellLabel>
                {quantity(row.item.orderedQuantity, row)}
              </Td>
              <Td gridArea="written" textStyle="numeric.body">
                <MobileCellLabel aria-hidden="true">Списано</MobileCellLabel>
                {quantity(row.item.writtenOffQuantity, row)}
              </Td>
              <Td gridArea="share" textStyle="numeric.body">
                <MobileCellLabel aria-hidden="true">
                  Доля списаний
                </MobileCellLabel>
                {percentText(row.writtenOffTenths)}
              </Td>
            </chakra.tr>
          ))}
        </tbody>
      </DataTable>
    </TableCard>
  );
}

function FlowBody({
  report,
  timeZone,
  view,
  onView,
}: {
  report: MovementReport;
  timeZone: string;
  view: CardView;
  onView: (view: CardView) => void;
}) {
  const rows = flowRows(report.items);
  return (
    <Stack gap="4">
      {!report.coverage.complete && (
        <FormMessage tone="info" title="Склад помнит не всю неделю">
          {`Склад помнит движение только с ${formatStamp(report.coverage.availableFrom.epochMs, timeZone)}. Более ранние дни не учтены.`}
        </FormMessage>
      )}
      {rows.length === 0 ? (
        <Text color="text.secondary">
          За 7 дней продукты не продавали и не списывали.
        </Text>
      ) : (
        <>
          <ChartControls
            legend={[
              { key: 'ordered', label: 'Ушло в блюда', color: 'bg.action' },
              { key: 'written-off', label: 'Списано', color: 'border.error' },
            ]}
            view={view}
            onView={onView}
          />
          {view === 'table' ? (
            <FlowTable rows={rows} />
          ) : (
            <BarChart
              label="Куда ушли продукты за 7 дней"
              rows={visibleRows(rows, view).map(bar)}
            />
          )}
          <MoreRows total={rows.length} view={view} onView={onView} />
        </>
      )}
    </Stack>
  );
}

export function FlowCard() {
  const data = useRestaurantData();
  const week = useAnalyticsWeek();
  const [view, setView] = useCardView('flow');
  return (
    <ChartCard
      id="flow"
      title="Куда ушли продукты за 7 дней"
      description="Сколько продуктов ушло в блюда, а сколько пришлось списать."
    >
      <WarehouseRead
        model={data.movementReport(week)}
        section="Аналитика"
        title="Не удалось загрузить движение продуктов"
      >
        {(value) => (
          <FlowBody
            report={value.result}
            timeZone={value.context.settings.timeZone}
            view={view}
            onView={setView}
          />
        )}
      </WarehouseRead>
    </ChartCard>
  );
}
