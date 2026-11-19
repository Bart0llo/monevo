import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ok, stubApi } from '../../test/api';
import { renderApp } from '../../test/render';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const IDP = {
  providerName: 'Account Center',
  issuer: 'https://id.example.test',
  clientId: 'monevo',
  clientType: 'CONFIDENTIAL',
  scopes: ['openid'],
  adminGroup: null,
  endSessionSupported: true,
  discovery: 'OK',
};

describe('instance settings', () => {
  it('lets an admin switch the exchange rate provider', async () => {
    const api = stubApi({
      role: 'ADMIN',
      routes: {
        'GET /admin/identity-provider': () => ok(IDP),
        'PATCH /admin/settings': () =>
          ok({ rates: { provider: { value: 'nbp', default: 'frankfurter', lockedByEnv: false } } }),
      },
    });
    const user = userEvent.setup();
    await renderApp('/admin/users');
    const section = await screen.findByRole('region', { name: 'Instance settings' });
    const select = await within(section).findByRole('textbox', { name: 'Exchange rate provider' });
    expect((select as HTMLInputElement).value).toBe('Frankfurter (ECB)');

    await user.click(select);
    await user.click(await screen.findByRole('option', { name: 'NBP' }));
    await waitFor(() => expect(api.calls.some((call) => call.method === 'PATCH')).toBe(true));
    expect(api.calls.find((call) => call.method === 'PATCH')?.body).toEqual({
      rates: { provider: 'nbp' },
    });
    expect(await screen.findByText('Instance settings saved.')).toBeTruthy();
  });

  it('locks the provider when the environment sets it', async () => {
    stubApi({
      role: 'ADMIN',
      routes: {
        'GET /admin/identity-provider': () => ok(IDP),
        'GET /admin/settings': () =>
          ok({ rates: { provider: { value: 'nbp', default: 'frankfurter', lockedByEnv: true } } }),
      },
    });
    await renderApp('/admin/users');
    const section = await screen.findByRole('region', { name: 'Instance settings' });
    const select = await within(section).findByRole('textbox', { name: 'Exchange rate provider' });
    expect((select as HTMLInputElement).disabled).toBe(true);
    expect((select as HTMLInputElement).value).toBe('NBP');
    expect(within(section).getByText('Set by environment')).toBeTruthy();
  });
});
