import { AppShell, Burger, Group, NavLink, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Link, Outlet, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ColorSchemeMenu } from './ColorSchemeMenu';
import { LanguageMenu } from './LanguageMenu';
import { NAV_ITEMS, isActivePath } from './navigation';

/** Protected-area layout (frontend-architecture.md#7-ui-composition): header, navigation, content. */
export function AppLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [opened, { toggle, close }] = useDisclosure(false);

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label={t('nav.toggle')} />
            <Title order={1} size="h3">
              {t('app.name')}
            </Title>
            <Text size="sm" c="dimmed" visibleFrom="md">
              {t('app.tagline')}
            </Text>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <LanguageMenu />
            <ColorSchemeMenu />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs" component="nav" aria-label={t('nav.label')}>
        {NAV_ITEMS.map(({ path, labelKey, icon: ItemIcon }) => {
          const active = isActivePath(path, pathname);
          return (
            <NavLink
              key={path}
              component={Link}
              to={path}
              label={t(labelKey)}
              leftSection={<ItemIcon size={18} stroke={1.5} />}
              active={active}
              aria-current={active ? 'page' : undefined}
              onClick={close}
            />
          );
        })}
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
