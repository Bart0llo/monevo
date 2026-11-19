import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Center,
  Checkbox,
  Group,
  Loader,
  Menu,
  Modal,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconDots, IconPlus } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ACCOUNT_KINDS,
  type Account,
  type AccountKind,
  type IconKey,
  type UserSettings,
} from '@monevo/contracts';
import { toCurrencyCode } from '@monevo/domain';
import { EntityIcon, ColorPicker, IconPicker } from '../../components/EntityIcon';
import { PageHeader } from '../../components/PageHeader';
import { StatePanel } from '../../components/StatePanel';
import { isApiError } from '../../data/api';
import { useErrorMessage, useFieldErrors } from '../../data/errors';
import {
  parseAmountInput,
  todayIn,
  useCurrencyName,
  useFormatLocalDate,
  useFormatMoney,
  useFormatRate,
} from '../../data/money';
import {
  useAccountMutations,
  useAccounts,
  useCurrencies,
  useCurrencyMap,
  useResolvedRate,
} from '../../data/reference';
import { useSettings } from '../../data/settings';

// Accounts (features.md#accounts). Stage 3 has no balances: each account shows its opening
// balance and, for a foreign currency, today's rate to the base currency.

const KIND_ICONS: Record<AccountKind, IconKey> = {
  BANK: 'bank',
  CASH: 'cash',
  SAVINGS: 'piggy-bank',
  CREDIT_CARD: 'credit-card',
  E_WALLET: 'wallet',
  OTHER: 'wallet',
  CUSTOM: 'wallet',
};

