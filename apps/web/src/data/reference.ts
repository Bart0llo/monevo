import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Account,
  AccountCreate,
  AccountListResponse,
  AccountUpdate,
  AdminSettings,
  AdminSettingsUpdate,
  Category,
  CategoryCreate,
  CategoryListResponse,
  CategoryUpdate,
  Currency,
  CurrencyListResponse,
  RateProviderId,
  ResolvedRate,
  UserSettings,
} from '@monevo/contracts';
import { api, isApiError } from './api';
import { queryKeys } from './queryKeys';

// Stage 3 reference data: currencies, rates, accounts, categories, base currency and the
// instance rate provider. Writes send the cached version (api-design.md#3-conventions).

export function useCurrencies() {
  return useQuery({
    queryKey: queryKeys.currencies,
    queryFn: async () => (await api<CurrencyListResponse>('/currencies')).items,
    staleTime: Infinity,
  });
}

/** Lookup by code; includes inactive currencies so history stays readable. */
export function useCurrencyMap(): ReadonlyMap<string, Currency> {
  const currencies = useCurrencies();
  return new Map((currencies.data ?? []).map((currency) => [currency.code, currency]));
}

/** `1 from = rate to` on `date`; never an error (multi-currency.md#5-rate-resolution-algorithm). */
export function useResolvedRate(from: string, to: string, date: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.resolvedRate(from, to, date),
    queryFn: () =>
      api<ResolvedRate>('/exchange-rates/resolve', {
        method: 'POST',
        body: { fromCurrency: from, toCurrency: to, date },
      }),
    enabled: enabled && from !== to,
    staleTime: 10 * 60 * 1000,
  });
}

function onConflict(queryClient: ReturnType<typeof useQueryClient>, key: readonly unknown[]) {
  return (error: unknown) => {
    if (isApiError(error, 'VERSION_CONFLICT'))
      void queryClient.invalidateQueries({ queryKey: key });
  };
}

// Accounts

export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts,
    queryFn: async () => (await api<AccountListResponse>('/accounts')).items,
  });
}

export function useAccountMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
  const conflict = onConflict(queryClient, queryKeys.accounts);
  return {
    create: useMutation({
      mutationFn: (body: AccountCreate) => api<Account>('/accounts', { method: 'POST', body }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ account, changes }: { account: Account; changes: AccountUpdate }) =>
        api<Account>(`/accounts/${account.id}`, {
          method: 'PATCH',
          body: { ...changes, version: account.version },
        }),
      onSuccess: refresh,
      onError: conflict,
    }),
    archive: useMutation({
      mutationFn: ({ account, archived }: { account: Account; archived: boolean }) =>
        api<Account>(`/accounts/${account.id}/${archived ? 'archive' : 'unarchive'}`, {
          method: 'POST',
        }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (account: Account) =>
        api<undefined>(`/accounts/${account.id}`, {
          method: 'DELETE',
          headers: { 'If-Match': `"${String(account.version)}"` },
        }),
      onSuccess: refresh,
      onError: conflict,
    }),
  };
}

// Categories

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: async () => (await api<CategoryListResponse>('/categories')).items,
  });
}

export function useCategoryMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.categories });
  const conflict = onConflict(queryClient, queryKeys.categories);
  return {
    create: useMutation({
      mutationFn: (body: CategoryCreate) => api<Category>('/categories', { method: 'POST', body }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ category, changes }: { category: Category; changes: CategoryUpdate }) =>
        api<Category>(`/categories/${category.id}`, {
          method: 'PATCH',
          body: { ...changes, version: category.version },
        }),
      onSuccess: refresh,
      onError: conflict,
    }),
    archive: useMutation({
      mutationFn: ({ category, archived }: { category: Category; archived: boolean }) =>
        api<Category>(`/categories/${category.id}/${archived ? 'archive' : 'unarchive'}`, {
          method: 'POST',
        }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (category: Category) =>
        api<undefined>(`/categories/${category.id}`, {
          method: 'DELETE',
          headers: { 'If-Match': `"${String(category.version)}"` },
        }),
      onSuccess: refresh,
      onError: conflict,
    }),
    reorder: useMutation({
      mutationFn: (ids: string[]) =>
        api<CategoryListResponse>('/categories/reorder', { method: 'POST', body: { ids } }),
      onSuccess: (list) => queryClient.setQueryData(queryKeys.categories, list.items),
      onError: refresh,
    }),
  };
}

// Base currency (multi-currency.md#9-base-currency-change)

export function useChangeBaseCurrency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ baseCurrency, version }: { baseCurrency: string; version: number }) =>
      api<UserSettings>('/me/base-currency-change', {
        method: 'POST',
        body: { baseCurrency, confirm: true, version },
      }),
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.settings, settings);
      void queryClient.invalidateQueries({ queryKey: ['exchange-rates'] });
    },
    onError: onConflict(queryClient, queryKeys.settings),
  });
}

// Instance settings (administration.md)

export function useAdminSettings() {
  return useQuery({
    queryKey: queryKeys.adminSettings,
    queryFn: () => api<AdminSettings>('/admin/settings'),
  });
}

export function useUpdateRateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: RateProviderId) =>
      api<AdminSettings>('/admin/settings', {
        method: 'PATCH',
        body: { rates: { provider } } satisfies AdminSettingsUpdate,
      }),
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.adminSettings, settings);
      void queryClient.invalidateQueries({ queryKey: ['exchange-rates'] });
    },
  });
}
