import { ActionIcon, Menu } from '@mantine/core';
import { IconCheck, IconLanguage } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, resolveLanguage } from '@monevo/i18n';
import type { LanguageMenuProps } from './menuControl';

export function LanguageMenu({ className, position = 'bottom-end', onChange }: LanguageMenuProps) {
  const { t, i18n } = useTranslation();
  const current = resolveLanguage([i18n.resolvedLanguage ?? i18n.language]);

  return (
    <Menu position={position} withinPortal>
      <Menu.Target>
        <ActionIcon
          variant="default"
          size="lg"
          className={className}
          aria-label={t('language.label')}
        >
          <IconLanguage size={18} stroke={1.5} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t('language.label')}</Menu.Label>
        {SUPPORTED_LANGUAGES.map((language) => (
          <Menu.Item
            key={language}
            lang={language}
            rightSection={language === current ? <IconCheck size={14} /> : null}
            onClick={() => {
              void i18n.changeLanguage(language);
              onChange?.(language);
            }}
          >
            {t(`language.${language}`)}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
