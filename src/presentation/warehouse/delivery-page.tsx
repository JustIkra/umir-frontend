import { Box, Flex, Grid, Stack, Text, chakra } from '@chakra-ui/react';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { useRestaurantPath } from '@/presentation/app-shell/paths';
import plusIcon from '@/presentation/assets/icons/plus-24.svg';
import trashIcon from '@/presentation/assets/icons/trash-24.svg';
import { PageHeader } from '@/presentation/app-shell/pages';
import { findProduct, products } from '@/presentation/placeholder-catalog';
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

const productOptions = products.map((product) => ({
  value: product.code,
  label: product.name,
}));

// «1 строка», «2 строки», «5 строк»; the same for «партия».
const plural = (count: number, forms: readonly [string, string, string]) => {
  const tens = count % 100;
  const ones = count % 10;
  const form =
    tens > 10 && tens < 20
      ? forms[2]
      : ones === 1
        ? forms[0]
        : ones > 1 && ones < 5
          ? forms[1]
          : forms[2];
  return `${String(count)} ${form}`;
};

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

// Figma P1 «Приём поставки». A delivery line is a table row from 1367 (P1
// 1440), a card with two columns from 768 (P1 1024) and a card with one
// column on 390. Rows are added and removed in place; nothing is checked or
// sent: «Принять поставку» returns to the stock.
export function DeliveryPage() {
  const path = useRestaurantPath();
  const navigate = useNavigate();
  const base = useId();
  const [rows, setRows] = useState<readonly Row[]>([{ key: 1, product: '' }]);
  const [next, setNext] = useState(2);
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
          description="Каждая строка — отдельная партия. «Годна до» рассчитает склад от изготовления. Время — Москва, UTC+3."
        />
      </Stack>
      <SplitCardForm
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void navigate(path('/warehouse'));
        }}
      >
        <SplitCardBody>
          <Grid
            gridTemplateColumns={{ sm: 'repeat(2, minmax(0, 1fr))' }}
            maxW={{ sm: rem(664) }}
            columnGap="6"
            rowGap="4"
          >
            <FieldGroup>
              <FieldLabel htmlFor="delivery-number">Номер поставки</FieldLabel>
              <TextInput
                id="delivery-number"
                name="number"
                placeholder="Например, 1192"
                aria-describedby="delivery-number-hint"
              />
              <FieldMessage
                id="delivery-number-hint"
                hint="Номер из накладной; может повторяться у разных поставок"
              />
            </FieldGroup>
            <FieldGroup>
              <FieldLabel htmlFor="delivery-date">
                Дата и время создания поставки (Москва, UTC+3)
              </FieldLabel>
              <Flex gap="1.5">
                <DateInput
                  id="delivery-date"
                  name="createdDate"
                  w="auto"
                  flex="1"
                  minW="0"
                  aria-describedby="delivery-date-hint"
                />
                <TimeInput
                  name="createdTime"
                  aria-label="Время создания поставки (Москва, UTC+3)"
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
            <Text textStyle="caption.default" color="text.secondary">
              {`${plural(rows.length, ['строка', 'строки', 'строк'])} → ${plural(rows.length, ['партия', 'партии', 'партий'])}`}
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
              <span>Изготовлено (Москва, UTC+3)</span>
              <span>Срок годности</span>
              <span>Поступило (Москва, UTC+3)</span>
            </Grid>
            <Stack as="ol" gap={{ base: '3', '2xl': '0' }} listStyleType="none">
              {rows.map((row, index) => {
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
                        unit={findProduct(row.product)?.unit ?? 'г'}
                      />
                    </Stack>
                    <Stack gridArea="made" gap="1">
                      <RowLabel htmlFor={id('made')}>
                        Дата и время изготовления (Москва, UTC+3)
                      </RowLabel>
                      <Flex gap="1.5">
                        <DateInput id={id('made')} w="auto" flex="1" minW="0" />
                        <TimeInput
                          w={{ base: rem(96), '2xl': rem(72) }}
                          aria-label={`Время изготовления (Москва, UTC+3), строка ${number}`}
                        />
                      </Flex>
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
                        Дата и время поступления (Москва, UTC+3)
                      </RowLabel>
                      <Flex gap="1.5">
                        <DateInput
                          id={id('received')}
                          w="auto"
                          flex="1"
                          minW="0"
                        />
                        <TimeInput
                          w={{ base: rem(96), '2xl': rem(72) }}
                          aria-label={`Время поступления (Москва, UTC+3), строка ${number}`}
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
            Склад проверит всю форму; при ошибке ничего не записывается.
          </Text>
          <Flex
            direction={{ base: 'column-reverse', sm: 'row' }}
            gap="3"
            flexShrink="0"
          >
            <ButtonLink variant="secondary" to={path('/warehouse')}>
              Отменить
            </ButtonLink>
            <Button type="submit">Принять поставку</Button>
          </Flex>
        </CardFooter>
      </SplitCardForm>
    </Stack>
  );
}
