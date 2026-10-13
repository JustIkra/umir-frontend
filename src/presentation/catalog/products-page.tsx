import { Text, chakra } from '@chakra-ui/react';
import { products, unitNames } from '@/presentation/placeholder-catalog';
import { SearchInput } from '@/presentation/ui/form';
import { DataTable, TableCard, Td, Th } from '@/presentation/ui/table';
import { rem } from '@/presentation/ui/units';
import { CatalogLayout } from './catalog-layout';

// Figma K01 «Продукты». Search is for show. On 390 a row reads
// «Авокадо / Код 101 · штуки, шт».
export function ProductsPage() {
  return (
    <CatalogLayout
      section="Продукты"
      action={{ to: '/app/catalog/products/new', title: 'Новый продукт' }}
    >
      <SearchInput label="Найти продукт по названию или коду" />
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
            {products.map((product) => (
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
                  {unitNames[product.unit]}
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
