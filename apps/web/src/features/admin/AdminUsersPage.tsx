import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Menu,
  Modal,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconDots, IconSearch } from '@tabler/icons-react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AdminUser,
  AdminUserPage,
  IdentityProviderStatus,
  UserStatus,
} from '@monevo/contracts';
import { ReauthModal } from '../../auth/ReauthModal';
import { useSession } from '../../auth/session';
import { PageHeader } from '../../components/PageHeader';
import { api, isApiError } from '../../data/api';
import { useErrorMessage } from '../../data/errors';
import { queryKeys } from '../../data/queryKeys';
import { useFormatInstant } from '../settings/format';

// User administration (administration.md): operational data only, never financial data.

type Action = 'promote' | 'demote' | 'deactivate' | 'activate';
type StatusFilter = 'ALL' | UserStatus;

export function AdminUsersPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('admin.title')} description={t('sections.admin')} />
      <IdentityProviderCard />
      <UsersSection />
    </>
  );
}

function IdentityProviderCard() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const idp = useQuery({
    queryKey: queryKeys.identityProvider,
    queryFn: () => api<IdentityProviderStatus>('/admin/identity-provider'),
  });
  return (
    <section className="mv-section" aria-labelledby="idp-title">
      <Group justify="space-between">
        <Title order={2} size="h4" id="idp-title">
          {t('admin.idp.title')}
        </Title>
        {idp.data ? (
          <Badge color={idp.data.discovery === 'OK' ? 'teal' : 'red'} variant="light">
            {t(`admin.idp.discovery.${idp.data.discovery}`)}
          </Badge>
        ) : null}
      </Group>
      {idp.isPending ? (
        <Loader size="sm" aria-label={t('auth.loading')} />
      ) : idp.isError ? (
        <Alert color="red" variant="light" role="alert">
          {errorMessage(idp.error)}
        </Alert>
      ) : (
        <dl className="mv-facts">
          <dt>{t('admin.idp.provider')}</dt>
          <dd>{idp.data.providerName}</dd>
          <dt>{t('admin.idp.issuer')}</dt>
          <dd className="mv-secret">{idp.data.issuer}</dd>
          <dt>{t('admin.idp.clientId')}</dt>
          <dd className="mv-secret">{idp.data.clientId}</dd>
          <dt>{t('admin.idp.clientType')}</dt>
          <dd>{t(`admin.idp.clientTypes.${idp.data.clientType}`)}</dd>
          <dt>{t('admin.idp.scopes')}</dt>
          <dd className="mv-secret">{idp.data.scopes.join(' ')}</dd>
          <dt>{t('admin.idp.adminGroup')}</dt>
          <dd>{idp.data.adminGroup ?? t('admin.idp.adminGroupUnset')}</dd>
          <dt>{t('admin.idp.endSession')}</dt>
          <dd>
            {idp.data.endSessionSupported === null
              ? '—'
              : idp.data.endSessionSupported
                ? t('admin.idp.yes')
                : t('admin.idp.no')}
          </dd>
        </dl>
      )}
    </section>
  );
}

function UsersSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const formatInstant = useFormatInstant();
  const errorMessage = useErrorMessage();
  const session = useSession();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [q] = useDebouncedValue(search.trim(), 300);
  const [pending, setPending] = useState<{ user: AdminUser; action: Action } | null>(null);
  const [reauth, setReauth] = useState(false);
  const idp = useQuery({
    queryKey: queryKeys.identityProvider,
    queryFn: () => api<IdentityProviderStatus>('/admin/identity-provider'),
  });
  const rolesManaged = Boolean(idp.data?.adminGroup);

  const users = useInfiniteQuery({
    queryKey: [...queryKeys.adminUsers(q), status],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (status !== 'ALL') params.set('status', status);
      if (pageParam) params.set('cursor', pageParam);
      return api<AdminUserPage>(`/admin/users?${params.toString()}`, { signal });
    },
    getNextPageParam: (page) => page.nextCursor,
  });

  const act = useMutation({
    mutationFn: ({ user, action }: { user: AdminUser; action: Action }) =>
      action === 'promote' || action === 'demote'
        ? api<AdminUser>(`/admin/users/${user.id}`, {
            method: 'PATCH',
            body: { role: action === 'promote' ? 'ADMIN' : 'USER' },
          })
        : api<AdminUser>(`/admin/users/${user.id}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      setPending(null);
      notifications.show({ message: t('admin.users.updated'), color: 'teal' });
      return queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error) => {
      if (isApiError(error, 'REAUTH_REQUIRED')) {
        setPending(null);
        setReauth(true);
      }
    },
  });

  const items = users.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section className="mv-section" aria-labelledby="users-title">
      <Title order={2} size="h4" id="users-title">
        {t('admin.users.title')}
      </Title>
      {rolesManaged ? (
        <Text size="sm" c="dimmed">
          {t('admin.users.rolesManaged', { group: idp.data?.adminGroup })}
        </Text>
      ) : null}
      <Group gap="sm" align="flex-end">
        <TextInput
          label={t('admin.users.search')}
          leftSection={<IconSearch size={16} aria-hidden="true" />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          maw={320}
        />
        <SegmentedControl
          aria-label={t('admin.users.statusFilter')}
          value={status}
          onChange={(value) => setStatus(value as StatusFilter)}
          data={[
            { value: 'ALL', label: t('admin.users.all') },
            { value: 'ACTIVE', label: t('admin.users.status.ACTIVE') },
            { value: 'DEACTIVATED', label: t('admin.users.status.DEACTIVATED') },
          ]}
        />
      </Group>
      {users.isPending ? (
        <Center py="md">
          <Loader size="sm" aria-label={t('auth.loading')} />
        </Center>
      ) : users.isError ? (
        <Alert color="red" variant="light" role="alert">
          {errorMessage(users.error)}
        </Alert>
      ) : items.length === 0 ? (
        <Text c="dimmed">{t('admin.users.empty')}</Text>
      ) : (
        <Table.ScrollContainer minWidth={640}>
          <Table verticalSpacing="sm" aria-labelledby="users-title">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('admin.users.user')}</Table.Th>
                <Table.Th>{t('admin.users.role')}</Table.Th>
                <Table.Th>{t('admin.users.statusLabel')}</Table.Th>
                <Table.Th>{t('admin.users.lastLogin')}</Table.Th>
                <Table.Th>{t('admin.users.sessions')}</Table.Th>
                <Table.Th>
                  <VisuallyHidden>{t('admin.users.actions')}</VisuallyHidden>
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((user) => (
                <Table.Tr key={user.id}>
                  <Table.Td>
                    <Stack gap={0}>
                      <Text fw={600}>
                        {user.displayName}
                        {user.id === session.data?.user.id ? ` (${t('admin.users.you')})` : ''}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {user.email ?? '—'}
                      </Text>
                    </Stack>
                  </Table.Td>
                  <Table.Td>{t(`roles.${user.role}`)}</Table.Td>
                  <Table.Td>
                    <Badge
                      variant="light"
                      color={user.status === 'ACTIVE' ? 'teal' : 'gray'}
                      size="sm"
                    >
                      {t(`admin.users.status.${user.status}`)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{formatInstant(user.lastLoginAt)}</Table.Td>
                  <Table.Td>{user.activeSessionCount}</Table.Td>
                  <Table.Td>
                    <UserActions
                      user={user}
                      rolesManaged={rolesManaged}
                      onAction={(action) => setPending({ user, action })}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      {users.hasNextPage ? (
        <Group>
          <Button
            variant="default"
            loading={users.isFetchingNextPage}
            onClick={() => void users.fetchNextPage()}
          >
            {t('admin.users.loadMore')}
          </Button>
        </Group>
      ) : null}

      <Modal
        opened={pending !== null}
        onClose={() => {
          setPending(null);
          act.reset();
        }}
        title={pending ? t(`admin.users.confirm.${pending.action}.title`) : ''}
        centered
      >
        <Text mb="lg">
          {pending
            ? t(`admin.users.confirm.${pending.action}.body`, { name: pending.user.displayName })
            : ''}
        </Text>
        {act.isError && !isApiError(act.error, 'REAUTH_REQUIRED') ? (
          <Alert color="red" variant="light" role="alert" mb="md">
            {errorMessage(act.error)}
          </Alert>
        ) : null}
        <Group justify="flex-end" gap="sm">
          <Button
            variant="default"
            onClick={() => {
              setPending(null);
              act.reset();
            }}
          >
            {t('actions.cancel')}
          </Button>
          <Button
            color={pending?.action === 'deactivate' ? 'red' : 'blue'}
            loading={act.isPending}
            onClick={() => pending && act.mutate(pending)}
          >
            {pending ? t(`admin.users.actionLabels.${pending.action}`) : ''}
          </Button>
        </Group>
      </Modal>
      <ReauthModal opened={reauth} onClose={() => setReauth(false)} />
    </section>
  );
}

function UserActions({
  user,
  rolesManaged,
  onAction,
}: {
  readonly user: AdminUser;
  readonly rolesManaged: boolean;
  readonly onAction: (action: Action) => void;
}) {
  const { t } = useTranslation();
  const actions: Action[] = [];
  if (!rolesManaged) actions.push(user.role === 'ADMIN' ? 'demote' : 'promote');
  actions.push(user.status === 'ACTIVE' ? 'deactivate' : 'activate');
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          aria-label={t('admin.users.actionsFor', { name: user.displayName })}
        >
          <IconDots size={18} aria-hidden="true" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {actions.map((action) => (
          <Menu.Item
            key={action}
            {...(action === 'deactivate' ? { color: 'red' } : {})}
            onClick={() => onAction(action)}
          >
            {t(`admin.users.actionLabels.${action}`)}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
