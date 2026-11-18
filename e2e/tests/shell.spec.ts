import { expect, test } from '@playwright/test';

// Stage 1 smoke: the app shell loads, the theme and language switch, and the PWA is installable
// (manifest and an active service worker).

test('app shell loads with navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav).toBeVisible();
  await nav.getByRole('link', { name: 'Transactions' }).click();
  await expect(page).toHaveURL(/\/transactions$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Transactions' })).toBeVisible();
  await expect(page).toHaveTitle('Transactions · Monevo');
});

test('mobile layout uses the bottom bar and the More sheet', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('button', { name: 'More' }).click();
  const sheet = page.getByRole('dialog', { name: 'More' });
  await sheet.getByRole('link', { name: 'Accounts' }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Accounts' })).toBeVisible();
  await expect(sheet).toBeHidden();
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
  await expect(page.getByRole('heading', { level: 1, name: 'Pulpit' })).toBeVisible();
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
  const sizes = (manifest.icons as { sizes: string; purpose?: string }[]).map(
    (icon) => `${icon.sizes}:${icon.purpose ?? 'any'}`,
  );
  expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));

  await page.goto('/');
  const scope = await page.evaluate(async () => {
    // `ready` resolves once a worker is active, which can still be in the `activating` state.
    const registration = await navigator.serviceWorker.ready;
    const worker = registration.active;
    if (!worker) return null;
    if (worker.state !== 'activated') {
      await new Promise<void>((resolve) => {
        const onChange = () => {
          if (worker.state === 'activated') {
            worker.removeEventListener('statechange', onChange);
            resolve();
          }
        };
        worker.addEventListener('statechange', onChange);
        onChange();
      });
    }
    return registration.scope;
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
