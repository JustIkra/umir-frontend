import { chakra } from '@chakra-ui/react';

// Figma Segment 37:150: grey bar, items with a white bordered selected state.
// One item style serves route tabs (aria-current), in-page tabs (aria-selected)
// and single choices (aria-pressed).
export const SegmentBar = chakra('div', {
  base: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1',
    p: '1',
    bg: 'bg.subtle',
    borderRadius: 'md',
  },
});

export const segmentItem = {
  display: 'flex',
  alignItems: 'center',
  px: 'calc({spacing.3} - 1px)',
  py: 'calc({spacing.1.5} - 1px)',
  borderWidth: '1px',
  borderColor: 'transparent',
  borderRadius: 'sm',
  textStyle: 'caption.default',
  color: 'text.secondary',
  cursor: 'pointer',
  _hover: { color: 'text.primary' },
  '&:is([aria-current=page], [aria-selected=true], [aria-pressed=true])': {
    bg: 'bg.surface',
    borderColor: 'border.strong',
    textStyle: 'caption.strong',
    color: 'text.primary',
  },
} as const;

export const SegmentButton = chakra('button', { base: segmentItem });
