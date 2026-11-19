import { expect, test } from '@playwright/test';
import { ADMIN_GROUP, PROVIDER_BUTTON, approveAtIdp, signIn } from './support/auth.js';

// Stage 2: OIDC sign-in through the mock IdP, onboarding, settings, personal API tokens, sign-out,
// and the admin role from the IdP group (authentication.md, api-tokens.md, administration.md).

test('signed-out visitors are sent to the sign-in page', async ({ page }) => {
  await page.goto('/budgets');
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fbudgets$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('button', { name: PROVIDER_BUTTON })).toBeVisible();
});

test('auth journey: sign in, onboarding, settings, API token, sign out', async ({
  page,
  request,
}) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: PROVIDER_BUTTON }).click();
  const username = await approveAtIdp(page, { name: 'Journey User' });
  expect(username).toBeTruthy();

  // A new user finishes onboarding before anything else.
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole('button', { name: 'Start using Monevo' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

  // Profile: the display name comes from the IdP and can be changed in Monevo.
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Settings' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.getByLabel('Display name')).toHaveValue('Journey User');

  // Devices: the current session is listed.
  await page.getByRole('link', { name: 'Devices' }).click();
  await expect(page).toHaveURL(/\/settings\/sessions$/);

  // API tokens: the secret is shown once and authenticates API requests.
  await page.getByRole('link', { name: 'API tokens' }).click();
  await page.getByRole('button', { name: 'Create token' }).click();
  const dialog = page.getByRole('dialog', { name: 'New API token' });
  await dialog.getByRole('textbox', { name: 'Name' }).fill('E2E script');
  // No permission is selected by default (api-tokens.md §6).
  await dialog.getByRole('checkbox', { name: 'Read your profile and settings' }).check();
  await dialog.getByRole('button', { name: 'Create token' }).click();
  const secret = await page.getByTestId('api-token-secret').textContent();
  expect(secret).toMatch(/^mnv_pat_/);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('E2E script')).toBeVisible();

  const me = await request.get('/api/v1/me', {
    headers: { Authorization: `Bearer ${secret ?? ''}` },
  });
  expect(me.status()).toBe(200);
  expect(await me.json()).toMatchObject({ displayName: 'Journey User' });

  // Sign out ends the Monevo session and the IdP session, then returns to the sign-in page.
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});

test('a denied sign-in explains what happened', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: PROVIDER_BUTTON }).click();
  await page.getByLabel('Username').fill('denied-user');
  await page.getByRole('button', { name: 'Deny' }).click();
  await expect(page).toHaveURL(/\/login\?error=access_denied$/);
  await expect(page.getByRole('alert')).toHaveText('Sign-in was cancelled or access was denied.');
});

test('members of the admin group get user administration', async ({ page }) => {
  await signIn(page, { groups: [ADMIN_GROUP] });
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('link', { name: 'Administration' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Identity provider' })).toBeVisible();
});

test('other users do not see administration', async ({ page }) => {
  await signIn(page);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link', { name: 'Settings' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Administration' })).toHaveCount(0);
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  const admin = await page.request.get('/api/v1/admin/users');
  expect(admin.status()).toBe(403);
});
