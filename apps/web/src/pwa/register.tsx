import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { i18n } from 'i18next';
import { registerSW } from 'virtual:pwa-register';

const UPDATE_NOTIFICATION_ID = 'pwa-update';

/**
 * Registers the service worker and offers a reload when a new version is waiting
 * (frontend-architecture.md#9-pwa-and-service-worker). Call once, after <Notifications> is mounted.
 */
export function registerServiceWorker(i18n: i18n): void {
  if (!('serviceWorker' in navigator)) return;
  const updateSW = registerSW({
    onNeedRefresh() {
      notifications.show({
        id: UPDATE_NOTIFICATION_ID,
        title: i18n.t('pwa.updateTitle'),
        message: (
          <>
            {i18n.t('pwa.updateMessage')}{' '}
            <Button size="compact-xs" variant="light" onClick={() => void updateSW(true)}>
              {i18n.t('pwa.updateAction')}
            </Button>
          </>
        ),
        autoClose: false,
      });
    },
    onOfflineReady() {
      notifications.show({ message: i18n.t('pwa.offlineReady') });
    },
  });
}
