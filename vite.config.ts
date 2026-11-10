import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const backend = env.VITE_BACKEND_PROVIDER === 'neon' ? 'neon' : 'supabase';
  const buildId = env.VITE_BUILD_ID || 'local';
  return {
    plugins: [
      {
        name: 'elomara-runtime-identity',
        transformIndexHtml() {
          return [{ tag: 'meta', attrs: { name: 'elomara-backend', content: backend }, injectTo: 'head-prepend' }];
        },
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'elomara-runtime.json', source: JSON.stringify({ backend, buildId }) });
        },
      },
      react(),
      tailwindcss(),
      VitePWA({
        // Native Neon builds use packaged assets/LiveUpdate, not a second PWA cache.
        injectRegister: backend === 'neon' ? false : 'auto',
        registerType: 'autoUpdate',
        includeAssets: ['brand-lockup.png', 'brand-lockup-dark.png', 'icon.svg', 'icon.png', 'pwa-maskable-512x512.png', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
        manifest: {
          id: '/',
          name: 'العمارة - إدارة العقارات السكنية',
          short_name: 'العمارة',
          description: 'نظام العمارة لإدارة العقارات السكنية، التحصيلات والمصروفات واتحادات الشاغلين',
          theme_color: '#0f2537',
          background_color: '#0f2537',
          display: 'standalone',
          orientation: 'portrait',
          dir: 'rtl',
          lang: 'ar-EG',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
