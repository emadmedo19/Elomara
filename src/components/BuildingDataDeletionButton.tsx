import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Building } from '../types';
import { supabase } from '../lib/supabase';
import { isNeonBackend } from '../lib/neon';
import { DestructiveActionDialog } from './DestructiveActionDialog';

export function BuildingDataDeletionButton({ building }: { building: Building }) {
  const [open, setOpen] = useState(false);
  const [operation, setOperation] = useState<'' | 'reset' | 'delete'>('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!isNeonBackend || !building.id) return null;
  const phrase = `${operation === 'reset' ? 'تصفير سجلات' : 'حذف عمارة'} ${building.name}`;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!operation || busy || confirmation !== phrase) return;
    setBusy(true); setError('');
    try {
      const { error } = await supabase.rpc('clear_building_data', { target_building_id: building.id, operation, confirmation });
      if (error) throw error;
    } catch (failure) {
      setError((failure as { message?: string })?.message || 'تعذر إكمال العملية. حاول مرة أخرى.'); setBusy(false); return;
    }
    window.location.replace(window.location.pathname);
  };
  return <div className="mt-6 border-t border-red-200 pt-5">
    <button type="button" onClick={() => { setOpen(true); setOperation(''); setConfirmation(''); setError(''); }} className="w-full flex justify-center items-center gap-2 rounded-2xl border border-red-300 bg-red-50 p-4 font-bold text-red-700"><Trash2 size={20}/>حذف كل بيانات العمارة</button>
    {open && <DestructiveActionDialog title="حذف كل بيانات العمارة" busy={busy} onClose={() => setOpen(false)}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm">العمارة المحددة: <strong>{building.name}</strong>. هذه العملية نهائية ولا يمكن التراجع عنها من التطبيق.</p>
        <fieldset disabled={busy} className="space-y-3"><legend className="font-bold mb-2">اختار العملية</legend>
          <label className="block rounded-xl border p-3"><input type="radio" name="clear-operation" checked={operation === 'reset'} onChange={() => { setOperation('reset'); setConfirmation(''); }}/><strong className="mr-2">تصفير السجلات فقط</strong><span className="block text-sm leading-7 mt-2">حذف المدفوعات والمصروفات وسجل التدقيق والبلاغات والحجوزات والإعلانات والتصويتات والتحصيلات الاستثنائية والإشعارات، وتصفير الخزينة ووديعة الصيانة وأرصدة السداد. تبقى العمارة والشقق والسكان والصلاحيات وإعدادات التحصيل.</span></label>
          <label className="block rounded-xl border border-red-200 p-3"><input type="radio" name="clear-operation" checked={operation === 'delete'} onChange={() => { setOperation('delete'); setConfirmation(''); }}/><strong className="mr-2 text-red-700">حذف العمارة بالكامل</strong><span className="block text-sm leading-7 mt-2">حذف العمارة والشقق وكل السجلات والإعدادات وأكواد وطلبات الانضمام، وفصل السكان عنها. حسابات السكان تظل موجودة ويمكنهم طلب الانضمام لعمارة أخرى.</span></label>
        </fieldset>
        {operation && <label className="block text-sm">للتأكيد اكتب: <strong>{phrase}</strong><input aria-label="تأكيد حذف بيانات العمارة" autoComplete="off" disabled={busy} value={confirmation} onChange={e => setConfirmation(e.target.value)} className="mt-2 w-full rounded-xl border p-3"/></label>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy || !operation || confirmation !== phrase} className="w-full rounded-xl bg-red-700 p-3 font-bold text-white disabled:opacity-40">{busy ? 'جارٍ تنفيذ العملية…' : operation === 'reset' ? 'تصفير السجلات نهائيًا' : 'حذف العمارة وكل بياناتها نهائيًا'}</button>
      </form>
    </DestructiveActionDialog>}
  </div>;
}
