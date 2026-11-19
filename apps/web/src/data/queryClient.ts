import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';
import { queryKeys } from './queryKeys';

/**
 * Server-state cache (frontend-architecture.md). Client errors (4xx) are not retried. A 401 from
 * any request other than the session check means the session ended: the session query is
 * refetched, and the route guard sends the user to the sign-in page.
 */
export function createQueryClient(): QueryClient {
  const onError = (error: Error, key?: readonly unknown[]) => {
    if (error instanceof ApiError && error.status === 401 && key?.[1] !== 'session') {
      void client.invalidateQueries({ queryKey: queryKeys.session });
    }
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => onError(error, query.queryKey) }),
    mutationCache: new MutationCache({ onError: (error) => onError(error) }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status < 500) && failureCount < 2,
      },
      mutations: { retry: false },
    },
  });
  return client;
}
