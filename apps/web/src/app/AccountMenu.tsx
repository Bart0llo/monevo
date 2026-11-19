import { ActionIcon, Menu } from '@mantine/core';
import { IconLogout, IconSettings, IconUserCircle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useLogout, useSession } from '../auth/session';
import type { MenuControlProps } from './menuControl';

/** The signed-in user's menu: settings and sign-out (authentication.md#logout). */
export function AccountMenu({ className, position = 'bottom-end' }: MenuControlProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = useSession();
  const logout = useLogout(() => void navigate('/login', { replace: true }));

  return (
    <Menu position={position} withinPortal>
      <Menu.Target>
        <ActionIcon
          variant="default"
          size="lg"
          className={className}
          aria-label={t('account.label')}
        >
          <IconUserCircle size={18} stroke={1.5} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{session.data?.user.displayName}</Menu.Label>
        <Menu.Item
          component={Link}
          to="/settings"
          leftSection={<IconSettings size={16} stroke={1.5} />}
        >
          {t('nav.settings')}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconLogout size={16} stroke={1.5} />}
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          {t('account.signOut')}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
