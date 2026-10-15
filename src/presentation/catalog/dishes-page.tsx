import { Skeleton, Text, chakra } from '@chakra-ui/react';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { useRestaurantPath } from '@/presentation/app-shell/paths';
import { ReadFailure } from '@/presentation/app-shell/read-failure';
import arrowIcon from '@/presentation/assets/icons/arrow-right-24.svg';
import catalogIcon from '@/presentation/assets/icons/catalog-24.svg';
import {
  useRestaurantData,
  useRestaurantRead,
} from '@/presentation/session/hooks';
import { ButtonLink } from '@/presentation/ui/actions';
import { SearchInput } from '@/presentation/ui/form';
import { Icon } from '@/presentation/ui/icon';
import { StateCard } from '@/presentation/ui/states';
import { DataTable, TableCard, Td, Th } from '@/presentation/ui/table';
import { rem } from '@/presentation/ui/units';
import { CatalogLayout, StaleCatalog } from './catalog-layout';
import { catalogStamp, dishRows } from './catalog-rows';

const RowLink = chakra(RouterLink, {
  base: {
    color: 'text.primary',
    textStyle: 'body.strong',
    _hover: { color: 'text.action' },
  },
});

// Figma K12 «Блюда»: every dish opens its card. On 390 a row reads
// «Борщ… / Код 201».
export function DishesPage() {
  const path = useRestaurantPath();
  const data = useRestaurantData();
  const model = data.dishCatalog();
  const { snapshot, failure } = useRestaurantRead(model);
  const [query, setQuery] = useState('');
  const value = snapshot.value;
  const rows = value === undefined ? [] : dishRows(value.result.items, query);
  const action = { to: path('/catalog/dishes/new'), title: 'Новое блюдо' };
  if (value === undefined && failure !== undefined) {
    return (
      <CatalogLayout section="Блюда" action={action}>
        <ReadFailure
          failure={failure}
          section="Справочники"
          title="Не удалось загрузить список блюд"
          onRetry={() => {
            model.refresh();
          }}
        >
          Попробуйте ещё раз.
        </ReadFailure>
      </CatalogLayout>
    );
  }
  if (value?.result.items.length === 0) {
    return (
      <CatalogLayout section="Блюда" action={action}>
        <StateCard
          icon={catalogIcon}
          title="Блюд пока нет"
          tile="action"
          actions={<ButtonLink to={action.to}>Новое блюдо</ButtonLink>}
        >
          Добавьте первое блюдо и рецепт на одну порцию.
        </StateCard>
      </CatalogLayout>
    );
  }
  return (
    <CatalogLayout section="Блюда" action={action}>
      {value !== undefined && failure !== undefined && (
        <StaleCatalog
          stamp={catalogStamp(
            value.result.evaluatedAt.epochMs,
            value.context.settings.timeZone,
          )}
          onRetry={() => {
            model.refresh();
          }}
        />
      )}
      <SearchInput
        label="Найти блюдо по названию или коду"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      <Text textStyle="caption.default" color="text.secondary">
        Все блюда, даже те, что сейчас нельзя заказать. Что можно заказать
        сейчас, видно в меню в разделе «Заказы».
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
            {value === undefined &&
              Array.from({ length: 6 }, (_, index) => (
                <tr key={index} aria-hidden="true">
                  {[0, 1, 2].map((cell) => (
                    <Td key={cell}>
                      <Skeleton h="5" w="full" />
                    </Td>
                  ))}
                </tr>
              ))}
            {value !== undefined && rows.length === 0 && (
              <tr>
                <Td colSpan={3} color="text.secondary">
                  {`По запросу «${query.trim()}» блюд нет.`}
                </Td>
              </tr>
            )}
            {rows.map((dish) => (
              <chakra.tr
                key={dish.code}
                gridTemplateAreas="'name arrow' 'code arrow'"
                gridTemplateColumns="1fr auto"
                alignItems="center"
              >
                <Td gridArea="name">
                  <RowLink
                    to={path(
                      `/catalog/dishes/${encodeURIComponent(dish.code)}`,
                    )}
                  >
                    {dish.name}
                  </RowLink>
                </Td>
                <Td
                  gridArea="code"
                  textStyle={{ base: 'numeric.default', sm: 'numeric.body' }}
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
                  <Icon src={arrowIcon} size={24} display="block" ml="auto" />
                </Td>
              </chakra.tr>
            ))}
          </tbody>
        </DataTable>
      </TableCard>
    </CatalogLayout>
  );
}
