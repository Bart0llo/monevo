import {
  IconCalendar,
  IconChartBar,
  IconHome,
  IconPigMoney,
  IconReceipt,
  IconSettings,
  IconShieldLock,
  IconWallet,
  type Icon,
} from '@tabler/icons-react';

/**
 * Main navigation (frontend-architecture.md#6-routing-indicative, user-experience.md#navigation).
 * Sections are placeholders until their stage. `group` places an item on the desktop rail:
 * `primary` items come first and also fill the mobile bottom bar; `secondary` items follow
 * them on the rail and sit under "More" on mobile; `system` items are pinned to the bottom of the rail.
 */
export const NAV_ITEMS = [
  {
    path: '/',
    labelKey: 'nav.dashboard',
    descriptionKey: 'sections.dashboard',
    icon: IconHome,
    group: 'primary',
  },
  {
    path: '/transactions',
    labelKey: 'nav.transactions',
    descriptionKey: 'sections.transactions',
    icon: IconReceipt,
    group: 'primary',
  },
  {
    path: '/budgets',
    labelKey: 'nav.budgets',
    descriptionKey: 'sections.budgets',
    icon: IconPigMoney,
    group: 'primary',
  },
  {
    path: '/calendar',
    labelKey: 'nav.calendar',
    descriptionKey: 'sections.calendar',
    icon: IconCalendar,
    group: 'primary',
  },
  {
    path: '/accounts',
    labelKey: 'nav.accounts',
    descriptionKey: 'sections.accounts',
    icon: IconWallet,
    group: 'secondary',
  },
  {
    path: '/reports',
    labelKey: 'nav.reports',
    descriptionKey: 'sections.reports',
    icon: IconChartBar,
    group: 'secondary',
  },
  {
    path: '/settings',
    labelKey: 'nav.settings',
    descriptionKey: 'sections.settings',
    icon: IconSettings,
    group: 'system',
  },
] as const satisfies readonly {
  path: string;
  labelKey: `nav.${string}`;
  descriptionKey: `sections.${string}`;
  icon: Icon;
  group: 'primary' | 'secondary' | 'system';
}[];

/** Shown only to administrators (administration.md). */
export const ADMIN_NAV_ITEM = {
  path: '/admin/users',
  labelKey: 'nav.admin',
  descriptionKey: 'sections.admin',
  icon: IconShieldLock,
  group: 'system',
} as const;

export type NavItem = (typeof NAV_ITEMS)[number] | typeof ADMIN_NAV_ITEM;

/** The navigation for the signed-in user: admins also get user administration. */
export function navItemsFor(isAdmin: boolean): readonly NavItem[] {
  return isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;
}

export const PRIMARY_NAV = NAV_ITEMS.filter((item) => item.group === 'primary');
/** Everything that is not in the mobile bottom bar; shown in the "More" sheet. */
export function moreNavFor(isAdmin: boolean): readonly NavItem[] {
  return navItemsFor(isAdmin).filter((item) => item.group !== 'primary');
}

export function isActivePath(itemPath: string, pathname: string): boolean {
  if (itemPath === '/') return pathname === '/';
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}
