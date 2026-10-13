import { Flex, Grid, Stack, Text, chakra } from '@chakra-ui/react';
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
  FieldGroup,
  FieldLabel,
  FieldMessage,
  QuantityInput,
  SelectField,
  TextInput,
} from '@/presentation/ui/form';
import { Icon, MaskIcon } from '@/presentation/ui/icon';
import { rem } from '@/presentation/ui/units';

const productOptions = products.map((product) => ({
  value: product.code,
  label: product.name,
}));

// From 768 the column heads name the fields, so the labels are hidden
// visually but stay for screen readers.
const hiddenFromSm = {
  [media.sm]: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  },
} as const;

const rowColumns = {
  base: '1fr auto',
  sm: `${rem(24)} 1fr ${rem(220)} ${rem(40)}`,
};

interface Row {
  readonly key: number;
  readonly product: string;
}

// Figma K14 «Новое блюдо» and K16 with ingredients: a row per ingredient from
// 768, a card per ingredient on 390. Rows are added and removed in place; the
// unit follows the chosen product. Nothing is checked or saved.
export function NewDishPage() {
  const path = useRestaurantPath();
  const navigate = useNavigate();
  const base = useId();
  const [rows, setRows] = useState<readonly Row[]>([]);
  const [next, setNext] = useState(1);
  return (
    <Stack gap={{ base: '4', sm: '6' }}>
      <Stack gap={{ base: '4', sm: '6' }}>
        <Breadcrumbs
          items={[
            { title: 'Справочники', to: path('/catalog') },
            { title: 'Блюда', to: path('/catalog/dishes') },
            { title: 'Новое блюдо' },
          ]}
        />
        <PageHeader
          title="Новое блюдо"
          description="Рецептура — на одну порцию, количества в базовой единице продукта. Определение нельзя изменить после создания."
        />
      </Stack>
      <SplitCardForm
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void navigate(path('/catalog/dishes'));
        }}
      >
        <SplitCardBody>
          <Stack gap="6" maxW={rem(560)}>
            <FieldGroup>
              <FieldLabel htmlFor="dish-name">Название</FieldLabel>
              <TextInput
                id="dish-name"
                name="name"
                placeholder="Например, Паста с белыми грибами"
              />
            </FieldGroup>
            <FieldGroup>
              <FieldLabel htmlFor="dish-code">Код блюда</FieldLabel>
              <TextInput
                id="dish-code"
                name="code"
                inputMode="numeric"
                placeholder="Например, 213"
                aria-describedby="dish-code-hint"
              />
              <FieldMessage
                id="dish-code-hint"
                hint="Постоянный код блюда для заказов и истории. Должен быть уникальным."
              />
            </FieldGroup>
          </Stack>
        </SplitCardBody>
        <Stack gap="3">
          <Flex justify="space-between" align="baseline" wrap="wrap" gap="2">
            <chakra.h2 textStyle="heading.h3">
              {`Рецептура одной порции · ${String(rows.length)}`}
            </chakra.h2>
            <Text textStyle="caption.default" color="text.secondary">
              Количество — в единице продукта, до тысячных
            </Text>
          </Flex>
          {rows.length === 0 ? (
            <Text textStyle="caption.default" color="text.secondary">
              Ингредиентов пока нет. Добавьте продукт и количество на одну
              порцию.
            </Text>
          ) : (
            <Stack gap="0">
              <Grid
                aria-hidden="true"
                display={{ base: 'none', sm: 'grid' }}
                gridTemplateColumns={rowColumns.sm}
                columnGap="3"
                py="2"
                borderBottomWidth="1px"
                borderColor="border.default"
                textStyle="caption.strong"
                color="text.secondary"
              >
                <span>№</span>
                <span>Продукт</span>
                <span>Количество на порцию</span>
              </Grid>
              <Stack as="ol" gap={{ base: '3', sm: '0' }} listStyleType="none">
                {rows.map((row, index) => {
                  const number = String(index + 1);
                  const productId = `${base}-product-${String(row.key)}`;
                  const quantityId = `${base}-quantity-${String(row.key)}`;
                  return (
                    <Grid
                      as="li"
                      key={row.key}
                      gridTemplateAreas={{
                        base: "'number remove' 'product product' 'quantity quantity'",
                        sm: "'number product quantity remove'",
                      }}
                      gridTemplateColumns={rowColumns}
                      alignItems="center"
                      columnGap="3"
                      rowGap="3"
                      p={{ base: '4', sm: '0' }}
                      py={{ sm: '3' }}
                      bg="bg.surface"
                      borderWidth={{ base: '1px', sm: '0 0 1px' }}
                      borderColor="border.default"
                      borderRadius={{ base: 'md', sm: '0' }}
                    >
                      <Text
                        gridArea="number"
                        textStyle={{
                          base: 'caption.strong',
                          sm: 'body.default',
                        }}
                        color={{ sm: 'text.secondary' }}
                      >
                        <chakra.span display={{ sm: 'none' }}>
                          Ингредиент{' '}
                        </chakra.span>
                        {number}
                      </Text>
                      <Stack gap="1" gridArea="product">
                        <chakra.label
                          htmlFor={productId}
                          textStyle="caption.strong"
                          css={hiddenFromSm}
                        >
                          Продукт
                        </chakra.label>
                        <SelectField
                          id={productId}
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
                      <Stack gap="1" gridArea="quantity">
                        <chakra.label
                          htmlFor={quantityId}
                          textStyle="caption.strong"
                          css={hiddenFromSm}
                        >
                          Количество на порцию
                        </chakra.label>
                        <QuantityInput
                          id={quantityId}
                          unit={findProduct(row.product)?.unit ?? ''}
                        />
                      </Stack>
                      <chakra.button
                        type="button"
                        gridArea="remove"
                        display="flex"
                        boxSize="10"
                        alignItems="center"
                        justifyContent="center"
                        borderRadius="md"
                        cursor="pointer"
                        _hover={{ bg: 'bg.subtle' }}
                        aria-label={`Удалить ингредиент ${number}`}
                        onClick={() => {
                          setRows((list) =>
                            list.filter((item) => item.key !== row.key),
                          );
                        }}
                      >
                        <Icon src={trashIcon} size={20} />
                      </chakra.button>
                    </Grid>
                  );
                })}
              </Stack>
            </Stack>
          )}
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
            Добавить ингредиент
          </Button>
        </Stack>
        <CardFooter>
          <Text textStyle="caption.default" color="text.secondary">
            Сервис проверит форму целиком; при ошибке ничего не записывается.
          </Text>
          <Flex
            direction={{ base: 'column-reverse', sm: 'row' }}
            gap="3"
            flexShrink="0"
          >
            <ButtonLink variant="secondary" to={path('/catalog/dishes')}>
              Отменить
            </ButtonLink>
            <Button type="submit">Создать блюдо</Button>
          </Flex>
        </CardFooter>
      </SplitCardForm>
    </Stack>
  );
}
