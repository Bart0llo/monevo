import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

// Sign-in through the test-only mock OpenID Provider (tools/mock-idp), which docker-compose.e2e.yml
// runs at http://localhost:9400. Its authorize page is a form that accepts any username.

export const PROVIDER_BUTTON = 'Sign in with Mock IdP';
export const ADMIN_GROUP = 'monevo-admins';

export interface SignInOptions {
  readonly username?: string;
  readonly name?: string;
  readonly groups?: readonly string[];
  /** Finish onboarding with the defaults (new users land on /onboarding). */
  readonly completeOnboarding?: boolean;
}

export function uniqueUsername(prefix = 'e2e'): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

/** Fills the mock IdP form; the page must be on the IdP's authorize page. */
export async function approveAtIdp(page: Page, options: SignInOptions = {}): Promise<string> {
  const username = options.username ?? uniqueUsername();
  await expect(page).toHaveURL(/localhost:9400\/authorize/);
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Name', { exact: true }).fill(options.name ?? `User ${username}`);
  if (options.groups?.length) await page.getByLabel(/Groups/).fill(options.groups.join(','));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  return username;
}

/** Signs a new user in from the sign-in page and, by default, completes onboarding. */
export async function signIn(page: Page, options: SignInOptions = {}): Promise<string> {
  await page.goto('/login');
  await page.getByRole('button', { name: PROVIDER_BUTTON }).click();
  const username = await approveAtIdp(page, options);
  if (options.completeOnboarding ?? true) {
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome to Monevo' })).toBeVisible();
    await page.getByRole('button', { name: 'Start using Monevo' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  }
  return username;
}
