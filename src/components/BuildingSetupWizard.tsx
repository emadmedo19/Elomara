import React, {useEffect, useRef, useState} from 'react';
import {useAuth} from '../context/AuthContext';
import {supabase} from '../lib/supabase';
import {completeNeonBuildingSetup} from '../lib/neon';
import {currentCollectionMonth,historicalDueMonths} from '../services/historicalCollections';

type UnitDraft={unitNumber:string;residentName:string;monthlyPaid:string;exceptionalPaid:string};
type Props={buildingId?:string;onDone:()=>void;onCancel:()=>void};
const money=(value:number)=>value.toLocaleString('ar-EG',{maximumFractionDigits:2});
const validMoney=(value:string)=>/^\d+(\.\d{1,2})?$/.test(value)&&Number(value)<=9999999999.99;
const sum=(units:UnitDraft[],key:'monthlyPaid'|'exceptionalPaid')=>units.reduce((n,u)=>n+Math.round(Number(u[key]||0)*100),0)/100;
const field='min-h-12 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900';
export function BuildingSetupWizard({buildingId,onDone,onCancel}:Props){
 const {user,refreshProfile,holdMembership}=useAuth();
 const activeUser=useRef(user?.id);activeUser.current=user?.id;
 const [mode,setMode]=useState<'new'|'transfer'|null>(null);
 const [step,setStep]=useState(0);const [unitPage,setUnitPage]=useState(0);
 const [name,setName]=useState('');const [address,setAddress]=useState('');
 const [count,setCount]=useState('');const [floors,setFloors]=useState('1');const [fee,setFee]=useState('');
 const [start,setStart]=useState(currentCollectionMonth());const [end,setEnd]=useState(currentCollectionMonth());
 const [units,setUnits]=useState<UnitDraft[]>([]);
 const [hasExceptional,setHasExceptional]=useState(false);const [title,setTitle]=useState('');const [perUnit,setPerUnit]=useState('');
 const [cash,setCash]=useState('');const [reserve,setReserve]=useState('0');const [expenses,setExpenses]=useState('0');
 const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(!!buildingId);const [error,setError]=useState('');const [confirmed,setConfirmed]=useState(false);
 const [blocked,setBlocked]=useState(false);
 const [savedId,setSavedId]=useState('');const requestId=useRef(crypto.randomUUID());
 const pendingPayload=useRef<{details:object;history:object}|null>(null);
 const headingRef=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{setUnitPage(0);headingRef.current?.focus();headingRef.current?.scrollIntoView({block:'nearest'});},[step,mode]);
 useEffect(()=>{if(!buildingId)return;let active=true;
  void(async()=>{try{
   const [building,apartments,payments,expenses,history]=await Promise.all([supabase.from('buildings').select('name,address,total_floors,monthly_target,balance,opening_cash_includes_history,historical_monthly_collections_total,historical_exceptional_collections_total,historical_expenses_total').eq('id',buildingId).single(),supabase.from('apartments').select('unit_number,resident_name').eq('building_id',buildingId),supabase.from('payments').select('id').eq('building_id',buildingId).limit(1),supabase.from('expenses').select('id').eq('building_id',buildingId).limit(1),supabase.from('historical_monthly_allocations').select('apartment_id').eq('building_id',buildingId).limit(1)]);
   if(building.error||apartments.error||payments.error||expenses.error||history.error)throw Error('تعذر تحميل بيانات العمارة. اقفل الخطوات وافتحها مرة أخرى.');
   if(!active)return;
   if(Number(building.data.balance)||building.data.opening_cash_includes_history||Number(building.data.historical_monthly_collections_total)||Number(building.data.historical_exceptional_collections_total)||Number(building.data.historical_expenses_total)||payments.data?.length||expenses.data?.length||history.data?.length){setBlocked(true);setError('العمارة فيها حسابات مسجلة بالفعل. النقل مخصص للبداية أو بعد التصفير؛ استخدم بيانات العمارة لتعديل الحسابات الحالية.');return;}
   setName(building.data.name);setAddress(building.data.address||'');setFloors(String(building.data.total_floors||1));setFee(building.data.monthly_target?String(building.data.monthly_target):'');
   const rows=(apartments.data||[]).map((a:{unit_number:string;resident_name:string})=>({unitNumber:a.unit_number,residentName:a.resident_name||'',monthlyPaid:'0',exceptionalPaid:'0'})).sort((a,b)=>a.unitNumber.localeCompare(b.unitNumber,'ar',{numeric:true}));
   setUnits(rows);setCount(rows.length?String(rows.length):'');
  }catch(failure){if(active)setError(failure instanceof Error?failure.message:'تعذر التحميل');}finally{if(active)setLoading(false);}})();return()=>{active=false};
 },[buildingId]);
 const months=historicalDueMonths(start,end);const monthlyDue=Number(fee||0)*months;
 const monthlyTotal=mode==='transfer'?sum(units,'monthlyPaid'):0;
 const exceptionalTotal=mode==='transfer'&&hasExceptional?sum(units,'exceptionalPaid'):0;
 const exceptionalDue=hasExceptional?Number(perUnit||0)*units.length:0;
 const changeUnit=(index:number,key:keyof UnitDraft,value:string)=>{setUnits(rows=>rows.map((row,i)=>i===index?{...row,[key]:value}:row));setConfirmed(false);};
 const validate=(targetStep:number)=>{
  if(!name.trim()||!Number.isInteger(Number(count))||Number(count)<1||Number(count)>10000||!Number.isInteger(Number(floors))||Number(floors)<1||Number(floors)>100||!validMoney(fee)||Number(fee)<=0)return 'اكتب الاسم وعدد الشقق (١–١٠٠٠٠) والأدوار والاشتراك الشهري الصحيح.';
  if(mode==='transfer'&&(!start||!end||start<'1900-01'||start>end||end>currentCollectionMonth()))return 'حدد أول شهر وآخر شهر في الحسابات القديمة، دون شهر مستقبلي.';
  if(targetStep>=1&&mode==='transfer'&&units.some(u=>!validMoney(u.monthlyPaid||'0')||Number(u.monthlyPaid)>monthlyDue))return 'راجع المدفوع الشهري: لا يتجاوز المطلوب عن الفترة لكل شقة.';
  if(targetStep>=1&&mode==='transfer'&&units.reduce((n,u)=>n+Math.ceil(Number(u.monthlyPaid||0)/Number(fee)),0)>1500)return 'الفترة والمدفوعات تتجاوز الحد المتاح (١٥٠٠ شهر للشقق).';
  if(targetStep>=2&&mode==='transfer'&&hasExceptional&&(!validMoney(perUnit)||Number(perUnit)<=0||title.trim().length<3||units.some(u=>!validMoney(u.exceptionalPaid||'0')||Number(u.exceptionalPaid)>Number(perUnit))))return 'اكتب اسم البند والمطلوب من كل شقة، والمدفوع لا يزيد عن المطلوب.';
  return '';
 };
 const next=()=>{const failure=validate(step);if(failure){setError(failure);return;}setError('');setConfirmed(false);
  if(step===0){setUnits(rows=>Array.from({length:Number(count)},(_,i)=>rows[i]||{unitNumber:String(i+1),residentName:'',monthlyPaid:'0',exceptionalPaid:'0'}));}
  setStep(mode==='new'?3:step+1);
 };
 const finish=async()=>{
  if(busy||loading)return;const failure=validate(3);
  if(failure){setError(failure);return;}
  if(!validMoney(cash)||!validMoney(reserve)||Number(reserve)>Number(cash)||!validMoney(expenses)){setError('اكتب الموجود فعلًا بالخزينة. صندوق الطوارئ جزء منها ولا يزيد عنها.');return;}
  if(!confirmed){setError('راجع الأرقام وفعّل تأكيد المراجعة قبل الحفظ.');return;}
  setBusy(true);setError('');const release=holdMembership();const actorId=user?.id;
  try{
   // Freeze a possibly committed request after a network failure: retry the same
   // payload and key, so creation/history cannot be duplicated.
   pendingPayload.current??={details:{name:name.trim(),address:address.trim(),totalUnits:Number(count),totalFloors:Number(floors),monthlyTarget:Number(fee)},history:{mode,startMonth:mode==='new'?currentCollectionMonth():start,endMonth:mode==='new'?currentCollectionMonth():end,cash:Number(cash),reserve:Number(reserve),expenses:mode==='transfer'?Number(expenses):0,exceptionalTitle:title.trim(),exceptionalPerUnit:mode==='transfer'&&hasExceptional?Number(perUnit):0,units:units.map(u=>({...u,monthlyPaid:mode==='transfer'?Number(u.monthlyPaid||0):0,exceptionalPaid:mode==='transfer'&&hasExceptional?Number(u.exceptionalPaid||0):0}))}};
   const saved=savedId?{id:savedId}:await completeNeonBuildingSetup(requestId.current,pendingPayload.current.details,pendingPayload.current.history,buildingId||null);
   if(activeUser.current!==actorId)throw Error('تم تغيير الحساب أثناء الحفظ.');
   setSavedId(saved.id);await refreshProfile(saved.id);onDone();
  }catch(failure){if(failure&&typeof failure==='object'&&'httpStatus' in failure&&[400,403,404,409].includes(Number(failure.httpStatus))){pendingPayload.current=null;requestId.current=crypto.randomUUID();}setError(failure instanceof Error?failure.message:'تعذر تأكيد الحفظ. أعد المحاولة بنفس البيانات.');}
  finally{release();setBusy(false);}
 };
 const frozen=busy||!!pendingPayload.current;
 const visibleUnits=units.slice(unitPage*20,unitPage*20+20);
 const pageControls=units.length>20?<div className="flex items-center justify-between gap-2 text-xs"><button type="button" disabled={unitPage===0} onClick={()=>setUnitPage(v=>v-1)} className="min-h-11 px-2 text-teal-800 disabled:opacity-40">الشقق السابقة</button><span>شقق {unitPage*20+1}–{Math.min(units.length,unitPage*20+20)} من {units.length}</span><button type="button" disabled={(unitPage+1)*20>=units.length} onClick={()=>setUnitPage(v=>v+1)} className="min-h-11 px-2 text-teal-800 disabled:opacity-40">الشقق التالية</button></div>:null;
 const tabs=['بيانات العمارة','الاشتراكات القديمة','التحصيل الاستثنائي','الخزينة والمراجعة'];
 return <section data-building-setup dir="rtl" className="mx-auto w-full max-w-xl space-y-5 rounded-3xl bg-white p-4 text-slate-800 sm:p-6">
  <div className="flex items-start justify-between gap-3"><div><h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">{!mode?'ابدأ حسابات عمارتك':tabs[step]}</h2><p className="mt-2 text-sm text-slate-500">{!mode?'اختار طريقة البداية، وهنمشي معاك خطوة بخطوة.':mode==='new'?'تسجيل عمارة جديدة بدون حسابات قديمة':`نقل حسابات عمارتك — الخطوة ${step+1} من ٤`}</p></div><button type="button" disabled={busy} onClick={onCancel} className="min-h-11 shrink-0 px-2 text-sm text-slate-600">إغلاق</button></div>
  {loading?<p role="status">جارٍ تحميل بيانات العمارة...</p>:<>
  {blocked?null:!mode?<div className="space-y-3"><button type="button" onClick={()=>{setMode('new');setError('');}} className="w-full rounded-2xl border border-teal-200 bg-teal-50 p-5 text-right"><strong className="block text-lg text-teal-800">تسجيل عمارة جديدة</strong><span className="mt-2 block text-sm">ابدأ الاشتراكات من الشهر الحالي، وسجّل الموجود بالخزينة.</span></button><button type="button" onClick={()=>{setMode('transfer');setError('');}} className="w-full rounded-2xl border border-sky-200 bg-sky-50 p-5 text-right"><strong className="block text-lg text-sky-900">نقل حسابات عمارتك</strong><span className="mt-2 block text-sm">سجّل الشهور والمدفوعات القديمة لكل شقة، ثم رصيد الخزينة الحالي.</span></button></div>:<>
  <div className="flex gap-1" aria-label="تقدم التسجيل">{(mode==='new'?[0,3]:[0,1,2,3]).map(n=><span key={n} className={`h-1.5 flex-1 rounded-full ${step>=n?'bg-teal-600':'bg-slate-100'}`}/>)}</div>
  <fieldset disabled={frozen} className="space-y-4 disabled:opacity-70">
  {step===0&&<>
   <label className="block space-y-2 text-sm font-bold">اسم العمارة<input className={field} value={name} onChange={e=>setName(e.target.value)} placeholder="اسم العمارة"/></label>
   <label className="block space-y-2 text-sm font-bold">العنوان<input className={field} value={address} onChange={e=>setAddress(e.target.value)}/></label>
   <div className="grid grid-cols-2 gap-3"><label className="space-y-2 text-sm font-bold">عدد الشقق<input className={field} type="number" min="1" max="10000" disabled={!!buildingId&&units.length>0} value={count} onChange={e=>setCount(e.target.value)}/></label><label className="space-y-2 text-sm font-bold">عدد الأدوار<input className={field} type="number" min="1" max="100" value={floors} onChange={e=>setFloors(e.target.value)}/></label></div>
   <label className="block space-y-2 text-sm font-bold">الاشتراك الشهري لكل شقة (جنيه)<input className={field} type="number" min="0.01" step="0.01" value={fee} onChange={e=>setFee(e.target.value)}/></label>
   {buildingId&&<p className="text-xs text-amber-800">النقل متاح قبل تسجيل العمليات المالية أو بعد تصفيرها. الاشتراك المكتوب سيطبق على الشقق الحالية عند تأكيد الحفظ.</p>}
   {mode==='transfer'&&<div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="space-y-2 text-sm font-bold">أول شهر في الحسابات القديمة<input className={field} type="month" max={end} value={start} onChange={e=>setStart(e.target.value)}/></label><label className="space-y-2 text-sm font-bold">آخر شهر في الحسابات القديمة<input className={field} type="month" min={start} max={currentCollectionMonth()} value={end} onChange={e=>setEnd(e.target.value)}/></label></div>}
  </>}
  {step===1&&<>
   <p className="rounded-xl bg-sky-50 p-3 text-sm leading-7">عن الفترة من {start} إلى {end}: المطلوب من كل شقة <strong>{money(monthlyDue)} جنيه</strong> ({months} شهر × {money(Number(fee))}). اكتب المدفوع فعلًا، واترك غير المسدد صفرًا. المبلغ يتوزع على أقدم الشهور.</p>
   <button type="button" onClick={()=>setUnits(rows=>rows.map(u=>({...u,monthlyPaid:String(monthlyDue)})))} className="min-h-11 text-sm font-bold text-teal-800 underline">كل الشقق سددت الاشتراكات بالكامل</button>
   {pageControls}<div className="space-y-3">{visibleUnits.map((u,i)=><div key={u.unitNumber} className="rounded-xl border border-slate-200 p-3"><strong className="text-sm">شقة {u.unitNumber}</strong><label className="mt-2 block text-xs">اسم الساكن (اختياري)<input className={field} value={u.residentName} onChange={e=>changeUnit(unitPage*20+i,'residentName',e.target.value)}/></label><label className="mt-2 block text-xs">المدفوع الشهري السابق للشقة {u.unitNumber}<input className={field} type="number" min="0" max={monthlyDue} step="0.01" value={u.monthlyPaid} onChange={e=>changeUnit(unitPage*20+i,'monthlyPaid',e.target.value)}/></label><p className="mt-2 text-xs text-rose-700">المتبقي: {money(monthlyDue-Number(u.monthlyPaid||0))} جنيه</p></div>)}</div>
   <p className="font-bold text-teal-800">المحصّل الشهري القديم: {money(monthlyTotal)} جنيه</p>
  </>}
  {step===2&&<>
   <label className="flex min-h-12 items-center gap-3 rounded-xl bg-sky-50 p-3 font-bold"><input type="checkbox" className="h-5 w-5" checked={hasExceptional} onChange={e=>setHasExceptional(e.target.checked)}/>عندي تحصيل استثنائي قديم</label>
   {!hasExceptional?<p className="text-sm text-slate-600">لو مفيش تحصيل استثنائي، اضغط التالي.</p>:<>
    <label className="block space-y-2 text-sm font-bold">اسم التحصيل الاستثنائي<input className={field} value={title} onChange={e=>setTitle(e.target.value)} placeholder="مثال: تركيب أسانسير"/></label>
    <label className="block space-y-2 text-sm font-bold">المطلوب من كل شقة (جنيه)<input className={field} type="number" min="0.01" step="0.01" value={perUnit} onChange={e=>setPerUnit(e.target.value)}/></label>
    <p className="rounded-xl bg-amber-50 p-3 text-sm">إجمالي المطلوب: {money(exceptionalDue)} جنيه عن {units.length} شقة. ده المطلوب، والمحصّل هو مجموع المدفوع تحت.</p>
    <button type="button" onClick={()=>setUnits(rows=>rows.map(u=>({...u,exceptionalPaid:perUnit||'0'})))} className="min-h-11 text-sm font-bold text-teal-800 underline">كل الشقق سددت التحصيل الاستثنائي بالكامل</button>
    {pageControls}{visibleUnits.map((u,i)=><label key={u.unitNumber} className="block rounded-xl border border-slate-200 p-3 text-sm">المدفوع الاستثنائي السابق للشقة {u.unitNumber}<input className={field} type="number" min="0" max={perUnit} step="0.01" aria-label={'المدفوع الاستثنائي السابق للشقة '+u.unitNumber} value={u.exceptionalPaid} onChange={e=>changeUnit(unitPage*20+i,'exceptionalPaid',e.target.value)}/><span className="mt-2 block text-xs text-rose-700">المتبقي: {money(Number(perUnit||0)-Number(u.exceptionalPaid||0))} جنيه</span></label>)}
    <p className="font-bold text-teal-800">المحصّل الاستثنائي القديم: {money(exceptionalTotal)} جنيه</p>
   </>}
  </>}
  {step===3&&<>
   <label className="block space-y-2 text-sm font-bold">الموجود حاليًا في خزينة العمارة (جنيه)<input className={field} type="number" min="0" step="0.01" value={cash} onChange={e=>{setCash(e.target.value);setConfirmed(false);}}/></label>
   <p className="rounded-xl bg-teal-50 p-3 text-sm leading-7">اكتب الفلوس الموجودة فعلًا بعد المصروفات القديمة. المدفوعات السابقة تتسجل لحساب الشقق، ومش هتتضاف على الخزينة مرة ثانية.</p>
   <label className="block space-y-2 text-sm font-bold">المخصص للطوارئ من الخزينة (جنيه)<input className={field} type="number" min="0" max={cash} step="0.01" value={reserve} onChange={e=>{setReserve(e.target.value);setConfirmed(false);}}/></label>
   {mode==='transfer'&&<label className="block space-y-2 text-sm font-bold">إجمالي المصروفات القديمة — اختياري (جنيه)<input className={field} type="number" min="0" step="0.01" value={expenses} onChange={e=>{setExpenses(e.target.value);setConfirmed(false);}}/></label>}
   <div data-setup-review className="space-y-2 rounded-2xl border border-slate-200 p-4 text-sm"><h3 className="font-bold">راجع قبل الحفظ</h3><p>{name} • {count} شقة • الاشتراك {money(Number(fee))} جنيه</p>{mode==='transfer'&&<><p>المطلوب الشهري عن الفترة: {money(monthlyDue*units.length)} جنيه</p><p>المحصّل الشهري: {money(monthlyTotal)} جنيه</p><p>المطلوب الاستثنائي: {money(exceptionalDue)} جنيه</p><p>المحصّل الاستثنائي: {money(exceptionalTotal)} جنيه</p><p className="font-bold text-rose-700">المتبقي القديم على الشقق: {money(monthlyDue*units.length-monthlyTotal+exceptionalDue-exceptionalTotal)} جنيه</p></>}<p className="font-bold text-teal-800">رصيد الخزينة عند البداية: {money(Number(cash||0))} جنيه</p><p>منه مخصص للطوارئ: {money(Number(reserve||0))} جنيه</p><p className="text-xs text-slate-500">الحسابات القديمة تُحفظ كتسويات سابقة، بدون إصدار إيصالات جديدة. الشهور التالية تستمر تلقائيًا حسب الاشتراك.</p></div>
   <label className="flex min-h-12 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>راجعت مدفوعات الشقق ورصيد الخزينة وأؤكد صحتها</label>
  </>}
  </fieldset>
  {pendingPayload.current&&<p role="status" className="text-xs text-amber-800">تم إرسال الأرقام للحفظ. لو الاتصال انقطع، أعد تأكيد نفس الطلب لمنع تكرار الحسابات.</p>}
  <div className="flex gap-3">{step===3?<button type="button" disabled={busy||!confirmed} onClick={()=>void finish()} className="min-h-12 flex-1 rounded-xl bg-teal-700 p-3 font-bold text-white disabled:opacity-50">{busy?'جارٍ الحفظ...':savedId?'تحديث بيانات الحساب':'حفظ وبدء الاستخدام'}</button>:<button type="button" disabled={frozen} onClick={next} className="min-h-12 flex-1 rounded-xl bg-teal-700 p-3 font-bold text-white">التالي</button>}<button type="button" disabled={frozen} onClick={()=>{setError('');setConfirmed(false);if(step===0)setMode(null);else setStep(mode==='new'?0:step-1);}} className="min-h-12 rounded-xl border border-slate-200 px-5 text-sm">السابق</button></div>
  </>}
  </>}
  {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm leading-7 text-rose-700">{error}</p>}
 </section>;
}
