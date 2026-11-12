import { Capacitor, registerPlugin } from '@capacitor/core';
const AnnouncementFiles = registerPlugin<{
  savePng: (options: { dataUrl: string; fileName: string }) => Promise<{ saved: boolean }>;
  beginPngTransfer: (options: { chunks: number }) => Promise<void>;
  appendPngChunk: (options: { index: number; chunk: string }) => Promise<void>;
  finishPngTransfer: (options: { fileName: string }) => Promise<{ saved: boolean }>;
}>('AnnouncementFiles');
export async function saveAnnouncementImage(dataUrl: string): Promise<'saved' | 'cancelled' | 'download-started'> {
  if (!dataUrl.startsWith('data:image/png;base64,')) throw new Error('صورة الإعلان غير جاهزة للحفظ.');
  const fileName = `elomara-announcement-${Date.now()}.png`;
  if (Capacitor.isNativePlatform()) {
    if (!Capacitor.isPluginAvailable('AnnouncementFiles')) {
      throw new Error('الحفظ على أندرويد يحتاج تثبيت أحدث نسخة APK من التطبيق.');
    }
    // Decode in JavaScript, then transfer small independent base64 blocks to avoid
    // truncation of multi-megabyte Capacitor bridge messages on Android WebView.
    const payload = dataUrl.slice('data:image/png;base64,'.length);
    const chunkLength = 12288; // smaller bridge messages; divisible by four so chunks decode independently
    const chunks = Math.ceil(payload.length / chunkLength);
    if (!chunks || chunks > 512) throw new Error('صورة الإعلان كبيرة جدًا للحفظ.');
    try {
      await AnnouncementFiles.beginPngTransfer({ chunks });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/not implemented|not available|not found/i.test(message)) {
        throw new Error('نسخة أندرويد المثبتة لا تدعم حفظ الصور الجديد. يلزم تثبيت APK مبني بعد تحديث الحفظ؛ تحديث OTA وحده لا يكفي.');
      }
      throw error;
    }
    for (let index = 0; index < chunks; index++) {
      await AnnouncementFiles.appendPngChunk({ index, chunk: payload.slice(index * chunkLength, (index + 1) * chunkLength) });
    }
    const result = await AnnouncementFiles.finishPngTransfer({ fileName });
    return result.saved ? 'saved' : 'cancelled';
  }
  const link = document.createElement('a');
  const binary = atob(dataUrl.slice('data:image/png;base64,'.length));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
  link.href = objectUrl; link.download = fileName; document.body.appendChild(link);
  try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(objectUrl), 60000); }
  return 'download-started';
}
