import {
  Alert,
  Button,
  Center,
  Group,
  Loader,
  Select,
  Text,
  TextInput,
  Title,
  useMantineColorScheme,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMemo } from 'react';
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
    </>
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
        <TextInput
          label={t('settings.baseCurrency')}
          description={t('settings.preferences.baseCurrencyLocked')}
          value={settings.baseCurrency}
          readOnly
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
