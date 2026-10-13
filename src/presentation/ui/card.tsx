import { chakra } from '@chakra-ui/react';
import { media } from '@/presentation/theme/system';

// Figma cards on app screens: white, a 1px border, 6px radius, 24px inside.
const card = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4',
  p: '6',
  bg: 'bg.surface',
  borderWidth: '1px',
  borderColor: 'border.default',
  borderRadius: 'md',
} as const;

export const Card = chakra('div', { base: card });
export const CardForm = chakra('form', { base: card });
// Members and invitations: 8px inside, every row draws its own divider.
export const ListCard = chakra('ul', {
  base: { ...card, gap: '0', p: '2', listStyleType: 'none' },
});

// Figma forms and the recipe (P1, K05, K13, K14): from 768 one card with a grey
// footer strip; on 390 only the fields sit in a card (SplitCardBody), and the
// footer note and the buttons follow on the page.
const splitCard = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6',
  [media.sm]: { ...card, gap: '6' },
} as const;

export const SplitCard = chakra('div', { base: splitCard });
export const SplitCardForm = chakra('form', { base: splitCard });
export const SplitCardBody = chakra('div', {
  base: {
    ...card,
    p: '4',
    [media.sm]: { p: '0', bg: 'transparent', borderWidth: '0' },
  },
});

export const CardFooter = chakra('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3',
    [media.sm]: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '4',
      mx: '-6',
      mb: '-6',
      px: '6',
      py: '4',
      bg: 'bg.canvas',
      borderTopWidth: '1px',
      borderColor: 'border.default',
      borderBottomRadius: 'md',
    },
  },
});
