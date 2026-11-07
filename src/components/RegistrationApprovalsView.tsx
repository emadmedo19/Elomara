import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Copy, RefreshCw, ShieldCheck, Trash2, Save, Users, Search, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Apartment } from '../types';
import { useAuth } from '../context/AuthContext';

type RequestRow = { id:string; user_id:string; full_name:string; requested_floor:number; requested_unit_number:string; resident_type:string; requested_label:string; status:string; created_at:string };
type MemberRow = { id:string; full_name:string; apartment_id:string; resident_label:string; role:string };
const requestLabel = (row:RequestRow) => row.requested_label || (row.resident_type==='owner'?'مالك':'مستأجر');
const normalizeSearch = (value:string) => value.normalize('NFKC').toLocaleLowerCase('ar-EG')
  .replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي')
  .replace(/[٠-٩۰-۹]/g,digit=>String(digit.charCodeAt(0)-(digit.charCodeAt(0)>=0x06f0?0x06f0:0x0660)));
const matchesSearch = (text:string,terms:string[]) => {
  const normalized=normalizeSearch(text);
  return terms.every(term=>normalized.includes(term));
};

// Fetch every page so search also finds residents beyond the API row limit.
async function readAllRows<T>(fetchPage:(start:number,end:number)=>PromiseLike<{ data:T[]|null; error:{message:string}|null }>) {
  const data:T[]=[];
  for(let start=0;;start+=500){
    const page=await fetchPage(start,start+499);
    if(page.error)return {data:null,error:page.error};
    data.push(...(page.data||[]));
    if(!page.data||page.data.length<500)return {data,error:null};
  }
}

