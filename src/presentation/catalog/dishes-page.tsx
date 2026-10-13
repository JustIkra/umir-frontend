import { Text, chakra } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router';
import { useRestaurantPath } from '@/presentation/app-shell/paths';
import arrowIcon from '@/presentation/assets/icons/arrow-right-24.svg';
import { dishes } from '@/presentation/placeholder-catalog';
import { SearchInput } from '@/presentation/ui/form';
import { Icon } from '@/presentation/ui/icon';
import { DataTable, TableCard, Td, Th } from '@/presentation/ui/table';
import { rem } from '@/presentation/ui/units';
import { CatalogLayout } from './catalog-layout';

const RowLink = chakra(RouterLink, {
  base: {
    color: 'text.primary',
    textStyle: 'body.strong',
    _hover: { color: 'text.action' },
  },
});

// Figma K12 «Блюда». Only dishes with a sample recipe open a page (206), so
// only they show the arrow. On 390 a row reads «Борщ… / Код 201».
export function DishesPage() {
  const path = useRestaurantPath();
  return (
    <CatalogLayout
      section="Блюда"
      action={{ to: path('/catalog/dishes/new'), title: 'Новое блюдо' }}
    >
      <SearchInput label="Найти блюдо по названию или коду" />
      <Text textStyle="caption.default" color="text.secondary">
        Полный список определённых блюд, в том числе тех, что сейчас недоступны
        для заказа. Доступность — в разделе «Меню и рекомендации».
      </Text>
      <TableCard>
        <DataTable rows="tall" mobile="cards">
          <colgroup>
            <col />
            <chakra.col w={rem(128)} />
            <chakra.col w={rem(56)} />
          </colgroup>
          <chakra.thead>
            <tr>
              <Th>Блюдо</Th>
              <Th colSpan={2}>Код</Th>
            </tr>
          </chakra.thead>
          <tbody>
            {dishes.map((dish) => (
              <chakra.tr
                key={dish.code}
                gridTemplateAreas="'name arrow' 'code arrow'"
                gridTemplateColumns="1fr auto"
                alignItems="center"
              >
                <Td gridArea="name">
                  {dish.recipe ? (
                    <RowLink to={path(`/catalog/dishes/${dish.code}`)}>
                      {dish.name}
                    </RowLink>
                  ) : (
                    <Text as="span" textStyle="body.strong">
                      {dish.name}
                    </Text>
                  )}
                </Td>
                <Td
                  gridArea="code"
                  textStyle={{ base: 'mono.default', sm: 'mono.body' }}
                  color="text.secondary"
                >
                  <Text
                    as="span"
                    display={{ sm: 'none' }}
                    textStyle="caption.default"
                  >
                    Код{' '}
                  </Text>
                  {dish.code}
                </Td>
                <Td gridArea="arrow" pl="0">
                  {dish.recipe && (
                    <Icon src={arrowIcon} size={24} display="block" ml="auto" />
                  )}
                </Td>
              </chakra.tr>
            ))}
          </tbody>
        </DataTable>
      </TableCard>
    </CatalogLayout>
  );
}
