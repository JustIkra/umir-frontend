import { defineRecipe } from '@chakra-ui/react';

// Figma Button 15:40. Strokes are inside the 48px box in Figma, so every variant
// reserves a 1px border and trims the padding by the same amount.
export const buttonRecipe = defineRecipe({
  className: 'umir-button',
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2',
    flexShrink: '0',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 'md',
    py: 'calc({spacing.3} - 1px)',
    textStyle: 'label.default',
    textAlign: 'center',
    cursor: 'pointer',
    userSelect: 'none',
    transitionProperty: 'background-color, border-color, color',
    transitionDuration: 'fast',
    _disabled: { cursor: 'not-allowed' },
  },
  variants: {
    variant: {
      primary: {
        px: 'calc({spacing.6} - 1px)',
        bg: 'bg.action',
        color: 'text.onAction',
        _hover: { bg: 'bg.actionHover' },
        _disabled: {
          bg: 'bg.subtle',
          color: 'text.disabled',
          _hover: { bg: 'bg.subtle' },
        },
      },
      secondary: {
        px: 'calc({spacing.6} - 1px)',
        bg: 'bg.surface',
        borderColor: 'border.action',
        color: 'text.action',
        _hover: { bg: 'bg.actionSubtle' },
        _disabled: {
          borderColor: 'border.default',
          color: 'text.disabled',
          _hover: { bg: 'bg.surface' },
        },
      },
      link: {
        px: 'calc({spacing.1} - 1px)',
        color: 'text.action',
        textDecoration: 'underline',
        textUnderlinePosition: 'from-font',
        _hover: { color: 'text.actionHover' },
        _disabled: { color: 'text.disabled', textDecoration: 'none' },
      },
    },
  },
  defaultVariants: { variant: 'primary' },
});

// Inline document and navigation links: Body/Link, Caption/Link and Label/Link.
export const linkRecipe = defineRecipe({
  className: 'umir-link',
  base: {
    color: 'text.action',
    textDecoration: 'underline',
    textUnderlinePosition: 'from-font',
    borderRadius: 'sm',
    _hover: { color: 'text.actionHover' },
  },
  variants: {
    size: {
      body: { textStyle: 'body.default' },
      caption: { textStyle: 'caption.default' },
      label: { textStyle: 'label.default' },
      inherit: {},
    },
  },
  defaultVariants: { size: 'body' },
});