export const RegistrationApprovalsView: React.FC<{ apartments: Apartment[] }> = ({ apartments }) => {
  const { userProfile } = useAuth();
  const buildingId = userProfile?.buildingId;
  const scope = useRef(buildingId); scope.current=buildingId;
  const [searchQuery,setSearchQuery] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const [rows,setRows] = useState<RequestRow[]>([]);
  const [members,setMembers] = useState<MemberRow[]>([]);
  const [chosen,setChosen] = useState<Record<string,string>>({});
  const [labels,setLabels] = useState<Record<string,string>>({});
  const [memberLabels,setMemberLabels] = useState<Record<string,string>>({});
  const [removing,setRemoving] = useState<MemberRow|null>(null);
  const [code,setCode] = useState('');
  const [revoked,setRevoked] = useState(false);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const removeButton = useRef<HTMLButtonElement>(null);
  const deleteTrigger = useRef<HTMLButtonElement|null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy); busyRef.current=busy;

  const load = useCallback(async () => {
    if (!buildingId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [requests,invite,people] = await Promise.all([
        readAllRows<RequestRow>((start,end)=>supabase.from('building_join_requests').select('id,user_id,full_name,requested_floor,requested_unit_number,resident_type,requested_label,status,created_at').eq('building_id',buildingId).order('created_at',{ascending:false}).order('id',{ascending:false}).range(start,end)),
        supabase.from('building_access_codes').select('code,revoked_at').eq('building_id',buildingId).maybeSingle(),
        readAllRows<MemberRow>((start,end)=>supabase.from('profiles').select('id,full_name,apartment_id,resident_label,role').eq('building_id',buildingId).eq('approved',true).is('disabled_at',null).in('role',['owner','tenant']).order('full_name').order('id').range(start,end)),
      ]);
      if (scope.current!==buildingId) return;
      const failure=requests.error||invite.error||people.error;
      if(failure){setError(failure.message);return;}
      setRows((requests.data||[]) as RequestRow[]);setMembers((people.data||[]) as MemberRow[]);
      setCode(invite.data?.code||'');setRevoked(Boolean(invite.data?.revoked_at));
    } catch { if(scope.current===buildingId)setError('تعذر تحميل الأعضاء والطلبات. حاول مرة أخرى.'); }
    finally { if(scope.current===buildingId)setLoading(false); }
  },[buildingId]);
  useEffect(()=>{setSearchQuery('');setRows([]);setMembers([]);setChosen({});setLabels({});setMemberLabels({});setRemoving(null);void load();},[load]);
  useEffect(()=>{
    if(!removing)return;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    removeButton.current?.focus();
    const escape=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&!busyRef.current){event.stopImmediatePropagation();setRemoving(null);}
      if(event.key==='Tab'){
        const buttons=Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]);
        const first=buttons[0],last=buttons.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    const back=(event:PopStateEvent)=>{event.stopImmediatePropagation();if(!busyRef.current)setRemoving(null);};
    document.addEventListener('keydown',escape,true);window.addEventListener('popstate',back,true);
    return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',escape,true);window.removeEventListener('popstate',back,true);deleteTrigger.current?.focus();};
  },[removing]);

  const act = async (action:()=>Promise<void>) => {
    if(busy)return;
    setBusy(true);setError('');setMessage('');
    try{await action();}catch{setError('تعذر الاتصال بالخادم. حدّث البيانات للتحقق من النتيجة.');}finally{setBusy(false);}
  };
  const createCode = () => act(async()=>{
    if(!buildingId)return;
    const {data,error:e}=await supabase.rpc('create_or_rotate_building_access_code',{target_building_id:buildingId});
    if(e)setError(e.message);else{setCode(String(data));setRevoked(false);setMessage('تم إنشاء الكود، وأي كود سابق أصبح غير صالح.');}
  });
  const revokeCode = () => act(async()=>{
    if(!buildingId)return;
    const {error:e}=await supabase.rpc('revoke_building_access_code',{target_building_id:buildingId});
    if(e)setError(e.message);else{setRevoked(true);setMessage('تم إلغاء الكود.');}
  });
  const decide = (row:RequestRow,accept:boolean) => act(async()=>{
    const label=(labels[row.id]??requestLabel(row)).trim();
    if(accept&&(!chosen[row.id]||!label)){setError('اختار الشقة واكتب الصفة قبل الموافقة.');return;}
    const result=accept
      ? await supabase.rpc('approve_building_join_request_with_label',{target_request_id:row.id,target_apartment_id:chosen[row.id],member_label:label})
      : await supabase.rpc('reject_building_join_request',{target_request_id:row.id});
    if(result.error)setError(result.error.message);else{setMessage(accept?'تم اعتماد العضو وربطه بالشقة بالصفة المحددة.':'تم رفض الطلب.');await load();}
  });
  const saveLabel = (member:MemberRow) => act(async()=>{
    const label=(memberLabels[member.id]??(member.resident_label||(member.role==='owner'?'مالك':'مستأجر'))).trim();
    if(!label){setError('اكتب الصفة قبل الحفظ.');return;}
    const {error:e}=await supabase.rpc('set_building_member_label',{target_building_id:buildingId,target_user_id:member.id,member_label:label});
    if(e)setError(e.message);else{setMessage('تم حفظ صفة العضو.');setMemberLabels(current=>{const next={...current};delete next[member.id];return next;});await load();}
  });
  const removeMember = () => act(async()=>{
    if(!removing||!buildingId)return;
    const {error:e}=await supabase.rpc('remove_building_member',{target_building_id:buildingId,target_user_id:removing.id});
    if(e){setError(e.message);setRemoving(null);return;}
    setRemoving(null);setMessage('تم حذف عضوية الحساب من العمارة. يمكنه تسجيل الدخول وتقديم طلب انضمام جديد بالكود. سجلات الشقة والمدفوعات محفوظة.');await load();
  });
  const apartmentById=useMemo(()=>new Map(apartments.map(apartment=>[apartment.id,apartment])),[apartments]);
  const terms=useMemo(()=>normalizeSearch(searchQuery).trim().split(/\s+/).filter(Boolean),[searchQuery]);
  const pendingAndRejected=useMemo(()=>rows.filter(row=>row.status!=='approved'),[rows]);
  const visibleRequests=useMemo(()=>pendingAndRejected.filter(row=>matchesSearch(
    `${row.full_name} شقة ${row.requested_unit_number} الدور ${row.requested_floor} ${requestLabel(row)}`,terms
  )),[pendingAndRejected,terms]);
  const visibleMembers=useMemo(()=>members.filter(member=>{
    const apartment=apartmentById.get(member.apartment_id);
    return matchesSearch(`${member.full_name} ${apartment?`شقة ${apartment.unitNumber} الدور ${apartment.floor}`:'شقة غير محددة'} ${member.resident_label||(member.role==='owner'?'مالك':'مستأجر')}`,terms);
  }),[members,apartmentById,terms]);
  return <section className="max-w-4xl mx-auto space-y-4" dir="rtl">
    <div className="rounded-3xl bg-[#10283a] text-white p-5">
      <div className="flex items-center justify-between gap-3"><div className="flex gap-3 items-center"><ShieldCheck className="h-8 w-8 text-teal-300 shrink-0"/><div><h2 className="text-xl font-bold">طلبات انضمام السكان</h2><p className="text-sm text-slate-300">مراجعة الطلبات وإدارة أعضاء الشقق.</p></div></div><button type="button" aria-label="تحديث الأعضاء والطلبات" disabled={busy||loading} onClick={()=>void load()}><RefreshCw className={loading?'animate-spin':''}/></button></div>
      <p className="mt-3 text-sm text-teal-200">{rows.filter(r=>r.status==='pending').length} طلب قيد المراجعة • {members.length} عضو مسجل</p>
    </div>
    <div className="rounded-2xl border bg-white p-4 space-y-3">
      <h3 className="font-bold">كود العمارة العام</h3>
      <p className="text-xs leading-6 text-slate-500">شارك الكود مع السكان وأفراد الأسرة. يمكنك ربط أكثر من عضو بنفس الشقة، وتحديد صفة كل عضو وقت الموافقة.</p>
      {code&&<div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><div className="min-w-0"><code dir="ltr" className="text-lg font-black tracking-widest break-all">{code}</code><p className="text-xs">{revoked?'ملغي':'فعال'}</p></div><button type="button" disabled={revoked} onClick={()=>void navigator.clipboard?.writeText(code)} className="flex gap-2 text-teal-700 shrink-0"><Copy/>نسخ</button></div>}
      <div className="grid grid-cols-2 gap-2"><button type="button" disabled={busy} onClick={()=>void createCode()} className="rounded-xl bg-teal-700 p-3 text-white font-bold">{code?'تجديد الكود':'إنشاء كود'}</button><button type="button" disabled={busy||!code||revoked} onClick={()=>void revokeCode()} className="rounded-xl border border-rose-200 p-3 text-rose-700 font-bold">إلغاء الكود</button></div>
    </div>
    <div className="rounded-2xl border bg-white p-4 space-y-2">
      <label htmlFor="member-search" className="block text-sm font-bold text-slate-800">البحث في الطلبات والأعضاء</label>
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100">
        <Search className="h-5 w-5 shrink-0 text-teal-700" aria-hidden="true"/>
        <input ref={searchInput} id="member-search" type="text" role="searchbox" enterKeyHint="search" value={searchQuery} onChange={event=>setSearchQuery(event.target.value)} placeholder="الاسم، رقم الشقة، الدور أو الصفة…" aria-describedby="member-search-help" style={{border:0,boxShadow:'none'}} className="w-full min-w-0 bg-transparent py-3 text-sm text-slate-800 outline-none"/>
        {searchQuery&&<button type="button" aria-label="مسح البحث" onClick={()=>{setSearchQuery('');searchInput.current?.focus();}} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-200"><X className="h-4 w-4" aria-hidden="true"/></button>}
      </div>
      <p id="member-search-help" className="text-xs leading-6 text-slate-500">ابحث بالاسم أو رقم الشقة أو الدور أو الصفة، بالعربي أو بالإنجليزي.</p>
      {!loading&&terms.length>0&&<p role="status" aria-live="polite" className="text-xs text-teal-800">عرض {visibleRequests.length} من {pendingAndRejected.length} طلب • {visibleMembers.length} من {members.length} عضو</p>}
    </div>
    {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-rose-700 text-sm"><AlertCircle className="inline ml-2"/>{error}</p>}
    {message&&<p role="status" className="rounded-xl bg-teal-50 p-3 text-teal-800 text-sm leading-7">{message}</p>}
    {loading?<p role="status" className="rounded-xl bg-white p-6 text-center">جارٍ التحميل...</p>:<>
      {visibleRequests.map(r=><article key={r.id} className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="flex justify-between gap-3"><div className="min-w-0"><b className="break-words">{r.full_name}</b><p className="text-sm text-slate-500">الدور {r.requested_floor} • شقة {r.requested_unit_number} • {requestLabel(r)}</p></div><span className="text-xs font-bold shrink-0">{r.status==='pending'?'قيد المراجعة':'مرفوض'}</span></div>
        {r.status==='pending'&&<><label className="block text-xs font-bold">الشقة الفعلية<select aria-label={`الشقة الفعلية للعضو ${r.full_name}`} disabled={busy} value={chosen[r.id]||''} onChange={e=>setChosen(v=>({...v,[r.id]:e.target.value}))} className="mt-2 w-full rounded-xl border p-3"><option value="">اختيار الشقة الفعلية</option>{apartments.map(a=><option key={a.id} value={a.id}>شقة {a.unitNumber} — الدور {a.floor}</option>)}</select></label>
          <label className="block text-xs font-bold">الصفة التي تحددها أنت<input aria-label={`صفة العضو ${r.full_name}`} disabled={busy} value={labels[r.id]??requestLabel(r)} maxLength={60} onChange={e=>setLabels(v=>({...v,[r.id]:e.target.value}))} placeholder="مثال: زوجة، ابن، ساكن، مالك" className="mt-2 w-full rounded-xl border p-3 text-sm font-normal"/></label>
          <div className="grid grid-cols-2 gap-2"><button type="button" disabled={busy||!chosen[r.id]} onClick={()=>void decide(r,true)} className="rounded-xl bg-teal-700 p-3 text-white font-bold">موافقة وربط</button><button type="button" disabled={busy} onClick={()=>void decide(r,false)} className="rounded-xl border border-rose-200 p-3 text-rose-700 font-bold">رفض الطلب</button></div>
        </>}
      </article>)}
      <h3 className="flex items-center gap-2 font-bold pt-2"><Users className="h-5 w-5 text-teal-700"/>الأعضاء المسجلون ({terms.length>0?`${visibleMembers.length} من ${members.length}`:members.length})</h3>
      {visibleMembers.length===0?<div className="rounded-xl bg-white p-6 text-center text-sm text-slate-500"><CheckCircle2 className="mx-auto mb-2 text-teal-600"/>{terms.length>0?'لا توجد نتائج مطابقة للأعضاء. جرّب اسمًا أو رقم شقة آخر.':'لا يوجد أعضاء مسجلون حاليًا.'}</div>:visibleMembers.map(member=>{const apt=apartmentById.get(member.apartment_id);const label=memberLabels[member.id]??(member.resident_label||(member.role==='owner'?'مالك':'مستأجر'));return <article key={member.id} className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><b className="break-words">{member.full_name}</b><p className="text-sm text-slate-500 mt-1">{apt?`الدور ${apt.floor} • شقة ${apt.unitNumber}`:'شقة غير محددة'} • {member.resident_label||(member.role==='owner'?'مالك':'مستأجر')}</p></div><button type="button" aria-label={`حذف العضو ${member.full_name}`} disabled={busy} onClick={event=>{deleteTrigger.current=event.currentTarget;setRemoving(member);}} className="flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 shrink-0"><Trash2 className="h-4 w-4"/>حذف</button></div>
        <div className="flex items-end gap-2"><label className="flex-1 min-w-0 block text-xs text-slate-500">الصفة<input aria-label={`تعديل صفة ${member.full_name}`} disabled={busy} maxLength={60} value={label} onChange={e=>setMemberLabels(v=>({...v,[member.id]:e.target.value}))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm text-slate-800"/></label><button type="button" aria-label={`حفظ صفة ${member.full_name}`} disabled={busy||label===(member.resident_label||(member.role==='owner'?'مالك':'مستأجر'))||!label.trim()} onClick={()=>void saveLabel(member)} className="flex items-center justify-center gap-1 rounded-xl bg-teal-700 px-3 py-2 text-xs font-bold text-white min-h-10"><Save className="h-4 w-4"/>حفظ</button></div>
      </article>})}
    </>}
    {removing&&createPortal(<div dir="rtl" className="fixed inset-0 z-[10040] bg-slate-950/50 flex items-center justify-center p-4" onClick={e=>{if(e.target===e.currentTarget&&!busy)setRemoving(null);}}><div ref={dialogRef} data-remove-member-dialog role="alertdialog" aria-modal="true" aria-labelledby="remove-member-title" aria-describedby="remove-member-copy" className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl text-slate-800">
      <h3 id="remove-member-title" className="font-bold text-lg text-rose-800">حذف عضوية {removing.full_name}؟</h3><p id="remove-member-copy" className="mt-3 text-sm leading-7 text-slate-600">هيتم فصل الحساب عن العمارة وإلغاء صلاحياته. يقدر يسجّل الدخول بنفس الحساب ويقدّم طلب انضمام جديد بالكود. بيانات الشقة والمدفوعات وباقي أفراد الأسرة مش هتتحذف.</p>
      <div className="flex gap-3 mt-5"><button ref={removeButton} type="button" disabled={busy} onClick={()=>setRemoving(null)} className="flex-1 rounded-xl bg-slate-100 px-4 py-3 font-bold">إلغاء</button><button type="button" disabled={busy} onClick={()=>void removeMember()} className="flex-1 rounded-xl bg-rose-700 px-4 py-3 font-bold text-white">{busy?'جارٍ الحذف...':'تأكيد حذف العضو'}</button></div>
    </div></div>,document.body)}
  </section>;
};
