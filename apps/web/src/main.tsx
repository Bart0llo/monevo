import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './theme/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppProviders } from './app/AppProviders';
import { routes } from './app/routes';
import { createI18n } from './i18n/i18n';
import { registerServiceWorker } from './pwa/register';

const container = document.getElementById('root');
if (container === null) throw new Error('Missing #root element');

const i18n = await createI18n();
const router = createBrowserRouter(routes);

createRoot(container).render(
  <StrictMode>
    <AppProviders i18n={i18n}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);

registerServiceWorker(i18n);
