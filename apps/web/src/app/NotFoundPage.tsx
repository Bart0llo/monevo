import { Button, Text } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { StatePanel } from '../components/StatePanel';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('notFound.title')} description={t('notFound.body')} />
      <StatePanel>
        <Text>{t('notFound.hint')}</Text>
        <Button
          component={Link}
          to="/"
          variant="light"
          leftSection={<IconArrowLeft size={16} stroke={1.8} aria-hidden="true" />}
        >
          {t('notFound.back')}
        </Button>
      </StatePanel>
    </>
  );
}
