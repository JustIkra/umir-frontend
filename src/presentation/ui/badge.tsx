import { chakra, defineRecipe } from '@chakra-ui/react';

// Figma Badge 37:141. Color always comes with text: Expiry marks dates inside
// the chosen window, Neutral a pending or unknown outcome, Error a failure and
// Success an outcome established by the server.
const badgeRecipe = defineRecipe({
  className: 'umir-badge',
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: '0',
    px: '2',
    py: '0.5',
    borderRadius: 'sm',
    textStyle: 'caption.strong',
    whiteSpace: 'nowrap',
  },
  variants: {
    tone: {
      expiry: { bg: 'bg.expiry', color: 'text.onExpiry' },
      neutral: { bg: 'bg.subtle', color: 'text.primary' },
      error: { bg: 'bg.errorSubtle', color: 'text.error' },
      success: { bg: 'bg.actionSubtle', color: 'text.action' },
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export const Badge = chakra('span', badgeRecipe, { displayName: 'Badge' });
