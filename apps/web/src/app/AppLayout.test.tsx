import { screen, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createI18n, LANGUAGE_STORAGE_KEY } from '../i18n/i18n';
import { AppProviders } from './AppProviders';
import { isActivePath } from './navigation';
import { routes } from './routes';

async function renderApp(path = '/', routeTable: RouteObject[] = routes) {
  const i18n = await createI18n();
  await i18n.changeLanguage('en');
  const router = createMemoryRouter(routeTable, { initialEntries: [path] });
  render(
    <AppProviders i18n={i18n} env="test">
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { i18n, router };
}

/** jsdom's matchMedia stub (test/setup.ts) matches nothing, which gives the mobile layout. */
function useDesktopViewport() {
  const original = window.matchMedia.bind(window);
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    ...original(query),
    matches: query.includes('min-width'),
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('app shell (mobile)', () => {
  it('renders the bottom navigation with the current section marked', async () => {
    await renderApp('/budgets');
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByRole('link', { name: 'Budgets' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(within(nav).getByRole('button', { name: 'More' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Budgets' })).toBeTruthy();
    expect(document.title).toBe('Budgets · Monevo');
  });

  it('offers a skip link to the main content first', async () => {
    await renderApp('/');
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip.getAttribute('href')).toBe('#main-content');
    expect(document.getElementById('main-content')).toBeTruthy();
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(skip);
  });

  it('opens the More sheet with the remaining sections', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    const moreButton = screen.getByRole('button', { name: 'More' });
    await user.click(moreButton);
    const sheet = await screen.findByRole('dialog', { name: 'More' });
    for (const name of ['Accounts', 'Reports', 'Settings']) {
      expect(within(sheet).getByRole('link', { name })).toBeTruthy();
    }
    await user.click(within(sheet).getByRole('link', { name: 'Reports' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Reports' })).toBeTruthy(),
    );
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'More' })).toBeNull());
    expect(moreButton.hasAttribute('data-active')).toBe(true);
  });
});

describe('app shell (desktop)', () => {
  it('renders the rail with every section and no bottom bar', async () => {
    useDesktopViewport();
    await renderApp('/settings');
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getAllByRole('link')).toHaveLength(7);
    expect(within(nav).getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy();
  });
});

describe('page states', () => {
  it('shows the not-found page for unknown paths', async () => {
    await renderApp('/nope');
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to the dashboard' }).getAttribute('href')).toBe(
      '/',
    );
  });

  it('keeps the shell and shows the error state when a page throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Broken(): never {
      throw new Error('boom');
    }
    // The real route table, with one failing page added inside the shell.
    const shell = routes[0];
    const pages = shell?.children?.[0];
    if (!shell || shell.index || !pages || pages.index) throw new Error('unexpected route table');
    const routeTable: RouteObject[] = [
      {
        ...shell,
        children: [
          {
            ...pages,
            children: [...(pages.children ?? []), { path: '/broken', element: <Broken /> }],
          },
        ],
      },
    ];
    await renderApp('/broken', routeTable);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Something went wrong' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy();
  });
});

describe('preferences', () => {
  it('switches the language and remembers the choice', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(screen.getByRole('button', { name: 'Language' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Polski' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Pulpit' })).toBeTruthy(),
    );
    expect(document.documentElement.lang).toBe('pl');
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('pl');
  });

  it('switches the color scheme', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(screen.getByRole('button', { name: 'Color scheme' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Dark' }));
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-mantine-color-scheme')).toBe('dark'),
    );
    expect(window.localStorage.getItem('monevo-color-scheme')).toBe('dark');
  });
});

describe('isActivePath', () => {
  it('matches the dashboard exactly and sections by prefix', () => {
    expect(isActivePath('/', '/')).toBe(true);
    expect(isActivePath('/', '/transactions')).toBe(false);
    expect(isActivePath('/transactions', '/transactions/42')).toBe(true);
    expect(isActivePath('/transactions', '/transactions-archive')).toBe(false);
  });
});
