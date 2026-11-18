/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

// App-shell service worker (frontend-architecture.md#9-pwa-and-service-worker). It precaches the
// built shell and serves index.html for navigations. API responses are never cached here: offline
// data lives in IndexedDB.

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (PrecacheEntry | string)[] };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api(\/|$)/] }));

// The page asks the waiting worker to activate once the user accepts the update prompt.
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data: unknown = event.data;
  if (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});
