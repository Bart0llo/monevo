import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { vi } from 'vitest';
import { AppProviders } from '../app/AppProviders';
import { routes } from '../app/routes';
import { createQueryClient } from '../data/queryClient';
import { createI18n } from '../i18n/i18n';

/** Renders the app at `path` with a fresh query cache, in English. Stub `fetch` first (test/api.ts). */
export async function renderApp(path = '/', routeTable: RouteObject[] = routes) {
  const i18n = await createI18n();
  await i18n.changeLanguage('en');
  const queryClient = createQueryClient();
  const router = createMemoryRouter(routeTable, { initialEntries: [path] });
  render(
    <AppProviders i18n={i18n} env="test" queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { i18n, router, queryClient };
}

/** jsdom's matchMedia stub (test/setup.ts) matches nothing, which gives the mobile layout. */
export function useDesktopViewport() {
  const original = window.matchMedia.bind(window);
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    ...original(query),
    matches: query.includes('min-width'),
  }));
}
