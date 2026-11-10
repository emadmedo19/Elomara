import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { isNeonBackend } from '../lib/neon';
import { useAuth } from '../context/AuthContext';
import { DestructiveActionDialog } from './DestructiveActionDialog';

type Successor = { user_id: string; full_name: string; email: string; role: string; approved: boolean; disabled_at: string | null; apartment_id: string | null; building_id: string | null };
const confirmationText = 'حذف حسابي نهائيًا';
export function AccountDeletionButton() {
  const { user, userProfile, isAdmin, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successors, setSuccessors] = useState<Successor[]>([]);
  const [successor, setSuccessor] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const requiresSuccessor = isAdmin && Boolean(userProfile?.buildingId);
  if (!isNeonBackend) return null;
  const show = async () => {
    setOpen(true); setError(''); setConfirmation(''); setSuccessor(''); setSuccessors([]);
    if (!requiresSuccessor) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('list_building_users');
      if (error) throw error;
      setSuccessors(((data || []) as Successor[]).filter(p => p.user_id !== user?.id && p.building_id === userProfile?.buildingId && p.approved && !p.disabled_at && p.apartment_id && ['owner', 'tenant'].includes(p.role)));
    } catch { setError('تعذر تحميل السكان المعتمدين. أغلق النافذة وحاول مرة أخرى.'); }
    finally { setLoading(false); }
  };
  const remove = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || loading || confirmation !== confirmationText || (requiresSuccessor && !successor)) return;
    setBusy(true); setError('');
    try {
      const { error } = await supabase.rpc('delete_account_with_successor', { confirmation, successor_id: requiresSuccessor ? successor : null });
      if (error) throw error;
    } catch (failure) { setError(failure instanceof Error ? failure.message : (failure as {message?:string})?.message || 'تعذر حذف الحساب. لم يتم إكمال العملية.'); setBusy(false); return; }
    // Account and sessions are already gone. Always leave the old account UI,
    // even if clearing the now-invalid native session reports an error.
    try { await signOut(); } catch { /* The deleted account has no valid session to retain. */ }
    window.location.replace(window.location.pathname);
  };
  return <>
    <button type="button" onClick={() => void show()} className="mt-5 w-full flex items-center justify-center gap-2 rounded-2xl border border-red-300 bg-red-50 px-4 py-4 font-bold text-red-700"><Trash2 size={20}/>حذف الحساب</button>
    {open && <DestructiveActionDialog title="حذف الحساب" busy={busy} onClose={() => setOpen(false)}>
      <form onSubmit={remove} className="space-y-4">
        <p className="text-sm leading-7">سيُحذف حسابك وبيانات دخولك وجلساتك نهائيًا. سجلات العمارة والمدفوعات المشتركة تظل محفوظة، وحذف الحساب لا يحذف حساب Google نفسه.</p>
        {requiresSuccessor && <div className="space-y-2"><p className="text-sm font-bold">لازم تعيّن مديرًا بديلًا من السكان المعتمدين في نفس العمارة. ستنتقل له صلاحيات الإدارة عند تأكيد الحذف.</p>
          {loading ? <p role="status">جارٍ تحميل السكان…</p> : successors.length ? <label className="block text-sm">المدير البديل<select required disabled={busy} value={successor} onChange={e => setSuccessor(e.target.value)} className="mt-2 w-full rounded-xl border p-3"><option value="">اختار ساكنًا</option>{successors.map(p => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email}</option>)}</select></label> : <p className="text-sm text-red-700">لا يوجد ساكن معتمد مؤهل حاليًا. اربط ساكنًا بشقة واعتمد حسابه أولًا؛ لن يُحذف حسابك بدون مدير بديل.</p>}
        </div>}
        <label className="block text-sm">للتأكيد اكتب: <strong>{confirmationText}</strong><input aria-label="تأكيد حذف الحساب" autoComplete="off" disabled={busy} value={confirmation} onChange={e => setConfirmation(e.target.value)} className="mt-2 w-full rounded-xl border p-3"/></label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy || loading || confirmation !== confirmationText || (requiresSuccessor && !successor)} className="w-full rounded-xl bg-red-700 p-3 font-bold text-white disabled:opacity-40">{busy ? 'جارٍ حذف الحساب…' : requiresSuccessor ? 'تعيين المدير البديل وحذف حسابي نهائيًا' : 'حذف حسابي نهائيًا'}</button>
      </form>
    </DestructiveActionDialog>}
  </>;
}
