import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../test/api';
import { renderApp, useDesktopViewport } from '../test/render';
import { oidcStartUrl, safeReturnTo } from './session';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('sign-in page', () => {
  it('offers sign-in with the configured provider', async () => {
    stubApi({ role: null });
    await renderApp('/login');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Sign in with Account Center' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('explains a failed sign-in from the error parameter', async () => {
    stubApi({ role: null });
    await renderApp('/login?error=account_deactivated');
    expect((await screen.findByRole('alert')).textContent).toBe(
      'This account has been deactivated. Contact your administrator.',
    );
  });

  it('ignores unknown error codes', async () => {
    stubApi({ role: null });
    await renderApp('/login?error=<script>');
    await screen.findByRole('button', { name: 'Sign in with Account Center' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sends a signed-in user on to the return path', async () => {
    stubApi({ role: 'USER' });
    const { router } = await renderApp('/login?returnTo=%2Fbudgets');
    expect(await screen.findByRole('heading', { level: 1, name: 'Budgets' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/budgets');
  });
});

describe('route guard', () => {
  it('sends a signed-out user to the sign-in page and keeps the target', async () => {
    stubApi({ role: null });
    const { router } = await renderApp('/budgets?month=2026-11');
    await screen.findByRole('button', { name: 'Sign in with Account Center' });
    expect(router.state.location.pathname).toBe('/login');
    expect(new URLSearchParams(router.state.location.search).get('returnTo')).toBe(
      '/budgets?month=2026-11',
    );
  });

  it('sends a user who has not finished onboarding to onboarding', async () => {
    stubApi({ role: 'USER', onboardingRequired: true });
    const { router } = await renderApp('/transactions');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Welcome to Monevo' }),
    ).toBeTruthy();
    expect(router.state.location.pathname).toBe('/onboarding');
  });

  it('keeps onboarded users away from onboarding', async () => {
    stubApi({ role: 'USER' });
    const { router } = await renderApp('/onboarding');
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/');
  });

  it('signs out and returns to the sign-in page', async () => {
    const api = stubApi({ role: 'USER' });
    const user = userEvent.setup();
    const { router } = await renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Account' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(api.calls).toContainEqual(
      expect.objectContaining({ method: 'POST', path: '/auth/logout' }),
    );
  });
});

describe('administration', () => {
  it('shows the administration section to admins only', async () => {
    useDesktopViewport();
    stubApi({ role: 'ADMIN' });
    await renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
    await waitFor(() =>
      expect(within(nav).getByRole('link', { name: 'Administration' })).toBeTruthy(),
    );
    expect(within(nav).getAllByRole('link')).toHaveLength(9);
  });

  it('hides the administration section and page from users', async () => {
    useDesktopViewport();
    stubApi({ role: 'USER' });
    await renderApp('/admin/users');
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).queryByRole('link', { name: 'Administration' })).toBeNull();
  });
});

describe('sign-in helpers', () => {
  it('keeps only same-origin return paths', () => {
    expect(safeReturnTo('/settings?tab=1')).toBe('/settings?tab=1');
    expect(safeReturnTo('//evil.example')).toBe('/');
    expect(safeReturnTo('/\\evil.example')).toBe('/');
    expect(safeReturnTo('https://evil.example')).toBe('/');
    expect(safeReturnTo(null)).toBe('/');
  });

  it('builds the OIDC start URL', () => {
    const url = new URL(oidcStartUrl('reauth', '//evil.example', 'pl'), 'http://localhost');
    expect(url.pathname).toBe('/api/v1/auth/oidc/start');
    expect(url.searchParams.get('intent')).toBe('reauth');
    expect(url.searchParams.get('returnTo')).toBe('/');
    expect(url.searchParams.get('locale')).toBe('pl');
  });
});
