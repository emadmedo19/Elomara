import { Capacitor, registerPlugin } from '@capacitor/core';
const AnnouncementFiles = registerPlugin<{
  savePng: (options: { dataUrl: string; fileName: string }) => Promise<{ saved: boolean }>;
}>('AnnouncementFiles');
export async function saveAnnouncementImage(dataUrl: string): Promise<'saved' | 'cancelled' | 'download-started'> {
  if (!dataUrl.startsWith('data:image/png;base64,')) throw new Error('صورة الإعلان غير جاهزة للحفظ.');
  const fileName = `elomara-announcement-${Date.now()}.png`;
  if (Capacitor.isNativePlatform()) {
    if (!Capacitor.isPluginAvailable('AnnouncementFiles')) {
      throw new Error('الحفظ على أندرويد يحتاج تثبيت أحدث نسخة APK من التطبيق.');
    }
    const result = await AnnouncementFiles.savePng({ dataUrl, fileName });
    return result.saved ? 'saved' : 'cancelled';
  }
  const link = document.createElement('a');
  link.href = dataUrl; link.download = fileName; document.body.appendChild(link);
  try { link.click(); } finally { link.remove(); }
  return 'download-started';
}
