import { expect, test } from '@playwright/test';

// Stage 1 smoke: the app shell loads, the theme and language switch, and the PWA is installable
// (manifest and an active service worker).

test('app shell loads with navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Monevo' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await page.getByRole('link', { name: 'Transactions' }).click();
  await expect(page).toHaveURL(/\/transactions$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Transactions' })).toBeVisible();
});

test('theme switch applies and persists across reloads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-mantine-color-scheme', 'light');

  await page.getByRole('button', { name: 'Color scheme' }).click();
  await page.getByRole('menuitem', { name: 'Dark' }).click();
  await expect(html).toHaveAttribute('data-mantine-color-scheme', 'dark');

  await page.reload();
  await expect(html).toHaveAttribute('data-mantine-color-scheme', 'dark');
});

test('language switch translates the UI and persists', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Language' }).click();
  await page.getByRole('menuitem', { name: 'Polski' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Pulpit' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');

  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Główna nawigacja' })).toBeVisible();
});

test('PWA manifest and service worker are in place', async ({ page, request }) => {
  const manifestResponse = await request.get('/manifest.webmanifest');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  const sizes = (manifest.icons as { sizes: string; purpose?: string }[]).map((icon) => `${icon.sizes}:${icon.purpose ?? 'any'}`);
  expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));

  await page.goto('/');
  const scope = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.active?.state === 'activated' ? registration.scope : null;
  });
  expect(scope).toBe(new URL('/', page.url()).href);
});

test('API and docs are served from the same origin', async ({ request }) => {
  const ready = await request.get('/api/v1/health/ready');
  expect(ready.status()).toBe(200);
  const docs = await request.get('/api/v1/docs/');
  expect(docs.status()).toBe(200);
  const unknownApi = await request.get('/api/v1/nope');
  expect(unknownApi.status()).toBe(404);
  expect(unknownApi.headers()['content-type']).toContain('application/problem+json');
});
