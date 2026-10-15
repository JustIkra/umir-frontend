import { chakra } from '@chakra-ui/react';
import { media } from '@/presentation/theme/system';
import { rem } from './units';

const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
} as const;

// Figma data tables (S1, K01, K12, K13): a grey head row, 1px dividers.
export const TableCard = chakra('div', {
  base: {
    bg: 'bg.surface',
    borderWidth: '1px',
    borderColor: 'border.default',
    borderRadius: 'md',
    overflow: 'hidden',
    '& tbody tr:last-child > td': { borderBottomWidth: '0' },
  },
});

export const DataTable = chakra('table', {
  base: { w: 'full', borderCollapse: 'collapse', textStyle: 'body.default' },
  variants: {
    // K01 and K12 rows are 52px from 768; K13 keeps 49px.
    rows: {
      regular: {},
      tall: {
        [media.sm]: {
          '& tbody td': { pt: rem(14), pb: `calc(${rem(14)} - 1px)` },
        },
      },
    },
    // On 390 every row is a card: the head stays for screen readers only and
    // each row places its cells with its own grid areas.
    mobile: {
      table: {},
      cards: {
        [media.belowSm]: {
          // Block boxes take the rows out of the table layout, so column
          // widths set for 768 (K12 colgroup) cannot squeeze the cards.
          display: 'block',
          '& tbody': { display: 'block' },
          '& thead': visuallyHidden,
          '& tbody tr': {
            display: 'grid',
            columnGap: '3',
            rowGap: '1',
            px: '4',
            py: '3',
            borderBottomWidth: '1px',
            borderColor: 'border.default',
          },
          '& tbody tr:last-child': { borderBottomWidth: '0' },
          '& tbody tr[hidden]': { display: 'none' },
          '& tbody td': { display: 'block', p: '0', borderBottomWidth: '0' },
        },
      },
    },
  },
  defaultVariants: { rows: 'regular', mobile: 'table' },
});

// Figma head rows are 36px with the divider inside.
export const Th = chakra('th', {
  base: {
    px: '4',
    py: 'calc({spacing.2} - 0.5px)',
    textAlign: 'start',
    textStyle: 'caption.strong',
    color: 'text.secondary',
    bg: 'bg.canvas',
    borderBottomWidth: '1px',
    borderColor: 'border.default',
  },
});

export const Td = chakra('td', {
  base: {
    px: '4',
    py: '3',
    verticalAlign: 'middle',
    borderBottomWidth: '1px',
    borderColor: 'border.default',
  },
});

export const MobileCellLabel = chakra('span', {
  base: {
    display: 'block',
    textStyle: 'caption.default',
    fontFamily: 'body',
    color: 'text.secondary',
    [media.sm]: { display: 'none' },
  },
});
