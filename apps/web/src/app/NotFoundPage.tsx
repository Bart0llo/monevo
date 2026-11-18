import { Anchor, Stack, Title } from '@mantine/core';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <Stack gap="xs">
      <Title order={2}>{t('notFound.title')}</Title>
      <Anchor component={Link} to="/">
        {t('notFound.back')}
      </Anchor>
    </Stack>
  );
}
