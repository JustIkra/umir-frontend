import { Box, Flex, Grid, Stack, Text, chakra } from '@chakra-ui/react';
import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useRestaurantPath } from '@/presentation/app-shell/paths';
import plusIcon from '@/presentation/assets/icons/plus-24.svg';
import trashIcon from '@/presentation/assets/icons/trash-24.svg';
import { PageHeader } from '@/presentation/app-shell/pages';
import { findRestaurant } from '@/application/access';
import { formatThousandths, unitShort } from '@/domain/quantity';
import {
  useAccess,
  useAttempts,
  useReadModel,
  useRestaurantData,
} from '@/presentation/session/hooks';
import { useServices } from '@/presentation/services';
import { useLeaveGuard } from '@/presentation/app-shell/leave-guard';
import {
  attemptPlaces,
  attemptRefusalText,
  serviceUnavailableText,
} from '@/presentation/ui/attempt-messages';
import {
  DamagedAttempt,
  NotSavedNotice,
  useAttemptFlags,
} from '@/presentation/ui/attempt-notices';
import { FormMessage } from '@/presentation/ui/form-message';
import { RateLimitMessage, useRetryWait } from '@/presentation/ui/rate-limit';
import { formatInstant } from '@/presentation/ui/time';
import { formatSectionDate } from '@/presentation/ui/zones';
import { civilFields, draftFromForm } from './delivery-forms';
import { media } from '@/presentation/theme/system';
import { Button, ButtonLink } from '@/presentation/ui/actions';
import { Breadcrumbs } from '@/presentation/ui/breadcrumbs';
import {
  CardFooter,
  SplitCardBody,
  SplitCardForm,
} from '@/presentation/ui/card';
import {
  DateInput,
  FieldGroup,
  FieldLabel,
  FieldMessage,
  QuantityInput,
  SelectField,
  TextInput,
  TimeInput,
} from '@/presentation/ui/form';
import { Icon, MaskIcon } from '@/presentation/ui/icon';
import { rem } from '@/presentation/ui/units';

// From 1367 the column heads name the fields, so the labels are hidden
// visually but stay for screen readers.
const hiddenWide = {
  [media.wide]: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  },
} as const;

const wideColumns = `${rem(28)} minmax(${rem(160)}, ${rem(200)}) ${rem(128)} ${rem(188)} ${rem(176)} ${rem(188)} ${rem(40)}`;

function RowLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: string;
}) {
  return (
    <chakra.label htmlFor={htmlFor} textStyle="caption.strong" css={hiddenWide}>
      {children}
    </chakra.label>
  );
}

interface Row {
  readonly key: number;
  readonly product: string;
}

