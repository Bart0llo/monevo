import { AppShell, Drawer, UnstyledButton } from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { IconDots } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useLocation } from 'react-router';
import { useIsAdmin } from '../auth/RequireAuth';
import { AccountMenu } from './AccountMenu';
import { ColorSchemeMenu } from './ColorSchemeMenu';
import { LanguageMenu } from './LanguageMenu';
import { PRIMARY_NAV, isActivePath, moreNavFor, navItemsFor, type NavItem } from './navigation';
import { usePreferenceSync } from './preferences';
import { Wordmark } from './Wordmark';
import './shell.css';

/** Mantine's `md` breakpoint (user-experience.md#navigation): rail from here up, bottom bar below. */
const DESKTOP_QUERY = '(min-width: 62em)';
const MAIN_ID = 'main-content';

/**
 * Protected-area layout (frontend-architecture.md#7-ui-composition). Desktop: an ink "cover" rail
 * with the wordmark, navigation and preferences. Mobile: a top bar with the wordmark and
 * preferences, and a bottom bar with the primary sections plus "More".
 */
export function AppLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isDesktop = useMediaQuery(DESKTOP_QUERY, undefined, { getInitialValueInEffect: false });
  const [moreOpened, more] = useDisclosure(false);
  const isAdmin = useIsAdmin();
  const navItems = navItemsFor(isAdmin);
  const moreNav = moreNavFor(isAdmin);
  const preferences = usePreferenceSync();
  const moreActive = moreNav.some((item) => isActivePath(item.path, pathname));

  return (
    <AppShell
      header={{ height: 56, collapsed: isDesktop }}
      navbar={{ width: 240, breakpoint: 'md', collapsed: { mobile: true } }}
      footer={{ height: 64, collapsed: isDesktop }}
      padding={0}
    >
      <a href={`#${MAIN_ID}`} className="mv-skip-link">
        {t('a11y.skipToContent')}
      </a>

      {isDesktop ? (
        <AppShell.Navbar component="div" className="mv-rail" withBorder={false}>
          <div className="mv-rail-brand">
            <Wordmark />
          </div>
          <nav className="mv-rail-nav" aria-label={t('nav.label')}>
            <ul className="mv-rail-list">
              {navItems.map((item) => (
                <li key={item.path} className="mv-rail-item" data-group={item.group}>
                  <RailLink item={item} active={isActivePath(item.path, pathname)} />
                </li>
              ))}
            </ul>
          </nav>
          <div className="mv-rail-footer">
            <AccountMenu className="mv-cover-control" position="top-start" />
            <LanguageMenu
              className="mv-cover-control"
              position="top-start"
              onChange={preferences.onLanguageChange}
            />
            <ColorSchemeMenu
              className="mv-cover-control"
              position="top-start"
              onChange={preferences.onColorSchemeChange}
            />
          </div>
        </AppShell.Navbar>
      ) : (
        <>
          <AppShell.Header className="mv-top-bar" withBorder={false}>
            <Wordmark />
            <div className="mv-top-bar-controls">
              <LanguageMenu
                className="mv-cover-control"
                position="bottom-end"
                onChange={preferences.onLanguageChange}
              />
              <ColorSchemeMenu
                className="mv-cover-control"
                position="bottom-end"
                onChange={preferences.onColorSchemeChange}
              />
              <AccountMenu className="mv-cover-control" position="bottom-end" />
            </div>
          </AppShell.Header>
          <AppShell.Footer className="mv-bottom-bar" withBorder={false}>
            <nav aria-label={t('nav.label')}>
              <ul className="mv-bottom-list">
                {PRIMARY_NAV.map((item) => {
                  const active = isActivePath(item.path, pathname);
                  const ItemIcon = item.icon;
                  return (
                    <li key={item.path}>
                      <Link
                        to={item.path}
                        className="mv-tab"
                        data-active={active || undefined}
                        aria-current={active ? 'page' : undefined}
                      >
                        <span className="mv-tab-icon">
                          <ItemIcon size={22} stroke={1.6} aria-hidden="true" />
                        </span>
                        <span className="mv-tab-label">{t(item.labelKey)}</span>
                      </Link>
                    </li>
                  );
                })}
                <li>
                  <UnstyledButton
                    className="mv-tab"
                    data-active={moreActive || undefined}
                    aria-haspopup="dialog"
                    aria-expanded={moreOpened}
                    onClick={more.open}
                  >
                    <span className="mv-tab-icon">
                      <IconDots size={22} stroke={1.6} aria-hidden="true" />
                    </span>
                    <span className="mv-tab-label">{t('nav.more')}</span>
                  </UnstyledButton>
                </li>
              </ul>
            </nav>
          </AppShell.Footer>
          <Drawer
            opened={moreOpened}
            onClose={more.close}
            position="bottom"
            size="auto"
            title={t('nav.more')}
            classNames={{ content: 'mv-sheet', title: 'mv-sheet-title' }}
            closeButtonProps={{ 'aria-label': t('nav.close') }}
          >
            <ul className="mv-sheet-list">
              {moreNav.map((item) => {
                const active = isActivePath(item.path, pathname);
                const ItemIcon = item.icon;
                return (
                  <li key={item.path} className="mv-sheet-item" data-group={item.group}>
                    <Link
                      to={item.path}
                      className="mv-sheet-link"
                      data-active={active || undefined}
                      aria-current={active ? 'page' : undefined}
                      onClick={more.close}
                    >
                      <ItemIcon size={20} stroke={1.6} aria-hidden="true" />
                      <span>{t(item.labelKey)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Drawer>
        </>
      )}

      <AppShell.Main id={MAIN_ID} tabIndex={-1} className="mv-main">
        <div className="mv-page">
          <Outlet />
        </div>
      </AppShell.Main>
    </AppShell>
  );
}

function RailLink({ item, active }: { readonly item: NavItem; readonly active: boolean }) {
  const { t } = useTranslation();
  const ItemIcon = item.icon;
  return (
    <Link
      to={item.path}
      className="mv-rail-link"
      data-active={active || undefined}
      aria-current={active ? 'page' : undefined}
    >
      <ItemIcon size={19} stroke={1.6} aria-hidden="true" />
      <span>{t(item.labelKey)}</span>
    </Link>
  );
}
