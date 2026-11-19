import {
  Alert,
  Badge,
  Button,
  Center,
  Checkbox,
  CopyButton,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconCopy, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  API_TOKEN_PERMISSION_REQUIRES,
  API_TOKEN_PERMISSIONS,
  type ApiToken,
  type ApiTokenCreate,
  type ApiTokenCreatedResponse,
  type ApiTokenListResponse,
  type ApiTokenPermission,
} from '@monevo/contracts';
import { ReauthModal } from '../../auth/ReauthModal';
import { api, isApiError } from '../../data/api';
import { clock } from '../../data/clock';
import { useErrorMessage, useFieldErrors } from '../../data/errors';
import { queryKeys } from '../../data/queryKeys';
import { useFormatInstant } from './format';

// Personal API tokens (api-tokens.md#6-user-interface).

const PERMISSION_LABELS = {
  'profile:read': 'apiTokens.permissions.profileRead',
  'currencies:read': 'apiTokens.permissions.currenciesRead',
  'exchange-rates:create': 'apiTokens.permissions.exchangeRatesCreate',
  'accounts:read': 'apiTokens.permissions.accountsRead',
  'accounts:create': 'apiTokens.permissions.accountsCreate',
  'accounts:update': 'apiTokens.permissions.accountsUpdate',
  'accounts:delete': 'apiTokens.permissions.accountsDelete',
  'categories:read': 'apiTokens.permissions.categoriesRead',
  'categories:create': 'apiTokens.permissions.categoriesCreate',
  'categories:update': 'apiTokens.permissions.categoriesUpdate',
  'categories:delete': 'apiTokens.permissions.categoriesDelete',
} as const satisfies Record<ApiTokenPermission, `apiTokens.permissions.${string}`>;

type Resource = ApiTokenPermission extends `${infer R}:${string}` ? R : never;

const RESOURCE_LABELS = {
  profile: 'apiTokens.resources.profile',
  currencies: 'apiTokens.resources.currencies',
  'exchange-rates': 'apiTokens.resources.exchangeRates',
  accounts: 'apiTokens.resources.accounts',
  categories: 'apiTokens.resources.categories',
} as const satisfies Record<Resource, `apiTokens.resources.${string}`>;

/** The catalogue grouped by resource, in catalogue order (api-tokens.md#6-user-interface). */
const PERMISSION_GROUPS: readonly (readonly [Resource, ApiTokenPermission[]])[] = (() => {
  const groups = new Map<Resource, ApiTokenPermission[]>();
  for (const permission of API_TOKEN_PERMISSIONS) {
    const resource = permission.slice(0, permission.indexOf(':')) as Resource;
    groups.set(resource, [...(groups.get(resource) ?? []), permission]);
  }
  return [...groups];
})();

const EXPIRY_DAYS = ['30', '90', '365', 'never'] as const;
type Expiry = (typeof EXPIRY_DAYS)[number];
const DAY_MS = 86_400_000;

