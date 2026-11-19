import { useMantineColorScheme, type MantineColorScheme } from '@mantine/core';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Locale, Theme } from '@monevo/contracts';
import { isLanguage } from '@monevo/i18n';
import { useSettings, useUpdateSettings } from '../data/settings';

export const THEME_TO_SCHEME: Readonly<Record<Theme, MantineColorScheme>> = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'auto',
};

export const SCHEME_TO_THEME: Readonly<Record<MantineColorScheme, Theme>> = {
  light: 'LIGHT',
  dark: 'DARK',
  auto: 'SYSTEM',
};

/**
 * Keeps the UI language and color scheme in line with the user's saved settings, and saves the
 * choices made from the shell menus (frontend-architecture.md, internationalization.md).
 */
export function usePreferenceSync() {
  const { i18n } = useTranslation();
  const { setColorScheme } = useMantineColorScheme();
  const settings = useSettings();
  const update = useUpdateSettings();
  const locale = settings.data?.locale;
  const theme = settings.data?.theme;

  useEffect(() => {
    if (locale && locale !== i18n.resolvedLanguage) void i18n.changeLanguage(locale);
  }, [locale, i18n]);
  useEffect(() => {
    if (theme) setColorScheme(THEME_TO_SCHEME[theme]);
  }, [theme, setColorScheme]);

  return {
    onLanguageChange: (language: string) => {
      if (isLanguage(language) && language !== locale) {
        update.mutate({ locale: language satisfies Locale });
      }
    },
    onColorSchemeChange: (scheme: MantineColorScheme) => {
      if (SCHEME_TO_THEME[scheme] !== theme) update.mutate({ theme: SCHEME_TO_THEME[scheme] });
    },
  };
}
