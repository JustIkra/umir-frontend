import { defineRecipe, defineSlotRecipe } from '@chakra-ui/react';
import {
  comboboxAnatomy,
  dateInputAnatomy,
  datePickerAnatomy,
} from '@chakra-ui/react/anatomy';

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
      // Irreversible actions (deleting a restaurant or an organization): the
      // error colour of the theme, the same 48px box as the primary button.
      danger: {
        px: 'calc({spacing.6} - 1px)',
        bg: 'text.error',
        color: 'text.onAction',
        _hover: { bg: 'text.error', filter: 'brightness(0.88)' },
        _disabled: {
          bg: 'bg.subtle',
          color: 'text.disabled',
          filter: 'none',
          _hover: { bg: 'bg.subtle', filter: 'none' },
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

// The input of a typed field, shared by the combobox and the date input: the
// Figma Input 117:1393 look, 44px high, with room for a 32px button on the right.
export const fieldControl = {
  display: 'flex',
  alignItems: 'center',
  w: 'full',
  h: '2.75rem',
  bg: 'bg.surface',
  borderWidth: '1px',
  borderColor: 'border.strong',
  borderRadius: 'md',
  color: 'text.primary',
  textStyle: 'body.default',
  _focusWithin: {
    outline: '2px solid {colors.border.focus}',
    outlineOffset: '2px',
  },
  _invalid: {
    bg: 'bg.errorSubtle',
    borderWidth: '2px',
    borderColor: 'border.error',
  },
  _disabled: { opacity: '0.5', cursor: 'not-allowed' },
} as const;

// The floating layer of a list or a calendar.
export const floatingContent = {
  bg: 'bg.surface',
  borderWidth: '1px',
  borderColor: 'border.default',
  borderRadius: 'md',
  boxShadow: 'overlay',
  outline: 'none',
  _open: { animationName: 'fadeIn', animationDuration: 'fast' },
} as const;

// A list of choices: products with search, times of the day.
export const comboboxRecipe = defineSlotRecipe({
  className: 'umir-combobox',
  slots: comboboxAnatomy.keys(),
  base: {
    root: { w: 'full' },
    control: { ...fieldControl, position: 'relative' },
    input: {
      flex: '1',
      minW: '0',
      h: 'full',
      pl: '3',
      pr: '10',
      bg: 'transparent',
      outline: 'none',
      _placeholder: { color: 'text.secondary' },
      _disabled: { cursor: 'not-allowed' },
    },
    indicatorGroup: {
      position: 'absolute',
      insetEnd: '1',
      top: '0',
      bottom: '0',
      display: 'flex',
      alignItems: 'center',
    },
    trigger: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSize: '8',
      borderRadius: 'sm',
      cursor: 'pointer',
      _hover: { bg: 'bg.subtle' },
      _disabled: { cursor: 'not-allowed', bg: 'transparent' },
      '& img': { transitionProperty: 'transform', transitionDuration: 'fast' },
      _open: { '& img': { transform: 'rotate(180deg)' } },
    },
    positioner: { zIndex: 'popover' },
    content: {
      ...floatingContent,
      py: '1',
      maxH: '16.5rem',
      overflowY: 'auto',
    },
    item: {
      display: 'flex',
      alignItems: 'center',
      gap: '2',
      px: '3',
      minH: { base: '11', sm: '10' },
      textStyle: 'body.default',
      cursor: 'pointer',
      _highlighted: { bg: 'bg.subtle' },
      _selected: { color: 'text.action', fontWeight: 'medium' },
    },
    itemText: { flex: '1', minW: '0', overflowWrap: 'anywhere' },
    itemIndicator: { display: 'flex', color: 'icon.action' },
    empty: {
      px: '3',
      py: '2.5',
      textStyle: 'body.default',
      color: 'text.secondary',
    },
  },
});

// Date segments «дд.мм.гггг»: each one takes digits only, ↑↓ step it.
export const dateInputRecipe = defineSlotRecipe({
  className: 'umir-date-input',
  slots: dateInputAnatomy.keys(),
  base: {
    root: { flex: '1', minW: '0' },
    control: { display: 'flex', alignItems: 'center', h: 'full', pl: '3' },
    segmentGroup: {
      display: 'flex',
      alignItems: 'center',
      textStyle: 'numeric.body',
    },
    segment: {
      px: '0.5',
      borderRadius: 'sm',
      outline: 'none',
      caretColor: 'transparent',
      _focus: { bg: 'bg.action', color: 'text.onAction' },
      _placeholderShown: { color: 'text.secondary' },
      '&[data-type=literal]': { px: '0', color: 'text.secondary' },
    },
  },
});

const monthButton = {
  boxSize: '8',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 'sm',
  cursor: 'pointer',
  _hover: { bg: 'bg.subtle' },
} as const;

// The calendar of a date field: a month with the week from Monday.
export const datePickerRecipe = defineSlotRecipe({
  className: 'umir-date-picker',
  slots: datePickerAnatomy.keys(),
  base: {
    control: { ...fieldControl, position: 'relative', pr: '1' },
    trigger: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSize: '8',
      flexShrink: '0',
      borderRadius: 'sm',
      cursor: 'pointer',
      _hover: { bg: 'bg.subtle' },
      _disabled: { cursor: 'not-allowed', bg: 'transparent' },
    },
    positioner: { zIndex: 'popover' },
    content: {
      ...floatingContent,
      p: '3',
      display: 'flex',
      flexDirection: 'column',
      gap: '2',
    },
    viewControl: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '2',
    },
    prevTrigger: monthButton,
    nextTrigger: monthButton,
    rangeText: { textStyle: 'body.strong', textTransform: 'capitalize' },
    table: { borderCollapse: 'separate', borderSpacing: '0.5' },
    tableHeader: {
      textStyle: 'caption.default',
      color: 'text.secondary',
      fontWeight: 'regular',
      h: '8',
    },
    tableCellTrigger: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSize: '10',
      borderRadius: 'md',
      textStyle: 'numeric.body',
      cursor: 'pointer',
      _hover: { bg: 'bg.subtle' },
      '&[data-today]': { boxShadow: 'inset 0 0 0 1px {colors.border.action}' },
      '&[data-outside-range]': { color: 'text.secondary' },
      _selected: {
        bg: 'bg.action',
        color: 'text.onAction',
        _hover: { bg: 'bg.actionHover' },
      },
      _focusVisible: {
        outline: '2px solid {colors.border.focus}',
        outlineOffset: '1px',
      },
    },
  },
});
