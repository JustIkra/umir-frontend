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
import { FormMessage } from '@/presentation/ui/form-message';
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
import { DateField } from '@/presentation/ui/date-field';
import {
  FieldGroup,
  FieldLabel,
  FieldMessage,
  QuantityInput,
  TextInput,
} from '@/presentation/ui/form';
import { Icon, MaskIcon } from '@/presentation/ui/icon';
import { ruDateToIso } from '@/presentation/ui/masks';
import { SearchSelect } from '@/presentation/ui/search-select';
import { Stepper, daysUnit } from '@/presentation/ui/stepper';
import { TimeField } from '@/presentation/ui/time-field';
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

// The date field is at least 148 wide, so a date with a time (100) needs 254;
// the fixed columns and the 6 gaps of 8 sum to 1014, which fits the content of
// a 1400 screen (1030) and leaves the product at least 112.
const wideColumns = `${rem(24)} minmax(${rem(112)}, 1fr) ${rem(104)} ${rem(254)} ${rem(170)} ${rem(254)} ${rem(40)}`;
const rowTimeWidth = { base: rem(112), '2xl': rem(100) } as const;

function RowLabel({
  htmlFor,
  id,
  children,
}: {
  htmlFor: string;
  id?: string;
  children: string;
}) {
  return (
    <chakra.label
      htmlFor={htmlFor}
      id={id}
      textStyle="caption.strong"
      css={hiddenWide}
    >
      {children}
    </chakra.label>
  );
}

interface Row {
  readonly key: number;
  readonly product: string;
  readonly shelf: string;
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
    timezoneChanged ||
    productRead.value === undefined;
  const [dirty, setDirty] = useState(false);
  useLeaveGuard(dirty && pending === undefined ? 'Форма поставки' : undefined);
  const todayIso = ruDateToIso(formatInstant(openedAt, timeZone, 'date'));
  const nowTime = formatInstant(now(), timeZone, 'time');
  const productOptions = products.map((product) => ({
    value: product.productID,
    label: product.name,
    code: product.productID,
  }));
  const markDirty = () => {
    setDirty(true);
  };
  const [rows, setRows] = useState<readonly Row[]>(() =>
    pending === undefined
      ? [{ key: 1, product: '', shelf: '' }]
      : pending.lines.map((line, index) => ({
          key: index + 1,
          product: line.productID,
          shelf: line.shelfLife.value,
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
              'Заполните все поля: номер поставки, продукт, количество больше нуля, срок годности, даты и время. Время — от 00:00 до 23:59.',
            );
            return;
          }
          setStatus('sending');
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
              setStatus(
                result.kind === 'unknown'
                  ? 'unknown'
                  : result.kind === 'reset'
                    ? 'reset'
                    : 'refused',
              );
              setMessage(
                result.kind === 'unknown'
                  ? 'Связь прервалась. Нажмите «Проверить результат» — поставка не задвоится. Пока форму менять нельзя.'
                  : result.kind === 'reset'
                    ? 'Была короткая техническая пауза. Прежде чем отправлять снова, проверьте поставку в истории склада.'
                    : result.kind === 'refused' &&
                        result.code === 'SettingsChanged'
                      ? 'Изменились настройки времени ресторана. Обновите страницу и проверьте даты.'
                      : 'Проверьте даты и количество и попробуйте ещё раз.',
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
                <FieldLabel htmlFor="delivery-date" id="delivery-date-label">
                  Дата и время создания поставки
                </FieldLabel>
                <Flex gap="1.5">
                  <DateField
                    id="delivery-date"
                    labelId="delivery-date-label"
                    name="createdDate"
                    defaultValue={ruDateToIso(created.date) || todayIso}
                    today={todayIso}
                    timeZone={timeZone}
                    disabled={closed}
                    onValueChange={markDirty}
                    aria-describedby="delivery-date-hint"
                  />
                  <Box w={rem(112)} flexShrink="0">
                    <TimeField
                      id="delivery-time"
                      name="createdTime"
                      defaultValue={
                        created.time ||
                        formatInstant(openedAt, timeZone, 'time')
                      }
                      now={nowTime}
                      disabled={closed}
                      onValueChange={markDirty}
                      aria-label="Время создания поставки"
                      aria-describedby="delivery-date-hint"
                    />
                  </Box>
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
                columnGap="2"
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
                      columnGap={{ base: '4', '2xl': '2' }}
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
                        <SearchSelect
                          id={id('product')}
                          options={productOptions}
                          value={row.product}
                          placeholder="Выберите продукт"
                          disabled={closed}
                          onValueChange={(product) => {
                            markDirty();
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
                        <RowLabel htmlFor={id('made')} id={id('made-label')}>
                          Дата и время изготовления
                        </RowLabel>
                        <Flex gap="1.5">
                          <DateField
                            id={id('made')}
                            labelId={id('made-label')}
                            name={`made-date-${String(row.key)}`}
                            defaultValue={ruDateToIso(
                              civilFields(pending?.lines[index]?.manufacturedAt)
                                .date,
                            )}
                            today={todayIso}
                            timeZone={timeZone}
                            disabled={closed}
                            onValueChange={markDirty}
                          />
                          <Box w={rowTimeWidth} flexShrink="0">
                            <TimeField
                              id={id('made-time')}
                              name={`made-time-${String(row.key)}`}
                              defaultValue={
                                civilFields(
                                  pending?.lines[index]?.manufacturedAt,
                                ).time
                              }
                              now={nowTime}
                              disabled={closed}
                              onValueChange={markDirty}
                              aria-label={`Время изготовления, строка ${number}`}
                            />
                          </Box>
                        </Flex>
                      </Stack>
                      <Stack gridArea="shelf" gap="1">
                        <RowLabel htmlFor={id('shelf')}>Срок годности</RowLabel>
                        <Stepper
                          id={id('shelf')}
                          name={`shelf-${String(row.key)}`}
                          value={row.shelf}
                          label={`строка ${number}`}
                          unit={daysUnit}
                          disabled={closed}
                          onChange={(shelf) => {
                            markDirty();
                            setRows((list) =>
                              list.map((item) =>
                                item.key === row.key
                                  ? { ...item, shelf }
                                  : item,
                              ),
                            );
                          }}
                        />
                      </Stack>
                      <Stack gridArea="received" gap="1">
                        <RowLabel
                          htmlFor={id('received')}
                          id={id('received-label')}
                        >
                          Дата и время поступления
                        </RowLabel>
                        <Flex gap="1.5">
                          <DateField
                            id={id('received')}
                            labelId={id('received-label')}
                            name={`received-date-${String(row.key)}`}
                            defaultValue={
                              ruDateToIso(
                                civilFields(pending?.lines[index]?.receivedAt)
                                  .date,
                              ) || todayIso
                            }
                            today={todayIso}
                            timeZone={timeZone}
                            disabled={closed}
                            onValueChange={markDirty}
                          />
                          <Box w={rowTimeWidth} flexShrink="0">
                            <TimeField
                              id={id('received-time')}
                              name={`received-time-${String(row.key)}`}
                              defaultValue={
                                civilFields(pending?.lines[index]?.receivedAt)
                                  .time ||
                                formatInstant(openedAt, timeZone, 'time')
                              }
                              now={nowTime}
                              disabled={closed}
                              onValueChange={markDirty}
                              aria-label={`Время поступления, строка ${number}`}
                            />
                          </Box>
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
                setRows((list) => [
                  ...list,
                  { key: next, product: '', shelf: '' },
                ]);
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
                  productRead.value === undefined || products.length === 0
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
