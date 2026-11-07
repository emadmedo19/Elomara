export type Appearance = 'light' | 'dark' | 'system';
export type FontSize = 'normal' | 'large' | 'extra-large';
export interface DevicePreferences { appearance: Appearance; fontSize: FontSize; }
const key = 'elomara-device-preferences-v1';
export const defaultDevicePreferences: DevicePreferences = { appearance: 'light', fontSize: 'normal' };
export function readDevicePreferences(): DevicePreferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return {
      appearance: ['light', 'dark', 'system'].includes(value?.appearance) ? value.appearance : 'light',
      fontSize: ['normal', 'large', 'extra-large'].includes(value?.fontSize) ? value.fontSize : 'normal',
    };
  } catch { return { ...defaultDevicePreferences }; }
}
export function applyDevicePreferences(value: DevicePreferences) {
  const dark = value.appearance === 'dark' || (value.appearance === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.appearance = dark ? 'dark' : 'light';
  document.documentElement.dataset.fontSize = value.fontSize;
  document.documentElement.style.fontSize = ({ normal: '16px', large: '18px', 'extra-large': '20px' })[value.fontSize];
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}
export function saveDevicePreferences(value: DevicePreferences): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { return false; }
  applyDevicePreferences(value);
  return true;
}
export function initializeDevicePreferences() {
  const refresh = () => applyDevicePreferences(readDevicePreferences());
  refresh();
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', refresh);
  const storage = (event: StorageEvent) => { if (event.key === key || event.key === null) refresh(); };
  window.addEventListener('storage', storage);
  return () => { media.removeEventListener('change', refresh); window.removeEventListener('storage', storage); };
}
