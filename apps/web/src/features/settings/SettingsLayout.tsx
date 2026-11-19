import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';
import { PageHeader } from '../../components/PageHeader';

const TABS = [
  { to: '/settings', labelKey: 'settings.tabs.profile', end: true },
  { to: '/settings/sessions', labelKey: 'settings.tabs.sessions', end: false },
  { to: '/settings/api-tokens', labelKey: 'settings.tabs.apiTokens', end: false },
] as const;

/** Settings area: profile and preferences, signed-in devices, personal API tokens. */
export function SettingsLayout() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('nav.settings')} description={t('sections.settings')} />
      <nav aria-label={t('settings.tabs.label')}>
        <ul className="mv-subnav">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink to={tab.to} end={tab.end} className="mv-subnav-link">
                {t(tab.labelKey)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </>
  );
}
