import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Copy, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Apartment } from '../types';
import { useAuth } from '../context/AuthContext';

type RequestRow = { id:string; full_name:string; requested_floor:number; requested_unit_number:string; resident_type:string; status:string; created_at:string };

export const RegistrationApprovalsView: React.FC<{ apartments: Apartment[] }> = ({ apartments }) => {
  const { userProfile } = useAuth();
  const buildingId = userProfile?.buildingId;
  const [rows,setRows] = useState<RequestRow[]>([]);
  const [chosen,setChosen] = useState<Record<string,string>>({});
  const [code,setCode] = useState('');
  const [revoked,setRevoked] = useState(false);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');

  const load = useCallback(async () => {
    if (!buildingId) { setLoading(false); return; }
    setLoading(true);
    const [requests,invite] = await Promise.all([
      supabase.from('building_join_requests').select('id,full_name,requested_floor,requested_unit_number,resident_type,status,created_at').eq('building_id',buildingId).order('created_at',{ascending:false}),
      supabase.from('building_access_codes').select('code,revoked_at').eq('building_id',buildingId).maybeSingle()
    ]);
    if (requests.error) setError(requests.error.message); else setRows((requests.data||[]) as RequestRow[]);
    if (invite.error) setError(invite.error.message);
    setCode(invite.data?.code||''); setRevoked(Boolean(invite.data?.revoked_at)); setLoading(false);
  },[buildingId]);
  useEffect(()=>{void load();},[load]);

  const createCode = async () => {
    if(!buildingId)return;
    setBusy(true);setError('');setMessage('');
    const {data,error:e}=await supabase.rpc('create_or_rotate_building_access_code',{target_building_id:buildingId});
    if(e)setError(e.message);else{setCode(String(data));setRevoked(false);setMessage('تم إنشاء الكود، وأي كود سابق أصبح غير صالح.');}
    setBusy(false);
  };
  const revokeCode = async () => {
    if(!buildingId)return;
    setBusy(true);setError('');setMessage('');
    const {error:e}=await supabase.rpc('revoke_building_access_code',{target_building_id:buildingId});
    if(e)setError(e.message);else{setRevoked(true);setMessage('تم إلغاء الكود.');}
    setBusy(false);
  };
  const decide = async (id:string,accept:boolean) => {
    if(accept&&!chosen[id]){setError('اختار الشقة الفعلية قبل الموافقة.');return;}
    setBusy(true);setError('');setMessage('');
    const result=accept
      ? await supabase.rpc('approve_building_join_request',{target_request_id:id,target_apartment_id:chosen[id]})
      : await supabase.rpc('reject_building_join_request',{target_request_id:id});
    if(result.error)setError(result.error.message);else{setMessage(accept?'تم اعتماد الساكن وربطه بالشقة.':'تم رفض الطلب.');await load();}
    setBusy(false);
  };

  return <section className="max-w-4xl mx-auto space-y-4" dir="rtl">
    <div className="rounded-3xl bg-[#10283a] text-white p-5">
      <div className="flex items-center justify-between"><div className="flex gap-3 items-center"><ShieldCheck className="h-8 w-8 text-teal-300"/><div><h2 className="text-xl font-bold">طلبات انضمام السكان</h2><p className="text-sm text-slate-300">مراجعة الطلبات واعتماد الشقق.</p></div></div><button onClick={()=>void load()}><RefreshCw className={loading?'animate-spin':''}/></button></div>
      <p className="mt-3 text-sm text-teal-200">{rows.filter(r=>r.status==='pending').length} طلب قيد المراجعة</p>
    </div>
    <div className="rounded-2xl border bg-white p-4 space-y-3">
      <h3 className="font-bold">كود العمارة العام</h3>
      <p className="text-xs text-slate-500">شارك الكود مع السكان. اختيار الشقة يتم بواسطة المدير بعد مراجعة الطلب.</p>
      {code&&<div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><div><code dir="ltr" className="text-lg font-black tracking-widest">{code}</code><p className="text-xs">{revoked?'ملغي':'فعال'}</p></div><button disabled={revoked} onClick={()=>void navigator.clipboard?.writeText(code)} className="flex gap-2 text-teal-700"><Copy/>نسخ</button></div>}
      <div className="grid grid-cols-2 gap-2"><button disabled={busy} onClick={()=>void createCode()} className="rounded-xl bg-teal-700 p-3 text-white font-bold">{code?'تجديد الكود':'إنشاء كود'}</button><button disabled={busy||!code||revoked} onClick={()=>void revokeCode()} className="rounded-xl border border-rose-200 p-3 text-rose-700 font-bold">إلغاء الكود</button></div>
    </div>
    {error&&<p className="rounded-xl bg-rose-50 p-3 text-rose-700 text-sm"><AlertCircle className="inline ml-2"/>{error}</p>}
    {message&&<p className="rounded-xl bg-teal-50 p-3 text-teal-800 text-sm">{message}</p>}
    {loading?<p className="rounded-xl bg-white p-6 text-center">جارٍ التحميل...</p>:rows.length===0?<div className="rounded-xl bg-white p-8 text-center"><CheckCircle2 className="mx-auto mb-2 text-teal-600"/>لا توجد طلبات.</div>:rows.map(r=><article key={r.id} className="rounded-2xl border bg-white p-4 space-y-3">
      <div className="flex justify-between"><div><b>{r.full_name}</b><p className="text-sm text-slate-500">الدور {r.requested_floor} • شقة {r.requested_unit_number} • {r.resident_type==='owner'?'مالك':'مستأجر'}</p></div><span className="text-xs font-bold">{r.status==='pending'?'قيد المراجعة':r.status==='approved'?'مقبول':'مرفوض'}</span></div>
      {r.status==='pending'&&<><select value={chosen[r.id]||''} onChange={e=>setChosen(v=>({...v,[r.id]:e.target.value}))} className="w-full rounded-xl border p-3"><option value="">اختيار الشقة الفعلية</option>{apartments.map(a=><option key={a.id} value={a.id}>شقة {a.unitNumber} — الدور {a.floor}</option>)}</select><div className="grid grid-cols-2 gap-2"><button disabled={busy||!chosen[r.id]} onClick={()=>void decide(r.id,true)} className="rounded-xl bg-teal-700 p-3 text-white font-bold">موافقة وربط</button><button disabled={busy} onClick={()=>void decide(r.id,false)} className="rounded-xl border border-rose-200 p-3 text-rose-700 font-bold">رفض الطلب</button></div></>}
    </article>)}
  </section>;
};
