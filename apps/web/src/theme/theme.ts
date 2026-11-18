import {
  createTheme,
  localStorageColorSchemeManager,
  type CSSVariablesResolver,
  type MantineColorsTuple,
} from '@mantine/core';

// Theme tokens (frontend-architecture.md#7-ui-composition). The visual system is described in
// docs/product/design-system.md. Light, dark, and system (auto) schemes.

export const COLOR_SCHEME_STORAGE_KEY = 'monevo-color-scheme';

/** Must use the same key as public/color-scheme.js, which applies the scheme before React loads. */
export const colorSchemeManager = localStorageColorSchemeManager({ key: COLOR_SCHEME_STORAGE_KEY });

/**
 * Ink: the accent. A muted blue (hue ~228), deliberately not green or red, which stay reserved for
 * inflow and outflow.
 */
const ink: MantineColorsTuple = [
  '#eef1f8',
  '#dde3f0',
  '#bac5e1',
  '#94a5d0',
  '#7488c1',
  '#5c73b6',
  '#4a62a8',
  '#3d5394',
  '#33467c',
  '#263561',
];

/** Ink-tinted neutrals for the dark scheme (replaces Mantine's warm grey `dark` palette). */
const dark: MantineColorsTuple = [
  '#d5dae5',
  '#b8bfcf',
  '#949db2',
  '#6c7590',
  '#4a5269',
  '#363d52',
  '#272d3f',
  '#191e2c',
  '#131724',
  '#0d101a',
];

/**
 * The "cover" (navigation rail and mobile bars) is solid ink-navy in both schemes. The "page" is
 * a cool paper neutral. Keep public/color-scheme.js, index.html, vite.config.ts and the icons in
 * sync with COVER and PAPER.
 */
export const COVER = { light: '#1a2544', dark: '#0f1320' } as const;
export const PAPER = { light: '#f4f6fa', dark: dark[7] } as const;

export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    '--mv-cover-fg': '#e8ecf5',
    '--mv-cover-fg-strong': '#ffffff',
    '--mv-cover-fg-muted': '#a9b4cd',
    '--mv-cover-hover': 'rgba(255, 255, 255, 0.06)',
    '--mv-cover-active': 'rgba(255, 255, 255, 0.11)',
    '--mv-cover-border': 'rgba(255, 255, 255, 0.09)',
    '--mv-cover-focus': ink[2],
  },
  light: {
    '--mantine-color-body': PAPER.light,
    '--mantine-color-text': '#182033',
    '--mantine-color-dimmed': '#566078',
    '--mantine-color-default-border': '#dce1eb',
    '--mv-surface': '#ffffff',
    '--mv-border': '#dce1eb',
    // 4.8:1 on paper: the planned badge is 12px text, so it needs AA contrast.
    '--mv-planned': '#636c86',
    '--mv-cover-bg': COVER.light,
    '--mv-focus': ink[6],
    '--mv-selection': ink[1],
  },
  dark: {
    '--mantine-color-body': PAPER.dark,
    '--mantine-color-dimmed': dark[2],
    '--mv-surface': '#1f2535',
    '--mv-border': dark[5],
    '--mv-planned': dark[2],
    '--mv-cover-bg': COVER.dark,
    '--mv-focus': ink[3],
    '--mv-selection': ink[8],
  },
});

export const theme = createTheme({
  primaryColor: 'ink',
  primaryShade: { light: 6, dark: 5 },
  colors: { ink, dark },
  white: '#ffffff',
  black: '#182033',
  fontFamily:
    '"Hanken Grotesk Variable", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  fontFamilyMonospace: 'ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace',
  // A fixed rem scale, ratio ~1.2. Body copy is md (15px).
  fontSizes: {
    xs: '0.75rem',
    sm: '0.8125rem',
    md: '0.9375rem',
    lg: '1.125rem',
    xl: '1.375rem',
  },
  lineHeights: { xs: '1.4', sm: '1.45', md: '1.55', lg: '1.5', xl: '1.4' },
  headings: {
    fontFamily: '"Hanken Grotesk Variable", system-ui, sans-serif',
    fontWeight: '620',
    sizes: {
      h1: { fontSize: '1.5rem', lineHeight: '1.25' },
      h2: { fontSize: '1.25rem', lineHeight: '1.3' },
      h3: { fontSize: '1.0625rem', lineHeight: '1.35' },
      h4: { fontSize: '0.9375rem', lineHeight: '1.4' },
    },
  },
  radius: { xs: '4px', sm: '6px', md: '8px', lg: '12px', xl: '16px' },
  defaultRadius: 'sm',
  // Elevation is drawn with hairline borders; shadows stay for floating layers only.
  shadows: {
    xs: '0 1px 2px rgba(16, 22, 40, 0.06)',
    sm: '0 2px 6px rgba(16, 22, 40, 0.08)',
    md: '0 6px 16px rgba(16, 22, 40, 0.12)',
    lg: '0 12px 32px rgba(16, 22, 40, 0.16)',
    xl: '0 20px 48px rgba(16, 22, 40, 0.2)',
  },
  focusRing: 'auto',
  cursorType: 'pointer',
  respectReducedMotion: true,
});
