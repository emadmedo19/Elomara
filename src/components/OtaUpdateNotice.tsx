import { useSyncExternalStore } from 'react';
import { Download, LoaderCircle, Sparkles } from 'lucide-react';
import { applyOtaUpdate, deferOtaUpdate, getOtaSnapshot, subscribeToOta } from '../services/otaUpdates';

export function OtaUpdateNotice() {
  const { manifest, phase } = useSyncExternalStore(subscribeToOta, getOtaSnapshot, getOtaSnapshot);
  if (!manifest) return null;
  const busy = phase === 'downloading' || phase === 'applying';
  const failed = phase === 'error';
  return (
    <aside className="ota-update-notice" dir="rtl" aria-labelledby="ota-update-title" aria-busy={busy}>
      <style>{`
        @keyframes ota-notice-enter { from { opacity:0; transform:translateY(-24px); } to { opacity:1; transform:translateY(0); } }
        @keyframes ota-notice-spin { to { transform:rotate(360deg); } }
        .ota-update-notice { position:fixed; z-index:10020; top:max(14px,env(safe-area-inset-top)); left:max(12px,env(safe-area-inset-left)); right:max(12px,env(safe-area-inset-right)); width:auto; max-width:420px; margin-inline:auto; padding:18px; border:1px solid #c3e8fa; border-radius:22px; color:#12344c; background:linear-gradient(125deg,#fff,#edf8ff); box-shadow:0 14px 48px #092b6040; animation:ota-notice-enter .35s ease-out both; font-family:inherit; }
        .ota-notice-heading { display:flex; gap:12px; align-items:flex-start; }
        .ota-notice-icon { display:grid; place-items:center; flex-shrink:0; width:44px; height:44px; border-radius:15px; color:#ffd04b; background:#0d3963; }
        .ota-notice-title { margin:0; font-size:16px; font-weight:800; line-height:1.6; }
        .ota-notice-copy { margin:4px 0 0; color:#47647c; font-size:13px; line-height:1.8; }
        .ota-notice-actions { display:flex; gap:10px; margin-top:14px; }
        .ota-notice-actions button { display:flex; align-items:center; justify-content:center; gap:7px; min-height:44px; padding:10px 16px; border-radius:13px; font:inherit; font-size:14px; font-weight:800; cursor:pointer; }
        .ota-notice-now { flex:1; background:#0d3963; color:white; border:1px solid #0d3963; }
        .ota-notice-later { background:white; color:#365975; border:1px solid #c5deeb; }
        .ota-notice-actions button:disabled { cursor:wait; opacity:.7; }
        .ota-notice-actions button:focus-visible { outline:3px solid #e4ac13; outline-offset:3px; }
        .ota-notice-spinner { animation:ota-notice-spin 1s linear infinite; }
        @media (prefers-reduced-motion:reduce) { .ota-update-notice,.ota-notice-spinner { animation:none; } }
      `}</style>
      <div className="ota-notice-heading">
        <span className="ota-notice-icon" aria-hidden="true"><Sparkles size={23} /></span>
        <div role="status" aria-live="polite" aria-atomic="true">
          <h2 id="ota-update-title" className="ota-notice-title">{failed ? 'تعذّر إكمال التحديث' : 'تحديث جديد للعمارة'}</h2>
          <p className="ota-notice-copy">{failed ? 'تأكد من اتصال الإنترنت وحاول مرة أخرى، أو أكمل لاحقًا.' : busy ? (phase === 'downloading' ? 'جارٍ تنزيل التحديث، انتظر قليلًا…' : 'جارٍ تطبيق التحديث وإعادة فتح التطبيق…') : 'نسخة أحدث متاحة. احفظ أي شغل مفتوح قبل التحديث؛ التطبيق هيعيد الفتح.'}</p>
        </div>
      </div>
      <div className="ota-notice-actions">
        <button type="button" className="ota-notice-now" disabled={busy} onClick={() => void applyOtaUpdate()}>
          {busy ? <LoaderCircle size={17} className="ota-notice-spinner" aria-hidden="true" /> : <Download size={17} aria-hidden="true" />}
          {busy ? 'جارٍ التحديث…' : failed ? 'حاول مرة أخرى' : 'حدّث الآن'}
        </button>
        <button type="button" className="ota-notice-later" disabled={busy} onClick={deferOtaUpdate}>لاحقًا</button>
      </div>
    </aside>
  );
}
