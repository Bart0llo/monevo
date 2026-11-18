import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Build and dev server for the web app (frontend-architecture.md). The production build is copied
// into the image as /app/public and served by Express from the same origin.

const BRAND = '#1c7ed6';
const DARK_BACKGROUND = '#242424';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, 'VITE_');
  return {
    plugins: [
      react(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src/sw',
        filename: 'sw.ts',
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['favicon.svg', 'color-scheme.js', 'icons/apple-touch-icon.png'],
        manifest: {
          id: '/',
          name: 'Monevo',
          short_name: 'Monevo',
          description: 'Personal finance, offline first',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          theme_color: BRAND,
          background_color: DARK_BACKGROUND,
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        },
        // The service worker caches aggressively; enable it in development only on request
        // (development-setup.md#5-working-on-specific-areas).
        devOptions: { enabled: env.VITE_PWA_DEV === 'true', type: 'module' },
      }),
    ],
    server: {
      port: 5173,
      proxy: { '/api': { target: 'http://localhost:3000', ws: true } },
    },
    // The shell budget is 300 KB gzip (frontend-architecture.md#10-performance-budget), checked on
    // gzip size; Rolldown's default warning is for minified size.
    build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 900 },
  };
});
