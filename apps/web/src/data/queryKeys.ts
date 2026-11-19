/** TanStack Query keys for server state. */
export const queryKeys = {
  authConfig: ['auth', 'config'] as const,
  session: ['auth', 'session'] as const,
  profile: ['me', 'profile'] as const,
  settings: ['me', 'settings'] as const,
  sessions: ['me', 'sessions'] as const,
  apiTokens: ['me', 'api-tokens'] as const,
  adminUsers: (q: string) => ['admin', 'users', q] as const,
  identityProvider: ['admin', 'identity-provider'] as const,
  adminSettings: ['admin', 'settings'] as const,
  currencies: ['currencies'] as const,
  accounts: ['accounts'] as const,
  categories: ['categories'] as const,
  resolvedRate: (from: string, to: string, date: string) =>
    ['exchange-rates', 'resolve', from, to, date] as const,
};
