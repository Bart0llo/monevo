import { MantineProvider, type MantineProviderProps } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { i18n } from 'i18next';
import { type ReactNode, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createQueryClient } from '../data/queryClient';
import { colorSchemeManager, cssVariablesResolver, theme } from '../theme/theme';

export function AppProviders({
  i18n,
  children,
  env,
  queryClient,
}: {
  readonly i18n: i18n;
  /** Tests pass their own client; the app creates one. */
  readonly queryClient?: QueryClient;
  readonly children: ReactNode;
  /** `test` in unit tests: Mantine then skips transitions, portals and detached-target hiding (jsdom has no layout). */
  readonly env?: MantineProviderProps['env'];
}) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MantineProvider
          theme={theme}
          cssVariablesResolver={cssVariablesResolver}
          colorSchemeManager={colorSchemeManager}
          defaultColorScheme="auto"
          env={env ?? 'default'}
        >
          <Notifications position="bottom-right" />
          {children}
        </MantineProvider>
      </I18nextProvider>
    </QueryClientProvider>
  );
}
