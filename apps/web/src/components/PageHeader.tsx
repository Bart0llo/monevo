import { Text, Title } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import './components.css';

/** The page's h1, an optional one-line description, and the document title. */
export function PageHeader({
  title,
  description,
}: {
  readonly title: string;
  readonly description?: ReactNode;
}) {
  const { t } = useTranslation();
  useDocumentTitle(`${title} · ${t('app.name')}`);
  return (
    <header className="mv-page-header">
      <Title order={1}>{title}</Title>
      {description === undefined ? null : (
        <Text c="dimmed" className="mv-page-description">
          {description}
        </Text>
      )}
    </header>
  );
}
