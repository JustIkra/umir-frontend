import { Flex, Stack, Text } from '@chakra-ui/react';
import { useNavigate } from 'react-router';
import { PageHeader } from '@/presentation/app-shell/pages';
import { useRestaurantPath } from '@/presentation/app-shell/paths';
import { unitNames, type Unit } from '@/presentation/placeholder-catalog';
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
import { rem } from '@/presentation/ui/units';

const units: readonly Unit[] = ['г', 'мл', 'шт'];

// Figma K05 «Новый продукт». «Создать продукт» only returns to the catalog.
export function NewProductPage() {
  const path = useRestaurantPath();
  const navigate = useNavigate();
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
      <SplitCardForm
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void navigate(path('/catalog'));
        }}
      >
        <SplitCardBody gap="6">
          <Stack gap="6" maxW={rem(560)}>
            <FieldGroup>
              <FieldLabel htmlFor="product-name">Название</FieldLabel>
              <TextInput
                id="product-name"
                name="name"
                placeholder="Например, Сыр бри"
              />
            </FieldGroup>
            <FieldGroup>
              <FieldLabel htmlFor="product-code">Код продукта</FieldLabel>
              <TextInput
                id="product-code"
                name="code"
                inputMode="numeric"
                placeholder="Например, 133"
                aria-describedby="product-code-hint"
              />
              <FieldMessage
                id="product-code-hint"
                hint="Постоянный код для поставок и рецептур, например артикул. Должен быть уникальным."
              />
            </FieldGroup>
          </Stack>
          <RadioGroupField
            legend="Единица учёта"
            name="unit"
            options={units.map((unit) => ({
              value: unit,
              label: unitNames[unit],
            }))}
            hint="В этой единице вводятся количества в поставках и рецептурах, до тысячных."
            hintId="product-unit-hint"
          />
        </SplitCardBody>
        <CardFooter>
          <Text textStyle="caption.default" color="text.secondary">
            Сервис проверит форму целиком; при ошибке ничего не записывается.
          </Text>
          <Flex
            direction={{ base: 'column-reverse', sm: 'row' }}
            gap="3"
            flexShrink="0"
          >
            <ButtonLink variant="secondary" to={path('/catalog')}>
              Отменить
            </ButtonLink>
            <Button type="submit">Создать продукт</Button>
          </Flex>
        </CardFooter>
      </SplitCardForm>
    </Stack>
  );
}
