import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LANGUAGE_STORAGE_KEY } from '../i18n/i18n';
import { stubApi } from '../test/api';
import { renderApp, useDesktopViewport } from '../test/render';
import { isActivePath } from './navigation';
import { createRoutes } from './routes';

let api: ReturnType<typeof stubApi>;

beforeEach(() => {
  api = stubApi({ role: 'USER' });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('app shell (mobile)', () => {
  it('renders the bottom navigation with the current section marked', async () => {
    await renderApp('/budgets');
    const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByRole('link', { name: 'Budgets' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(within(nav).getByRole('button', { name: 'More' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Budgets' })).toBeTruthy();
    expect(document.title).toBe('Budgets · Monevo');
  });

  it('offers a skip link to the main content first', async () => {
    await renderApp('/');
    const skip = await screen.findByRole('link', { name: 'Skip to content' });
    expect(skip.getAttribute('href')).toBe('#main-content');
    expect(document.getElementById('main-content')).toBeTruthy();
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(skip);
  });

  it('opens the More sheet with the remaining sections', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    const moreButton = await screen.findByRole('button', { name: 'More' });
    await user.click(moreButton);
    const sheet = await screen.findByRole('dialog', { name: 'More' });
    for (const name of ['Accounts', 'Reports', 'Settings']) {
      expect(within(sheet).getByRole('link', { name })).toBeTruthy();
    }
    expect(within(sheet).queryByRole('link', { name: 'Administration' })).toBeNull();
    await user.click(within(sheet).getByRole('link', { name: 'Reports' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Reports' })).toBeTruthy(),
    );
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'More' })).toBeNull());
    expect(moreButton.hasAttribute('data-active')).toBe(true);
  });

  it('ends the More sheet with Settings and, for admins, Administration as one group', async () => {
    stubApi({ role: 'ADMIN' });
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'More' }));
    const sheet = await screen.findByRole('dialog', { name: 'More' });
    const items = within(sheet)
      .getAllByRole('listitem')
      .map((item) => [item.textContent, item.getAttribute('data-group')]);
    expect(items).toEqual([
      ['Accounts', 'secondary'],
      ['Categories', 'secondary'],
      ['Reports', 'secondary'],
      ['Settings', 'system'],
      ['Administration', 'system'],
    ]);
  });
});

describe('app shell (desktop)', () => {
  it('renders the rail with every section and no bottom bar', async () => {
    useDesktopViewport();
    await renderApp('/settings');
    const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getAllByRole('link')).toHaveLength(8);
    expect(within(nav).getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy();
  });

  it('pins Settings and, for admins, Administration together at the end of the rail', async () => {
    stubApi({ role: 'ADMIN' });
    useDesktopViewport();
    await renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
    await within(nav).findByRole('link', { name: 'Administration' });
    const system = within(nav)
      .getAllByRole('listitem')
      .filter((item) => item.getAttribute('data-group') === 'system')
      .map((item) => item.textContent);
    expect(system).toEqual(['Settings', 'Administration']);
  });
});

describe('page states', () => {
  it('shows the not-found page for unknown paths', async () => {
    await renderApp('/nope');
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to the dashboard' }).getAttribute('href')).toBe(
      '/',
    );
  });

  it('keeps the shell and shows the error state when a page throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Broken(): never {
      throw new Error('boom');
    }
    await renderApp('/broken', createRoutes([{ path: '/broken', element: <Broken /> }]));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Something went wrong' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy();
  });
});

describe('preferences', () => {
  it('switches the language, saves it to the settings and remembers the choice', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Language' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Polski' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Pulpit' })).toBeTruthy(),
    );
    expect(document.documentElement.lang).toBe('pl');
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('pl');
    await waitFor(() =>
      expect(api.calls).toContainEqual(
        expect.objectContaining({
          method: 'PATCH',
          path: '/me/settings',
          body: { locale: 'pl', version: 1 },
        }),
      ),
    );
  });

  it('switches the color scheme and saves it to the settings', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Color scheme' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Dark' }));
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-mantine-color-scheme')).toBe('dark'),
    );
    expect(window.localStorage.getItem('monevo-color-scheme')).toBe('dark');
    await waitFor(() =>
      expect(api.calls).toContainEqual(
        expect.objectContaining({ method: 'PATCH', body: { theme: 'DARK', version: 1 } }),
      ),
    );
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
