import { Box, Flex, Stack, Text, chakra } from '@chakra-ui/react';
import { useLoaderData } from 'react-router';
import { PageHeader } from '@/presentation/app-shell/pages';
import {
  catalogStamp,
  findProduct,
  type Dish,
} from '@/presentation/placeholder-catalog';
import { ButtonLink } from '@/presentation/ui/actions';
import { Breadcrumbs } from '@/presentation/ui/breadcrumbs';
import { CardFooter, SplitCard, SplitCardBody } from '@/presentation/ui/card';
import { ReadOnlyValue } from '@/presentation/ui/form';
import { DataTable, Td, Th } from '@/presentation/ui/table';
import { rem } from '@/presentation/ui/units';

const bareTh = { bg: 'transparent' } as const;

// Figma K13 «Рецептура»: read-only code and stamp, the recipe of one portion.
// On 390 the fields, the recipe list and the footer are separate blocks.
export function DishPage() {
  const dish = useLoaderData<Dish>();
  const recipe = dish.recipe ?? [];
  return (
    <Stack gap={{ base: '4', sm: '6' }}>
      <Stack gap={{ base: '4', sm: '6' }}>
        <Breadcrumbs
          items={[
            { title: 'Справочники', to: '/app/catalog' },
            { title: 'Блюда', to: '/app/catalog/dishes' },
            { title: dish.name },
          ]}
        />
        <PageHeader
          title={dish.name}
          description="Рецептура одной порции. Определение блюда не изменяется после создания."
        />
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
                  value={dish.code}
                  note="Постоянный, не изменяется"
                />
              </Box>
              <Box w={{ sm: rem(360) }}>
                <ReadOnlyValue
                  label="Справочник на"
                  value={catalogStamp}
                  note="Москва, UTC+3"
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
                  {recipe.map((line, index) => {
                    const product = findProduct(line.product);
                    return (
                      <chakra.tr
                        key={line.product}
                        gridTemplateAreas="'number name quantity' 'number code quantity'"
                        gridTemplateColumns="auto 1fr auto"
                        alignItems="start"
                      >
                        <Td gridArea="number" pr="0" color="text.secondary">
                          {index + 1}
                        </Td>
                        <Td gridArea="name">{product?.name}</Td>
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
                          {line.product}
                        </Td>
                        <Td
                          gridArea="quantity"
                          textStyle="mono.body"
                          textAlign="end"
                          whiteSpace="nowrap"
                        >
                          {`${line.quantity} ${product?.unit ?? ''}`}
                        </Td>
                      </chakra.tr>
                    );
                  })}
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
            <ButtonLink variant="secondary" to="/app/catalog/dishes">
              К списку блюд
            </ButtonLink>
            <ButtonLink to="/app/catalog/dishes/new">Новое блюдо</ButtonLink>
          </Flex>
        </CardFooter>
      </SplitCard>
    </Stack>
  );
}
