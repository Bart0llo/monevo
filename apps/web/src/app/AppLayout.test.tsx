import { screen, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createI18n, LANGUAGE_STORAGE_KEY } from '../i18n/i18n';
import { AppProviders } from './AppProviders';
import { isActivePath } from './navigation';
import { routes } from './routes';

async function renderApp(path = '/') {
  const i18n = await createI18n();
  await i18n.changeLanguage('en');
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProviders i18n={i18n} env="test">
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { i18n, router };
}

describe('app shell', () => {
  it('renders the navigation with the current section marked', async () => {
    await renderApp('/budgets');
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(nav).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Budgets' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('heading', { level: 2, name: 'Budgets' })).toBeTruthy();
  });

  it('shows the not-found page for unknown paths', async () => {
    await renderApp('/nope');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy();
  });

  it('switches the language and remembers the choice', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(screen.getByRole('button', { name: 'Language' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Polski' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: 'Pulpit' })).toBeTruthy(),
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
