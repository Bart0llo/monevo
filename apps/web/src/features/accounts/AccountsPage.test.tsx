import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedRate } from '@monevo/contracts';
import { accountFixture, ok, stubApi } from '../../test/api';
import { renderApp } from '../../test/render';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const EUR_ACCOUNT = accountFixture({
  id: '33333333-3333-4333-8333-000000000002',
  name: 'Euro savings',
  currency: 'EUR',
  kind: 'SAVINGS',
  icon: 'piggy-bank',
  openingBalance: '300.00',
});

function resolved(overrides: Partial<ResolvedRate> = {}): ResolvedRate {
  return {
    status: 'FOUND',
    fromCurrency: 'EUR',
    toCurrency: 'PLN',
    date: '2026-11-19',
    rate: '4.265000000000',
    source: 'PROVIDER',
    providerId: 'frankfurter',
    rateDate: '2026-11-19',
    publishedOn: '2026-11-19',
    method: 'DIRECT',
    pivot: null,
    stale: false,
    estimate: false,
    ...overrides,
  };
}

describe('accounts page', () => {
  it('shows the empty state', async () => {
    stubApi();
    await renderApp('/accounts');
    expect(await screen.findByRole('heading', { level: 1, name: 'Accounts' })).toBeTruthy();
    expect(await screen.findByText('No accounts yet')).toBeTruthy();
  });

  it('lists accounts and shows the rate to the base currency for a foreign account', async () => {
    const api = stubApi({
      routes: {
        'GET /accounts': () => ok({ items: [accountFixture(), EUR_ACCOUNT] }),
        'POST /exchange-rates/resolve': () => ok(resolved()),
      },
    });
    await renderApp('/accounts');
    const active = await screen.findByRole('region', { name: 'Active accounts' });
    expect(within(active).getByText('Main bank')).toBeTruthy();
    expect(within(active).getByText('Euro savings')).toBeTruthy();
    expect(
      await within(active).findByText(/^1 EUR = 4\.2650 PLN · Frankfurter \(ECB\) · /),
    ).toBeTruthy();
    const resolves = api.calls.filter((call) => call.path === '/exchange-rates/resolve');
    expect(resolves).toHaveLength(1);
    expect(resolves[0]?.body).toMatchObject({ fromCurrency: 'EUR', toCurrency: 'PLN' });
  });

  it('says so when no rate is available', async () => {
    stubApi({
      routes: {
        'GET /accounts': () => ok({ items: [EUR_ACCOUNT] }),
        'POST /exchange-rates/resolve': () =>
          ok(
            resolved({
              status: 'MISSING',
              rate: null,
              source: null,
              providerId: null,
              rateDate: null,
              publishedOn: null,
              method: null,
            }),
          ),
      },
    });
    await renderApp('/accounts');
    expect(await screen.findByText('No exchange rate available for EUR → PLN.')).toBeTruthy();
  });

  it('creates an account with the amount as a decimal string', async () => {
    const api = stubApi({
      routes: { 'POST /accounts': () => ok(accountFixture({ name: 'Wallet' }), 201) },
    });
    const user = userEvent.setup();
    await renderApp('/accounts');
    await user.click(await screen.findByRole('button', { name: 'Add account' }));
    const dialog = await screen.findByRole('dialog', { name: 'New account' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Wallet');
    const balance = within(dialog).getByRole('textbox', { name: 'Opening balance' });
    await user.clear(balance);
    await user.type(balance, '1 234,56');
    await user.click(within(dialog).getByRole('button', { name: 'Add account' }));

    await waitFor(() => expect(api.calls.some((call) => call.method === 'POST')).toBe(true));
    const post = api.calls.find((call) => call.method === 'POST');
    expect(post?.body).toMatchObject({
      name: 'Wallet',
      currency: 'PLN',
      kind: 'BANK',
      openingBalance: '1234.56',
      openingDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as unknown,
    });
  });

  it('rejects an amount that is not a number', async () => {
    const api = stubApi();
    const user = userEvent.setup();
    await renderApp('/accounts');
    await user.click(await screen.findByRole('button', { name: 'Add account' }));
    const dialog = await screen.findByRole('dialog', { name: 'New account' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Wallet');
    const balance = within(dialog).getByRole('textbox', { name: 'Opening balance' });
    await user.clear(balance);
    await user.type(balance, 'ten');
    await user.click(within(dialog).getByRole('button', { name: 'Add account' }));
    expect(await within(dialog).findByText('Enter an amount, for example 1250.50.')).toBeTruthy();
    expect(api.calls.some((call) => call.method === 'POST')).toBe(false);
  });
});
