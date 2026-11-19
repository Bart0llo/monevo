import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/auth.js';

// Stage 3: accounts in several currencies with today's rate to the base currency, the category
// tree with archiving, and the base currency change (features.md, multi-currency.md).
// No test may reach a real rate provider: manual rates are created first, and the server prefers
// an exact manual rate (direct or inverse) over any provider (multi-currency.md#5).

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Saves a manual PLN → EUR rate for the user's yesterday, today and tomorrow (no midnight race). */
async function createManualRates(page: Page): Promise<void> {
  const session = await page.request.get('/api/v1/auth/session');
  expect(session.status()).toBe(200);
  const { csrfToken } = (await session.json()) as { csrfToken: string };
  const settings = await page.request.get('/api/v1/me/settings');
  expect(settings.status()).toBe(200);
  const { timeZone } = (await settings.json()) as { timeZone: string };
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  for (const offset of [-1, 0, 1]) {
    const response = await page.request.post('/api/v1/exchange-rates', {
      headers: { 'X-CSRF-Token': csrfToken },
      data: {
        fromCurrency: 'PLN',
        toCurrency: 'EUR',
        rateDate: shiftDate(today, offset),
        rate: '0.234500000000',
      },
    });
    expect(response.status()).toBe(201);
  }
}

async function addAccount(
  page: Page,
  values: { name: string; currency?: string; openingBalance: string },
): Promise<void> {
  await page.getByRole('button', { name: 'Add account' }).click();
  const dialog = page.getByRole('dialog', { name: 'New account' });
  await dialog.getByRole('textbox', { name: 'Name' }).fill(values.name);
  if (values.currency) {
    await dialog.getByLabel('Currency').click();
    await dialog.getByLabel('Currency').fill(values.currency);
    await page.getByRole('option', { name: new RegExp(`^${values.currency} · `) }).click();
  }
  await dialog.getByRole('textbox', { name: 'Opening balance' }).fill(values.openingBalance);
  await dialog.getByRole('button', { name: 'Add account' }).click();
  await expect(dialog).toBeHidden();
}

test('accounts show the rate to the base currency, which can be changed', async ({ page }) => {
  await signIn(page);
  await createManualRates(page);

  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Accounts' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Accounts' })).toBeVisible();
  await expect(page.getByText('No accounts yet')).toBeVisible();

  // New users' base currency is EUR.
  await addAccount(page, { name: 'Euro account', openingBalance: '100' });
  await addAccount(page, { name: 'Złoty account', currency: 'PLN', openingBalance: '1250.50' });

  const active = page.getByRole('region', { name: 'Active accounts' });
  const euro = active.getByRole('listitem').filter({ hasText: 'Euro account' });
  const zloty = active.getByRole('listitem').filter({ hasText: 'Złoty account' });
  await expect(zloty.getByText(/^Opening balance .*1,250\.50 on /)).toBeVisible();
  await expect(zloty.getByText(/^1 PLN = 0\.2345 EUR · Manual rate · /)).toBeVisible();
  await expect(euro.getByText(/^1 EUR = /)).toHaveCount(0);

  // Archived accounts are listed separately, on request.
  await euro.getByRole('button', { name: 'Actions for Euro account' }).click();
  await page.getByRole('menuitem', { name: 'Archive' }).click();
  await expect(active.getByText('Euro account')).toHaveCount(0);
  await page.getByRole('switch', { name: 'Show archived accounts' }).click();
  const archived = page.getByRole('region', { name: 'Archived (1)' });
  await expect(archived.getByText('Euro account')).toBeVisible();
  await archived.getByRole('button', { name: 'Actions for Euro account' }).click();
  await page.getByRole('menuitem', { name: 'Restore' }).click();
  await expect(active.getByText('Euro account')).toBeVisible();

  // Base currency change (confirmed) flips which account shows a rate.
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Settings' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  const baseCurrency = page.getByRole('textbox', { name: 'Base currency' });
  await baseCurrency.click();
  await baseCurrency.fill('PLN');
  await page.getByRole('option', { name: /^PLN · / }).click();
  await page.getByRole('button', { name: 'Change base currency' }).click();
  const confirm = page.getByRole('dialog', { name: 'Change base currency?' });
  await expect(confirm).toContainText('from EUR to PLN');
  await confirm.getByRole('button', { name: 'Change to the new currency' }).click();
  await expect(page.getByText('Base currency changed to PLN.')).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Accounts' })
    .click();
  // The manual PLN → EUR rate is used inverted.
  await expect(euro.getByText(/^1 EUR = 4\.2643\d* PLN · Manual rate · /)).toBeVisible();
  await expect(zloty.getByText(/^1 PLN = /)).toHaveCount(0);
});

test('category tree: subcategories, archiving a parent, deleting with children', async ({
  page,
}) => {
  await signIn(page);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Categories' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Categories' })).toBeVisible();
  await expect(page.getByText('No expense categories yet.')).toBeVisible();

  await page.getByRole('button', { name: 'Add category' }).click();
  let dialog = page.getByRole('dialog', { name: 'New category' });
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Food');
  await dialog.getByRole('button', { name: 'Add category' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Actions for Food' }).click();
  await page.getByRole('menuitem', { name: 'Add subcategory' }).click();
  dialog = page.getByRole('dialog', { name: 'New category' });
  await expect(dialog.getByRole('textbox', { name: 'Parent category' })).toHaveValue('Food');
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Groceries');
  await dialog.getByRole('button', { name: 'Add category' }).click();
  await expect(dialog).toBeHidden();

  const list = page.getByRole('region', { name: 'Expenses' });
  await expect(list.getByText('Groceries')).toBeVisible();

  // Income has its own tree.
  const types = page.getByRole('radiogroup', { name: 'Category type' });
  await types.getByText('Income', { exact: true }).click();
  await expect(page.getByText('No income categories yet.')).toBeVisible();
  await types.getByText('Expenses', { exact: true }).click();

  // An archived parent hides its subcategories, which keep their own state.
  await page.getByRole('button', { name: 'Actions for Food' }).click();
  await page.getByRole('menuitem', { name: 'Archive' }).click();
  await expect(page.getByText('No expense categories yet.')).toBeVisible();
  await page.getByRole('switch', { name: 'Show archived categories' }).click();
  await expect(list.getByText('Groceries')).toBeVisible();
  await expect(list.getByText('Hidden: parent archived')).toBeVisible();

  // Restoring the parent shows the subcategory again; deleting it names the subcategory count.
  await page.getByRole('button', { name: 'Actions for Food' }).click();
  await page.getByRole('menuitem', { name: 'Restore' }).click();
  await expect(list.getByText('Hidden: parent archived')).toHaveCount(0);
  await page.getByRole('button', { name: 'Actions for Food' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete category?' });
  await expect(confirm).toContainText('“Food” and its 1 subcategory will be deleted permanently.');
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No expense categories yet.')).toBeVisible();
});
