import { Alert, Badge, Button, Center, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { RevokeOthersResponse, SessionListResponse } from '@monevo/contracts';
import { api } from '../../data/api';
import { useErrorMessage } from '../../data/errors';
import { queryKeys } from '../../data/queryKeys';
import { useFormatInstant } from './format';

/** Signed-in devices (authentication.md#device-and-session-management). */
export function SessionsSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const formatInstant = useFormatInstant();
  const errorMessage = useErrorMessage();
  const sessions = useQuery({
    queryKey: queryKeys.sessions,
    queryFn: () => api<SessionListResponse>('/me/sessions'),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
  const revoke = useMutation({
    mutationFn: (id: string) => api<undefined>(`/me/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      notifications.show({ message: t('sessions.revoked'), color: 'teal' });
      return refresh();
    },
  });
  const revokeOthers = useMutation({
    mutationFn: () => api<RevokeOthersResponse>('/me/sessions/revoke-others', { method: 'POST' }),
    onSuccess: ({ revoked }) => {
      notifications.show({
        message: t('sessions.revokedOthers', { count: revoked }),
        color: 'teal',
      });
      return refresh();
    },
  });

  const items = sessions.data?.items ?? [];
  const hasOthers = items.some((item) => !item.current);
  const error = revoke.error ?? revokeOthers.error;

  return (
    <section className="mv-section" aria-labelledby="sessions-title">
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Title order={2} size="h4" id="sessions-title">
            {t('sessions.title')}
          </Title>
          <Text size="sm" c="dimmed">
            {t('sessions.body')}
          </Text>
        </Stack>
        <Button
          variant="default"
          disabled={!hasOthers}
          loading={revokeOthers.isPending}
          onClick={() => revokeOthers.mutate()}
        >
          {t('sessions.revokeOthers')}
        </Button>
      </Group>
      {error ? (
        <Alert color="red" variant="light" role="alert">
          {errorMessage(error)}
        </Alert>
      ) : null}
      {sessions.isPending ? (
        <Center py="md">
          <Loader size="sm" aria-label={t('auth.loading')} />
        </Center>
      ) : sessions.isError ? (
        <Alert color="red" variant="light" role="alert">
          {errorMessage(sessions.error)}
        </Alert>
      ) : (
        <ul className="mv-list" aria-label={t('sessions.title')}>
          {items.map((item) => (
            <li key={item.id} className="mv-list-item">
              <Stack gap={2}>
                <Group gap="xs">
                  <Text fw={600}>{item.deviceLabel ?? t('sessions.unknownDevice')}</Text>
                  {item.current ? (
                    <Badge variant="light" size="sm">
                      {t('sessions.current')}
                    </Badge>
                  ) : null}
                </Group>
                <Text size="sm" c="dimmed">
                  {t('sessions.lastSeen', { when: formatInstant(item.lastSeenAt) })}
                  {item.ipLast ? ` · ${item.ipLast}` : ''}
                </Text>
                <Text size="sm" c="dimmed">
                  {t('sessions.signedIn', { when: formatInstant(item.createdAt) })}
                </Text>
              </Stack>
              {item.current ? null : (
                <Button
                  variant="subtle"
                  color="red"
                  size="compact-sm"
                  loading={revoke.isPending && revoke.variables === item.id}
                  onClick={() => revoke.mutate(item.id)}
                  aria-label={t('sessions.revokeNamed', {
                    device: item.deviceLabel ?? t('sessions.unknownDevice'),
                  })}
                >
                  {t('sessions.revoke')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
