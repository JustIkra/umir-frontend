import { Stack, Text, chakra } from '@chakra-ui/react';
import type { SupplySuggestions } from '@/application/warehouse';
import { formatQuantity, unitShort } from '@/domain/quantity';
import { useRestaurantData } from '@/presentation/session/hooks';
import {
  MobileCellLabel,
  DataTable,
  TableCard,
  Th,
  Td,
} from '@/presentation/ui/table';
import { FormMessage } from '@/presentation/ui/form-message';
import { days, displayDecimal } from '@/presentation/ui/decimals';
import { WarehouseRead } from './warehouse-read';

function SupplyRows({ value }: { value: SupplySuggestions }) {
  return (
    <Stack gap="3">
      {!value.coverage.complete && (
        <FormMessage tone="info" title="Данных пока мало">
          Мы знаем расход меньше чем за 7 дней, поэтому подсказка
          приблизительная.
        </FormMessage>
      )}
      {value.items.length === 0 ? (
        <Text color="text.secondary">Сейчас ничего докупать не нужно.</Text>
      ) : (
        <TableCard>
          <DataTable mobile="cards">
            <chakra.thead>
              <tr>
                <Th>Продукт</Th>
                <Th>Можно использовать</Th>
                <Th>Средний расход</Th>
                <Th>Хватит на</Th>
                <Th>Докупить</Th>
              </tr>
            </chakra.thead>
            <tbody>
              {value.items.map((row) => (
                <chakra.tr
                  key={row.productID}
                  gridTemplateColumns="1fr 1fr"
                  gridTemplateAreas="'product product' 'stock mean' 'coverage suggestion'"
                >
                  <Td gridArea="product">
                    <Text textStyle="body.strong">{row.productName}</Text>
                    <Text textStyle="caption.default" color="text.secondary">
                      {row.reasons.includes('low_coverage')
                        ? 'Хватит меньше чем на 3 дня. '
                        : ''}
                      {row.reasons.includes('stop_list_deficit')
                        ? `Не хватает на одну порцию: ${formatQuantity(row.onePortionDeficit, row.baseUnit)}.`
                        : ''}
                    </Text>
                  </Td>
                  <Td gridArea="stock" textStyle="numeric.body">
                    <MobileCellLabel aria-hidden="true">
                      Можно использовать
                    </MobileCellLabel>
                    {formatQuantity(row.availableQuantity, row.baseUnit)}
                  </Td>
                  <Td gridArea="mean" textStyle="numeric.body">
                    <MobileCellLabel aria-hidden="true">
                      Средний расход
                    </MobileCellLabel>
                    {`${displayDecimal(row.averageDailyBaseUnits)}\u00a0${unitShort(row.baseUnit)} в день`}
                  </Td>
                  <Td gridArea="coverage">
                    <MobileCellLabel aria-hidden="true">
                      Хватит на
                    </MobileCellLabel>
                    {row.coverageDays === null
                      ? 'Расхода нет'
                      : days(row.coverageDays)}
                  </Td>
                  <Td
                    gridArea="suggestion"
                    textStyle="numeric.body"
                    color="text.action"
                  >
                    <MobileCellLabel aria-hidden="true">
                      Докупить
                    </MobileCellLabel>
                    +{formatQuantity(row.suggestedQuantity, row.baseUnit)}
                  </Td>
                </chakra.tr>
              ))}
            </tbody>
          </DataTable>
        </TableCard>
      )}
    </Stack>
  );
}

export function SupplyPanel() {
  const data = useRestaurantData();
  return (
    <Stack gap="3">
      <chakra.h2 textStyle="heading.h3">Что докупить</chakra.h2>
      <Text textStyle="caption.default" color="text.secondary">
        Считаем по расходу за 7 дней. Заказ поставщику вы оформляете сами.
      </Text>
      <WarehouseRead
        model={data.supplySuggestions()}
        title="Не удалось рассчитать, что докупить"
      >
        {(value) => <SupplyRows value={value.result} />}
      </WarehouseRead>
    </Stack>
  );
}
