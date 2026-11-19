import {
  Alert,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Select,
  Text,
  TextInput,
  Title,
  useMantineColorScheme,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DATE_FORMATS,
  type DateFormat,
  type Locale,
  LOCALES,
  type Profile,
  type Theme,
  THEMES,
  type UserSettings,
  WEEK_STARTS,
  type WeekStart,
} from '@monevo/contracts';
import { THEME_TO_SCHEME } from '../../app/preferences';
import { useErrorMessage, useFieldErrors } from '../../data/errors';
import { useCurrencyName } from '../../data/money';
import { useChangeBaseCurrency, useCurrencies } from '../../data/reference';
import { useProfile, useSettings, useUpdateProfile, useUpdateSettings } from '../../data/settings';
import { timeZoneOptions } from './options';

/** Profile (display name) and preferences (language, time zone, week, dates, theme). */
export function ProfileSettings() {
  const { t } = useTranslation();
  const profile = useProfile();
  const settings = useSettings();
  if (!profile.data || !settings.data) {
    return (
      <Center py="xl">
        <Loader size="sm" aria-label={t('auth.loading')} />
      </Center>
    );
  }
  return (
    <>
      <ProfileSection profile={profile.data} />
      <PreferencesSection key={settings.data.version} settings={settings.data} />
      <BaseCurrencySection key={`base-${String(settings.data.version)}`} settings={settings.data} />
    </>
  );
}

/**
 * Base currency change (multi-currency.md#9-base-currency-change). Stage 3 only switches the
 * setting; there are no stored base amounts to recalculate yet.
 */
function BaseCurrencySection({ settings }: { readonly settings: UserSettings }) {
  const { t } = useTranslation();
  const currencies = useCurrencies();
  const currencyName = useCurrencyName();
  const change = useChangeBaseCurrency();
  const errorMessage = useErrorMessage();
  const fieldErrors = useFieldErrors();
  const [selected, setSelected] = useState(settings.baseCurrency);
  const [confirming, setConfirming] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const options = (currencies.data ?? [])
    .filter((currency) => currency.active || currency.code === settings.baseCurrency)
    .map((currency) => ({
      value: currency.code,
      label: `${currency.code} · ${currencyName(currency)}`,
    }));

  const confirm = () =>
    change.mutate(
      { baseCurrency: selected, version: settings.version },
      {
        onSuccess: (saved) => {
          setConfirming(false);
          notifications.show({
            message: t('settings.baseCurrencyChange.done', { currency: saved.baseCurrency }),
            color: 'teal',
          });
        },
        onError: (error) => {
          setConfirming(false);
          setFieldError(fieldErrors(error).baseCurrency ?? null);
        },
      },
    );

  return (
    <section className="mv-section" aria-labelledby="base-currency-title">
      <Title order={2} size="h4" id="base-currency-title">
        {t('settings.baseCurrencyChange.title')}
      </Title>
      <Text size="sm" c="dimmed">
        {t('settings.baseCurrencyChange.description')}
      </Text>
      <form
        className="mv-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setConfirming(true);
        }}
      >
        <Select
          label={t('settings.baseCurrency')}
          data={options}
          searchable
          allowDeselect={false}
          nothingFoundMessage={t('settings.nothingFound')}
          value={selected}
          error={fieldError}
          onChange={(value) => {
            if (value) setSelected(value);
            setFieldError(null);
          }}
        />
        {change.isError && !fieldError ? (
          <Alert color="red" variant="light" role="alert">
            {errorMessage(change.error)}
          </Alert>
        ) : null}
        <Group>
          <Button type="submit" disabled={selected === settings.baseCurrency}>
            {t('settings.baseCurrencyChange.submit')}
          </Button>
        </Group>
      </form>
      <Modal
        opened={confirming}
        onClose={() => setConfirming(false)}
        title={t('settings.baseCurrencyChange.confirmTitle')}
      >
        <Text size="sm">
          {t('settings.baseCurrencyChange.confirmBody', {
            from: settings.baseCurrency,
            to: selected,
          })}
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setConfirming(false)}>
            {t('actions.cancel')}
          </Button>
          <Button loading={change.isPending} onClick={confirm}>
            {t('settings.baseCurrencyChange.confirm')}
          </Button>
        </Group>
      </Modal>
    </section>
  );
}

