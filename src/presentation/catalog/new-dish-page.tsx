import { Flex, Grid, Stack, Text, chakra } from '@chakra-ui/react';
import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { Dish, DishInput } from '@/application/restaurant';
import { parseQuantity, unitShort } from '@/domain/quantity';
import { useLeaveGuard } from '@/presentation/app-shell/leave-guard';
import { useRestaurantPath } from '@/presentation/app-shell/paths';
import plusIcon from '@/presentation/assets/icons/plus-24.svg';
import trashIcon from '@/presentation/assets/icons/trash-24.svg';
import { PageHeader } from '@/presentation/app-shell/pages';
import {
  useAttempts,
  useReadModel,
  useRestaurantData,
} from '@/presentation/session/hooks';
import { useServices } from '@/presentation/services';
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
import { FormMessage } from '@/presentation/ui/form-message';
import { Icon, MaskIcon } from '@/presentation/ui/icon';
import { rem } from '@/presentation/ui/units';
import {
  conflictText,
  dishDraftOf,
  dishErrors,
  fieldsSummary,
  linesSummary,
  outcomeMessage,
  type RecipeLineDraft,
} from './catalog-forms';

type Status =
  | 'idle'
  | 'invalid'
  | 'sending'
  | 'conflict'
  | 'unknown'
  | 'reset'
  | 'rejected'
  | 'refused';

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

