import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { LiveUpdate } from '@capawesome/capacitor-live-update';

const OTA_MANIFEST_URL = 'https://yvoylicirtdarroqcxoq.supabase.co/storage/v1/object/public/bunyan-ota/latest.json';
type Manifest = { bundleId: string; url: string; checksum: string };
type UpdateState = {
  manifest: Manifest | null;
  phase: 'available' | 'downloading' | 'applying' | 'error';
};
const idle: UpdateState = { manifest: null, phase: 'available' };
let state = idle;
const listeners = new Set<() => void>();
const dismissed = new Set<string>();
let initialization: Promise<boolean> | undefined;
let checking: Promise<void> | undefined;
let applying = false;

function publish(next: UpdateState) {
  state = next;
  listeners.forEach(listener => listener());
}

export const getOtaSnapshot = () => state;
export const subscribeToOta = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

async function markCurrentBundleReady(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const ready = await LiveUpdate.ready();
    console.info('[OTA] Current bundle marked ready:', ready);
    return true;
  } catch (error) {
    console.warn('[OTA] Ready check failed:', error);
    return false;
  }
}

export function checkForOtaUpdate(): Promise<void> {
  if (checking) return checking;
  if (applying) return Promise.resolve();
  checking = (async () => {
    initialization ??= markCurrentBundleReady();
    if (!await initialization) return;
    try {
      const response = await fetch(OTA_MANIFEST_URL, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`Manifest request failed: HTTP ${response.status}`);
      const manifest: unknown = await response.json();
      if (!manifest || typeof manifest !== 'object' ||
          !('bundleId' in manifest) || !('url' in manifest) || !('checksum' in manifest)) {
        throw new Error('Invalid OTA manifest');
      }
      const { bundleId, url, checksum } = manifest;
      const expectedPrefix = 'https://yvoylicirtdarroqcxoq.supabase.co/storage/v1/object/public/bunyan-ota/bundles/';
      if (typeof bundleId !== 'string' || !/^[a-f0-9]{40}$/.test(bundleId) ||
          typeof url !== 'string' || !url.startsWith(expectedPrefix) || !url.endsWith(`/${bundleId}.zip`) ||
          typeof checksum !== 'string' || !/^[a-f0-9]{64}$/.test(checksum)) {
        throw new Error('OTA manifest contains an invalid bundle reference');
      }
      const current = await LiveUpdate.getCurrentBundle();
      // A resume/data-refresh check must not replace an in-flight apply state.
      if (applying) return;
      if (current.bundleId === bundleId || (!current.bundleId && import.meta.env.VITE_BUILD_ID === bundleId)) {
        publish(idle);
        return;
      }
      if (!dismissed.has(bundleId)) publish({ manifest: { bundleId, url, checksum }, phase: 'available' });
    } catch (error) {
      // Offline/invalid manifests must never prevent opening the app.
      console.warn('[OTA] Update check failed:', error);
    }
  })().finally(() => { checking = undefined; });
  return checking;
}

export function deferOtaUpdate() {
  if (applying || !state.manifest) return;
  // Memory-only: remember the choice during this run, ask again on next launch.
  dismissed.add(state.manifest.bundleId);
  publish(idle);
}

export async function applyOtaUpdate() {
  const manifest = state.manifest;
  if (applying || !manifest) return;
  applying = true;
  try {
    if (!await initialization) throw new Error('Current bundle is not ready');
    publish({ manifest, phase: 'downloading' });
    const next = await LiveUpdate.getNextBundle();
    if (next.bundleId !== manifest.bundleId) await LiveUpdate.downloadBundle(manifest);
    publish({ manifest, phase: 'applying' });
    // Stage only after explicit consent, so "later" cannot install on restart.
    await LiveUpdate.setNextBundle({ bundleId: manifest.bundleId });
    await LiveUpdate.reload();
    publish(idle);
  } catch (error) {
    console.warn('[OTA] Update apply failed:', error);
    publish({ manifest, phase: 'error' });
  } finally {
    applying = false;
  }
}

let started = false;
export function initializeLiveUpdates() {
  if (started || !Capacitor.isNativePlatform()) return;
  started = true;
  void checkForOtaUpdate();
  void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) void checkForOtaUpdate();
  }).catch(error => console.warn('[OTA] Resume listener unavailable:', error));
}
