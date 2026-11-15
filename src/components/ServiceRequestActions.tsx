import React, { useState } from 'react';
export function ServiceRequestActions({ status, note = '', statuses, onSave }: {
  status: string; note?: string; statuses: string[]; onSave: (status: string, note: string) => Promise<boolean>;
}) {
  const [next, setNext] = useState(status);
  const [text, setText] = useState(note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <form className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3" onSubmit={async event => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { if (!await onSave(next, text.trim())) setError('تعذر حفظ التحديث. حاول مرة أخرى.'); }
    catch { setError('تعذر الاتصال. لم يتم تأكيد حفظ التحديث.'); }
    finally { setBusy(false); }
  }}>
    <label className="block text-xs font-bold">حالة الطلب<select aria-label="حالة الطلب" value={next} disabled={busy} onChange={e => setNext(e.target.value)} className="mt-1 w-full rounded-xl border bg-white p-3">{statuses.map(value => <option key={value}>{value}</option>)}</select></label>
    <label className="block text-xs">ملاحظة للساكن (اختياري)<textarea aria-label="ملاحظة للساكن" maxLength={1000} value={text} disabled={busy} onChange={e => setText(e.target.value)} className="mt-1 w-full rounded-xl border bg-white p-3" rows={2}/></label>
    <button type="submit" disabled={busy || (next === status && text.trim() === note)} className="min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'جارٍ الحفظ...' : 'حفظ حالة الطلب'}</button>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
  </form>;
}
