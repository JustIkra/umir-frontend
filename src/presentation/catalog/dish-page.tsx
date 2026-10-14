import { Box, Flex, Stack, Text, chakra } from '@chakra-ui/react';
import { useLocation, useParams } from 'react-router';
import { PageHeader } from '@/presentation/app-shell/pages';
import { useRestaurantPath } from '@/presentation/app-shell/paths';
import { ReadFailure } from '@/presentation/app-shell/read-failure';
import catalogIcon from '@/presentation/assets/icons/catalog-24.svg';
import {
  useReadModel,
  useRestaurantData,
  useRestaurantRead,
} from '@/presentation/session/hooks';
import { ButtonLink, TextLink } from '@/presentation/ui/actions';
import { Breadcrumbs } from '@/presentation/ui/breadcrumbs';
import { CardFooter, SplitCard, SplitCardBody } from '@/presentation/ui/card';
import { ReadOnlyValue } from '@/presentation/ui/form';
import { FormMessage } from '@/presentation/ui/form-message';
import { StateCard } from '@/presentation/ui/states';
import { DataTable, Td, Th } from '@/presentation/ui/table';
import { rem } from '@/presentation/ui/units';
import { formatStamp, zoneLabel } from '@/presentation/ui/zones';
import { createdDishText, createdNoticeOf } from './catalog-forms';
import { recipeRows } from './catalog-rows';

const bareTh = { bg: 'transparent' } as const;

// Figma K13 «Рецептура»: read-only code and stamp, the recipe of one portion.
// On 390 the fields, the recipe list and the footer are separate blocks.
export function DishPage() {
  const path = useRestaurantPath();
  const data = useRestaurantData();
  const { dish: dishID = '' } = useParams();
  const model = data.dish(dishID);
  const { snapshot, failure } = useRestaurantRead(model);
  const productList = useReadModel(data.products()).value;
  const created = createdNoticeOf(useLocation().state);
  const value = snapshot.value;
  if (value === undefined) {
    if (failure === undefined) return null;
    if (
      (failure.kind === 'unavailable' || failure.kind === 'error') &&
      failure.failure.code === 'NotFound'
    ) {
      return (
        <StateCard
          icon={catalogIcon}
          title="Блюдо не найдено"
          actions={
            <TextLink to={path('/catalog/dishes')}>К списку блюд</TextLink>
          }
        >
          Такого блюда нет в каталоге этого ресторана.
        </StateCard>
      );
    }
    return (
      <ReadFailure
        failure={failure}
        section="Справочники"
        title="Не удалось получить блюдо"
        onRetry={() => {
          model.refresh();
        }}
      >
        Рецептура сейчас недоступна. Повторите чтение; определение блюда не
        меняется, пока вы ждёте.
      </ReadFailure>
    );
  }
  const dish = value.result.dish;
  const createdText =
    created?.kind === 'dish' && created.code === dish.dishID
      ? createdDishText(created.name, created.code, created.ingredients)
      : undefined;
  const { timeZone } = value.context.settings;
  const epochMs = value.result.evaluatedAt.epochMs;
  const recipe = recipeRows(dish, productList?.result.items ?? []);
  return (
    <Stack gap={{ base: '4', sm: '6' }}>
      <Stack gap={{ base: '4', sm: '6' }}>
        <Breadcrumbs
          items={[
            { title: 'Справочники', to: path('/catalog') },
            { title: 'Блюда', to: path('/catalog/dishes') },
            { title: dish.name },
          ]}
        />
        <PageHeader
          title={dish.name}
          description="Рецептура одной порции. Определение блюда не изменяется после создания."
        />
        {createdText !== undefined && (
          <FormMessage tone="success" title={createdText.title}>
            {createdText.text}
          </FormMessage>
        )}
      </Stack>
      <SplitCard>
        <Stack gap={{ base: '6', sm: '4' }}>
          <SplitCardBody>
            <Flex
              direction={{ base: 'column', sm: 'row' }}
              gap={{ base: '4', sm: '8' }}
            >
              <Box w={{ sm: rem(360) }}>
                <ReadOnlyValue
                  label="Код блюда"
                  value={dish.dishID}
                  note="Постоянный, не изменяется"
                />
              </Box>
              <Box w={{ sm: rem(360) }}>
                <ReadOnlyValue
                  label="Справочник на"
                  value={formatStamp(epochMs, timeZone)}
                  note={zoneLabel(timeZone, epochMs)}
                />
              </Box>
            </Flex>
          </SplitCardBody>
          <Stack gap={{ base: '3', sm: '4' }}>
            <Flex justify="space-between" align="baseline" wrap="wrap" gap="2">
              <chakra.h2 textStyle="heading.h3">
                {`Рецептура одной порции · ${String(recipe.length)}`}
              </chakra.h2>
              <Text
                display={{ base: 'none', sm: 'block' }}
                textStyle="caption.default"
                color="text.secondary"
              >
                Количество — в базовой единице продукта
              </Text>
            </Flex>
            <Box
              bg={{ base: 'bg.surface', sm: 'transparent' }}
              borderWidth={{ base: '1px', sm: '0' }}
              borderColor="border.default"
              borderRadius="md"
            >
              <DataTable mobile="cards">
                <chakra.thead>
                  <tr>
                    <Th {...bareTh} w={rem(36)} pr="0">
                      №
                    </Th>
                    <Th {...bareTh}>Продукт</Th>
                    <Th {...bareTh} w={rem(132)}>
                      Код
                    </Th>
                    <Th
                      {...bareTh}
                      w={rem(192)}
                      textAlign="end"
                      whiteSpace="nowrap"
                    >
                      Количество на порцию
                    </Th>
                  </tr>
                </chakra.thead>
                <tbody>
                  {recipe.map((line) => (
                    <chakra.tr
                      key={line.code}
                      gridTemplateAreas="'number name quantity' 'number code quantity'"
                      gridTemplateColumns="auto 1fr auto"
                      alignItems="start"
                    >
                      <Td gridArea="number" pr="0" color="text.secondary">
                        {line.no}
                      </Td>
                      <Td gridArea="name">{line.name}</Td>
                      <Td
                        gridArea="code"
                        textStyle="mono.default"
                        color="text.secondary"
                      >
                        <Text
                          as="span"
                          display={{ sm: 'none' }}
                          textStyle="caption.default"
                        >
                          Код{' '}
                        </Text>
                        {line.code}
                      </Td>
                      <Td
                        gridArea="quantity"
                        textStyle="mono.body"
                        textAlign="end"
                        whiteSpace="nowrap"
                      >
                        {line.quantity}
                      </Td>
                    </chakra.tr>
                  ))}
                </tbody>
              </DataTable>
            </Box>
          </Stack>
        </Stack>
        <CardFooter>
          <Text textStyle="caption.default" color="text.secondary">
            Определение нельзя изменить. Сколько порций можно приготовить сейчас
            — в разделе «Меню и рекомендации».
          </Text>
          <Flex
            direction={{ base: 'column-reverse', sm: 'row' }}
            gap="3"
            flexShrink="0"
          >
            <ButtonLink variant="secondary" to={path('/catalog/dishes')}>
              К списку блюд
            </ButtonLink>
            <ButtonLink to={path('/catalog/dishes/new')}>
              Новое блюдо
            </ButtonLink>
          </Flex>
        </CardFooter>
      </SplitCard>
    </Stack>
  );
}
