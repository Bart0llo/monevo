import {
  IconCalendar,
  IconChartBar,
  IconHome,
  IconPigMoney,
  IconReceipt,
  IconSettings,
  IconWallet,
  type Icon,
} from '@tabler/icons-react';

/** Main navigation (frontend-architecture.md#6-routing-indicative). Sections are placeholders in Stage 1. */
export const NAV_ITEMS = [
  { path: '/', labelKey: 'nav.dashboard', icon: IconHome },
  { path: '/transactions', labelKey: 'nav.transactions', icon: IconReceipt },
  { path: '/accounts', labelKey: 'nav.accounts', icon: IconWallet },
  { path: '/budgets', labelKey: 'nav.budgets', icon: IconPigMoney },
  { path: '/calendar', labelKey: 'nav.calendar', icon: IconCalendar },
  { path: '/reports', labelKey: 'nav.reports', icon: IconChartBar },
  { path: '/settings', labelKey: 'nav.settings', icon: IconSettings },
] as const satisfies readonly { path: string; labelKey: `nav.${string}`; icon: Icon }[];

export type NavItem = (typeof NAV_ITEMS)[number];

export function isActivePath(itemPath: string, pathname: string): boolean {
  if (itemPath === '/') return pathname === '/';
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}