export function ApiTokensSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const formatInstant = useFormatInstant();
  const errorMessage = useErrorMessage();
  const [creating, setCreating] = useState(false);
  const [reauth, setReauth] = useState(false);
  const [toRevoke, setToRevoke] = useState<ApiToken | null>(null);
  const tokens = useQuery({
    queryKey: queryKeys.apiTokens,
    queryFn: () => api<ApiTokenListResponse>('/me/api-tokens'),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api<undefined>(`/me/api-tokens/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setToRevoke(null);
      notifications.show({ message: t('apiTokens.revoked'), color: 'teal' });
      return queryClient.invalidateQueries({ queryKey: queryKeys.apiTokens });
    },
  });

  return (
    <section className="mv-section" aria-labelledby="tokens-title">
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Title order={2} size="h4" id="tokens-title">
            {t('apiTokens.title')}
          </Title>
          <Text size="sm" c="dimmed">
            {t('apiTokens.body')}
          </Text>
        </Stack>
        <Button
          leftSection={<IconPlus size={16} aria-hidden="true" />}
          onClick={() => setCreating(true)}
        >
          {t('apiTokens.create')}
        </Button>
      </Group>
      {tokens.isPending ? (
        <Center py="md">
          <Loader size="sm" aria-label={t('auth.loading')} />
        </Center>
      ) : tokens.isError ? (
        <Alert color="red" variant="light" role="alert">
          {errorMessage(tokens.error)}
        </Alert>
      ) : tokens.data.items.length === 0 ? (
        <Text c="dimmed">{t('apiTokens.empty')}</Text>
      ) : (
        <ul className="mv-list" aria-label={t('apiTokens.title')}>
          {tokens.data.items.map((token) => (
            <li key={token.id} className="mv-list-item">
              <Stack gap={2}>
                <Group gap="xs">
                  <Text fw={600}>{token.name}</Text>
                  <Badge
                    variant="light"
                    size="sm"
                    color={token.status === 'ACTIVE' ? 'teal' : 'gray'}
                  >
                    {t(`apiTokens.status.${token.status}`)}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed" className="mv-secret">
                  {`${token.displayPrefix}…`}
                </Text>
                <Text size="sm" c="dimmed">
                  {token.permissions.map((p) => t(PERMISSION_LABELS[p])).join(', ')}
                </Text>
                <Text size="sm" c="dimmed">
                  {t('apiTokens.meta', {
                    created: formatInstant(token.createdAt),
                    expires: token.expiresAt
                      ? formatInstant(token.expiresAt)
                      : t('apiTokens.noExpiry'),
                    used: token.lastUsedAt
                      ? formatInstant(token.lastUsedAt)
                      : t('apiTokens.neverUsed'),
                  })}
                </Text>
              </Stack>
              {token.status === 'ACTIVE' ? (
                <Button
                  variant="subtle"
                  color="red"
                  size="compact-sm"
                  onClick={() => setToRevoke(token)}
                  aria-label={t('apiTokens.revokeNamed', { name: token.name })}
                >
                  {t('apiTokens.revoke')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <CreateTokenModal
        opened={creating}
        onClose={() => setCreating(false)}
        onReauth={() => {
          setCreating(false);
          setReauth(true);
        }}
      />
      <ReauthModal opened={reauth} onClose={() => setReauth(false)} />
      <Modal
        opened={toRevoke !== null}
        onClose={() => setToRevoke(null)}
        title={t('apiTokens.revokeTitle')}
        centered
      >
        <Text mb="lg">{t('apiTokens.revokeBody', { name: toRevoke?.name ?? '' })}</Text>
        {revoke.isError ? (
          <Alert color="red" variant="light" role="alert" mb="md">
            {errorMessage(revoke.error)}
          </Alert>
        ) : null}
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={() => setToRevoke(null)}>
            {t('actions.cancel')}
          </Button>
          <Button
            color="red"
            loading={revoke.isPending}
            onClick={() => toRevoke && revoke.mutate(toRevoke.id)}
          >
            {t('apiTokens.revoke')}
          </Button>
        </Group>
      </Modal>
    </section>
  );
}

interface CreateValues {
  name: string;
  permissions: ApiTokenPermission[];
  expiry: Expiry;
}

function CreateTokenModal({
  opened,
  onClose,
  onReauth,
}: {
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly onReauth: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const fieldErrors = useFieldErrors();
  const [secret, setSecret] = useState<string | null>(null);
  const form = useForm<CreateValues>({
    initialValues: { name: '', permissions: [], expiry: '90' },
    validate: {
      name: (value) => (value.trim() ? null : t('validation.required')),
      permissions: (value) => (value.length ? null : t('apiTokens.permissionsRequired')),
    },
  });
  const create = useMutation({
    mutationFn: (body: ApiTokenCreate) =>
      api<ApiTokenCreatedResponse>('/me/api-tokens', { method: 'POST', body }),
    onSuccess: (created) => {
      setSecret(created.secret);
      return queryClient.invalidateQueries({ queryKey: queryKeys.apiTokens });
    },
    onError: (error) => {
      if (isApiError(error, 'REAUTH_REQUIRED')) onReauth();
      else form.setErrors(fieldErrors(error));
    },
  });
  const close = () => {
    setSecret(null);
    form.reset();
    create.reset();
    onClose();
  };
  const submit = form.onSubmit((values) =>
    create.mutate({
      name: values.name.trim(),
      permissions: values.permissions,
      expiresAt:
        values.expiry === 'never'
          ? null
          : new Date(clock.now().getTime() + Number(values.expiry) * DAY_MS).toISOString(),
    }),
  );

  return (
    <Modal
      opened={opened}
      onClose={close}
      title={secret ? t('apiTokens.createdTitle') : t('apiTokens.createTitle')}
      centered
    >
      {secret ? (
        <Stack>
          <Alert color="yellow" variant="light">
            {t('apiTokens.secretOnce')}
          </Alert>
          <Text className="mv-secret" data-testid="api-token-secret">
            {secret}
          </Text>
          <Group justify="flex-end" gap="sm">
            <CopyButton value={secret}>
              {({ copied, copy }) => (
                <Button
                  variant="light"
                  onClick={copy}
                  leftSection={
                    copied ? (
                      <IconCheck size={16} aria-hidden="true" />
                    ) : (
                      <IconCopy size={16} aria-hidden="true" />
                    )
                  }
                >
                  {copied ? t('actions.copied') : t('actions.copy')}
                </Button>
              )}
            </CopyButton>
            <Button onClick={close}>{t('actions.done')}</Button>
          </Group>
        </Stack>
      ) : (
        <form onSubmit={submit} noValidate className="mv-form">
          <TextInput
            label={t('apiTokens.name')}
            placeholder={t('apiTokens.namePlaceholder')}
            maxLength={100}
            data-autofocus
            {...form.getInputProps('name')}
          />
          <Checkbox.Group
            label={t('apiTokens.permissionsLabel')}
            {...form.getInputProps('permissions')}
          >
            <Stack gap="sm" mt="xs">
              {PERMISSION_GROUPS.map(([resource, permissions]) => (
                <Stack key={resource} gap={6} role="group" aria-labelledby={`perm-${resource}`}>
                  <Text size="sm" fw={600} id={`perm-${resource}`}>
                    {t(RESOURCE_LABELS[resource])}
                  </Text>
                  {permissions.map((permission) => {
                    const requires = API_TOKEN_PERMISSION_REQUIRES[permission];
                    return (
                      <Checkbox
                        key={permission}
                        value={permission}
                        label={t(PERMISSION_LABELS[permission])}
                        description={
                          requires.length > 0
                            ? t('apiTokens.alsoRequires', {
                                permissions: requires
                                  .map((required) => t(PERMISSION_LABELS[required]))
                                  .join(', '),
                              })
                            : undefined
                        }
                      />
                    );
                  })}
                </Stack>
              ))}
            </Stack>
          </Checkbox.Group>
          <Select
            label={t('apiTokens.expiry')}
            data={EXPIRY_DAYS.map((value) => ({
              value,
              label:
                value === 'never'
                  ? t('apiTokens.noExpiry')
                  : t('apiTokens.expiryDays', { count: Number(value) }),
            }))}
            allowDeselect={false}
            {...form.getInputProps('expiry')}
          />
          {create.isError && !isApiError(create.error, 'REAUTH_REQUIRED') ? (
            <Alert color="red" variant="light" role="alert">
              {errorMessage(create.error)}
            </Alert>
          ) : null}
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={close}>
              {t('actions.cancel')}
            </Button>
            <Button type="submit" loading={create.isPending}>
              {t('apiTokens.create')}
            </Button>
          </Group>
        </form>
      )}
    </Modal>
  );
}
