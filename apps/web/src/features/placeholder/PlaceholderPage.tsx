import { Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { NavItem } from '../../app/navigation';
import { PageHeader } from '../../components/PageHeader';
import { PlannedBadge } from '../../components/PlannedBadge';
import { StatePanel } from '../../components/StatePanel';

/** Stand-in for sections that later stages build: what the section is for, and that it is planned. */
export function PlaceholderPage({ item }: { readonly item: NavItem }) {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t(item.labelKey)} description={t(item.descriptionKey)} />
      <StatePanel planned>
        <PlannedBadge>{t('placeholder.badge')}</PlannedBadge>
        <Text>{t('placeholder.body')}</Text>
      </StatePanel>
    </>
  );
}
