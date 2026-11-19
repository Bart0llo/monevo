import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Profile, ProfileUpdate, UserSettings, UserSettingsUpdate } from '@monevo/contracts';
import { api, isApiError } from './api';
import { queryKeys } from './queryKeys';

export function useProfile() {
  return useQuery({ queryKey: queryKeys.profile, queryFn: () => api<Profile>('/me') });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (update: ProfileUpdate) => api<Profile>('/me', { method: 'PATCH', body: update }),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.profile, profile);
      void queryClient.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
}

export function useSettings(enabled = true) {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => api<UserSettings>('/me/settings'),
    enabled,
  });
}

/** PATCH /me/settings with the cached version (api-design.md optimistic concurrency). */
export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (update: Omit<UserSettingsUpdate, 'version'>) => {
      const current =
        queryClient.getQueryData<UserSettings>(queryKeys.settings) ??
        (await queryClient.fetchQuery<UserSettings>({
          queryKey: queryKeys.settings,
          queryFn: () => api<UserSettings>('/me/settings'),
        }));
      return api<UserSettings>('/me/settings', {
        method: 'PATCH',
        body: { ...update, version: current.version },
      });
    },
    onSuccess: (settings, update) => {
      queryClient.setQueryData(queryKeys.settings, settings);
      if (update.completeOnboarding) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.session });
      }
    },
    onError: (error) => {
      if (isApiError(error, 'VERSION_CONFLICT')) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.settings });
      }
    },
  });
}
