import { Stack, Text, chakra } from '@chakra-ui/react';
import type { SupplySuggestions } from '@/application/warehouse';
import { formatQuantity, unitShort } from '@/domain/quantity';
import { useRestaurantData } from '@/presentation/session/hooks';
import { DataTable, TableCard, Th, Td } from '@/presentation/ui/table';
import { FormMessage } from '@/presentation/ui/form-message';
import { WarehouseRead } from './warehouse-read';

export function displayDecimal(value: string): string {
  const [whole = '', fraction = ''] = value.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const tail = fraction.replace(/0+$/, '');
  return tail === '' ? grouped : `${grouped},${tail}`;
}

function SupplyRows({ value }: { value: SupplySuggestions }) {
  return (
    <Stack gap="3">
      {!value.coverage.complete && (
        <FormMessage tone="info" title="История расхода неполная">
          Учтён зарегистрированный расход за последние 7 дней. До начала текущей
          истории расход не предполагается; при отсутствии расхода предложение
          покрывает только дефицит одной порции.
        </FormMessage>
      )}
      {value.items.length === 0 ? (
        <Text color="text.secondary">
          Пополнение по текущим данным не требуется.
        </Text>
      ) : (
        <TableCard>
          <DataTable mobile="cards">
            <chakra.thead>
              <tr>
                <Th>Продукт</Th>
                <Th>Пригодный остаток</Th>
                <Th>Средний расход</Th>
                <Th>Запас</Th>
                <Th>Предложение</Th>
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
                        ? 'Запас менее 3 дней. '
                        : ''}
                      {row.reasons.includes('stop_list_deficit')
                        ? `Не хватает на одну порцию: ${formatQuantity(row.onePortionDeficit, row.baseUnit)}.`
                        : ''}
                    </Text>
                  </Td>
                  <Td gridArea="stock" textStyle="mono.body">
                    {formatQuantity(row.availableQuantity, row.baseUnit)}
                  </Td>
                  <Td gridArea="mean" textStyle="mono.body">
                    {displayDecimal(row.averageDailyBaseUnits)}{' '}
                    {unitShort(row.baseUnit)}/день
                  </Td>
                  <Td gridArea="coverage">
                    {row.coverageDays === null
                      ? 'Нет расхода'
                      : `${displayDecimal(row.coverageDays)} дн.`}
                  </Td>
                  <Td
                    gridArea="suggestion"
                    textStyle="mono.body"
                    color="text.action"
                  >
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
      <chakra.h2 textStyle="heading.h3">Предложения поставок</chakra.h2>
      <Text textStyle="caption.default" color="text.secondary">
        Ориентир — 7 дней наблюдаемого расхода или дефицит одной порции.
        Поставка создаётся человеком.
      </Text>
      <WarehouseRead
        model={data.supplySuggestions()}
        title="Не удалось рассчитать пополнение"
      >
        {(value) => <SupplyRows value={value.result} />}
      </WarehouseRead>
    </Stack>
  );
}
