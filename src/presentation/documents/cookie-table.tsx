import { Box, Stack, Text, chakra } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import type { CookieRow } from './content';

// Figma keeps 16px at the table edges and 16px between columns, so inner
// cell sides get half of the gap.
const nameColumn = '12.5rem';
const termColumn = { md: '9.375rem', xl: '11.25rem' };
const cellPadding = {
  px: '2',
  py: '3',
  textAlign: 'start',
  _first: { pl: '4' },
  _last: { pr: '4' },
} as const;

const Cell = chakra('td', {
  base: { ...cellPadding, verticalAlign: 'top' },
});
const HeaderCell = chakra('th', {
  base: {
    ...cellPadding,
    textStyle: 'caption.strong',
    color: 'text.secondary',
  },
});

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack gap="0.5">
      <Text as="dt" textStyle="caption.strong" color="text.secondary">
        {label}
      </Text>
      <chakra.dd>{children}</chakra.dd>
    </Stack>
  );
}

// Figma «Cookie table» in the cookie policy: a table from tablet width and one
// card per row on mobile.
export function CookieTable({ rows }: { rows: readonly CookieRow[] }) {
  return (
    <Box
      w="full"
      bg="bg.surface"
      borderWidth="1px"
      borderColor="border.default"
      borderRadius="md"
      overflow="hidden"
    >
      <chakra.table
        display={{ base: 'none', md: 'table' }}
        w="full"
        borderCollapse="collapse"
        tableLayout="fixed"
      >
        <chakra.caption srOnly>
          Строго необходимые cookie и записи в хранилище браузера
        </chakra.caption>
        <colgroup>
          <chakra.col w={`calc(${nameColumn} + {spacing.6})`} />
          <col />
          <chakra.col
            w={{
              md: `calc(${termColumn.md} + {spacing.6})`,
              xl: `calc(${termColumn.xl} + {spacing.6})`,
            }}
          />
        </colgroup>
        <chakra.thead bg="bg.canvas">
          <tr>
            <HeaderCell scope="col">Название и хранилище</HeaderCell>
            <HeaderCell scope="col">Назначение</HeaderCell>
            <HeaderCell scope="col">Срок хранения</HeaderCell>
          </tr>
        </chakra.thead>
        <tbody>
          {rows.map((row) => (
            <chakra.tr
              key={row.name}
              borderTopWidth="1px"
              borderColor="border.default"
            >
              <Cell>
                <Text textStyle="mono.default" overflowWrap="anywhere">
                  {row.name}
                </Text>
                <Text
                  mt="0.5"
                  textStyle="caption.default"
                  color="text.secondary"
                >
                  {row.storage}
                </Text>
              </Cell>
              <Cell textStyle="body.default">{row.purpose}</Cell>
              <Cell textStyle="body.default">{row.term}</Cell>
            </chakra.tr>
          ))}
        </tbody>
      </chakra.table>
      <chakra.ul display={{ base: 'block', md: 'none' }} listStyleType="none">
        {rows.map((row, index) => (
          <chakra.li
            key={row.name}
            p="4"
            borderTopWidth={index === 0 ? undefined : '1px'}
            borderColor="border.default"
          >
            <Text textStyle="mono.default" overflowWrap="anywhere">
              {row.name}
            </Text>
            <Stack as="dl" gap="2" mt="2">
              <Field label="Назначение">
                <Text textStyle="body.default">{row.purpose}</Text>
              </Field>
              <Field label="Хранилище">
                <Text textStyle="mono.default">{row.storage}</Text>
              </Field>
              <Field label="Срок">
                <Text textStyle="body.default">{row.term}</Text>
              </Field>
            </Stack>
          </chakra.li>
        ))}
      </chakra.ul>
    </Box>
  );
}
