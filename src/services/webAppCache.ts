import { Capacitor } from '@capacitor/core';
// PWA workers must never serve an old shell over a native OTA bundle.
export async function clearNativeWebAppCache() {
  if (!Capacitor.isNativePlatform()) return;
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(registration => registration.unregister()));
  }
  if (typeof caches !== 'undefined') {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('workbox-')).map(key => caches.delete(key)));
  }
}
export function registerWebAppWorker() {
  if (Capacitor.isNativePlatform() || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.register('/sw.js').catch(error => console.warn('[PWA] Registration unavailable', error));
}
