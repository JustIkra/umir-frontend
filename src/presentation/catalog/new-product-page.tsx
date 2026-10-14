import { Flex, Stack, Text, chakra } from '@chakra-ui/react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { CreateOutcome } from '@/application/catalog-commands';
import type { Product, ProductInput } from '@/application/restaurant';
import { baseUnits, unitTitles, type BaseUnit } from '@/domain/quantity';
import { useLeaveGuard } from '@/presentation/app-shell/leave-guard';
import { PageHeader } from '@/presentation/app-shell/pages';
import { useRestaurantPath } from '@/presentation/app-shell/paths';
import { useReadModel, useRestaurantData } from '@/presentation/session/hooks';
import { useServices } from '@/presentation/services';
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
  RadioGroupField,
  TextInput,
} from '@/presentation/ui/form';
import { FormMessage } from '@/presentation/ui/form-message';
import { rem } from '@/presentation/ui/units';
import {
  conflictText,
  fieldsSummary,
  outcomeMessage,
  productErrors,
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

const unitOptions = baseUnits.map((unit) => ({
  value: unit,
  label: unitTitles[unit],
}));

const asUnit = (value: string): BaseUnit | undefined =>
  baseUnits.find((unit) => unit === value);

// Figma K05–K11 «Новый продукт». The service checks the form as a whole; a
// create whose answer was lost keeps the fields closed (K11) and «Проверить
// результат» repeats the same command.
export function NewProductPage() {
  const path = useRestaurantPath();
  const navigate = useNavigate();
  const { restaurantID = '' } = useParams();
  const { catalogCommands } = useServices();
  const catalog = catalogCommands(restaurantID);
  const data = useRestaurantData();
  const suggested =
    useReadModel(data.suggestion('product')).value?.result.suggestedID ?? '';
  const known = useReadModel(data.products()).value?.result.items;
  const pending = catalog.pendingProduct();
  const [name, setName] = useState('');
  const [code, setCode] = useState<string | undefined>(undefined);
  const [unit, setUnit] = useState<BaseUnit | undefined>(undefined);
  const [status, setStatus] = useState<Status>('idle');
  const shown: Status =
    pending !== undefined && status === 'idle' ? 'unknown' : status;
  const closed =
    shown === 'sending' || shown === 'unknown' || shown === 'reset';
  const nameValue = pending?.name ?? name;
  const codeValue = pending?.productID ?? code ?? suggested;
  const unitValue = pending?.baseUnit ?? unit;
  const errors =
    shown === 'invalid' ? productErrors({ name, code: codeValue, unit }) : {};
  const errorCount = Object.keys(errors).length;
  const conflictName =
    shown === 'conflict'
      ? known?.find((product) => product.productID === codeValue.trim())?.name
      : undefined;
  const summary = fieldsSummary(errorCount, false);
  const dirty = name.trim() !== '' || unit !== undefined || code !== undefined;
  useLeaveGuard(
    dirty && pending === undefined ? 'Форма нового продукта' : undefined,
  );

  const send = async (input: ProductInput) => {
    setStatus('sending');
    const outcome: CreateOutcome<Product> =
      await catalog.registerProduct(input);
    switch (outcome.kind) {
      case 'created':
        void navigate(path('/catalog'), {
          state: {
            created: {
              kind: 'product',
              name: outcome.value.name,
              code: outcome.value.productID,
              unit: outcome.value.baseUnit,
            },
          },
        });
        return;
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
    const draft = { name, code: codeValue, unit };
    if (Object.keys(productErrors(draft)).length > 0 || unit === undefined) {
      setStatus('invalid');
      return;
    }
    void send({
      productID: codeValue.trim(),
      name: name.trim(),
      baseUnit: unit,
    });
  };

  const message =
    shown === 'invalid' && errorCount > 0
      ? { tone: 'error' as const, ...summary }
      : shown === 'conflict'
        ? {
            tone: 'error' as const,
            title: 'Продукт не создан',
            text: 'Такой код уже есть в справочнике. Ничего не записано, введённые значения сохранены.',
          }
        : shown === 'unknown' || shown === 'reset'
          ? { tone: 'unknown' as const, ...outcomeMessage('product', shown) }
          : shown === 'rejected' || shown === 'refused'
            ? {
                tone: 'error' as const,
                ...outcomeMessage(
                  'product',
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
            { title: 'Продукты', to: path('/catalog') },
            { title: 'Новый продукт' },
          ]}
        />
        <PageHeader
          title="Новый продукт"
          description="Продукт — то, что принимается на склад и входит в рецептуры. Определение нельзя изменить после создания."
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
          <SplitCardBody gap="6">
            <Stack gap="6" maxW={rem(560)}>
              <FieldGroup>
                <FieldLabel htmlFor="product-name">Название</FieldLabel>
                <TextInput
                  id="product-name"
                  name="name"
                  placeholder="Например, Сыр бри"
                  value={nameValue}
                  invalid={errors.name !== undefined}
                  aria-describedby={
                    errors.name === undefined ? undefined : 'product-name-error'
                  }
                  onChange={(event) => {
                    setName(event.target.value);
                  }}
                />
                <FieldMessage id="product-name-error" error={errors.name} />
              </FieldGroup>
              <FieldGroup>
                <FieldLabel htmlFor="product-code">Код продукта</FieldLabel>
                <TextInput
                  id="product-code"
                  name="code"
                  inputMode="numeric"
                  placeholder="Например, 133"
                  value={codeValue}
                  invalid={errors.code !== undefined || shown === 'conflict'}
                  aria-describedby="product-code-hint"
                  onChange={(event) => {
                    setCode(event.target.value);
                    if (status === 'conflict') setStatus('idle');
                  }}
                />
                <FieldMessage
                  id="product-code-hint"
                  hint="Постоянный код для поставок и рецептур, например артикул. Должен быть уникальным."
                  error={
                    shown === 'conflict'
                      ? conflictText('product', codeValue.trim(), conflictName)
                      : errors.code
                  }
                />
              </FieldGroup>
            </Stack>
            <RadioGroupField
              legend="Единица учёта"
              name="unit"
              options={unitOptions}
              value={unitValue ?? ''}
              onChange={(value) => {
                setUnit(asUnit(value));
              }}
              error={errors.unit}
              hint="В этой единице вводятся количества в поставках и рецептурах, до тысячных."
              hintId="product-unit-hint"
            />
          </SplitCardBody>
        </chakra.fieldset>
        <CardFooter>
          <Text textStyle="caption.default" color="text.secondary">
            {shown === 'sending'
              ? 'Ждём ответ сервиса. Повторное нажатие не создаст второй продукт.'
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
                <ButtonLink variant="secondary" to={path('/catalog')}>
                  Открыть список продуктов
                </ButtonLink>
                {shown === 'unknown' && pending !== undefined && (
                  <Button
                    onClick={() => {
                      void send(pending);
                    }}
                  >
                    Проверить результат
                  </Button>
                )}
              </>
            ) : (
              <>
                <ButtonLink variant="secondary" to={path('/catalog')}>
                  Отменить
                </ButtonLink>
                <Button type="submit" disabled={shown === 'sending'}>
                  {shown === 'sending' ? 'Создаём…' : 'Создать продукт'}
                </Button>
              </>
            )}
          </Flex>
        </CardFooter>
      </SplitCardForm>
    </Stack>
  );
}
