import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../../test/api';
import { renderApp } from '../../test/render';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('base currency change', () => {
  it('changes the base currency after confirmation, sending the settings version', async () => {
    const api = stubApi();
    const user = userEvent.setup();
    await renderApp('/settings');
    const section = await screen.findByRole('region', { name: 'Base currency' });
    const submit = within(section).getByRole('button', { name: 'Change base currency' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    await user.click(within(section).getByRole('textbox', { name: 'Base currency' }));
    await user.click(await screen.findByRole('option', { name: /^EUR/ }));
    expect(screen.queryByRole('option', { name: /^HRK/ })).toBeNull();
    await user.click(submit);

    const dialog = await screen.findByRole('dialog', { name: 'Change base currency?' });
    expect(within(dialog).getByText(/from PLN to EUR/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Change to the new currency' }));

    await waitFor(() =>
      expect(api.calls.some((call) => call.path === '/me/base-currency-change')).toBe(true),
    );
    const post = api.calls.find((call) => call.path === '/me/base-currency-change');
    expect(post?.body).toEqual({ baseCurrency: 'EUR', confirm: true, version: 1 });
    expect(await screen.findByText('Base currency changed to EUR.')).toBeTruthy();
  });
});
