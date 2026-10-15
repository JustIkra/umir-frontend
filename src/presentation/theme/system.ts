import {
  createSystem,
  defaultBaseConfig,
  defineConfig,
  defineKeyframes,
  defineSemanticTokens,
  defineTextStyles,
  defineTokens,
} from '@chakra-ui/react';
import { comboboxRecipe } from './recipes';

// Mobile-first form of the project scale from the design brief:
// Mobile Portrait ≤767 is the base, Mobile Landscape ≤880, Tablet Portrait ≤1024,
// Tablet Landscape ≤1200, Laptop ≤1366, Desktop above, Widescreen ≥2400.
const breakpoints = {
  sm: '768px',
  md: '881px',
  lg: '1025px',
  xl: '1201px',
  '2xl': '1367px',
  '3xl': '2400px',
} as const;

// Media queries for CSS that Chakra props cannot reach (dialog backdrops,
// :modal states) and for matchMedia.
export const atLeast = { sm: `(min-width: ${breakpoints.sm})` } as const;
// belowSm styles only the 390 layout, where the 768 rules must not see it
// (cards built from table rows).
export const media = {
  sm: `@media ${atLeast.sm}`,
  belowSm: '@media (max-width: 767.98px)',
  // P1: the delivery lines become a table from 2xl.
  wide: `@media (min-width: ${breakpoints['2xl']})`,
} as const;

// Figma Overlay scrim under modal dialogs and sheets.
export const scrim = 'rgba(23, 43, 77, 0.32)';

// Values mirror the Figma variables of the UmirHack Foundations page.
// Semantic paths keep the Figma names: color/bg/action → `bg.action`.
const colors = defineSemanticTokens.colors({
  bg: {
    surface: { value: '#FFFFFF' },
    canvas: { value: '#F5F7F9' },
    subtle: { value: '#EDF1F4' },
    action: { value: '#006B63' },
    actionHover: { value: '#00564F' },
    actionSubtle: { value: '#E6F2F1' },
    errorSubtle: { value: '#FDECEA' },
    expiry: { value: '#FFC233' },
    expirySubtle: { value: '#FFF6DB' },
    inverse: { value: '#172B4D' },
    tintViolet: { value: '#F2EFFC' },
    tintSky: { value: '#EAF4FC' },
    tintMint: { value: '#EAF7EF' },
    scrim: { value: scrim },
  },
  text: {
    primary: { value: '#172B4D' },
    secondary: { value: '#526579' },
    disabled: { value: '#8194A6' },
    action: { value: '#006B63' },
    actionHover: { value: '#00564F' },
    error: { value: '#B42318' },
    onAction: { value: '#FFFFFF' },
    onExpiry: { value: '#172B4D' },
    onInverse: { value: '#FFFFFF' },
    onInverseSecondary: { value: '#B6C2D2' },
  },
  border: {
    default: { value: '#D3DBE3' },
    strong: { value: '#6E8195' },
    action: { value: '#006B63' },
    error: { value: '#B42318' },
    focus: { value: '#172B4D' },
  },
  icon: {
    action: { value: '#006B63' },
    secondary: { value: '#526579' },
  },
  decor: {
    teal: { value: '#7CC4BA' },
    tealSoft: { value: '#CCE8E4' },
    violet: { value: '#B3A5EC' },
    violetSoft: { value: '#E2DCF8' },
    mint: { value: '#8ED4A9' },
    mintSoft: { value: '#CFEEDB' },
    sky: { value: '#8EC5EE' },
    skySoft: { value: '#D2E8F8' },
  },
});

const spacing = defineTokens.spacing({
  '0': { value: '0' },
  '0.5': { value: '0.125rem' },
  '1': { value: '0.25rem' },
  '1.5': { value: '0.375rem' },
  '2': { value: '0.5rem' },
  '2.5': { value: '0.625rem' },
  '3': { value: '0.75rem' },
  '4': { value: '1rem' },
  '5': { value: '1.25rem' },
  '6': { value: '1.5rem' },
  '7': { value: '1.75rem' },
  '8': { value: '2rem' },
  '10': { value: '2.5rem' },
  '11': { value: '2.75rem' },
  '12': { value: '3rem' },
  '14': { value: '3.5rem' },
  '16': { value: '4rem' },
  '20': { value: '5rem' },
  '24': { value: '6rem' },
  '30': { value: '7.5rem' },
});

