import { ActionIcon, Menu, useMantineColorScheme, type MantineColorScheme } from '@mantine/core';
import { IconCheck, IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { MenuControlProps } from './menuControl';

const OPTIONS = [
  { value: 'light', labelKey: 'theme.light', icon: IconSun },
  { value: 'dark', labelKey: 'theme.dark', icon: IconMoon },
  { value: 'auto', labelKey: 'theme.auto', icon: IconDeviceDesktop },
] as const satisfies readonly {
  value: MantineColorScheme;
  labelKey: `theme.${string}`;
  icon: unknown;
}[];

export function ColorSchemeMenu({ className, position = 'bottom-end' }: MenuControlProps) {
  const { t } = useTranslation();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const current = OPTIONS.find((option) => option.value === colorScheme) ?? OPTIONS[2];
  const CurrentIcon = current.icon;

  return (
    <Menu position={position} withinPortal>
      <Menu.Target>
        <ActionIcon variant="default" size="lg" className={className} aria-label={t('theme.label')}>
          <CurrentIcon size={18} stroke={1.5} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t('theme.label')}</Menu.Label>
        {OPTIONS.map(({ value, labelKey, icon: OptionIcon }) => (
          <Menu.Item
            key={value}
            leftSection={<OptionIcon size={16} stroke={1.5} />}
            rightSection={value === colorScheme ? <IconCheck size={14} /> : null}
            onClick={() => setColorScheme(value)}
          >
            {t(labelKey)}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