function ProfileSection({ profile }: { readonly profile: Profile }) {
  const { t } = useTranslation();
  const update = useUpdateProfile();
  const errorMessage = useErrorMessage();
  const form = useForm({
    initialValues: { displayName: profile.displayName },
    validate: {
      displayName: (value) =>
        value.trim().length === 0
          ? t('validation.required')
          : value.trim().length > 100
            ? t('validation.tooLong', { max: 100 })
            : null,
    },
  });
  const submit = form.onSubmit((values) =>
    update.mutate(
      { displayName: values.displayName.trim() },
      { onSuccess: () => notifications.show({ message: t('settings.saved'), color: 'teal' }) },
    ),
  );

  return (
    <section className="mv-section" aria-labelledby="profile-title">
      <Title order={2} size="h4" id="profile-title">
        {t('settings.profile.title')}
      </Title>
      <form onSubmit={submit} noValidate className="mv-form">
        <TextInput
          label={t('settings.profile.displayName')}
          maxLength={100}
          {...form.getInputProps('displayName')}
        />
        <TextInput
          label={t('settings.profile.email')}
          description={t('settings.profile.emailHint')}
          value={profile.email ?? ''}
          readOnly
        />
        <Text size="sm">{t('settings.profile.role', { role: t(`roles.${profile.role}`) })}</Text>
        {update.isError ? (
          <Alert color="red" variant="light" role="alert">
            {errorMessage(update.error)}
          </Alert>
        ) : null}
        <Group>
          <Button type="submit" loading={update.isPending} disabled={!form.isDirty()}>
            {t('actions.save')}
          </Button>
        </Group>
      </form>
    </section>
  );
}

interface PreferenceValues {
  locale: Locale;
  timeZone: string;
  weekStart: WeekStart;
  dateFormat: DateFormat;
  theme: Theme;
}

function PreferencesSection({ settings }: { readonly settings: UserSettings }) {
  const { t, i18n } = useTranslation();
  const { setColorScheme } = useMantineColorScheme();
  const update = useUpdateSettings();
  const errorMessage = useErrorMessage();
  const fieldErrors = useFieldErrors();
  const zones = useMemo(() => timeZoneOptions(settings.timeZone), [settings.timeZone]);
  const form = useForm<PreferenceValues>({
    initialValues: {
      locale: settings.locale,
      timeZone: settings.timeZone,
      weekStart: settings.weekStart,
      dateFormat: settings.dateFormat,
      theme: settings.theme,
    },
  });
  const submit = form.onSubmit((values) =>
    update.mutate(values, {
      onSuccess: (saved) => {
        void i18n.changeLanguage(saved.locale);
        setColorScheme(THEME_TO_SCHEME[saved.theme]);
        notifications.show({ message: t('settings.saved'), color: 'teal' });
      },
      onError: (error) => form.setErrors(fieldErrors(error)),
    }),
  );

  return (
    <section className="mv-section" aria-labelledby="preferences-title">
      <Title order={2} size="h4" id="preferences-title">
        {t('settings.preferences.title')}
      </Title>
      <form onSubmit={submit} noValidate className="mv-form">
        <Select
          label={t('settings.language')}
          data={LOCALES.map((value) => ({ value, label: t(`language.${value}`) }))}
          allowDeselect={false}
          {...form.getInputProps('locale')}
        />
        <Select
          label={t('settings.timeZone')}
          data={zones}
          searchable
          allowDeselect={false}
          nothingFoundMessage={t('settings.nothingFound')}
          {...form.getInputProps('timeZone')}
        />
        <Select
          label={t('settings.preferences.weekStart')}
          data={WEEK_STARTS.map((value) => ({ value, label: t(`weekdays.${value}`) }))}
          allowDeselect={false}
          {...form.getInputProps('weekStart')}
        />
        <Select
          label={t('settings.preferences.dateFormat')}
          data={DATE_FORMATS.map((value) => ({
            value,
            label: value === 'LOCALE' ? t('settings.preferences.dateFormatLocale') : value,
          }))}
          allowDeselect={false}
          {...form.getInputProps('dateFormat')}
        />
        <Select
          label={t('theme.label')}
          data={THEMES.map((value) => ({
            value,
            label: t(`theme.${THEME_TO_SCHEME[value]}`),
          }))}
          allowDeselect={false}
          {...form.getInputProps('theme')}
        />
        {update.isError ? (
          <Alert color="red" variant="light" role="alert">
            {errorMessage(update.error)}
          </Alert>
        ) : null}
        <Group>
          <Button type="submit" loading={update.isPending} disabled={!form.isDirty()}>
            {t('actions.save')}
          </Button>
        </Group>
      </form>
    </section>
  );
}
