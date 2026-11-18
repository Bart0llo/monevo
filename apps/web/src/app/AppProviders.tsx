import { MantineProvider, type MantineProviderProps } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { i18n } from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { colorSchemeManager, theme } from '../theme/theme';

export function AppProviders({
  i18n,
  children,
  env,
}: {
  readonly i18n: i18n;
  readonly children: ReactNode;
  /** `test` in unit tests: Mantine then skips transitions, portals and detached-target hiding (jsdom has no layout). */
  readonly env?: MantineProviderProps['env'];
}) {
  return (
    <I18nextProvider i18n={i18n}>
      <MantineProvider
        theme={theme}
        colorSchemeManager={colorSchemeManager}
        defaultColorScheme="auto"
        env={env ?? 'default'}
      >
        <Notifications position="bottom-right" />
        {children}
      </MantineProvider>
    </I18nextProvider>
  );
}
