import { afterEach, describe, expect, it, vi } from 'vitest';
import { CSRF_TOKEN, ok, problem, stubApi } from '../test/api';
import { ApiError, api, isApiError, setCsrfToken } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
  setCsrfToken(null);
});

describe('api client', () => {
  it('sends the CSRF token on unsafe requests only', async () => {
    const stub = stubApi({ routes: { 'POST /things': () => ok({ id: 1 }, 201) } });
    setCsrfToken(CSRF_TOKEN);
    await api('/me');
    await expect(api('/things', { method: 'POST', body: { a: 1 } })).resolves.toEqual({ id: 1 });
    const [get, post] = stub.calls;
    expect(get?.headers['X-CSRF-Token']).toBeUndefined();
    expect(post?.headers['X-CSRF-Token']).toBe(CSRF_TOKEN);
    expect(post?.headers['Content-Type']).toBe('application/json');
    expect(post?.body).toEqual({ a: 1 });
    expect(stub.fetch).toHaveBeenCalledWith(
      '/api/v1/things',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('maps problem+json responses to ApiError with the stable code', async () => {
    stubApi({ routes: { 'DELETE /things/1': () => problem('NOT_FOUND', 'Not found') } });
    const error: unknown = await api('/things/1', { method: 'DELETE' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(isApiError(error, 'NOT_FOUND')).toBe(true);
    expect(isApiError(error, 'REAUTH_REQUIRED')).toBe(false);
    if (!isApiError(error)) throw new Error('expected an ApiError');
    expect(error.status).toBe(404);
    expect(error.message).toBe('Not found');
  });

  it('returns undefined for 204 responses', async () => {
    stubApi({ routes: { 'DELETE /things/1': () => ({ status: 204 }) } });
    await expect(api('/things/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});
