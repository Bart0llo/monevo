import { Alert, Button, Loader, Text, Title } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import { IconAlertCircle, IconLogin2 } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router';
import { LOGIN_ERROR_CODES, type LoginErrorCode } from '@monevo/contracts';
import { ColorSchemeMenu } from '../../app/ColorSchemeMenu';
import { LanguageMenu } from '../../app/LanguageMenu';
import { Wordmark } from '../../app/Wordmark';
import { safeReturnTo, startSignIn, useAuthConfig, useSession } from '../../auth/session';
import './auth.css';

function loginError(value: string | null): LoginErrorCode | null {
  return (LOGIN_ERROR_CODES as readonly string[]).includes(value ?? '')
    ? (value as LoginErrorCode)
    : null;
}

/** Sign-in page (authentication.md#2-sign-in): one button that starts the OIDC flow. */
export function LoginPage() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get('returnTo'));
  const error = loginError(params.get('error'));
  const session = useSession();
  const config = useAuthConfig();
  useDocumentTitle(`${t('login.title')} · ${t('app.name')}`);

  if (session.data) return <Navigate to={returnTo} replace />;

  const providerName = config.data?.providerName;

  return (
    <div className="mv-auth-page">
      <header className="mv-auth-top">
        <Wordmark />
        <div className="mv-top-bar-controls">
          <LanguageMenu className="mv-cover-control" position="bottom-end" />
          <ColorSchemeMenu className="mv-cover-control" position="bottom-end" />
        </div>
      </header>
      <main className="mv-auth-main">
        <section className="mv-auth-card" aria-labelledby="login-title">
          <Title order={1} id="login-title">
            {t('login.title')}
          </Title>
          <Text c="dimmed">{t('login.body')}</Text>
          {error ? (
            <Alert
              color="red"
              variant="light"
              icon={<IconAlertCircle size={18} aria-hidden="true" />}
              role="alert"
            >
              {t(`login.errors.${error}`)}
            </Alert>
          ) : null}
          {config.isPending ? (
            <Loader size="sm" aria-label={t('auth.loading')} />
          ) : config.isError ? (
            <Alert color="red" variant="light" role="alert">
              {t('login.errors.idp_unavailable')}
            </Alert>
          ) : (
            <Button
              size="md"
              fullWidth
              leftSection={<IconLogin2 size={18} aria-hidden="true" />}
              onClick={() => startSignIn('login', returnTo, i18n.resolvedLanguage ?? 'en')}
            >
              {t('login.signIn', { provider: providerName })}
            </Button>
          )}
          <Text size="sm" c="dimmed">
            {t('login.hint')}
          </Text>
        </section>
      </main>
    </div>
  );
}
