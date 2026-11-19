import { Alert, Button, Center, Loader, Select, Text, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDocumentTitle } from '@mantine/hooks';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { type Locale, LOCALES, type UserSettings } from '@monevo/contracts';
import { toCurrencyCode } from '@monevo/domain';
import { Wordmark } from '../../app/Wordmark';
import { useErrorMessage, useFieldErrors } from '../../data/errors';
import { useSettings, useUpdateSettings } from '../../data/settings';
import { currencyOptions, timeZoneOptions } from '../settings/options';
import '../auth/auth.css';

interface Values {
  locale: Locale;
  timeZone: string;
  baseCurrency: string;
}

/**
 * First-run setup (requirements.md, Stage 2): language, time zone and base currency. The base
 * currency is locked once onboarding completes.
 */
export function OnboardingPage() {
  const { t } = useTranslation();
  useDocumentTitle(`${t('onboarding.title')} · ${t('app.name')}`);
  const settings = useSettings();

  return (
    <div className="mv-auth-page">
      <header className="mv-auth-top">
        <Wordmark />
      </header>
      <main className="mv-auth-main">
        <section className="mv-auth-card" data-wide aria-labelledby="onboarding-title">
          <Title order={1} id="onboarding-title">
            {t('onboarding.title')}
          </Title>
          <Text c="dimmed">{t('onboarding.body')}</Text>
          {settings.data ? (
            <OnboardingForm settings={settings.data} />
          ) : (
            <Center>
              <Loader size="sm" aria-label={t('auth.loading')} />
            </Center>
          )}
        </section>
      </main>
    </div>
  );
}

function OnboardingForm({ settings }: { readonly settings: UserSettings }) {
  const { t, i18n } = useTranslation();
  const update = useUpdateSettings();
  const errorMessage = useErrorMessage();
  const fieldErrors = useFieldErrors();
  const zones = useMemo(() => timeZoneOptions(settings.timeZone), [settings.timeZone]);
  const currencies = useMemo(() => currencyOptions(), []);
  const form = useForm<Values>({
    initialValues: {
      locale: settings.locale,
      timeZone: settings.timeZone,
      baseCurrency: settings.baseCurrency,
    },
    validate: {
      timeZone: (value) => (value ? null : t('validation.required')),
      baseCurrency: (value) => (value ? null : t('validation.required')),
    },
  });

  const submit = form.onSubmit((values) => {
    update.mutate(
      { ...values, baseCurrency: toCurrencyCode(values.baseCurrency), completeOnboarding: true },
      {
        onSuccess: () => void i18n.changeLanguage(values.locale),
        onError: (error) => form.setErrors(fieldErrors(error)),
      },
    );
  });

  return (
    <form onSubmit={submit} noValidate className="mv-form">
      <Select
        label={t('settings.language')}
        data={LOCALES.map((value) => ({ value, label: t(`language.${value}`) }))}
        allowDeselect={false}
        {...form.getInputProps('locale')}
        onChange={(value) => {
          if (!value) return;
          form.setFieldValue('locale', value as Locale);
          void i18n.changeLanguage(value);
        }}
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
        label={t('settings.baseCurrency')}
        description={t('onboarding.baseCurrencyHint')}
        data={currencies}
        searchable
        allowDeselect={false}
        nothingFoundMessage={t('settings.nothingFound')}
        {...form.getInputProps('baseCurrency')}
      />
      {update.isError && !Object.keys(fieldErrors(update.error)).length ? (
        <Alert color="red" variant="light" role="alert">
          {errorMessage(update.error)}
        </Alert>
      ) : null}
      <Button type="submit" loading={update.isPending}>
        {t('onboarding.submit')}
      </Button>
    </form>
  );
}