export function AccountsPage() {
  const { t } = useTranslation();
  const accounts = useAccounts();
  const settings = useSettings();
  const errorMessage = useErrorMessage();
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = accounts.data?.filter((account) => account.archivedAt === null) ?? [];
  const archived = accounts.data?.filter((account) => account.archivedAt !== null) ?? [];

  return (
    <>
      <PageHeader title={t('nav.accounts')} description={t('accounts.description')} />
      <Group mb="lg">
        <Button
          leftSection={<IconPlus size={16} aria-hidden="true" />}
          onClick={() => setEditing('new')}
        >
          {t('accounts.create')}
        </Button>
      </Group>
      {accounts.isPending || !settings.data ? (
        <Center py="xl">
          <Loader size="sm" aria-label={t('auth.loading')} />
        </Center>
      ) : accounts.isError ? (
        <Alert color="red" variant="light" role="alert">
          {errorMessage(accounts.error)}
        </Alert>
      ) : active.length === 0 && archived.length === 0 ? (
        <StatePanel>
          <Title order={2} size="h4">
            {t('accounts.emptyTitle')}
          </Title>
          <Text>{t('accounts.emptyBody')}</Text>
        </StatePanel>
      ) : (
        <>
          <section className="mv-section" aria-labelledby="accounts-active">
            <Title order={2} size="h4" id="accounts-active">
              {t('accounts.active')}
            </Title>
            {active.length === 0 ? (
              <Text c="dimmed">{t('accounts.noActive')}</Text>
            ) : (
              <AccountList
                accounts={active}
                settings={settings.data}
                onEdit={setEditing}
                onDelete={setDeleting}
              />
            )}
          </section>
          {archived.length > 0 ? (
            <section className="mv-section" aria-labelledby="accounts-archived">
              <Group justify="space-between">
                <Title order={2} size="h4" id="accounts-archived">
                  {t('accounts.archived', { count: archived.length })}
                </Title>
                <Switch
                  label={t('accounts.showArchived')}
                  checked={showArchived}
                  onChange={(event) => setShowArchived(event.currentTarget.checked)}
                />
              </Group>
              {showArchived ? (
                <AccountList
                  accounts={archived}
                  settings={settings.data}
                  onEdit={setEditing}
                  onDelete={setDeleting}
                />
              ) : null}
            </section>
          ) : null}
        </>
      )}
      {editing !== null && settings.data ? (
        <AccountFormModal
          account={editing === 'new' ? null : editing}
          settings={settings.data}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <DeleteAccountModal account={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}

function AccountList({
  accounts,
  settings,
  onEdit,
  onDelete,
}: {
  readonly accounts: readonly Account[];
  readonly settings: UserSettings;
  readonly onEdit: (account: Account) => void;
  readonly onDelete: (account: Account) => void;
}) {
  return (
    <ul className="mv-list">
      {accounts.map((account) => (
        <AccountRow
          key={account.id}
          account={account}
          settings={settings}
          onEdit={() => onEdit(account)}
          onDelete={() => onDelete(account)}
        />
      ))}
    </ul>
  );
}

function AccountRow({
  account,
  settings,
  onEdit,
  onDelete,
}: {
  readonly account: Account;
  readonly settings: UserSettings;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const formatDate = useFormatLocalDate();
  const currencies = useCurrencyMap();
  const { archive } = useAccountMutations();
  const errorMessage = useErrorMessage();
  const exponent = currencies.get(account.currency)?.exponent;
  const kindLabel =
    account.kind === 'CUSTOM' && account.customKindLabel
      ? account.customKindLabel
      : t(`accounts.kinds.${account.kind}`);
  const toggleArchive = () =>
    archive.mutate(
      { account, archived: account.archivedAt === null },
      {
        onSuccess: (saved) =>
          notifications.show({
            message: t(saved.archivedAt ? 'accounts.archivedDone' : 'accounts.restoredDone'),
            color: 'teal',
          }),
        onError: (error) => notifications.show({ message: errorMessage(error), color: 'red' }),
      },
    );

  return (
    <li className="mv-list-item">
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <EntityIcon icon={account.icon} color={account.color} />
        <Stack gap={2}>
          <Group gap="xs">
            <Text fw={600}>{account.name}</Text>
            <Badge variant="default" size="sm">
              {account.currency}
            </Badge>
            {account.includeInNetWorthWidget ? null : (
              <Badge variant="light" color="gray" size="sm">
                {t('accounts.excludedFromNetWorth')}
              </Badge>
            )}
          </Group>
          <Text size="sm" c="dimmed">
            {kindLabel}
          </Text>
          <Text size="sm" className="mv-figures">
            {t('accounts.openingLine', {
              amount: formatMoney(account.openingBalance, account.currency, exponent),
              date: formatDate(account.openingDate),
            })}
          </Text>
          {account.currency === settings.baseCurrency ? null : (
            <RateLine
              from={account.currency}
              to={settings.baseCurrency}
              timeZone={settings.timeZone}
            />
          )}
        </Stack>
      </Group>
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon
            variant="subtle"
            aria-label={t('accounts.actionsFor', { name: account.name })}
          >
            <IconDots size={18} aria-hidden="true" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={onEdit}>{t('actions.edit')}</Menu.Item>
          <Menu.Item onClick={toggleArchive}>
            {t(account.archivedAt === null ? 'actions.archive' : 'actions.restore')}
          </Menu.Item>
          <Menu.Item color="red" onClick={onDelete}>
            {t('actions.delete')}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </li>
  );
}

/** "1 EUR = 4.2650 PLN · Frankfurter · 19 Nov 2026" (multi-currency.md). */
export function RateLine({
  from,
  to,
  timeZone,
}: {
  readonly from: string;
  readonly to: string;
  readonly timeZone: string;
}) {
  const { t } = useTranslation();
  const formatRate = useFormatRate();
  const formatDate = useFormatLocalDate();
  const today = todayIn(timeZone);
  const rate = useResolvedRate(from, to, today);
  if (rate.isPending) {
    return (
      <Text size="sm" c="dimmed">
        {t('rates.loading')}
      </Text>
    );
  }
  if (rate.isError || rate.data.status === 'MISSING' || rate.data.rate === null) {
    return (
      <Text size="sm" c="dimmed">
        {t('rates.missing', { from, to })}
      </Text>
    );
  }
  const data = rate.data;
  const source =
    data.source === 'MANUAL'
      ? t('rates.sources.manual')
      : t(`rates.providers.${data.providerId === 'nbp' ? 'nbp' : 'frankfurter'}`);
  return (
    <Text size="sm" c="dimmed" className="mv-figures">
      {t('rates.line', {
        from,
        to,
        rate: formatRate(data.rate ?? '0'),
        source,
        date: formatDate(data.publishedOn ?? data.rateDate ?? today),
      })}
      {data.stale ? ` · ${t('rates.stale')}` : ''}
    </Text>
  );
}

interface AccountValues {
  name: string;
  currency: string;
  kind: AccountKind;
  customKindLabel: string;
  icon: IconKey;
  color: string;
  openingBalance: string;
  openingDate: string;
  includeInNetWorthWidget: boolean;
}

function AccountFormModal({
  account,
  settings,
  onClose,
}: {
  readonly account: Account | null;
  readonly settings: UserSettings;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const currencies = useCurrencies();
  const currencyName = useCurrencyName();
  const { create, update } = useAccountMutations();
  const mutation = account ? update : create;
  const errorMessage = useErrorMessage();
  const fieldErrors = useFieldErrors();
  const form = useForm<AccountValues>({
    initialValues: account
      ? {
          name: account.name,
          currency: account.currency,
          kind: account.kind,
          customKindLabel: account.customKindLabel ?? '',
          icon: account.icon as IconKey,
          color: account.color,
          openingBalance: account.openingBalance,
          openingDate: account.openingDate,
          includeInNetWorthWidget: account.includeInNetWorthWidget,
        }
      : {
          name: '',
          currency: settings.baseCurrency,
          kind: 'BANK',
          customKindLabel: '',
          icon: 'bank',
          color: 'blue',
          openingBalance: '0',
          openingDate: todayIn(settings.timeZone),
          includeInNetWorthWidget: true,
        },
    validate: {
      name: (value) =>
        value.trim().length === 0
          ? t('validation.required')
          : value.trim().length > 100
            ? t('validation.tooLong', { max: 100 })
            : null,
      customKindLabel: (value, values) =>
        values.kind === 'CUSTOM' && value.trim().length === 0
          ? t('validation.required')
          : value.trim().length > 50
            ? t('validation.tooLong', { max: 50 })
            : null,
      openingBalance: (value) => (parseAmountInput(value) === null ? t('validation.amount') : null),
      openingDate: (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? null : t('validation.date')),
    },
  });

  const currencyOptions = useMemo(
    () =>
      (currencies.data ?? [])
        .filter((currency) => currency.active || currency.code === account?.currency)
        .map((currency) => ({
          value: currency.code,
          label: `${currency.code} · ${currencyName(currency)}`,
        })),
    [currencies.data, currencyName, account?.currency],
  );

  const submit = form.onSubmit((values) => {
    const body = {
      name: values.name.trim(),
      currency: toCurrencyCode(values.currency),
      kind: values.kind,
      customKindLabel: values.kind === 'CUSTOM' ? values.customKindLabel.trim() : null,
      icon: values.icon,
      color: values.color,
      openingBalance: parseAmountInput(values.openingBalance) ?? '0',
      openingDate: values.openingDate,
      includeInNetWorthWidget: values.includeInNetWorthWidget,
    };
    const options = {
      onSuccess: () => {
        notifications.show({
          message: t(account ? 'accounts.saved' : 'accounts.created'),
          color: 'teal',
        });
        onClose();
      },
      onError: (error: unknown) => form.setErrors(fieldErrors(error)),
    };
    if (account) update.mutate({ account, changes: body }, options);
    else create.mutate(body, options);
  });

  const showError = mutation.isError && Object.keys(fieldErrors(mutation.error)).length === 0;

  return (
    <Modal
      opened
      onClose={onClose}
      title={t(account ? 'accounts.editTitle' : 'accounts.createTitle')}
      size="lg"
      centered
    >
      <form onSubmit={submit} noValidate className="mv-form">
        <TextInput
          label={t('accounts.fields.name')}
          maxLength={100}
          data-autofocus
          {...form.getInputProps('name')}
        />
        <Select
          label={t('accounts.fields.currency')}
          data={currencyOptions}
          searchable
          allowDeselect={false}
          nothingFoundMessage={t('settings.nothingFound')}
          {...form.getInputProps('currency')}
        />
        <Select
          label={t('accounts.fields.kind')}
          data={ACCOUNT_KINDS.map((kind) => ({ value: kind, label: t(`accounts.kinds.${kind}`) }))}
          allowDeselect={false}
          {...form.getInputProps('kind')}
          onChange={(value) => {
            if (!value) return;
            const kind = value as AccountKind;
            form.setFieldValue('kind', kind);
            if (!account && kind !== 'CUSTOM') form.setFieldValue('icon', KIND_ICONS[kind]);
          }}
        />
        {form.values.kind === 'CUSTOM' ? (
          <TextInput
            label={t('accounts.fields.customKindLabel')}
            maxLength={50}
            {...form.getInputProps('customKindLabel')}
          />
        ) : null}
        <Group grow align="flex-start">
          <TextInput
            label={t('accounts.fields.openingBalance')}
            description={t('accounts.fields.openingBalanceHint')}
            inputMode="decimal"
            className="mv-figures"
            {...form.getInputProps('openingBalance')}
          />
          <TextInput
            type="date"
            label={t('accounts.fields.openingDate')}
            {...form.getInputProps('openingDate')}
          />
        </Group>
        <IconPicker
          label={t('accounts.fields.icon')}
          value={form.values.icon}
          color={form.values.color}
          onChange={(icon) => form.setFieldValue('icon', icon)}
        />
        <ColorPicker
          label={t('accounts.fields.color')}
          value={form.values.color}
          onChange={(color) => form.setFieldValue('color', color)}
        />
        <Checkbox
          label={t('accounts.fields.includeInNetWorth')}
          {...form.getInputProps('includeInNetWorthWidget', { type: 'checkbox' })}
        />
        {showError ? (
          <Alert color="red" variant="light" role="alert">
            {errorMessage(mutation.error)}
            {isApiError(mutation.error, 'VERSION_CONFLICT') ? ` ${t('conflict.reopen')}` : ''}
          </Alert>
        ) : null}
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {t(account ? 'actions.save' : 'accounts.create')}
          </Button>
        </Group>
      </form>
    </Modal>
  );
}

function DeleteAccountModal({
  account,
  onClose,
}: {
  readonly account: Account | null;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const { remove } = useAccountMutations();
  const errorMessage = useErrorMessage();
  const close = () => {
    remove.reset();
    onClose();
  };
  return (
    <Modal opened={account !== null} onClose={close} title={t('accounts.deleteTitle')} centered>
      <Text mb="lg">{account ? t('accounts.deleteBody', { name: account.name }) : ''}</Text>
      {remove.isError ? (
        <Alert color="red" variant="light" role="alert" mb="md">
          {errorMessage(remove.error)}
        </Alert>
      ) : null}
      <Group justify="flex-end" gap="sm">
        <Button variant="default" onClick={close}>
          {t('actions.cancel')}
        </Button>
        <Button
          color="red"
          loading={remove.isPending}
          onClick={() =>
            account &&
            remove.mutate(account, {
              onSuccess: () => {
                notifications.show({ message: t('accounts.deleted'), color: 'teal' });
                close();
              },
            })
          }
        >
          {t('actions.delete')}
        </Button>
      </Group>
    </Modal>
  );
}
