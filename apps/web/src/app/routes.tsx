import type { RouteObject } from 'react-router';
import { PlaceholderPage } from '../features/placeholder/PlaceholderPage';
import { AppLayout } from './AppLayout';
import { NAV_ITEMS } from './navigation';
import { NotFoundPage } from './NotFoundPage';
import { RouteError } from './RouteError';

// Route table (frontend-architecture.md#6-routing-indicative). Feature routes replace the
// placeholders, lazily loaded, in later stages. The inner pathless route keeps the shell on screen
// when a page fails; the outer error element covers a failing shell.

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    errorElement: <RouteError standalone />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          ...NAV_ITEMS.map((item) => ({
            path: item.path,
            element: <PlaceholderPage item={item} />,
          })),
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
