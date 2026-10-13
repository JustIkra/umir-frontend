import { Grid, Stack, Text, chakra } from '@chakra-ui/react';
import { Fragment, useState } from 'react';
import chevronIcon from '@/presentation/assets/icons/chevron-right-24.svg';
import {
  stock,
  stockStamp,
  type Batch,
  type StockRow,
} from '@/presentation/placeholder-warehouse';
import { SearchInput } from '@/presentation/ui/form';
import { Icon } from '@/presentation/ui/icon';
import { DataTable, TableCard, Td, Th } from '@/presentation/ui/table';
import { rem } from '@/presentation/ui/units';
import { WarehouseLayout } from './warehouse-layout';

function ProductCell({
  row,
  open,
  onToggle,
  batchesId,
}: {
  row: StockRow;
  open: boolean;
  onToggle: () => void;
  batchesId: string;
}) {
  // Rows with usable batches show the chevron as in S1; only rows whose
  // batches are in the sample open.
  if (!row.items)
    return (
      <Text
        as="span"
        display="flex"
        alignItems="center"
        gap="2"
        textStyle="body.strong"
        ps={row.nearest === '—' ? '8' : undefined}
      >
        {row.nearest !== '—' && <Icon src={chevronIcon} size={24} />}
        {row.product}
      </Text>
    );
  return (
    <chakra.button
      type="button"
      display="flex"
      alignItems="center"
      gap="2"
      textStyle="body.strong"
      textAlign="start"
      cursor="pointer"
      aria-expanded={open}
      aria-controls={batchesId}
      onClick={onToggle}
    >
      <Icon
        src={chevronIcon}
        size={24}
        transform={open ? 'rotate(90deg)' : undefined}
      />
      {row.product}
    </chakra.button>
  );
}

// A batch of an open row: one line from 768, three lines on 390 (S1 390).
function BatchLine({
  batch,
  first,
  last,
}: {
  batch: Batch;
  first: boolean;
  last: boolean;
}) {
  return (
    <Grid
      gridTemplateAreas={{
        base: "'id quantity' 'text text'",
        sm: "'id quantity text'",
      }}
      gridTemplateColumns={{ base: '1fr auto', sm: `${rem(100)} auto 1fr` }}
      alignItems="center"
      columnGap="3"
      rowGap="1"
      ps={{ base: '8', sm: '12' }}
      pe={{ sm: '4' }}
      pt={{ base: first ? '0' : '3', sm: '3' }}
      pb={{ base: last ? '0' : '3', sm: '3' }}
      borderTopWidth={first ? '0' : '1px'}
      borderColor="border.default"
    >
      <Text gridArea="id" textStyle="mono.default" color="text.secondary">
        <chakra.span display={{ sm: 'none' }} textStyle="caption.default">
          Партия{' '}
        </chakra.span>
        {batch.id}
      </Text>
      <Text gridArea="quantity" textStyle="mono.body" whiteSpace="nowrap">
        {batch.quantity}
      </Text>
      <Stack gridArea="text" gap="0">
        <Text textStyle={{ base: 'caption.default', sm: 'body.default' }}>
          {batch.expires}
        </Text>
        <Text textStyle="caption.default" color="text.secondary">
          {batch.received}
        </Text>
      </Stack>
    </Grid>
  );
}

// Figma S1 «Остатки». Rows with sample batches expand («Сыр пармезан» is open
// as in the frame); batch rows are text: batch details (S2) are not built.
// On 390 a row is a card: the name, the quantity with the batches, the date.
export function StockPage() {
  const [open, setOpen] = useState<readonly string[]>(['Сыр пармезан']);
  const toggle = (product: string) => {
    setOpen((list) =>
      list.includes(product)
        ? list.filter((item) => item !== product)
        : [...list, product],
    );
  };
  return (
    <WarehouseLayout section="Остатки" stamp={stockStamp}>
      <SearchInput label="Найти продукт" />
      <TableCard>
        <DataTable mobile="cards">
          <chakra.thead>
            <tr>
              <Th ps="12">Продукт</Th>
              <Th w={rem(144)} pe="0" textAlign="end" whiteSpace="nowrap">
                Пригодный остаток
              </Th>
              <Th w={rem(128)} ps="3">
                Партии
              </Th>
              <Th w={{ sm: rem(236), xl: rem(252) }}>Ближайший срок</Th>
            </tr>
          </chakra.thead>
          <tbody>
            {stock.map((row, index) => {
              const isOpen = open.includes(row.product);
              const batchesId = `stock-batches-${String(index)}`;
              return (
                <Fragment key={row.product}>
                  <chakra.tr
                    bg={isOpen ? 'bg.subtle' : undefined}
                    gridTemplateAreas="'product product' 'quantity batches' 'nearest nearest'"
                    gridTemplateColumns="auto 1fr"
                    alignItems="baseline"
                  >
                    <Td gridArea="product">
                      <ProductCell
                        row={row}
                        open={isOpen}
                        onToggle={() => {
                          toggle(row.product);
                        }}
                        batchesId={batchesId}
                      />
                    </Td>
                    <Td
                      gridArea="quantity"
                      ms={{ base: '8', sm: '0' }}
                      pe="0"
                      textStyle="mono.body"
                      textAlign="end"
                      whiteSpace="nowrap"
                    >
                      {row.quantity}
                    </Td>
                    <Td
                      gridArea="batches"
                      ps="3"
                      textStyle="caption.default"
                      color="text.secondary"
                    >
                      {row.batches}
                    </Td>
                    <Td
                      gridArea="nearest"
                      ms={{ base: '8', sm: '0' }}
                      textStyle="caption.default"
                      color="text.secondary"
                    >
                      {row.nearest}
                    </Td>
                  </chakra.tr>
                  {row.items && (
                    <tr id={batchesId} hidden={!isOpen}>
                      <Td colSpan={4} p="0">
                        {row.items.map((batch, item, items) => (
                          <BatchLine
                            key={batch.id}
                            batch={batch}
                            first={item === 0}
                            last={item === items.length - 1}
                          />
                        ))}
                      </Td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </DataTable>
      </TableCard>
    </WarehouseLayout>
  );
}
