import { Capacitor } from '@capacitor/core';
import { LiveUpdate } from '@capawesome/capacitor-live-update';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext';
import { PushNotificationManager } from './components/PushNotificationManager';
import './index.css';

const OTA_MANIFEST_URL = 'https://yvoylicirtdarroqcxoq.supabase.co/storage/v1/object/public/bunyan-ota/latest.json';

async function initializeLiveUpdates() {
  if (!Capacitor.isNativePlatform()) return;

  // Confirm the currently running bundle is healthy before staging another one.
  try {
    await LiveUpdate.ready();
  } catch (error) {
    console.warn('Live Update ready check failed:', error);
    return;
  }

  try {
    const response = await fetch(OTA_MANIFEST_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Manifest request failed: HTTP ${response.status}`);

    const manifest: unknown = await response.json();
    if (
      !manifest ||
      typeof manifest !== 'object' ||
      !('bundleId' in manifest) ||
      !('url' in manifest) ||
      !('checksum' in manifest)
    ) {
      throw new Error('Invalid OTA manifest');
    }

    const { bundleId, url, checksum } = manifest as {
      bundleId: string;
      url: string;
      checksum: string;
    };

    const expectedPrefix = 'https://yvoylicirtdarroqcxoq.supabase.co/storage/v1/object/public/bunyan-ota/bundles/';
    if (
      typeof bundleId !== 'string' ||
      !/^[a-f0-9]{40}$/.test(bundleId) ||
      typeof url !== 'string' ||
      !url.startsWith(expectedPrefix) ||
      !url.endsWith(`/${bundleId}.zip`) ||
      typeof checksum !== 'string' ||
      !/^[a-f0-9]{64}$/.test(checksum)
    ) {
      throw new Error('OTA manifest contains an invalid bundle reference');
    }

    const current = await LiveUpdate.getCurrentBundle();
    const next = await LiveUpdate.getNextBundle();
    if (current.bundleId === bundleId || next.bundleId === bundleId) return;

    await LiveUpdate.downloadBundle({ url, bundleId, checksum });
    await LiveUpdate.setNextBundle({ bundleId });
    console.info('A Bunyan update is ready and will apply after the next app restart.');
  } catch (error) {
    // OTA failures must never prevent the residential app from opening.
    console.warn('Bunyan live update check failed:', error);
  }
}

void initializeLiveUpdates();

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <PushNotificationManager />
    <App />
  </AuthProvider>
);
