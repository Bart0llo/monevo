import { Button, Center, Loader, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router';
import { StatePanel } from '../components/StatePanel';
import { useSession } from './session';

const ONBOARDING_PATH = '/onboarding';

/**
 * Route guard for the protected area: signed-out users go to /login (keeping the target as
 * `returnTo`), users who have not finished onboarding go to /onboarding.
 */
export function RequireAuth() {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const session = useSession();

  if (session.isPending) {
    return (
      <Center mih="100dvh">
        <Loader aria-label={t('auth.loading')} />
      </Center>
    );
  }
  if (session.isError) {
    return (
      <Center mih="100dvh" p="md">
        <StatePanel>
          <Text fw={600}>{t('auth.unreachableTitle')}</Text>
          <Text>{t('auth.unreachableBody')}</Text>
          <Button onClick={() => void session.refetch()}>{t('auth.retry')}</Button>
        </StatePanel>
      </Center>
    );
  }
  if (session.data === null) {
    const returnTo = `${pathname}${search}`;
    const target = returnTo === '/' ? '/login' : `/login?returnTo=${encodeURIComponent(returnTo)}`;
    return <Navigate to={target} replace />;
  }
  const onOnboarding = pathname === ONBOARDING_PATH;
  if (session.data.onboardingRequired && !onOnboarding) {
    return <Navigate to={ONBOARDING_PATH} replace />;
  }
  if (!session.data.onboardingRequired && onOnboarding) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Admin-only routes; others see the not-found page (administration.md). */
export function useIsAdmin(): boolean {
  const session = useSession();
  return session.data?.user.role === 'ADMIN';
}