// Figma K14–K22 «Новое блюдо»: a row per ingredient from 768, a card per
// ingredient on 390. The unit follows the chosen product. The service checks
// the form as a whole; a create whose answer was lost keeps the form closed and
// «Проверить результат» repeats the same command.
export function NewDishPage() {
  const path = useRestaurantPath();
  const navigate = useNavigate();
  const base = useId();
  const { restaurantID = '' } = useParams();
  const { catalogCommands } = useServices();
  const catalog = catalogCommands(restaurantID);
  const data = useRestaurantData();
  const suggested =
    useReadModel(data.suggestion('dish')).value?.result.suggestedID ?? '';
  const products = useReadModel(data.products()).value?.result.items ?? [];
  const known = useReadModel(data.dishCatalog()).value?.result.items;
  useAttempts();
  const pending = catalog.pendingDish();
  const [start] = useState(() =>
    pending === undefined ? undefined : dishDraftOf(pending),
  );
  const [name, setName] = useState(start?.name ?? '');
  const [code, setCode] = useState<string | undefined>(start?.code);
  const [lines, setLines] = useState<readonly RecipeLineDraft[]>(
    start?.lines ?? [],
  );
  const [next, setNext] = useState((start?.lines.length ?? 0) + 1);
  const [status, setStatus] = useState<Status>(
    start === undefined ? 'idle' : 'unknown',
  );
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // The attempt was settled elsewhere (W11, or the request of a page we left):
  // the form opens again with the kept values and the list is read anew.
  const settledElsewhere = status === 'unknown' && pending === undefined;
  const dishesModel = data.dishCatalog();
  useEffect(() => {
    if (settledElsewhere) dishesModel.refresh();
  }, [settledElsewhere, dishesModel]);
  const shown: Status = settledElsewhere ? 'idle' : status;
  const closed =
    shown === 'sending' || shown === 'unknown' || shown === 'reset';
  const codeValue = code ?? suggested;
  const rows = lines;
  const productOptions = products.map((product) => ({
    value: product.productID,
    label: product.name,
  }));
  const errors =
    shown === 'invalid'
      ? dishErrors({ name, code: codeValue, lines }, products)
      : undefined;
  const fieldErrors = errors?.fields ?? {};
  const lineErrors = errors?.lines ?? new Map<number, string>();
  const lineNos = rows.flatMap((row, index) =>
    lineErrors.has(row.key) ? [index + 1] : [],
  );
  const plainFields = Object.keys(fieldErrors).filter(
    (field) => field !== 'recipe',
  ).length;
  const recipeFault = fieldErrors.recipe !== undefined || lineNos.length > 0;
  const conflictName =
    shown === 'conflict'
      ? known?.find((dish) => dish.dishID === codeValue.trim())?.name
      : undefined;
  const summary =
    plainFields > 0 || fieldErrors.recipe !== undefined
      ? fieldsSummary(plainFields + (recipeFault ? 1 : 0), recipeFault)
      : lineNos.length > 0
        ? linesSummary(lineNos)
        : undefined;
  const dirty = name.trim() !== '' || code !== undefined || lines.length > 0;
  useLeaveGuard(
    dirty && pending === undefined ? 'Форма нового блюда' : undefined,
  );

  const send = async (input: DishInput) => {
    setStatus('sending');
    const outcome = await catalog.defineDish(input);
    if (!mounted.current) return;
    switch (outcome.kind) {
      case 'created': {
        const dish: Dish = outcome.value;
        void navigate(
          path(`/catalog/dishes/${encodeURIComponent(dish.dishID)}`),
          {
            state: {
              created: {
                kind: 'dish',
                name: dish.name,
                code: dish.dishID,
                ingredients: dish.ingredients.length,
              },
            },
          },
        );
        return;
      }
      case 'conflict':
        setStatus('conflict');
        return;
      case 'unknown':
        setStatus('unknown');
        return;
      case 'reset':
        setStatus('reset');
        return;
      case 'invalid':
        setStatus('rejected');
        return;
      case 'refused':
        setStatus('refused');
        return;
      case 'ended':
        return;
    }
  };

  const submit = () => {
    const found = dishErrors({ name, code: codeValue, lines }, products);
    if (Object.keys(found.fields).length > 0 || found.lines.size > 0) {
      setStatus('invalid');
      return;
    }
    const ingredients = lines.flatMap((line) => {
      const parsed = parseQuantity(line.quantity);
      const product = products.find(
        (item) => item.productID === line.productID,
      );
      return parsed.ok && product !== undefined
        ? [
            {
              productID: line.productID,
              quantity: parsed.thousandths,
              baseUnit: product.baseUnit,
            },
          ]
        : [];
    });
    void send({ dishID: codeValue.trim(), name: name.trim(), ingredients });
  };

  const message =
    shown === 'invalid' && summary !== undefined
      ? { tone: 'error' as const, ...summary }
      : shown === 'conflict'
        ? {
            tone: 'error' as const,
            title: 'Блюдо не создано',
            text: 'Такой код уже есть в каталоге. Ничего не записано, введённые значения сохранены.',
          }
        : shown === 'unknown' || shown === 'reset'
          ? { tone: 'unknown' as const, ...outcomeMessage('dish', shown) }
          : shown === 'rejected' || shown === 'refused'
            ? {
                tone: 'error' as const,
                ...outcomeMessage(
                  'dish',
                  shown === 'rejected' ? 'invalid' : 'refused',
                ),
              }
            : undefined;
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
      {message !== undefined && (
        <FormMessage tone={message.tone} title={message.title}>
          {message.text}
        </FormMessage>
      )}
      <SplitCardForm
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!closed) submit();
        }}
      >
        <chakra.fieldset
          disabled={closed}
          display="contents"
          border="0"
          p="0"
          m="0"
        >
          <SplitCardBody>
            <Stack gap="6" maxW={rem(560)}>
              <FieldGroup>
                <FieldLabel htmlFor="dish-name">Название</FieldLabel>
                <TextInput
                  id="dish-name"
                  name="name"
                  placeholder="Например, Паста с белыми грибами"
                  value={name}
                  invalid={fieldErrors.name !== undefined}
                  aria-describedby={
                    fieldErrors.name === undefined
                      ? undefined
                      : 'dish-name-error'
                  }
                  onChange={(event) => {
                    setName(event.target.value);
                  }}
                />
                <FieldMessage id="dish-name-error" error={fieldErrors.name} />
              </FieldGroup>
              <FieldGroup>
                <FieldLabel htmlFor="dish-code">Код блюда</FieldLabel>
                <TextInput
                  id="dish-code"
                  name="code"
                  inputMode="numeric"
                  placeholder="Например, 213"
                  value={codeValue}
                  invalid={
                    fieldErrors.code !== undefined || shown === 'conflict'
                  }
                  aria-describedby="dish-code-hint"
                  onChange={(event) => {
                    setCode(event.target.value);
                    if (status === 'conflict') setStatus('idle');
                  }}
                />
                <FieldMessage
                  id="dish-code-hint"
                  hint="Постоянный код блюда для заказов и истории. Должен быть уникальным."
                  error={
                    shown === 'conflict'
                      ? conflictText('dish', codeValue.trim(), conflictName)
                      : fieldErrors.code
                  }
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
              <Stack gap="1">
                <Text textStyle="caption.default" color="text.secondary">
                  Ингредиентов пока нет. Добавьте продукт и количество на одну
                  порцию.
                </Text>
                <FieldMessage
                  id="dish-recipe-error"
                  error={fieldErrors.recipe}
                />
              </Stack>
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
                <Stack
                  as="ol"
                  gap={{ base: '3', sm: '0' }}
                  listStyleType="none"
                >
                  {rows.map((row, index) => {
                    const number = String(index + 1);
                    const product = products.find(
                      (item) => item.productID === row.productID,
                    );
                    const lineError = lineErrors.get(row.key);
                    const productFault =
                      lineError !== undefined &&
                      (row.productID === '' ||
                        rows.findIndex(
                          (item) => item.productID === row.productID,
                        ) < index);
                    const errorId = `${base}-error-${String(row.key)}`;
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
                        alignItems="start"
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
                            value={row.productID}
                            invalid={productFault}
                            aria-describedby={
                              productFault ? errorId : undefined
                            }
                            onChange={(event) => {
                              const productID = event.target.value;
                              setLines((list) =>
                                list.map((item) =>
                                  item.key === row.key
                                    ? { ...item, productID }
                                    : item,
                                ),
                              );
                            }}
                          />
                          {productFault && (
                            <FieldMessage id={errorId} error={lineError} />
                          )}
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
                            unit={
                              product === undefined
                                ? ''
                                : unitShort(product.baseUnit)
                            }
                            value={row.quantity}
                            invalid={lineError !== undefined && !productFault}
                            aria-describedby={
                              lineError !== undefined && !productFault
                                ? errorId
                                : undefined
                            }
                            onChange={(event) => {
                              const quantity = event.target.value;
                              setLines((list) =>
                                list.map((item) =>
                                  item.key === row.key
                                    ? { ...item, quantity }
                                    : item,
                                ),
                              );
                            }}
                          />
                          {lineError !== undefined && !productFault && (
                            <FieldMessage id={errorId} error={lineError} />
                          )}
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
                            setLines((list) =>
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
                setLines((list) => [
                  ...list,
                  { key: next, productID: '', quantity: '' },
                ]);
                setNext((value) => value + 1);
              }}
            >
              <MaskIcon src={plusIcon} size={20} />
              Добавить ингредиент
            </Button>
          </Stack>
        </chakra.fieldset>
        <CardFooter>
          <Text textStyle="caption.default" color="text.secondary">
            {shown === 'sending'
              ? 'Ждём ответ сервиса. Повторное нажатие не создаст второе блюдо.'
              : closed
                ? 'Поля заблокированы до результата: изменённые данные были бы уже другим запросом.'
                : 'Сервис проверит форму целиком; при ошибке ничего не записывается.'}
          </Text>
          <Flex
            direction={{ base: 'column-reverse', sm: 'row' }}
            gap="3"
            flexShrink="0"
          >
            {closed && shown !== 'sending' ? (
              <>
                <ButtonLink variant="secondary" to={path('/catalog/dishes')}>
                  Открыть список блюд
                </ButtonLink>
                {shown === 'unknown' && pending !== undefined && (
                  <Button
                    onClick={() => {
                      const current = catalog.pendingDish();
                      if (current === undefined) {
                        setStatus('idle');
                        return;
                      }
                      void send(current);
                    }}
                  >
                    Проверить результат
                  </Button>
                )}
              </>
            ) : (
              <>
                <ButtonLink variant="secondary" to={path('/catalog/dishes')}>
                  Отменить
                </ButtonLink>
                <Button type="submit" disabled={shown === 'sending'}>
                  {shown === 'sending' ? 'Создаём…' : 'Создать блюдо'}
                </Button>
              </>
            )}
          </Flex>
        </CardFooter>
      </SplitCardForm>
    </Stack>
  );
}
