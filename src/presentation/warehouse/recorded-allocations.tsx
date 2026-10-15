import { Stack, Text } from '@chakra-ui/react';
import type { Order } from '@/application/restaurant';
import { recordedAllocations } from '@/application/recorded-allocations';
import { formatQuantity, formatThousandths } from '@/domain/quantity';
import { useReadModel, useRestaurantData } from '@/presentation/session/hooks';
import { formatStamp } from '@/presentation/ui/zones';

export function AllocationFacts({
  order,
  warehouseEpoch,
  timeZone,
}: {
  order: Order;
  warehouseEpoch: string | undefined;
  timeZone: string;
}) {
  const data = useRestaurantData();
  const history = useReadModel(data.history());
  const products = useReadModel(data.products());
  const rows = recordedAllocations(order, warehouseEpoch, history.value);
  return (
    <Stack gap="2">
      <Text textStyle="caption.strong">Фактический расход по партиям</Text>
      {rows.map((row, index) => {
        const catalog = products.value;
        const product =
          catalog !== undefined &&
          warehouseEpoch !== undefined &&
          catalog.context.runtimeEpoch === warehouseEpoch
            ? catalog.result.items.find((v) => v.productID === row.productID)
            : undefined;
        return (
          <Stack
            key={`${String(index)}-${row.batchID}`}
            gap="0.5"
            ps="3"
            borderStartWidth="2px"
            borderColor="border.default"
          >
            <Text textStyle="caption.default" overflowWrap="anywhere">
              {product?.name ?? `Продукт ${row.productID}`} · партия{' '}
              {row.batchID}
            </Text>
            <Text textStyle="numeric.default" overflowWrap="anywhere">
              {product === undefined
                ? `${formatThousandths(row.quantity)} (единица из справочника недоступна)`
                : formatQuantity(row.quantity, product.baseUnit)}
            </Text>
            <Text textStyle="caption.default" color="text.secondary">
              {row.expiresAt === undefined
                ? history.loading
                  ? 'Получаем срок из истории поступления…'
                  : 'Срок партии не подтверждён доступной историей.'
                : `Годна до ${formatStamp(row.expiresAt.epochMs, timeZone)}`}
            </Text>
          </Stack>
        );
      })}
    </Stack>
  );
}
