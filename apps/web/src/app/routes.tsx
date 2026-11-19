import type { RouteObject } from 'react-router';
import { RequireAuth, useIsAdmin } from '../auth/RequireAuth';
import { PlaceholderPage } from '../features/placeholder/PlaceholderPage';
import { AppLayout } from './AppLayout';
import { NAV_ITEMS } from './navigation';
import { NotFoundPage } from './NotFoundPage';
import { RouteError } from './RouteError';

// Route table (frontend-architecture.md#6-routing-indicative). Feature pages are loaded lazily.
// /login is public; everything else sits behind RequireAuth. The inner pathless route keeps the
// shell on screen when a page fails; the outer error element covers a failing shell.

function AdminOnly({ children }: { readonly children: React.ReactNode }) {
  return useIsAdmin() ? children : <NotFoundPage />;
}

/** `extraPages` lets tests add pages inside the shell. */
export function createRoutes(extraPages: RouteObject[] = []): RouteObject[] {
  return [
    {
      path: '/login',
      errorElement: <RouteError standalone />,
      lazy: async () => ({ Component: (await import('../features/auth/LoginPage')).LoginPage }),
    },
    {
      element: <RequireAuth />,
      errorElement: <RouteError standalone />,
      children: [
        {
          path: '/onboarding',
          lazy: async () => ({
            Component: (await import('../features/onboarding/OnboardingPage')).OnboardingPage,
          }),
        },
        {
          element: <AppLayout />,
          children: [
            {
              errorElement: <RouteError />,
              children: [
                ...NAV_ITEMS.filter((item) => item.path !== '/settings').map((item) => ({
                  path: item.path,
                  element: <PlaceholderPage item={item} />,
                })),
                {
                  path: '/settings',
                  lazy: async () => ({
                    Component: (await import('../features/settings/SettingsLayout')).SettingsLayout,
                  }),
                  children: [
                    {
                      index: true,
                      lazy: async () => ({
                        Component: (await import('../features/settings/ProfileSettings'))
                          .ProfileSettings,
                      }),
                    },
                    {
                      path: 'sessions',
                      lazy: async () => ({
                        Component: (await import('../features/settings/SessionsSettings'))
                          .SessionsSettings,
                      }),
                    },
                    {
                      path: 'api-tokens',
                      lazy: async () => ({
                        Component: (await import('../features/settings/ApiTokensSettings'))
                          .ApiTokensSettings,
                      }),
                    },
                  ],
                },
                {
                  path: '/admin/users',
                  lazy: async () => {
                    const { AdminUsersPage } = await import('../features/admin/AdminUsersPage');
                    return {
                      Component: () => (
                        <AdminOnly>
                          <AdminUsersPage />
                        </AdminOnly>
                      ),
                    };
                  },
                },
                ...extraPages,
                { path: '*', element: <NotFoundPage /> },
              ],
            },
          ],
        },
      ],
    },
  ];
}

export const routes: RouteObject[] = createRoutes();
