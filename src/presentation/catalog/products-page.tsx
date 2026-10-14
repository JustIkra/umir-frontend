import { Skeleton, Text, chakra } from '@chakra-ui/react';
import { useState } from 'react';
import { useLocation } from 'react-router';
import { ReadFailure } from '@/presentation/app-shell/read-failure';
import { useRestaurantPath } from '@/presentation/app-shell/paths';
import catalogIcon from '@/presentation/assets/icons/catalog-24.svg';
import {
  useRestaurantData,
  useRestaurantRead,
} from '@/presentation/session/hooks';
import { ButtonLink } from '@/presentation/ui/actions';
import { SearchInput } from '@/presentation/ui/form';
import { FormMessage } from '@/presentation/ui/form-message';
import { StateCard } from '@/presentation/ui/states';
import { DataTable, TableCard, Td, Th } from '@/presentation/ui/table';
import { rem } from '@/presentation/ui/units';
import { catalogStamp, productRows } from './catalog-rows';
import { createdNoticeOf, createdProductText } from './catalog-forms';
import { CatalogLayout, StaleCatalog } from './catalog-layout';

// Figma K01 «Продукты». On 390 a row reads «Авокадо / Код 101 · штуки, шт».
export function ProductsPage() {
  const path = useRestaurantPath();
  const data = useRestaurantData();
  const model = data.products();
  const { snapshot, failure } = useRestaurantRead(model);
  const [query, setQuery] = useState('');
  const created = createdNoticeOf(useLocation().state);
  const createdMessage =
    created?.kind === 'product' ? (
      <CreatedMessage
        {...createdProductText(created.name, created.code, created.unit)}
      />
    ) : null;
  const value = snapshot.value;
  const rows =
    value === undefined ? [] : productRows(value.result.items, query);
  const action = {
    to: path('/catalog/products/new'),
    title: 'Новый продукт',
  };
  if (value === undefined && failure !== undefined) {
    return (
      <CatalogLayout section="Продукты" action={action}>
        <ReadFailure
          failure={failure}
          section="Справочники"
          title="Не удалось получить справочник продуктов"
          onRetry={() => {
            model.refresh();
          }}
        >
          Справочник сейчас недоступен — это не значит, что он пуст. Повторите
          чтение; определения не меняются, пока вы ждёте.
        </ReadFailure>
      </CatalogLayout>
    );
  }
  if (value?.result.items.length === 0) {
    return (
      <CatalogLayout section="Продукты" action={action}>
        {createdMessage}
        <StateCard
          icon={catalogIcon}
          title="Продуктов пока нет"
          tile="action"
          actions={<ButtonLink to={action.to}>Добавить продукт</ButtonLink>}
        >
          Сначала добавьте продукты с базовой единицей учёта, затем определите
          блюда с рецептурой одной порции.
        </StateCard>
      </CatalogLayout>
    );
  }
  return (
    <CatalogLayout section="Продукты" action={action}>
      {createdMessage}
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
        label="Найти продукт по названию или коду"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      <TableCard>
        <DataTable rows="tall" mobile="cards">
          <chakra.thead>
            <tr>
              <Th>Продукт</Th>
              <Th w={rem(212)}>Единица</Th>
              <Th w={rem(140)}>Код</Th>
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
                  {`По запросу «${query.trim()}» продуктов нет.`}
                </Td>
              </tr>
            )}
            {rows.map((product) => (
              <chakra.tr
                key={product.code}
                gridTemplateAreas="'name name' 'code unit'"
                gridTemplateColumns="auto 1fr"
                columnGap="1.5"
              >
                <Td gridArea="name" textStyle="body.strong">
                  {product.name}
                </Td>
                <Td
                  gridArea="unit"
                  textStyle={{ base: 'caption.default', sm: 'body.default' }}
                  color={{ base: 'text.secondary', sm: 'text.primary' }}
                >
                  <Text as="span" display={{ sm: 'none' }}>
                    ·{' '}
                  </Text>
                  {product.unit}
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
                  {product.code}
                </Td>
              </chakra.tr>
            ))}
          </tbody>
        </DataTable>
      </TableCard>
    </CatalogLayout>
  );
}

function CreatedMessage({ title, text }: { title: string; text: string }) {
  return (
    <FormMessage tone="success" title={title}>
      {text}
    </FormMessage>
  );
}
