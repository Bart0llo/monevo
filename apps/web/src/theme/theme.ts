import { createTheme, localStorageColorSchemeManager } from '@mantine/core';

// Theme tokens (frontend-architecture.md#7-ui-composition). Light, dark, and system (auto) schemes.

export const COLOR_SCHEME_STORAGE_KEY = 'monevo-color-scheme';

/** Must use the same key as public/color-scheme.js, which applies the scheme before React loads. */
export const colorSchemeManager = localStorageColorSchemeManager({ key: COLOR_SCHEME_STORAGE_KEY });

export const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
});
