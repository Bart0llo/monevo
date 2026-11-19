import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuthConfigResponse,
  AuthSessionResponse,
  LogoutResponse,
  OidcIntent,
} from '@monevo/contracts';
import { api, API_BASE, isApiError, setCsrfToken } from '../data/api';
import { queryKeys } from '../data/queryKeys';

// Browser side of OIDC sign-in (authentication.md): the server runs the code flow; the web app
// only navigates to /auth/oidc/start and reads the Monevo session.

export async function fetchSession(): Promise<AuthSessionResponse | null> {
  try {
    const session = await api<AuthSessionResponse>('/auth/session');
    setCsrfToken(session.csrfToken);
    return session;
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      setCsrfToken(null);
      return null;
    }
    throw error;
  }
}

/** The current Monevo session, or null when signed out. */
export function useSession() {
  return useQuery({ queryKey: queryKeys.session, queryFn: fetchSession, staleTime: 60_000 });
}

export function useAuthConfig() {
  return useQuery({
    queryKey: queryKeys.authConfig,
    queryFn: () => api<AuthConfigResponse>('/auth/config'),
    staleTime: Infinity,
  });
}

export function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/** Only same-origin paths are kept; the server validates `returnTo` again. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return '/';
  }
  return value;
}

export function oidcStartUrl(intent: OidcIntent, returnTo: string, locale: string): string {
  const params = new URLSearchParams({ intent, returnTo: safeReturnTo(returnTo), locale });
  const timeZone = browserTimeZone();
  if (timeZone) params.set('timeZone', timeZone);
  return `${API_BASE}/auth/oidc/start?${params.toString()}`;
}

/** Full-page navigation to the identity provider. */
export function startSignIn(intent: OidcIntent, returnTo: string, locale: string): void {
  window.location.assign(oidcStartUrl(intent, returnTo, locale));
}

/** Ends the Monevo session, then the IdP session when the IdP supports RP-initiated logout. */
export function useLogout(onSignedOut: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<LogoutResponse>('/auth/logout', { method: 'POST' }),
    onSettled: (data) => {
      setCsrfToken(null);
      queryClient.clear();
      queryClient.setQueryData(queryKeys.session, null);
      if (data?.endSessionUrl) window.location.assign(data.endSessionUrl);
      else onSignedOut();
    },
  });
}
