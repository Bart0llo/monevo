import type { RouteObject } from 'react-router';
import { PlaceholderPage } from '../features/placeholder/PlaceholderPage';
import { AppLayout } from './AppLayout';
import { NAV_ITEMS } from './navigation';
import { NotFoundPage } from './NotFoundPage';

// Route table (frontend-architecture.md#6-routing-indicative). Feature routes replace the
// placeholders, lazily loaded, in later stages.

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      ...NAV_ITEMS.map(({ path, labelKey }) => ({
        path,
        element: <PlaceholderPage labelKey={labelKey} />,
      })),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