const textStyles = defineTextStyles({
  display: {
    xl: {
      value: {
        fontFamily: 'body',
        fontWeight: 'semibold',
        fontSize: '3.5rem',
        lineHeight: '4rem',
        letterSpacing: '-0.01em',
      },
    },
    l: {
      value: {
        fontFamily: 'body',
        fontWeight: 'semibold',
        fontSize: '2.5rem',
        lineHeight: '3rem',
        letterSpacing: '-0.01em',
      },
    },
  },
  heading: {
    h1: {
      value: {
        fontFamily: 'body',
        fontWeight: 'semibold',
        fontSize: '2rem',
        lineHeight: '2.5rem',
      },
    },
    h2: {
      value: {
        fontFamily: 'body',
        fontWeight: 'semibold',
        fontSize: '1.5rem',
        lineHeight: '2rem',
      },
    },
    h3: {
      value: {
        fontFamily: 'body',
        fontWeight: 'semibold',
        fontSize: '1.25rem',
        lineHeight: '1.75rem',
      },
    },
  },
  body: {
    lead: {
      value: {
        fontFamily: 'body',
        fontWeight: 'regular',
        fontSize: '1.125rem',
        lineHeight: '1.75rem',
      },
    },
    default: {
      value: {
        fontFamily: 'body',
        fontWeight: 'regular',
        fontSize: '1rem',
        lineHeight: '1.5rem',
      },
    },
    strong: {
      value: {
        fontFamily: 'body',
        fontWeight: 'semibold',
        fontSize: '1rem',
        lineHeight: '1.5rem',
      },
    },
  },
  label: {
    default: {
      value: {
        fontFamily: 'body',
        fontWeight: 'medium',
        fontSize: '1rem',
        lineHeight: '1.5rem',
      },
    },
  },
  caption: {
    default: {
      value: {
        fontFamily: 'body',
        fontWeight: 'regular',
        fontSize: '0.875rem',
        lineHeight: '1.25rem',
      },
    },
    strong: {
      value: {
        fontFamily: 'body',
        fontWeight: 'medium',
        fontSize: '0.875rem',
        lineHeight: '1.25rem',
      },
    },
  },
  // Quantities, codes and times in tables: the body font with digits of one
  // width, so columns line up without a typewriter look.
  numeric: {
    default: {
      value: {
        fontFamily: 'body',
        fontWeight: 'regular',
        fontSize: '0.875rem',
        lineHeight: '1.25rem',
        fontVariantNumeric: 'tabular-nums',
      },
    },
    body: {
      value: {
        fontFamily: 'body',
        fontWeight: 'regular',
        fontSize: '1rem',
        lineHeight: '1.5rem',
        fontVariantNumeric: 'tabular-nums',
      },
    },
  },
  mono: {
    // Figma Code field value: the six digits of an email code, the only text
    // in the monospace font.
    code: {
      value: {
        fontFamily: 'mono',
        fontWeight: 'regular',
        fontSize: '1.5rem',
        lineHeight: '2rem',
        letterSpacing: '0.08em',
      },
    },
  },
});

const keyframes = defineKeyframes({
  rise: {
    from: {
      opacity: 'var(--rise-from-opacity, 0)',
      transform: 'translate(var(--rise-x, 0), var(--rise-y, 1rem))',
    },
    to: { opacity: 'var(--rise-to-opacity, 1)', transform: 'none' },
  },
  spin: {
    to: { transform: 'rotate(1turn)' },
  },
  fadeIn: {
    from: { opacity: '0' },
    to: { opacity: '1' },
  },
});

const config = defineConfig({
  cssVarsPrefix: 'umir',
  cssVarsRoot: ':where(:root, :host)',
  preflight: true,
  globalCss: {
    html: {
      fontFamily: 'body',
      color: 'text.primary',
      bg: 'bg.surface',
      textStyle: 'body.default',
      scrollPaddingTop: '1rem',
      '@media (prefers-reduced-motion: no-preference)': {
        scrollBehavior: 'smooth',
      },
    },
    ':focus-visible': {
      outline: '2px solid {colors.border.focus}',
      outlineOffset: '2px',
    },
    '*, *::before, *::after': {
      '@media (prefers-reduced-motion: reduce)': {
        animationDelay: '0s !important',
        animationDuration: '0.01ms !important',
        animationIterationCount: '1 !important',
        transitionDuration: '0.01ms !important',
      },
    },
  },
  theme: {
    breakpoints,
    tokens: {
      fonts: {
        body: { value: "'IBM Plex Sans', system-ui, sans-serif" },
        mono: { value: "'IBM Plex Mono', ui-monospace, monospace" },
      },
      fontWeights: {
        regular: { value: '400' },
        medium: { value: '500' },
        semibold: { value: '600' },
      },
      spacing,
      sizes: {
        ...spacing,
        full: { value: '100%' },
      },
      radii: {
        none: { value: '0' },
        sm: { value: '0.25rem' },
        md: { value: '0.375rem' },
        lg: { value: '0.5rem' },
        xl: { value: '0.75rem' },
        full: { value: '9999px' },
      },
      shadows: {
        overlay: {
          value:
            '0 1px 3px rgba(23, 43, 77, 0.08), 0 8px 24px rgba(23, 43, 77, 0.12)',
        },
      },
      easings: {
        enter: { value: 'cubic-bezier(0, 0, 0.2, 1)' },
      },
      zIndex: {
        decor: { value: '0' },
        content: { value: '1' },
        banner: { value: '20' },
        popover: { value: '25' },
        skipLink: { value: '30' },
      },
      durations: {
        fast: { value: '150ms' },
        base: { value: '200ms' },
      },
    },
    semanticTokens: { colors },
    textStyles,
    keyframes,
    slotRecipes: { combobox: comboboxRecipe },
  },
});

export const system = createSystem(defaultBaseConfig, config);
