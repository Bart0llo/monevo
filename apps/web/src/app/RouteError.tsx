import { Button, Group, Text } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { StatePanel } from '../components/StatePanel';
import './shell.css';

/**
 * Route error boundary. Inside the shell it replaces only the page; at the root (when the shell
 * itself failed) it stands alone.
 */
export function RouteError({ standalone = false }: { readonly standalone?: boolean }) {
  const { t } = useTranslation();
  const content = (
    <>
      <PageHeader title={t('errorPage.title')} description={t('errorPage.body')} />
      <StatePanel>
        <Text>{t('errorPage.hint')}</Text>
        <Group gap="sm">
          <Button
            onClick={() => window.location.reload()}
            leftSection={<IconRefresh size={16} stroke={1.8} aria-hidden="true" />}
          >
            {t('errorPage.reload')}
          </Button>
          <Button component={Link} to="/" variant="default" reloadDocument>
            {t('notFound.back')}
          </Button>
        </Group>
      </StatePanel>
    </>
  );
  if (!standalone) return content;
  return (
    <main className="mv-main">
      <div className="mv-page">{content}</div>
    </main>
  );
}