export function DeliveryPage() {
  const { restaurantID = '' } = useParams();
  const products = useReadModel(useRestaurantData().products());
  return (
    <DeliveryView
      key={`${restaurantID}-${products.value?.context.runtimeEpoch ?? ''}`}
      restaurantID={restaurantID}
    />
  );
}
function DeliveryView({ restaurantID }: { restaurantID: string }) {
  const path = useRestaurantPath();
  const navigate = useNavigate();
  const base = useId();
  const data = useRestaurantData();
  const productRead = useReadModel(data.products());
  const products = productRead.value?.result.items ?? [];
  const { warehouseCommands, now } = useServices();
  const commands = warehouseCommands(restaurantID);
  useAttempts();
  const attempt = useAttemptFlags(commands.deliveryAttempt);
  const pending = commands.pendingDelivery();
  const restaurant = findRestaurant(useAccess(), restaurantID);
  const [timeZone] = useState(
    () =>
      commands.pendingDeliveryTimeZone() ??
      restaurant?.timeZone ??
      'Europe/Moscow',
  );
  const [openedAt] = useState(now);
  const created = civilFields(pending?.createdAt);
  const [status, setStatus] = useState<
    'idle' | 'invalid' | 'sending' | 'unknown' | 'refused' | 'reset'
  >(pending === undefined ? 'idle' : 'unknown');
  const [message, setMessage] = useState<string | undefined>();
  const wait = useRetryWait();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const timezoneChanged =
    productRead.value !== undefined &&
    productRead.value.context.settings.timeZone !== timeZone;
  const closed =
    status === 'sending' ||
    status === 'unknown' ||
    status === 'reset' ||
    attempt.damaged ||
    timezoneChanged ||
    productRead.value === undefined;
  const [dirty, setDirty] = useState(false);
  useLeaveGuard(dirty && pending === undefined ? 'Форма поставки' : undefined);
  const productOptions = products.map((product) => ({
    value: product.productID,
    label: product.name,
  }));
  const [rows, setRows] = useState<readonly Row[]>(() =>
    pending === undefined
      ? [{ key: 1, product: '' }]
      : pending.lines.map((line, index) => ({
          key: index + 1,
          product: line.productID,
        })),
  );
  const [next, setNext] = useState(() => rows.length + 1);
  return (
    <Stack gap={{ base: '4', sm: '6' }}>
      <Stack gap={{ base: '4', sm: '6' }}>
        <Breadcrumbs
          items={[
            { title: 'Склад', to: path('/warehouse') },
            { title: 'Поставки' },
            { title: 'Приём поставки' },
          ]}
        />
        <PageHeader
          title="Приём поставки"
          caption={formatSectionDate(openedAt, timeZone)}
          description="Одна строка — одна партия. Срок годности посчитаем сами по дате изготовления."
        />
      </Stack>
      {attempt.damaged && (
        <DamagedAttempt state={commands.deliveryAttempt} place="warehouse" />
      )}
      {attempt.notSaved && (
        <NotSavedNotice text={attemptPlaces.warehouse.notSaved} />
      )}
      {message !== undefined && (
        <FormMessage
          tone={status === 'unknown' ? 'unknown' : 'error'}
          title={
            status === 'unknown' || status === 'reset'
              ? 'Не знаем, принята ли поставка'
              : status === 'invalid'
                ? 'Проверьте форму'
                : 'Поставка не принята'
          }
        >
          {message}
        </FormMessage>
      )}
      <RateLimitMessage wait={wait} />
      {timezoneChanged && (
        <FormMessage tone="error" title="Изменился часовой пояс ресторана">
          Обновите страницу и проверьте даты и время. Если поставка уже
          отправлена, её данные не изменятся.
        </FormMessage>
      )}
      <SplitCardForm
        noValidate
        onChange={() => {
          setDirty(true);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          if (
            status === 'sending' ||
            wait.waiting ||
            timezoneChanged ||
            productRead.value === undefined
          )
            return;
          const input =
            pending ??
            draftFromForm(
              new FormData(event.currentTarget),
              rows,
              productRead.value.context.settings.settingsVersion,
            );
          if (input === undefined) {
            setStatus('invalid');
            setMessage(
              'Заполните все поля. Дата — дд.мм.гггг, время — чч:мм, срок — целое число дней, количество — больше нуля, с точностью до 0,001.',
            );
            return;
          }
          setStatus('sending');
          wait.clear();
          void commands
            .receiveDelivery(
              input,
              timeZone,
              productRead.value.context.runtimeEpoch,
            )
            .then((result) => {
              if (!mounted.current) return;
              if (result.kind === 'created') {
                setDirty(false);
                void navigate(path('/warehouse'));
                return;
              }
              if (result.kind === 'rate-limited') {
                setStatus('refused');
                setMessage(undefined);
                wait.begin(result.retryAfterSeconds);
                return;
              }
              setStatus(
                result.kind === 'unknown'
                  ? 'unknown'
                  : result.kind === 'reset'
                    ? 'reset'
                    : 'refused',
              );
              setMessage(
                result.kind === 'refused' && result.code === 'AttemptDamaged'
                  ? undefined
                  : result.kind === 'unknown'
                    ? 'Связь прервалась. Нажмите «Проверить результат» — поставка не задвоится. Пока форму менять нельзя.'
                    : result.kind === 'reset'
                      ? 'Данные на сервере обновились, и мы не можем подтвердить результат. Прежде чем отправлять снова, проверьте поставку в истории склада.'
                      : result.kind === 'refused' &&
                          result.code === 'ServiceUnavailable'
                        ? serviceUnavailableText
                        : result.kind === 'refused' &&
                            result.code === 'SettingsChanged'
                          ? 'Изменились настройки времени ресторана. Обновите страницу и проверьте даты.'
                          : ((result.kind === 'refused'
                              ? attemptRefusalText(result.code, 'warehouse')
                              : undefined) ??
                            'Проверьте даты и количество и попробуйте ещё раз.'),
              );
            });
        }}
      >
        <chakra.fieldset
          disabled={closed}
          display="contents"
          minW="0"
          border="0"
          p="0"
          m="0"
        >
          <SplitCardBody>
            <Grid
              gridTemplateColumns={{ sm: 'repeat(2, minmax(0, 1fr))' }}
              maxW={{ sm: rem(664) }}
              columnGap="6"
              rowGap="4"
            >
              <FieldGroup>
                <FieldLabel htmlFor="delivery-number">
                  Номер поставки
                </FieldLabel>
                <TextInput
                  id="delivery-number"
                  name="number"
                  defaultValue={pending?.number}
                  placeholder="Например, 1192"
                  aria-describedby="delivery-number-hint"
                />
                <FieldMessage
                  id="delivery-number-hint"
                  hint="Номер из накладной. Может совпадать у разных поставок."
                />
              </FieldGroup>
              <FieldGroup>
                <FieldLabel htmlFor="delivery-date">
                  Дата и время создания поставки
                </FieldLabel>
                <Flex gap="1.5">
                  <DateInput
                    id="delivery-date"
                    name="createdDate"
                    defaultValue={
                      created.date || formatInstant(openedAt, timeZone, 'date')
                    }
                    w="auto"
                    flex="1"
                    minW="0"
                    aria-describedby="delivery-date-hint"
                  />
                  <TimeInput
                    name="createdTime"
                    defaultValue={
                      created.time || formatInstant(openedAt, timeZone, 'time')
                    }
                    aria-label="Время создания поставки"
                    aria-describedby="delivery-date-hint"
                  />
                </Flex>
                <FieldMessage
                  id="delivery-date-hint"
                  hint="Не позже текущего времени"
                />
              </FieldGroup>
            </Grid>
          </SplitCardBody>
          <Stack gap="3">
            <Flex justify="space-between" align="baseline" wrap="wrap" gap="2">
              <chakra.h2 textStyle="heading.h3">
                {`Строки поставки · ${String(rows.length)}`}
              </chakra.h2>
            </Flex>
            <Stack gap="0">
              <Grid
                aria-hidden="true"
                display={{ base: 'none', '2xl': 'grid' }}
                gridTemplateColumns={wideColumns}
                columnGap="3"
                alignItems="start"
                pb="2"
                borderBottomWidth="1px"
                borderColor="border.default"
                textStyle="caption.strong"
                color="text.secondary"
              >
                <span>№</span>
                <span>Продукт</span>
                <span>Количество</span>
                <span>Изготовлено</span>
                <span>Срок годности</span>
                <span>Поступило</span>
              </Grid>
              <Stack
                as="ol"
                gap={{ base: '3', '2xl': '0' }}
                listStyleType="none"
              >
                {rows.map((row, index) => {
                  const selectedProduct = products.find(
                    (v) => v.productID === row.product,
                  );
                  const unit =
                    selectedProduct === undefined
                      ? ''
                      : unitShort(selectedProduct.baseUnit);
                  const number = String(index + 1);
                  const id = (field: string) =>
                    `${base}-${field}-${String(row.key)}`;
                  return (
                    <Grid
                      as="li"
                      key={row.key}
                      gridTemplateAreas={{
                        base: "'head' 'product' 'quantity' 'made' 'shelf' 'received'",
                        sm: "'head head' 'product quantity' 'made shelf' 'received received'",
                        '2xl':
                          "'number product quantity made shelf received remove'",
                      }}
                      gridTemplateColumns={{
                        base: '1fr',
                        sm: 'repeat(2, minmax(0, 1fr))',
                        '2xl': wideColumns,
                      }}
                      alignItems={{ base: 'start', '2xl': 'center' }}
                      columnGap={{ base: '4', '2xl': '3' }}
                      rowGap="3"
                      p={{ base: '4', '2xl': '0' }}
                      py={{ '2xl': '3' }}
                      bg="bg.surface"
                      borderWidth={{ base: '1px', '2xl': '0 0 1px' }}
                      borderColor="border.default"
                      borderRadius={{ base: 'md', '2xl': '0' }}
                    >
                      <Flex
                        gridArea="head"
                        display={{ base: 'flex', '2xl': 'contents' }}
                        align="center"
                        gap="3"
                      >
                        <Text
                          gridArea="number"
                          minW="6"
                          px={{ base: '2', '2xl': '0' }}
                          bg={{ base: 'bg.subtle', '2xl': 'transparent' }}
                          borderRadius="sm"
                          textAlign="center"
                          textStyle={{
                            base: 'caption.strong',
                            '2xl': 'body.default',
                          }}
                          color={{ '2xl': 'text.secondary' }}
                        >
                          {number}
                        </Text>
                        <Text
                          flex="1"
                          display={{ '2xl': 'none' }}
                          textStyle="caption.default"
                          color="text.secondary"
                        >
                          Строка — одна партия
                        </Text>
                        <chakra.button
                          type="button"
                          gridArea="remove"
                          display="flex"
                          boxSize="10"
                          my={{ base: '-2', '2xl': '0' }}
                          alignItems="center"
                          justifyContent="center"
                          borderRadius="md"
                          cursor="pointer"
                          _hover={{ bg: 'bg.subtle' }}
                          _disabled={{
                            cursor: 'default',
                            _hover: { bg: 'transparent' },
                          }}
                          aria-label={`Удалить строку ${number}`}
                          disabled={rows.length === 1}
                          onClick={() => {
                            setRows((list) =>
                              list.filter((item) => item.key !== row.key),
                            );
                          }}
                        >
                          <Icon src={trashIcon} size={20} />
                        </chakra.button>
                      </Flex>
                      <Stack gridArea="product" gap="1">
                        <RowLabel htmlFor={id('product')}>Продукт</RowLabel>
                        <SelectField
                          id={id('product')}
                          value={row.product}
                          placeholder="Выберите продукт"
                          options={productOptions}
                          onChange={(event) => {
                            const product = event.target.value;
                            setRows((list) =>
                              list.map((item) =>
                                item.key === row.key
                                  ? { ...item, product }
                                  : item,
                              ),
                            );
                          }}
                        />
                      </Stack>
                      <Stack gridArea="quantity" gap="1">
                        <RowLabel htmlFor={id('quantity')}>Количество</RowLabel>
                        <QuantityInput
                          id={id('quantity')}
                          name={`quantity-${String(row.key)}`}
                          defaultValue={
                            pending?.lines[index]?.quantity === undefined
                              ? ''
                              : formatThousandths(pending.lines[index].quantity)
                          }
                          unit={unit}
                        />
                      </Stack>
                      <Stack gridArea="made" gap="1">
                        <RowLabel htmlFor={id('made')}>
                          Дата и время изготовления
                        </RowLabel>
                        <Flex gap="1.5">
                          <DateInput
                            id={id('made')}
                            name={`made-date-${String(row.key)}`}
                            defaultValue={
                              civilFields(pending?.lines[index]?.manufacturedAt)
                                .date
                            }
                            w="auto"
                            flex="1"
                            minW="0"
                          />
                          <TimeInput
                            w={{ base: rem(96), '2xl': rem(72) }}
                            name={`made-time-${String(row.key)}`}
                            defaultValue={
                              civilFields(pending?.lines[index]?.manufacturedAt)
                                .time
                            }
                            aria-label={`Время изготовления, строка ${number}`}
                          />
                        </Flex>
                      </Stack>
                      <Stack gridArea="shelf" gap="1">
                        <RowLabel htmlFor={id('shelf')}>Срок годности</RowLabel>
                        <Flex gap="1.5">
                          <TextInput
                            id={id('shelf')}
                            name={`shelf-${String(row.key)}`}
                            defaultValue={
                              pending?.lines[index]?.shelfLife.value
                            }
                            inputMode="numeric"
                            placeholder="0"
                            w={rem(64)}
                            flexShrink="0"
                          />
                          <Box flex="1" minW="0">
                            <SelectField
                              options={[{ value: 'days', label: 'дней' }]}
                              aria-label={`Единица срока годности, строка ${number}`}
                            />
                          </Box>
                        </Flex>
                      </Stack>
                      <Stack gridArea="received" gap="1">
                        <RowLabel htmlFor={id('received')}>
                          Дата и время поступления
                        </RowLabel>
                        <Flex gap="1.5">
                          <DateInput
                            id={id('received')}
                            name={`received-date-${String(row.key)}`}
                            defaultValue={
                              civilFields(pending?.lines[index]?.receivedAt)
                                .date ||
                              formatInstant(openedAt, timeZone, 'date')
                            }
                            w="auto"
                            flex="1"
                            minW="0"
                          />
                          <TimeInput
                            w={{ base: rem(96), '2xl': rem(72) }}
                            name={`received-time-${String(row.key)}`}
                            defaultValue={
                              civilFields(pending?.lines[index]?.receivedAt)
                                .time ||
                              formatInstant(openedAt, timeZone, 'time')
                            }
                            aria-label={`Время поступления, строка ${number}`}
                          />
                        </Flex>
                      </Stack>
                    </Grid>
                  );
                })}
              </Stack>
            </Stack>
            <Button
              variant="secondary"
              alignSelf={{ base: 'stretch', sm: 'flex-start' }}
              px="calc({spacing.3} - 1px)"
              py="calc({spacing.2} - 1px)"
              onClick={() => {
                setRows((list) => [...list, { key: next, product: '' }]);
                setNext((value) => value + 1);
              }}
            >
              <MaskIcon src={plusIcon} size={20} />
              Добавить строку
            </Button>
          </Stack>
          <CardFooter>
            <Text textStyle="caption.default" color="text.secondary">
              Если в форме ошибка, ничего не сохранится.
            </Text>
            <Flex
              direction={{ base: 'column-reverse', sm: 'row' }}
              gap="3"
              flexShrink="0"
            >
              <ButtonLink variant="secondary" to={path('/warehouse')}>
                Отменить
              </ButtonLink>
              <Button
                type="submit"
                disabled={
                  productRead.value === undefined ||
                  products.length === 0 ||
                  wait.waiting
                }
              >
                {status === 'sending' ? 'Принимаем…' : 'Принять поставку'}
              </Button>
            </Flex>
          </CardFooter>
        </chakra.fieldset>
        {status === 'unknown' && (
          <Button type="submit">Проверить результат</Button>
        )}
      </SplitCardForm>
    </Stack>
  );
}
