import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock3, RefreshCw, ShieldCheck, UserRound, AlertCircle, Crown, Trash2, UserCheck, Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Apartment } from '../types';
import { useAuth } from '../context/AuthContext';

interface UserRow {
  user_id: string;
  email: string | null;
  full_name: string;
  role: string;
  approved: boolean;
  building_id: string | null;
  apartment_id: string | null;
  registered_at: string;
  disabled_at: string | null;
}

export const RegistrationApprovalsView: React.FC<{ apartments: Apartment[] }> = ({ apartments }) => {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { userProfile } = useAuth();
  const isBuildingAdmin = userProfile?.role === 'building_admin' || userProfile?.role === 'assistant_admin';
  const [inviteName, setInviteName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteApartmentId, setInviteApartmentId] = useState('');
  const [createdInviteCode, setCreatedInviteCode] = useState('');
  const [whatsappInviteUrl, setWhatsappInviteUrl] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const { data: authData } = await supabase.auth.getUser();
    setCurrentUserId(authData.user?.id ?? null);
    const { data, error: requestError } = await supabase.rpc(isBuildingAdmin ? 'list_building_users' : 'list_all_bunyan_users');
    if (requestError) { setError(requestError.message); setRows([]); }
    else setRows((data || []) as UserRow[]);
    setLoading(false);
  }, [isBuildingAdmin]);

  useEffect(() => { void load(); }, [load]);

  const createInvite = async () => {
    if (!inviteName.trim() || !invitePhone.trim() || !inviteApartmentId || !userProfile?.buildingId) {
      setError('اكتب اسم الساكن ورقم موبايله واختار الشقة.'); return;
    }
    setBusyId('invite'); setError(''); setNotice(''); setCreatedInviteCode(''); setWhatsappInviteUrl('');
    const { data, error: inviteError } = await supabase.rpc('create_building_phone_invite', {
      target_building_id: userProfile.buildingId, target_apartment_id: inviteApartmentId,
      target_phone: invitePhone.trim(), target_name: inviteName.trim(),
    });
    if (inviteError) setError(inviteError.message);
    else {
      const result = Array.isArray(data) ? data[0] : data;
      const code = result?.invite_code;
      if (code) {
        setCreatedInviteCode(code);
        const inviteUrl = new URL(window.location.href); inviteUrl.searchParams.set('invite', code);
        const digits = invitePhone.replace(/\\D/g, '').replace(/^0/, '20');
        const message = 'أهلاً ' + inviteName + '، دي دعوة للانضمام إلى تطبيق العمارة.' + '\\n\\nرابط الدعوة: ' + inviteUrl.toString() + '\\nكود الدعوة: ' + code + '\\n\\nالدعوة صالحة لمدة 48 ساعة، ولازم تنشئ حساب برقم الموبايل نفسه وتستخدمه عند تسجيل الدخول.';
        setWhatsappInviteUrl('https://wa.me/' + digits + '?text=' + encodeURIComponent(message));
        setNotice('تم إنشاء الدعوة. ابعتها للساكن على واتساب؛ ينشئ حسابًا بنفس الرقم وكلمة مرور، ثم يقبل الدعوة.');
      } else setError('لم يتم استلام كود الدعوة.');
    }
    setBusyId(null);
  };
  const approve = async (id: string) => {
    const apartmentId = assignments[id];
    if (!apartmentId) { setError('اختار الشقة الأول قبل اعتماد الحساب.'); return; }
    setBusyId(id); setError(''); setNotice('');
    const { data, error: actionError } = await supabase.rpc('approve_and_assign_registration', {
      target_user_id: id, target_apartment_id: apartmentId,
    });
    if (actionError) setError(actionError.message);
    else if (data) { setNotice('تم قبول الحساب وتخصيص الشقة.'); await load(); }
    else setError('لم يتم حفظ التخصيص؛ حدّث القائمة وحاول مرة أخرى.');
    setBusyId(null);
  };

  const changeRole = async (row: UserRow, role: 'super_admin' | 'tenant') => {
    const label = role === 'super_admin' ? 'مدير كامل مثل حسابك' : 'مستخدم عادي';
    if (!window.confirm(`تأكيد تغيير صلاحية ${row.full_name || row.email} إلى ${label}؟`)) return;
    setBusyId(row.user_id); setError(''); setNotice('');
    const { data, error: actionError } = await supabase.rpc('set_bunyan_user_role', {
      target_user_id: row.user_id, target_role: role,
    });
    if (actionError) setError(actionError.message);
    else if (data) { setNotice('تم تحديث صلاحيات الحساب بنجاح.'); await load(); }
    else setError('لم يتم تحديث الصلاحية؛ حدّث القائمة وحاول مرة أخرى.');
    setBusyId(null);
  };

  const disableUser = async (row: UserRow) => {
    if (!window.confirm(`تأكيد تعطيل حساب ${row.full_name || row.email}؟ لن يستطيع تسجيل الدخول، وسيظل سجل العمليات محفوظًا.`)) return;
    setBusyId(row.user_id); setError(''); setNotice('');
    const { data, error: actionError } = await supabase.rpc('disable_bunyan_user', { target_user_id: row.user_id });
    if (actionError) setError(actionError.message);
    else if (data) { setNotice('تم تعطيل الحساب وإلغاء تسجيل جهاز الإشعارات.'); await load(); }
    else setError('لم يتم تعطيل الحساب؛ حدّث القائمة وحاول مرة أخرى.');
    setBusyId(null);
  };

  const pendingCount = rows.filter(r => !r.disabled_at && (!r.approved || !r.building_id || (!['super_admin', 'assistant_admin', 'building_admin'].includes(r.role) && !r.apartment_id))).length;
  const roleLabel = (row: UserRow) => row.disabled_at ? 'حساب معطّل' :
    row.role === 'super_admin' ? 'مدير كامل' :
    row.role === 'assistant_admin' ? 'مساعد مدير' :
    row.role === 'building_admin' ? 'مدير عقار' :
    row.role === 'owner' ? 'مالك وحدة' :
    row.role === 'tenant' ? 'مستخدم عادي' : 'طلب جديد';

  return <section className="max-w-4xl mx-auto space-y-4" dir="rtl">
    <div className="rounded-3xl bg-[#10283a] text-white p-5 shadow-lg border border-teal-500/20">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3"><div className="w-12 h-12 rounded-2xl bg-teal-500/15 flex items-center justify-center"><ShieldCheck className="w-6 h-6 text-teal-300" /></div>
          <div><h2 className="text-xl font-bold">إدارة المستخدمين والصلاحيات</h2><p className="text-sm text-slate-300 mt-1">عرض كل الحسابات المسجلة، قبول الطلبات، وتعديل الصلاحيات.</p></div>
        </div>
        <button onClick={() => void load()} disabled={loading || busyId !== null} className="p-3 rounded-xl bg-white/10"><RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-teal-200">
        <span className="flex items-center gap-2"><UserRound className="w-4 h-4" />{rows.length} حساب مسجل</span>
        <span className="flex items-center gap-2"><Clock3 className="w-4 h-4" />{pendingCount} طلب يحتاج مراجعة</span>
      </div>
    </div>
    {isBuildingAdmin && <div className="rounded-2xl border border-teal-200 bg-white p-4 space-y-3">
      <div><h3 className="font-bold text-slate-800">دعوة ساكن أو مالك جديد</h3><p className="mt-1 text-xs text-slate-500">بالاسم ورقم الموبايل، والدعوة صالحة 48 ساعة ومخصصة لعمارة وشقة ورقم واحد.</p></div>
      <input type="text" value={inviteName} onChange={e=>setInviteName(e.target.value)} placeholder="اسم الساكن بالكامل" className="w-full rounded-xl border border-slate-300 p-3 text-sm"/>
      <input type="tel" inputMode="tel" dir="ltr" value={invitePhone} onChange={e=>setInvitePhone(e.target.value)} placeholder="01xxxxxxxxx" className="w-full rounded-xl border border-slate-300 p-3 text-sm"/>
      <select value={inviteApartmentId} onChange={e=>setInviteApartmentId(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm">
        <option value="">اختار الشقة</option>{apartments.map(a=><option key={a.id} value={a.id}>شقة {a.unitNumber} — الدور {a.floor}</option>)}
      </select>
      <button onClick={()=>void createInvite()} disabled={busyId!==null || !inviteName.trim() || !invitePhone.trim() || !inviteApartmentId} className="w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busyId==="invite"?"جارٍ إنشاء الدعوة...":"إنشاء دعوة واتساب"}</button>
      {createdInviteCode && <div className="rounded-xl bg-slate-50 p-3 text-sm space-y-2"><p className="font-semibold">كود الدعوة</p><code dir="ltr" className="block break-all">{createdInviteCode}</code><button onClick={()=>{void navigator.clipboard?.writeText(createdInviteCode);}} className="block text-teal-700 font-bold">نسخ الكود</button>{whatsappInviteUrl && <a href={whatsappInviteUrl} target="_blank" rel="noopener noreferrer" className="block rounded-xl bg-[#128C7E] px-4 py-3 text-center font-bold text-white">إرسال الدعوة على واتساب</a>}<p className="text-xs text-amber-700">قبول الدعوة يتطلب حسابًا مسجلًا بنفس رقم الموبايل الموجود في الدعوة.</p></div>}
    </div>}
    {error && <div className="rounded-xl bg-rose-50 text-rose-700 border border-rose-200 p-3 text-sm flex gap-2"><AlertCircle className="w-5 h-5 shrink-0" />{error}</div>}
    {notice && <div className="rounded-xl bg-teal-50 text-teal-800 border border-teal-200 p-3 text-sm">{notice}</div>}
    {loading ? <div className="bg-white rounded-2xl p-8 text-center">جارٍ تحميل الحسابات...</div> :
      rows.length === 0 ? <div className="bg-white rounded-2xl border p-8 text-center"><CheckCircle2 className="w-9 h-9 text-teal-500 mx-auto mb-2" /><b>لا توجد حسابات مسجلة.</b></div> :
      rows.map(row => {
        const isPending = !row.disabled_at && (!row.approved || !row.building_id || (!['super_admin', 'assistant_admin', 'building_admin'].includes(row.role) && !row.apartment_id));
        const isSelf = row.user_id === currentUserId;
        return <article key={row.user_id} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0"><UserRound className="w-8 h-8 text-slate-500 shrink-0" /><div className="min-w-0"><b>{row.full_name || 'مستخدم جديد'}</b><p className="text-sm text-slate-500 break-all" dir="ltr">{row.email}</p><p className="text-xs text-slate-400 mt-1">تاريخ التسجيل: {new Date(row.registered_at).toLocaleDateString('ar-EG')}</p></div></div>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${row.disabled_at ? 'bg-rose-100 text-rose-700' : row.role === 'super_admin' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{roleLabel(row)}</span>
          </div>
          {isPending && <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-2">
            <p className="text-sm font-bold text-amber-800">طلب انضمام يحتاج اعتمادًا أو تخصيص شقة</p>
            <select aria-label="اختيار الشقة" value={assignments[row.user_id] || ''} onChange={e => setAssignments(current => ({...current,[row.user_id]:e.target.value}))} className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-800">
              <option value="">اختر الشقة...</option>{apartments.map(a => <option key={a.id} value={a.id}>شقة {a.unitNumber} — الدور {a.floor} ({a.residentName || 'بدون اسم'})</option>)}
            </select>
            <button onClick={() => void approve(row.user_id)} disabled={busyId !== null || !assignments[row.user_id]} className="w-full rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-5 py-3 font-bold text-sm disabled:opacity-50">{busyId === row.user_id ? 'جارٍ الحفظ...' : 'قبول عادي وتخصيص الشقة'}</button>
          </div>}
          {!isBuildingAdmin && !row.disabled_at && row.role !== 'super_admin' && <button onClick={() => void changeRole(row,'super_admin')} disabled={busyId !== null || isSelf} className="w-full rounded-xl bg-amber-500 hover:bg-amber-600 text-white px-4 py-3 font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"><Crown className="w-4 h-4" />تحويل إلى مدير كامل</button>}
          {!isBuildingAdmin && !row.disabled_at && row.role === 'super_admin' && <button onClick={() => void changeRole(row,'tenant')} disabled={busyId !== null || isSelf} className="w-full rounded-xl bg-slate-700 hover:bg-slate-800 text-white px-4 py-3 font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"><Shield className="w-4 h-4" />إرجاع إلى مستخدم عادي</button>}
          {!isBuildingAdmin && !row.disabled_at && <button onClick={() => void disableUser(row)} disabled={busyId !== null || isSelf} className="w-full rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 px-4 py-3 font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"><Trash2 className="w-4 h-4" />حذف / تعطيل الحساب</button>}
          {!isBuildingAdmin && row.disabled_at && <button onClick={() => void changeRole(row,'tenant')} disabled={busyId !== null} className="w-full rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-4 py-3 font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"><UserCheck className="w-4 h-4" />إعادة تفعيل كمستخدم عادي</button>}
        </article>;
      })}
    {apartments.length === 0 && <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded-xl">أضف الشقق أولًا حتى تتمكن من تخصيص حسابات السكان.</p>}
  </section>;
};
