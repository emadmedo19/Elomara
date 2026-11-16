import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { allocateHistoricalMonthlyPayments, currentCollectionMonth } from '../services/historicalCollections';

type Unit = { id: string; unit_number: string; monthly_fee: number };
type Allocation = { apartmentId: string; month: string; amount: number };
type StoredAllocation = { apartment_id: string; month: string; amount: number };
type Props = { buildingId: string; startMonth: string; disabledReason?: string; canSaveBuilding?: boolean; onSaved: () => Promise<void> | void };
const money = (n: number) => n.toLocaleString('ar-EG', {maximumFractionDigits:2});
const isMoney = (n:number) => Number.isFinite(n) && n>=0 && Math.abs(Math.round(n*100)-n*100)<0.00001;
export const HistoricalMonthlyDistribution: React.FC<Props> = ({buildingId,startMonth,disabledReason,canSaveBuilding=false,onSaved}) => {
 const [units,setUnits]=useState<Unit[]>([]);
 const [stored,setStored]=useState<StoredAllocation[]>([]);
 const [values,setValues]=useState<Record<string,string>>({});
 const [target,setTarget]=useState('');
 const [loading,setLoading]=useState(true);
 const [loadError,setLoadError]=useState('');
 const [revision,setRevision]=useState(0);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [success,setSuccess]=useState('');
 const currentMonth=currentCollectionMonth();
 useEffect(()=>{let active=true;setLoading(true);setLoadError('');setError('');setSuccess('');
  void (async()=>{
   try {
    const [apartments,rows]=await Promise.all([
     supabase.from('apartments').select('id,unit_number,monthly_fee').eq('building_id',buildingId).order('unit_number'),
     supabase.from('historical_monthly_allocations').select('apartment_id,month,amount').eq('building_id',buildingId)
    ]);
    if(!active)return;
    if(apartments.error||rows.error) throw new Error('تعذر تحميل التوزيع السابق. أعد المحاولة قبل إجراء أي تعديل.');
    const apt=[...((apartments.data||[]) as Unit[])].sort((a,b)=>a.unit_number.localeCompare(b.unit_number,'ar',{numeric:true,sensitivity:'base'}));
    const previous=(rows.data||[]) as StoredAllocation[];
    const amounts:Record<string,number>={};
    for(const item of previous) amounts[item.apartment_id]=(amounts[item.apartment_id]||0)+Math.round(Number(item.amount)*100);
    setUnits(apt);setStored(previous);
    setValues(Object.fromEntries(Object.entries(amounts).map(([k,v])=>[k,String(v/100)])));
    setTarget(String(Object.values(amounts).reduce((a,b)=>a+b,0)/100));
   } catch(failure) { if(active)setLoadError(failure instanceof Error?failure.message:'تعذر تحميل التوزيع السابق.'); }
   finally {if(active)setLoading(false);}
  })();
  return()=>{active=false};
 },[buildingId,revision]);
 const allocations=useMemo(()=>{
  const all:Allocation[]=[];
  if(!startMonth||startMonth>currentMonth)return {all,warning:'حدد شهر بداية التحصيل الصحيح من بيانات العمارة واحفظه أولًا.'};
  for(const unit of units){
   const amount=Number(values[unit.id]||0);
   if(!isMoney(amount))return {all,warning:'اكتب مبلغًا موجبًا أو صفرًا، بحد أقصى رقمين بعد العلامة العشرية.'};
   if(!amount)continue;
   const previous=stored.filter(row=>row.apartment_id===unit.id);
   if(Math.round(amount*100)===previous.reduce((sum,row)=>sum+Math.round(Number(row.amount)*100),0)) {
    all.push(...previous.map(row=>({apartmentId:unit.id,month:row.month,amount:Number(row.amount)})));
    continue;
   }
   try {
    const result=allocateHistoricalMonthlyPayments(startMonth,Number(unit.monthly_fee),amount,currentMonth);
    if(result.unallocatedCredit>0)return {all,warning:'بعض المبالغ تتجاوز اشتراكات الشهور المتاحة؛ راجع نصيب الشقق.'};
    all.push(...result.allocations.map(row=>({apartmentId:unit.id,month:row.month+'-01',amount:row.amount})));
   }catch(failure){return {all,warning:failure instanceof Error?failure.message:'قيمة غير صالحة'};}
  }
  return {all,warning:all.length>1500?'عدد الشهور الموزعة يتجاوز الحد المتاح (١٥٠٠).':''};
 },[units,values,stored,startMonth,currentMonth]);
 const assignedCents=Object.values(values).reduce((sum,v)=>sum+Math.round(Number(v||0)*100),0);
 const total=Number(target||0);
 const validTotal=isMoney(total)&&Number.isFinite(assignedCents)&&Math.round(total*100)===assignedCents;
 const save=async()=>{
  setError('');setSuccess('');
  if(loading||loadError||saving||disabledReason)return;
  if(allocations.warning){setError(allocations.warning);return;}
  if(!validTotal){setError('لازم إجمالي الموزع يساوي الرصيد اللي أدخلته بالضبط، وبحد أقصى رقمين عشريين.');return;}
  if(!window.confirm('تأكيد حفظ توزيع الرصيد السابق؟ سيتم تعديل الرصيد الافتتاحي والخزينة بالفرق فقط دون إنشاء إيصالات جديدة.'))return;
  setSaving(true);
  try {
   const {error:failure}=await supabase.rpc('save_historical_monthly_allocations',{p_building_id:buildingId,p_allocations:allocations.all});
   if(failure)throw new Error(failure.message);
   setStored(allocations.all.map(row=>({apartment_id:row.apartmentId,month:row.month,amount:row.amount})));
   setSuccess('تم حفظ توزيع الرصيد السابق.');
   await onSaved();
  }catch(failure){setError(failure instanceof Error?failure.message:'تعذر الحفظ. احتفظنا بالمبالغ لإعادة المحاولة.');}
  finally{setSaving(false);}
 };
 return <section data-historical-distribution onKeyDown={event=>{if(event.key==='Enter'&&event.target instanceof HTMLInputElement)event.preventDefault();}} className="space-y-3 rounded-xl border border-teal-200 bg-white p-3" dir="rtl">
  <h3 className="text-sm font-bold text-slate-800">توزيع التحصيلات الشهرية السابقة على الشقق</h3>
  <p className="text-xs text-slate-600">يبدأ السداد من {startMonth||'شهر البداية'}، ويُوزع على أقدم الشهور حتى الشهر الحالي. لا يدخل في التحصيلات الاستثنائية. المبالغ المحفوظة تبقى في شهورها عند الحفظ دون تعديل.</p>
  {loading?<p role="status" className="text-xs">جارٍ تحميل التوزيع السابق...</p>:loadError?<div role="alert" className="text-xs text-rose-700"><p>{loadError}</p><button type="button" className="mt-2 min-h-11 underline" onClick={()=>setRevision(v=>v+1)}>إعادة تحميل التوزيع</button></div>:<>
   {disabledReason&&<div className="space-y-2"><p role="status" className="text-xs text-amber-800">{disabledReason}</p>{canSaveBuilding&&<button type="submit" data-save-building-for-distribution className="min-h-11 w-full rounded-xl bg-teal-700 px-3 py-2 text-sm font-bold text-white">حفظ بيانات العمارة وفتح التوزيع</button>}</div>}
   <fieldset disabled={saving||!!disabledReason} className="space-y-3 disabled:opacity-60">
    <label className="block text-xs font-bold">إجمالي الرصيد الشهري السابق (جنيه)<input className="mt-1 min-h-11 w-full rounded-lg border p-2" type="number" min="0" step="0.01" value={target} onChange={e=>{setTarget(e.target.value);setSuccess('');}}/></label>
    <div className="max-h-52 space-y-2 overflow-y-auto">
     {units.map(unit=><div key={unit.id} className="grid grid-cols-2 items-center gap-2 text-xs"><label htmlFor={'historical-'+unit.id}>شقة {unit.unit_number} — {money(Number(unit.monthly_fee))} ج/شهر</label><input id={'historical-'+unit.id} className="min-h-11 min-w-0 rounded-lg border p-2" aria-label={'المبلغ السابق للشقة '+unit.unit_number} type="number" min="0" step="0.01" value={values[unit.id]||''} placeholder="المبلغ المسدد" onChange={e=>{setValues(v=>({...v,[unit.id]:e.target.value}));setSuccess('');}}/></div>)}
    </div>
    <div data-historical-summary className="rounded-lg bg-slate-50 p-2 text-xs">الموزع: {money(assignedCents/100)} ج — المتبقي: {money(total-assignedCents/100)} ج — عدد الشهور المسددة/الجزئية: {allocations.all.length}</div>
    {allocations.warning&&<p className="text-xs text-rose-700">{allocations.warning}</p>}
    <button type="button" className="min-h-11 text-xs text-rose-700 underline" onClick={()=>{setValues({});setTarget('0');setError('');setSuccess('');}}>مسح التوزيع من النموذج</button>
    <p className="text-[11px] text-slate-500">المسح والتعديل لا يؤثران على السجلات إلا بعد الضغط على حفظ وتأكيد العملية.</p>
    <button type="button" disabled={saving||!!allocations.warning||!validTotal} onClick={()=>void save()} className="min-h-11 w-full rounded-xl bg-teal-700 p-2 text-sm font-bold text-white disabled:opacity-50">{saving?'جارٍ الحفظ...':'حفظ توزيع الرصيد السابق'}</button>
   </fieldset>
   {error&&<p role="alert" className="text-xs text-rose-700">{error}</p>}
   {success&&<p role="status" className="text-xs text-teal-700">{success}</p>}
  </>}
 </section>;
};
