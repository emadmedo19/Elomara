import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { allocateHistoricalMonthlyPayments } from '../services/historicalCollections';

type Unit = { id: string; unit_number: string; monthly_fee: number };
type Allocation = { apartmentId: string; month: string; amount: number };
type Props = { buildingId: string; startMonth: string; onSaved: () => void };
const money = (n: number) => n.toLocaleString('ar-EG', {maximumFractionDigits:2});
export const HistoricalMonthlyDistribution: React.FC<Props> = ({buildingId,startMonth,onSaved}) => {
 const [units,setUnits]=useState<Unit[]>([]);
 const [values,setValues]=useState<Record<string,string>>({});
 const [target,setTarget]=useState('');
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const currentMonth=new Date().toISOString().slice(0,7);
 useEffect(()=>{let active=true;setLoading(true);setError('');
  void (async()=>{
   const [apartments,rows]=await Promise.all([
    supabase.from('apartments').select('id,unit_number,monthly_fee').eq('building_id',buildingId).order('unit_number'),
    supabase.from('historical_monthly_allocations').select('apartment_id,month,amount').eq('building_id',buildingId)
   ]);
   if(!active)return;
   if(apartments.error || (rows.error && !['PGRST205','42P01'].includes(rows.error.code||''))){setError(apartments.error?.message||rows.error?.message||'تعذر تحميل التوزيع');setLoading(false);return;}
   const apt=(apartments.data||[]) as Unit[];setUnits(apt);
   const amounts:Record<string,number>={};
   for(const item of (rows.data||[]) as any[]){amounts[item.apartment_id]=(amounts[item.apartment_id]||0)+Number(item.amount);}
   setValues(Object.fromEntries(Object.entries(amounts).map(([k,v])=>[k,String(v)])));
   setTarget(String(Object.values(amounts).reduce((a,b)=>a+b,0)));
   setLoading(false);
  })();
  return()=>{active=false};
 },[buildingId]);
 const allocations=useMemo(()=>{
  const all:Allocation[]=[];let warning='';
  if(!startMonth||startMonth>currentMonth)return {all,warning:'حدد شهر بداية التحصيل أولًا من بيانات العمارة واحفظه'};
  for(const unit of units){const amount=Number(values[unit.id]||0);if(!amount)continue;
   try{const res=allocateHistoricalMonthlyPayments(startMonth,Number(unit.monthly_fee),amount,currentMonth);
    if(res.unallocatedCredit>0){warning='بعض المبالغ تتجاوز الشهور المتاحة؛ راجع نصيب الشقق';break;}
    all.push(...res.allocations.map(x=>({apartmentId:unit.id,month:x.month+'-01',amount:x.amount})));
   }catch(e){warning=e instanceof Error?e.message:'قيمة غير صالحة';break;}
  }
  return {all,warning};
 },[units,values,startMonth,currentMonth]);
 const assigned=Object.values(values).reduce((s,v)=>s+(Number(v)||0),0);
 const total=Number(target||0);
 const save=async()=>{setError('');
  if(allocations.warning){setError(allocations.warning);return;}
  if(!Number.isFinite(total)||total<0||!Number.isFinite(assigned)||Math.abs(assigned-total)>.001){setError('لازم إجمالي الموزع يساوي الرصيد اللي أدخلته بالضبط');return;}
  if(!window.confirm('تأكيد توزيع الرصيد السابق على الشقق والشهور؟ سيتم تحديث الرصيد الافتتاحي بالفرق فقط، وليس إضافة إيصالات جديدة.'))return;
  setSaving(true);
  const {error:failure}=await supabase.rpc('save_historical_monthly_allocations',{p_building_id:buildingId,p_allocations:allocations.all});
  setSaving(false);
  if(failure){setError(failure.message);return;}
  onSaved();
 };
 return <section className="space-y-3 rounded-xl border border-teal-200 bg-white p-3" dir="rtl">
  <h3 className="text-sm font-bold text-slate-800">توزيع التحصيلات الشهرية السابقة على الشقق</h3>
  <p className="text-xs text-slate-600">يبدأ السداد من {startMonth||'شهر البداية'}، ويُوزع على أقدم الشهور تلقائيًا. لا يدخل في التحصيلات الاستثنائية.</p>
  {loading?<p className="text-xs">جاري تحميل الشقق...</p>:<>
   <label className="block text-xs font-bold">إجمالي الرصيد الشهري السابق (جنيه)
    <input className="mt-1 w-full rounded-lg border p-2" type="number" min="0" step="0.01" value={target} onChange={e=>setTarget(e.target.value)}/></label>
   <div className="max-h-52 space-y-2 overflow-y-auto">
    {units.map(unit=><div key={unit.id} className="grid grid-cols-2 items-center gap-2 text-xs">
      <label>شقة {unit.unit_number} — {money(Number(unit.monthly_fee))} ج/شهر</label>
      <input className="rounded-lg border p-2" aria-label={'المبلغ السابق للشقة '+unit.unit_number} type="number" min="0" step="0.01" value={values[unit.id]||''} placeholder="المبلغ المسدد" onChange={e=>setValues(v=>({...v,[unit.id]:e.target.value}))}/>
    </div>)}
   </div>
   <div className="rounded-lg bg-slate-50 p-2 text-xs">الموزع: {money(assigned)} ج — المتبقي: {money(total-assigned)} ج — عدد الشهور المسددة/الجزئية: {allocations.all.length}</div>
   {allocations.warning&&<p className="text-xs text-rose-700">{allocations.warning}</p>}
   {error&&<p role="alert" className="text-xs text-rose-700">{error}</p>}
   <button type="button" disabled={saving||!!allocations.warning||Math.abs(total-assigned)>.001} onClick={()=>void save()} className="w-full rounded-xl bg-teal-700 p-2 text-sm font-bold text-white disabled:opacity-50">{saving?'جاري الحفظ...':'حفظ توزيع الرصيد السابق'}</button>
  </>}
 </section>;
};
