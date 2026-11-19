import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CSRF_TOKEN, ok, problem, stubApi, tokenFixture } from '../../test/api';
import { renderApp } from '../../test/render';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const SECRET = 'mnv_pat_abcd_secret-value';

describe('API tokens', () => {
  it('lists tokens and shows a new secret once', async () => {
    let created = false;
    const api = stubApi({
      routes: {
        'GET /me/api-tokens': () =>
          ok({
            items: created ? [tokenFixture({ name: 'Scripts' }), tokenFixture()] : [tokenFixture()],
          }),
        'POST /me/api-tokens': () => {
          created = true;
          return ok({ token: tokenFixture({ name: 'Scripts' }), secret: SECRET }, 201);
        },
      },
    });
    const user = userEvent.setup();
    await renderApp('/settings/api-tokens');
    expect(await screen.findByText('Home Assistant')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Create token' }));
    const dialog = await screen.findByRole('dialog', { name: 'New API token' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Scripts');
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Read your profile and settings' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Create token' }));

    const done = await screen.findByRole('dialog', { name: 'Token created' });
    expect(within(done).getByTestId('api-token-secret').textContent).toBe(SECRET);
    const post = api.calls.find((call) => call.method === 'POST');
    expect(post?.headers['X-CSRF-Token']).toBe(CSRF_TOKEN);
    expect(post?.body).toMatchObject({ name: 'Scripts', permissions: ['profile:read'] });

    await user.click(within(done).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByTestId('api-token-secret')).toBeNull());
    expect(await screen.findByText('Scripts')).toBeTruthy();
    expect(screen.queryByText(SECRET)).toBeNull();
  });

  it('asks the user to confirm their identity when the server wants a recent sign-in', async () => {
    stubApi({ routes: { 'POST /me/api-tokens': () => problem('REAUTH_REQUIRED') } });
    const user = userEvent.setup();
    await renderApp('/settings/api-tokens');
    await user.click(await screen.findByRole('button', { name: 'Create token' }));
    const dialog = await screen.findByRole('dialog', { name: 'New API token' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Scripts');
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Read your profile and settings' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Create token' }));

    const reauth = await screen.findByRole('dialog', { name: "Confirm it's you" });
    expect(within(reauth).getByRole('button', { name: 'Continue to sign-in' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'New API token' })).toBeNull();
  });

  it('groups permissions by resource and selects none by default', async () => {
    const api = stubApi();
    const user = userEvent.setup();
    await renderApp('/settings/api-tokens');
    await user.click(await screen.findByRole('button', { name: 'Create token' }));
    const dialog = await screen.findByRole('dialog', { name: 'New API token' });

    const accounts = within(dialog).getByRole('group', { name: 'Accounts' });
    expect(within(accounts).getAllByRole('checkbox')).toHaveLength(4);
    const boxes = within(dialog).getAllByRole('checkbox');
    expect(boxes).toHaveLength(11);
    expect(boxes.every((box) => !(box as HTMLInputElement).checked)).toBe(true);

    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Scripts');
    await user.click(within(dialog).getByRole('button', { name: 'Create token' }));
    expect(await within(dialog).findByText('Choose at least one permission.')).toBeTruthy();
    expect(api.calls.some((call) => call.method === 'POST')).toBe(false);
  });
});
