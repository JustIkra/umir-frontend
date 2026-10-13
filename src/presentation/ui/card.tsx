import { chakra } from '@chakra-ui/react';

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
