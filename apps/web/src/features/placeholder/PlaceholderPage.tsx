import { Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { NavItem } from '../../app/navigation';

/** Stand-in for sections that later stages build. */
export function PlaceholderPage({ labelKey }: { readonly labelKey: NavItem['labelKey'] }) {
  const { t } = useTranslation();
  return (
    <Stack gap="xs">
      <Title order={2}>{t(labelKey)}</Title>
      <Text c="dimmed">{t('placeholder.body')}</Text>
    </Stack>
  );
}
