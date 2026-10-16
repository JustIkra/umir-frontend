import { Flex, Stack, Text, chakra } from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { findRestaurant } from '@/application/access';
import type { AttemptState } from '@/application/durable-attempts';
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
import {
  attemptPlaces,
  attemptRefusalText,
} from '@/presentation/ui/attempt-messages';
import {
  DamagedAttempt,
  NotSavedNotice,
  useAttemptFlags,
} from '@/presentation/ui/attempt-notices';
import { FormMessage } from '@/presentation/ui/form-message';
import { rem } from '@/presentation/ui/units';
import { formatAbsoluteStamp } from '@/presentation/ui/zones';
import { WarehouseLayout } from './warehouse-layout';
import { WarehouseRead, warehouseStamp } from './warehouse-read';
import { remainingTime } from './warehouse-time';

// The button of one batch's write-off with the warnings of its saved attempt:
// a damaged one closes the button until the attempt is cancelled.
function WriteoffControls({
  state,
  disabled,
  label,
  onConfirm,
}: {
  state: AttemptState;
  disabled: boolean;
  label: string;
  onConfirm: () => void;
}) {
  const attempt = useAttemptFlags(state);
  return (
    <Stack gap="2" maxW={{ sm: rem(360) }}>
      {attempt.damaged ? (
        <DamagedAttempt state={state} place="warehouse" />
      ) : (
        <Button variant="secondary" disabled={disabled} onClick={onConfirm}>
          {label}
        </Button>
      )}
      {attempt.notSaved && (
        <NotSavedNotice text={attemptPlaces.warehouse.notSaved} />
      )}
    </Stack>
  );
}

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
  const [message, setMessage] = useState<
    { readonly title: string; readonly text: string } | undefined
  >();
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
        `Продукт с кодом ${id}`)
      : `Продукт с кодом ${id}`;
  const confirm = async (batchID: string, epoch: string) => {
    setStates((v) => ({ ...v, [batchID]: 'sending' }));
    const result = await commands.confirmWriteoff(batchID, epoch);
    if (!mounted.current) return;
    if (result.kind === 'created') {
      setStates((v) => ({ ...v, [batchID]: 'done' }));
      setMessage({
        title: 'Готово',
        text: `Списание подтверждено: ${name(result.value.productID, epoch)}, ${formatQuantity(result.value.writtenOffQuantity, result.value.baseUnit)}.`,
      });
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
        result.kind === 'refused' && result.code === 'AttemptDamaged'
          ? undefined
          : result.kind === 'unknown'
            ? {
                title: 'Не знаем, прошло ли списание',
                text: 'Связь прервалась. Нажмите «Проверить результат» — повторно ничего не спишется.',
              }
            : result.kind === 'reset'
              ? {
                  title: 'Не знаем, прошло ли списание',
                  text: 'Данные обновились. Обновите список и проверьте, списана ли партия.',
                }
              : {
                  title: 'Не удалось списать',
                  text:
                    (result.kind === 'refused'
                      ? attemptRefusalText(result.code, 'warehouse')
                      : undefined) ?? 'Обновите страницу и попробуйте ещё раз.',
                },
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
        <Text>Что испортится в ближайшие 2 дня</Text>
        <Button variant="secondary" onClick={refresh}>
          Обновить
        </Button>
      </Flex>
      <WarehouseRead
        model={expiryModel}
        title="Не удалось загрузить сроки годности"
      >
        {(value) =>
          value.result.items.length === 0 ? (
            <Text color="text.secondary">
              В ближайшие 2 дня ничего не испортится.
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
                      Остаток{' '}
                      {formatQuantity(row.remainingQuantity, row.baseUnit)}
                    </Text>
                    <Text textStyle="caption.default" color="text.secondary">
                      Годна до{' '}
                      {formatAbsoluteStamp(
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
        Просроченное уже не попадает в заказы. Подтвердите списание, когда
        уберёте продукты.
      </Text>
      {message !== undefined && (
        <FormMessage tone="info" title={message.title}>
          {message.text}
        </FormMessage>
      )}
      <WarehouseRead
        model={data.pendingWriteoffs()}
        title="Не удалось загрузить партии к списанию"
      >
        {(value) =>
          value.result.items.length === 0 ? (
            <Text color="text.secondary">Списывать пока нечего.</Text>
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
                        {unit === undefined
                          ? 'Узнаём единицу измерения…'
                          : `Остаток ${formatQuantity(batch.remainingQuantity, unit)}`}
                      </Text>
                      <Text textStyle="caption.default" color="text.secondary">
                        Срок истёк{' '}
                        {formatAbsoluteStamp(
                          batch.expiresAt.epochMs,
                          value.context.settings.timeZone,
                        )}
                      </Text>
                      <Badge tone="expiry">Ожидает списания</Badge>
                    </Stack>
                    {canWriteoff && (
                      <WriteoffControls
                        state={commands.writeoffAttempt(batch.batchID)}
                        disabled={
                          unit === undefined ||
                          status === 'sending' ||
                          status === 'done' ||
                          status === 'reset'
                        }
                        label={
                          status === 'sending'
                            ? 'Списываем…'
                            : status === 'unknown'
                              ? 'Проверить результат'
                              : 'Подтвердить списание'
                        }
                        onConfirm={() => {
                          void confirm(
                            batch.batchID,
                            value.context.runtimeEpoch,
                          );
                        }}
                      />
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
