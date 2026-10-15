import { Flex, Stack, Text, chakra } from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { findRestaurant } from '@/application/access';
import { formatQuantity } from '@/domain/quantity';
import {
  useAccess,
  useAttempts,
  useReadModel,
  useRestaurantData,
} from '@/presentation/session/hooks';
import { useServices } from '@/presentation/services';
import { Button } from '@/presentation/ui/actions';
import { Badge } from '@/presentation/ui/badge';
import { ListCard } from '@/presentation/ui/card';
import { FormMessage } from '@/presentation/ui/form-message';
import { formatStamp } from '@/presentation/ui/zones';
import { WarehouseLayout } from './warehouse-layout';
import { WarehouseRead, warehouseStamp } from './warehouse-read';
import { remainingTime } from './warehouse-time';

export function ExpiryPage() {
  const { restaurantID = '' } = useParams();
  return <ExpiryView key={restaurantID} restaurantID={restaurantID} />;
}
function ExpiryView({ restaurantID }: { restaurantID: string }) {
  const data = useRestaurantData();
  const access = useAccess();
  const canWriteoff =
    findRestaurant(access, restaurantID)?.permissions.has(
      'writeoff.confirm',
    ) === true;
  const { warehouseCommands } = useServices();
  const commands = warehouseCommands(restaurantID);
  useAttempts();
  const expiryModel = data.expiringBatches();
  const expiry = useReadModel(expiryModel);
  const products = useReadModel(data.products());
  const [states, setStates] = useState<
    Readonly<
      Record<string, 'sending' | 'unknown' | 'done' | 'refused' | 'reset'>
    >
  >({});
  const [message, setMessage] = useState<string | undefined>();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const name = (id: string, epoch: string) =>
    products.value?.context.runtimeEpoch === epoch
      ? (products.value.result.items.find((v) => v.productID === id)?.name ??
        id)
      : id;
  const confirm = async (batchID: string, epoch: string) => {
    setStates((v) => ({ ...v, [batchID]: 'sending' }));
    const result = await commands.confirmWriteoff(batchID, epoch);
    if (!mounted.current) return;
    if (result.kind === 'created') {
      setStates((v) => ({ ...v, [batchID]: 'done' }));
      setMessage(
        `Подтверждено списание ${formatQuantity(result.value.writtenOffQuantity, result.value.baseUnit)} из партии ${batchID}.`,
      );
    } else {
      setStates((v) => ({
        ...v,
        [batchID]:
          result.kind === 'unknown'
            ? 'unknown'
            : result.kind === 'reset'
              ? 'reset'
              : 'refused',
      }));
      setMessage(
        result.kind === 'unknown'
          ? 'Ответ не получен. Проверка повторит сохранённую попытку без нового списания.'
          : result.kind === 'reset'
            ? 'Данные склада обновились. Старый исход не подтверждён; обновите список.'
            : 'Списание не подтверждено. Обновите данные и повторите проверку доступа.',
      );
    }
  };
  const refresh = () => {
    expiryModel.refresh();
    data.pendingWriteoffs().refresh();
    data.products().refresh();
  };
  return (
    <WarehouseLayout
      onRefresh={refresh}
      section="Сроки годности"
      stamp={warehouseStamp(expiry.value?.context)}
    >
      <Flex wrap="wrap" gap="3" justify="space-between" align="center">
        <Text>Пригодные партии со сроком в ближайшие 48 часов</Text>
        <Button variant="secondary" onClick={refresh}>
          Обновить
        </Button>
      </Flex>
      <WarehouseRead
        model={expiryModel}
        title="Не удалось получить сроки годности"
      >
        {(value) =>
          value.result.items.length === 0 ? (
            <Text color="text.secondary">
              Пригодных партий с истекающим сроком в ближайшие 48 часов нет.
            </Text>
          ) : (
            <ListCard p="0">
              {value.result.items.map((row, index) => (
                <Flex
                  as="li"
                  key={row.batchID}
                  direction={{ base: 'column', sm: 'row' }}
                  align={{ sm: 'center' }}
                  justify="space-between"
                  gap="3"
                  p="4"
                  borderTopWidth={index === 0 ? '0' : '1px'}
                  borderColor="border.default"
                >
                  <Stack gap="1" minW="0">
                    <Text textStyle="body.strong">
                      {name(row.productID, value.context.runtimeEpoch)}
                    </Text>
                    <Text textStyle="numeric.default" overflowWrap="anywhere">
                      Партия {row.batchID} ·{' '}
                      {formatQuantity(row.remainingQuantity, row.baseUnit)}
                    </Text>
                    <Text textStyle="caption.default" color="text.secondary">
                      До{' '}
                      {formatStamp(
                        row.expiresAt.epochMs,
                        value.context.settings.timeZone,
                      )}
                    </Text>
                  </Stack>
                  <Badge tone="expiry">
                    {remainingTime(
                      row.expiresAt.epochMs,
                      value.context.evaluatedAt.epochMs,
                    )}
                  </Badge>
                </Flex>
              ))}
            </ListCard>
          )
        }
      </WarehouseRead>
      <chakra.h2 textStyle="heading.h3">Ожидает списания</chakra.h2>
      <Text textStyle="caption.default" color="text.secondary">
        Просроченные партии уже недоступны для заказов. Окончательное списание
        подтверждает сотрудник склада.
      </Text>
      {message !== undefined && (
        <FormMessage tone="info" title="Результат операции">
          {message}
        </FormMessage>
      )}
      <WarehouseRead
        model={data.pendingWriteoffs()}
        title="Не удалось получить партии к списанию"
      >
        {(value) =>
          value.result.items.length === 0 ? (
            <Text color="text.secondary">Партий, ожидающих списания, нет.</Text>
          ) : (
            <ListCard p="0">
              {value.result.items.map(({ batch }, index) => {
                const pending = commands.pendingWriteoff(batch.batchID);
                const stored = states[batch.batchID];
                const status =
                  stored === 'unknown' && !pending
                    ? undefined
                    : (stored ?? (pending ? 'unknown' : undefined));
                const unit =
                  products.value?.context.runtimeEpoch ===
                  value.context.runtimeEpoch
                    ? products.value.result.items.find(
                        (v) => v.productID === batch.productID,
                      )?.baseUnit
                    : undefined;
                return (
                  <Flex
                    as="li"
                    key={batch.batchID}
                    direction={{ base: 'column', sm: 'row' }}
                    justify="space-between"
                    align={{ sm: 'center' }}
                    gap="3"
                    p="4"
                    borderTopWidth={index === 0 ? '0' : '1px'}
                    borderColor="border.default"
                  >
                    <Stack gap="1" minW="0">
                      <Text textStyle="body.strong">
                        {name(batch.productID, value.context.runtimeEpoch)}
                      </Text>
                      <Text textStyle="numeric.default" overflowWrap="anywhere">
                        Партия {batch.batchID}
                        {unit === undefined
                          ? ' · получаем единицу измерения…'
                          : ` · ${formatQuantity(batch.remainingQuantity, unit)}`}
                      </Text>
                      <Text textStyle="caption.default" color="text.secondary">
                        Срок истёк{' '}
                        {formatStamp(
                          batch.expiresAt.epochMs,
                          value.context.settings.timeZone,
                        )}
                      </Text>
                      <Badge tone="expiry">Ожидает списания</Badge>
                    </Stack>
                    {canWriteoff && (
                      <Button
                        variant="secondary"
                        disabled={
                          unit === undefined ||
                          status === 'sending' ||
                          status === 'done' ||
                          status === 'reset'
                        }
                        onClick={() => {
                          void confirm(
                            batch.batchID,
                            value.context.runtimeEpoch,
                          );
                        }}
                      >
                        {status === 'sending'
                          ? 'Подтверждаем…'
                          : status === 'unknown'
                            ? 'Проверить результат'
                            : 'Подтвердить списание'}
                      </Button>
                    )}
                  </Flex>
                );
              })}
            </ListCard>
          )
        }
      </WarehouseRead>
    </WarehouseLayout>
  );
}
