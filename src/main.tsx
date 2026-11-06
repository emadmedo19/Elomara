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
    const ready = await LiveUpdate.ready();
    console.info('[OTA] Current bundle marked ready:', ready);
  } catch (error) {
    console.warn('[OTA] Ready check failed:', error);
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
    console.info('[OTA] Bundle state:', {
      currentBundleId: current.bundleId ?? 'native-default',
      nextBundleId: next.bundleId ?? null,
      publishedBundleId: bundleId,
    });
    if (current.bundleId === bundleId) return;
    if (next.bundleId === bundleId) {
      // A previous run may have downloaded and staged this bundle but not
      // applied it. Reload the web layer now instead of waiting for a manual
      // force-stop/restart from the user.
      await LiveUpdate.reload();
      return;
    }

    await LiveUpdate.downloadBundle({ url, bundleId, checksum });
    await LiveUpdate.setNextBundle({ bundleId });
    console.info('[OTA] Bundle downloaded and staged; applying it now.');
    await LiveUpdate.reload();
  } catch (error) {
    // OTA failures must never prevent the residential app from opening.
    console.warn('[OTA] Live update check/apply failed:', error);
  }
}

void initializeLiveUpdates();

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <PushNotificationManager />
    <App />
  </AuthProvider>
);
