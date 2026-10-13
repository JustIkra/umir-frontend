import { chakra } from '@chakra-ui/react';

// Figma data tables (S1, K01, K12, K13): a grey head row, 1px dividers. On 390
// the screens lay rows out as cards themselves.
export const TableCard = chakra('div', {
  base: {
    bg: 'bg.surface',
    borderWidth: '1px',
    borderColor: 'border.default',
    borderRadius: 'md',
    overflow: 'hidden',
  },
});

export const DataTable = chakra('table', {
  base: { w: 'full', borderCollapse: 'collapse', textStyle: 'body.default' },
});

export const Th = chakra('th', {
  base: {
    px: '4',
    py: '2',
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
