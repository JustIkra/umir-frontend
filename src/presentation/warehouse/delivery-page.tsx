import { Box, Flex, Grid, Stack, Text, chakra } from '@chakra-ui/react';
import { useId, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import type { DeliveryFlow, DeliveryPhase } from '@/application/delivery-flow';
import type { Product } from '@/application/restaurant';
import {
  addDeliveryLine,
  removeDeliveryLine,
  setDeliveryField,
  setLineField,
  type DeliveryLineDraft,
} from '@/domain/delivery-draft';
import { unitShort } from '@/domain/quantity';
import { PageHeader } from '@/presentation/app-shell/pages';
import { useRestaurantPath } from '@/presentation/app-shell/paths';
import plusIcon from '@/presentation/assets/icons/plus-24.svg';
import trashIcon from '@/presentation/assets/icons/trash-24.svg';
import { productMap } from '@/presentation/orders/order-rows';
import { useServices } from '@/presentation/services';
import {
  useAccess,
  useReadModel,
  useRestaurantData,
  useStore,
} from '@/presentation/session/hooks';
import { media } from '@/presentation/theme/system';
import { Button, ButtonLink } from '@/presentation/ui/actions';
import { Badge } from '@/presentation/ui/badge';
import { Breadcrumbs } from '@/presentation/ui/breadcrumbs';
import {
  CardFooter,
  ListCard,
  SplitCardBody,
  SplitCardForm,
} from '@/presentation/ui/card';
import {
  FieldGroup,
  FieldLabel,
  FieldMessage,
  QuantityInput,
  RadioGroupField,
  SelectField,
  TextInput,
} from '@/presentation/ui/form';
import { FormMessage } from '@/presentation/ui/form-message';
import { Icon, MaskIcon } from '@/presentation/ui/icon';
import { plural } from '@/presentation/ui/plural';
import { rem } from '@/presentation/ui/units';
import { zoneLabel } from '@/presentation/ui/zones';
import {
  checkFailedMessage,
  civilNow,
  civilParts,
  deliveryErrors,
  deliveryInput,
  deliveryMessage,
  deliverySummary,
  expiredNote,
  occurrenceOptions,
  organizationSettings,
  receiptView,
  repeatedTimeText,
  skippedTimeText,
  timeFieldsOf,
  withCivilPart,
  type LineErrors,
} from './delivery-form';

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

// Native date and time inputs give 'YYYY-MM-DD' and 'HH:MM' whatever the
// browser language; without the picker icon they look like the fields of P1.
const noPicker = {
  '&::-webkit-calendar-picker-indicator': { display: 'none' },
} as const;

const wideColumns = `${rem(28)} minmax(${rem(160)}, ${rem(200)}) ${rem(128)} ${rem(188)} ${rem(176)} ${rem(188)} ${rem(40)}`;

const shelfLifeUnits = [
  { value: 'day', label: 'дней' },
  { value: 'month', label: 'месяцев' },
] as const;

const byName = (a: Product, b: Product) => a.name.localeCompare(b.name, 'ru');

const count = (value: number, one: string, few: string, many: string) =>
  `${String(value)} ${plural(value, one, few, many)}`;

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

// A date and a time input over one draft value.
function CivilInputs({
  id,
  value,
  timeLabel,
  invalid,
  describedBy,
  compact,
  onPart,
}: {
  id: string;
  value: string;
  timeLabel: string;
  invalid: boolean;
  describedBy: string | undefined;
  compact: boolean;
  onPart: (part: 'date' | 'time', text: string) => void;
}) {
  const { date, time } = civilParts(value);
  return (
    <Flex gap="1.5">
      <TextInput
        id={id}
        type="date"
        value={date}
        flex="1"
        minW="0"
        invalid={invalid}
        aria-describedby={describedBy}
        css={noPicker}
        onChange={(event) => {
          onPart('date', event.target.value);
        }}
      />
      <TextInput
        type="time"
        value={time}
        w={compact ? { base: rem(96), '2xl': rem(72) } : rem(96)}
        flexShrink="0"
        invalid={invalid}
        aria-label={timeLabel}
        aria-describedby={describedBy}
        css={noPicker}
        onChange={(event) => {
          onPart('time', event.target.value);
        }}
      />
    </Flex>
  );
}

// DS01 under a repeated time: one choice for every time of the next submit.
function OccurrenceChoice({
  name,
  value,
  onChange,
}: {
  name: string;
  value: 'earlier' | 'later' | undefined;
  onChange: (value: 'earlier' | 'later') => void;
}) {
  return (
    <RadioGroupField
      legend={repeatedTimeText}
      name={name}
      options={occurrenceOptions}
      value={value ?? ''}
      onChange={(chosen) => {
        if (chosen === 'earlier' || chosen === 'later') onChange(chosen);
      }}
    />
  );
}

// Figma P1–P10, DS01–DS03 «Приём поставки». The draft and an attempt whose
// answer was lost live in the tab (DeliveryFlow); the page checks the fields
// before sending and never changes what the operator typed.
export function DeliveryPage() {
  const { restaurantID = '' } = useParams();
  const { deliveryFlow } = useServices();
  const flow = deliveryFlow(restaurantID);
  return flow === undefined ? null : (
    <DeliveryView flow={flow} restaurantID={restaurantID} />
  );
}

function DeliveryView({
  flow,
  restaurantID,
}: {
  flow: DeliveryFlow;
  restaurantID: string;
}) {
  const path = useRestaurantPath();
  const base = useId();
  const { now, access: accessStore } = useServices();
  const access = useAccess();
  const data = useRestaurantData();
  const items = useReadModel(data.products()).value?.result.items;
  const snapshot = useStore(flow);
  const [checked, setChecked] = useState(false);
  const { draft, phase } = snapshot;
  const settings = organizationSettings(access, restaurantID);
  const timeZone = settings?.timeZone ?? 'UTC';
  const nowMs = now();
  const zone = zoneLabel(timeZone, nowMs);
  const products = productMap(items ?? []);
  // Without the settings the zone is unknown, not UTC.
  const zoneText = settings === undefined ? '' : ` Время — ${zone}.`;
  const header = (
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
        description={`Каждая строка — отдельная партия. «Годна до» рассчитает склад от изготовления.${zoneText}`}
      />
    </Stack>
  );
  const restart = () => {
    setChecked(false);
    flow.restart();
  };
  if (phase.kind === 'received') {
    return (
      <Stack gap={{ base: '4', sm: '6' }}>
        {header}
        <ReceivedDelivery
          phase={phase}
          products={products}
          timeZone={timeZone}
          stockPath={path('/warehouse')}
          onRestart={restart}
        />
      </Stack>
    );
  }
  if (settings === undefined) {
    return (
      <Stack gap={{ base: '4', sm: '6' }}>
        {header}
        <FormMessage
          tone="unknown"
          title="Настройки организации не получены"
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void accessStore.refresh();
              }}
            >
              Повторить
            </Button>
          }
        >
          Сервис авторизации не ответил, поэтому часовой пояс организации
          неизвестен. Поставку нельзя оформить, пока настройки не получены.
        </FormMessage>
      </Stack>
    );
  }
  const message = deliveryMessage(phase, zone);
  if (phase.kind === 'conflict' && message !== undefined) {
    // P8: the delivery is already recorded; sending this draft again would
    // meet the same conflict.
    return (
      <Stack gap={{ base: '4', sm: '6' }}>
        {header}
        <FormMessage
          tone={message.tone}
          title={message.title}
          action={
            <>
              <ButtonLink to={path('/warehouse')}>К остаткам</ButtonLink>
              <Button variant="secondary" onClick={restart}>
                Принять ещё поставку
              </Button>
            </>
          }
        >
          {message.text}
        </FormMessage>
      </Stack>
    );
  }
  const locked = snapshot.locked;
  const errors = checked
    ? deliveryErrors(draft, products, civilNow(nowMs, timeZone))
    : undefined;
  const fieldErrors = errors?.fields ?? {};
  const lineErrors = errors?.lines ?? new Map<number, LineErrors>();
  const summary =
    errors !== undefined && errors.count > 0
      ? deliverySummary(errors.count)
      : undefined;
  const repeated =
    phase.kind === 'ambiguous-time'
      ? timeFieldsOf(draft, timeZone, 'repeated')
      : new Set<string>();
  const skipped =
    phase.kind === 'nonexistent-time'
      ? timeFieldsOf(draft, timeZone, 'skipped')
      : new Set<string>();
  const occurrence = (name: string) => (
    <OccurrenceChoice
      name={name}
      value={snapshot.occurrence}
      onChange={(value) => {
        flow.chooseOccurrence(value);
      }}
    />
  );
  // The zone may read the time differently from this browser: then DS01 and
  // DS02 stand above the form.
  let timeNotice: ReactNode = null;
  if (phase.kind === 'ambiguous-time' && repeated.size === 0) {
    timeNotice = (
      <Box
        role="alert"
        px="4"
        py="3"
        bg="bg.errorSubtle"
        borderWidth="1px"
        borderColor="border.error"
        borderRadius="md"
      >
        {occurrence(`${base}-occurrence`)}
      </Box>
    );
  } else if (phase.kind === 'nonexistent-time' && skipped.size === 0) {
    timeNotice = <FormMessage tone="error" title={skippedTimeText} />;
  }
  const productOptions = [...(items ?? [])].sort(byName).map((product) => ({
    value: product.productID,
    label: product.name,
  }));
  const editLine = (
    key: number,
    field: Parameters<typeof setLineField>[2],
    value: (line: DeliveryLineDraft) => string,
  ) => {
    flow.edit((current) => {
      const line = current.lines.find((item) => item.key === key);
      return line === undefined
        ? current
        : setLineField(current, key, field, value(line));
    });
  };
  const submit = () => {
    if (locked) return;
    const found = deliveryErrors(draft, products, civilNow(now(), timeZone));
    if (found.count > 0) {
      setChecked(true);
      return;
    }
    setChecked(false);
    void flow.submit(
      deliveryInput(draft, settings.settingsVersion, snapshot.occurrence),
    );
  };
  const createdError = fieldErrors.createdAt;
  const createdSkipped = skipped.has('createdAt');
  const lines = draft.lines;
  return (
    <Stack gap={{ base: '4', sm: '6' }}>
      {header}
      {summary !== undefined ? (
        <FormMessage tone="error" title={summary.title}>
          {summary.text}
        </FormMessage>
      ) : (
        message !== undefined && (
          <FormMessage tone={message.tone} title={message.title}>
            {message.text}
          </FormMessage>
        )
      )}
      {phase.kind === 'unknown' && snapshot.notice?.kind === 'check-failed' && (
        <FormMessage
          tone={checkFailedMessage.tone}
          title={checkFailedMessage.title}
        >
          {checkFailedMessage.text}
        </FormMessage>
      )}
      {timeNotice}
      <SplitCardForm
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <chakra.fieldset
          disabled={locked}
          display="contents"
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
                  placeholder="Например, 1192"
                  value={draft.number}
                  invalid={fieldErrors.number !== undefined}
                  aria-describedby="delivery-number-hint"
                  onChange={(event) => {
                    const value = event.target.value;
                    flow.edit((current) =>
                      setDeliveryField(current, 'number', value),
                    );
                  }}
                />
                <FieldMessage
                  id="delivery-number-hint"
                  hint="Номер из накладной; может повторяться у разных поставок"
                  error={fieldErrors.number}
                />
              </FieldGroup>
              <FieldGroup>
                <FieldLabel htmlFor="delivery-date">
                  {`Дата и время создания поставки (${zone})`}
                </FieldLabel>
                <CivilInputs
                  id="delivery-date"
                  value={draft.createdAt}
                  timeLabel={`Время создания поставки (${zone})`}
                  invalid={createdError !== undefined || createdSkipped}
                  describedBy="delivery-date-hint"
                  compact={false}
                  onPart={(part, text) => {
                    flow.edit((current) =>
                      setDeliveryField(
                        current,
                        'createdAt',
                        withCivilPart(current.createdAt, part, text),
                      ),
                    );
                  }}
                />
                <FieldMessage
                  id="delivery-date-hint"
                  hint="Не позже текущего времени"
                  error={
                    createdError ??
                    (createdSkipped ? skippedTimeText : undefined)
                  }
                />
                {repeated.has('createdAt') &&
                  occurrence(`${base}-occurrence-created`)}
              </FieldGroup>
            </Grid>
          </SplitCardBody>
          <Stack gap="3">
            <Flex justify="space-between" align="baseline" wrap="wrap" gap="2">
              <chakra.h2 textStyle="heading.h3">
                {`Строки поставки · ${String(lines.length)}`}
              </chakra.h2>
              <Text textStyle="caption.default" color="text.secondary">
                {`${count(lines.length, 'строка', 'строки', 'строк')} → ${count(lines.length, 'партия', 'партии', 'партий')}`}
              </Text>
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
                <span>{`Изготовлено (${zone})`}</span>
                <span>Срок годности</span>
                <span>{`Поступило (${zone})`}</span>
              </Grid>
              <Stack
                as="ol"
                gap={{ base: '3', '2xl': '0' }}
                listStyleType="none"
              >
                {lines.map((row, index) => {
                  const number = String(index + 1);
                  const key = String(row.key);
                  const id = (field: string) => `${base}-${field}-${key}`;
                  const errorsOf = lineErrors.get(row.key) ?? {};
                  const product = products.get(row.productID);
                  const madeSkipped = skipped.has(`${key}.manufacturedAt`);
                  const receivedSkipped = skipped.has(`${key}.receivedAt`);
                  const madeError =
                    errorsOf.manufacturedAt ??
                    (madeSkipped ? skippedTimeText : undefined);
                  const receivedError =
                    errorsOf.receivedAt ??
                    (receivedSkipped ? skippedTimeText : undefined);
                  const describedBy = (field: string, error: unknown) =>
                    error === undefined ? undefined : id(`${field}-error`);
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
                          disabled={lines.length === 1}
                          onClick={() => {
                            flow.edit((current) =>
                              removeDeliveryLine(current, row.key),
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
                          placeholder="Выберите продукт"
                          options={productOptions}
                          value={row.productID}
                          invalid={errorsOf.productID !== undefined}
                          aria-describedby={describedBy(
                            'product',
                            errorsOf.productID,
                          )}
                          onChange={(event) => {
                            const value = event.target.value;
                            editLine(row.key, 'productID', () => value);
                          }}
                        />
                        <FieldMessage
                          id={id('product-error')}
                          error={errorsOf.productID}
                        />
                      </Stack>
                      <Stack gridArea="quantity" gap="1">
                        <RowLabel htmlFor={id('quantity')}>Количество</RowLabel>
                        <QuantityInput
                          id={id('quantity')}
                          unit={
                            product === undefined
                              ? ''
                              : unitShort(product.baseUnit)
                          }
                          value={row.quantity}
                          invalid={errorsOf.quantity !== undefined}
                          aria-describedby={describedBy(
                            'quantity',
                            errorsOf.quantity,
                          )}
                          onChange={(event) => {
                            const value = event.target.value;
                            editLine(row.key, 'quantity', () => value);
                          }}
                        />
                        <FieldMessage
                          id={id('quantity-error')}
                          error={errorsOf.quantity}
                        />
                      </Stack>
                      <Stack gridArea="made" gap="1">
                        <RowLabel htmlFor={id('made')}>
                          {`Дата и время изготовления (${zone})`}
                        </RowLabel>
                        <CivilInputs
                          id={id('made')}
                          value={row.manufacturedAt}
                          timeLabel={`Время изготовления (${zone}), строка ${number}`}
                          invalid={madeError !== undefined}
                          describedBy={describedBy('made', madeError)}
                          compact
                          onPart={(part, text) => {
                            editLine(row.key, 'manufacturedAt', (line) =>
                              withCivilPart(line.manufacturedAt, part, text),
                            );
                          }}
                        />
                        <FieldMessage id={id('made-error')} error={madeError} />
                        {repeated.has(`${key}.manufacturedAt`) &&
                          occurrence(id('occurrence-made'))}
                      </Stack>
                      <Stack gridArea="shelf" gap="1">
                        <RowLabel htmlFor={id('shelf')}>Срок годности</RowLabel>
                        <Flex gap="1.5">
                          <TextInput
                            id={id('shelf')}
                            inputMode="numeric"
                            placeholder="0"
                            w={rem(64)}
                            flexShrink="0"
                            value={row.shelfLifeValue}
                            invalid={errorsOf.shelfLife !== undefined}
                            aria-describedby={describedBy(
                              'shelf',
                              errorsOf.shelfLife,
                            )}
                            onChange={(event) => {
                              const value = event.target.value;
                              editLine(row.key, 'shelfLifeValue', () => value);
                            }}
                          />
                          <Box flex="1" minW="0">
                            <SelectField
                              options={shelfLifeUnits}
                              value={row.shelfLifeUnit}
                              aria-label={`Единица срока годности, строка ${number}`}
                              onChange={(event) => {
                                const value = event.target.value;
                                editLine(row.key, 'shelfLifeUnit', () => value);
                              }}
                            />
                          </Box>
                        </Flex>
                        <FieldMessage
                          id={id('shelf-error')}
                          error={errorsOf.shelfLife}
                        />
                      </Stack>
                      <Stack gridArea="received" gap="1">
                        <RowLabel htmlFor={id('received')}>
                          {`Дата и время поступления (${zone})`}
                        </RowLabel>
                        <CivilInputs
                          id={id('received')}
                          value={row.receivedAt}
                          timeLabel={`Время поступления (${zone}), строка ${number}`}
                          invalid={receivedError !== undefined}
                          describedBy={describedBy('received', receivedError)}
                          compact
                          onPart={(part, text) => {
                            editLine(row.key, 'receivedAt', (line) =>
                              withCivilPart(line.receivedAt, part, text),
                            );
                          }}
                        />
                        <FieldMessage
                          id={id('received-error')}
                          error={receivedError}
                        />
                        {repeated.has(`${key}.receivedAt`) &&
                          occurrence(id('occurrence-received'))}
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
                flow.edit(addDeliveryLine);
              }}
            >
              <MaskIcon src={plusIcon} size={20} />
              Добавить строку
            </Button>
          </Stack>
        </chakra.fieldset>
        <CardFooter>
          <Text textStyle="caption.default" color="text.secondary">
            {phase.kind === 'unknown'
              ? 'Поля закрыты до результата.'
              : 'Склад проверит всю форму; при ошибке ничего не записывается.'}
          </Text>
          <Flex
            direction={{ base: 'column-reverse', sm: 'row' }}
            gap="3"
            flexShrink="0"
          >
            {phase.kind === 'unknown' ? (
              <Button
                disabled={phase.checking}
                aria-busy={phase.checking ? 'true' : undefined}
                onClick={() => {
                  void flow.check();
                }}
              >
                {phase.checking
                  ? 'Проверяем результат…'
                  : 'Проверить результат'}
              </Button>
            ) : (
              <>
                <ButtonLink variant="secondary" to={path('/warehouse')}>
                  Отменить
                </ButtonLink>
                <Button
                  type="submit"
                  disabled={phase.kind === 'sending'}
                  aria-busy={phase.kind === 'sending' ? 'true' : undefined}
                >
                  {phase.kind === 'sending' ? 'Принимаем…' : 'Принять поставку'}
                </Button>
              </>
            )}
          </Flex>
        </CardFooter>
      </SplitCardForm>
    </Stack>
  );
}

// Figma P6: the batches with «годна до» from the warehouse; a batch already
// expired on receipt waits for a confirmed write-off.
function ReceivedDelivery({
  phase,
  products,
  timeZone,
  stockPath,
  onRestart,
}: {
  phase: Extract<DeliveryPhase, { readonly kind: 'received' }>;
  products: ReadonlyMap<string, Product>;
  timeZone: string;
  stockPath: string;
  onRestart: () => void;
}) {
  const view = receiptView(phase, products, timeZone);
  return (
    <Stack gap="4">
      <FormMessage tone="success" title={view.title}>
        {view.text}
      </FormMessage>
      <ListCard p="0">
        {view.rows.map((row, index) => (
          <Stack
            as="li"
            key={row.batchID}
            gap="1"
            px="4"
            py="3"
            borderTopWidth={index === 0 ? '0' : '1px'}
            borderColor="border.default"
          >
            <Text textStyle="body.strong">{row.title}</Text>
            <Text textStyle="body.default" color="text.secondary">
              {row.batch}
            </Text>
            {row.expired && (
              <Flex wrap="wrap" align="center" columnGap="2" rowGap="1">
                <Badge tone="expiry">Ожидает списания</Badge>
                <Text textStyle="caption.default">{expiredNote}</Text>
              </Flex>
            )}
          </Stack>
        ))}
      </ListCard>
      <Flex direction={{ base: 'column-reverse', sm: 'row' }} gap="3">
        <Button variant="secondary" onClick={onRestart}>
          Принять ещё поставку
        </Button>
        <ButtonLink to={stockPath}>К остаткам</ButtonLink>
      </Flex>
    </Stack>
  );
}
