import React, {useCallback,useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

type State = 'trial'|'active'|'vip'|'expired'|'unknown';
export function useBuildingReadOnly(buildingId?:string){
 const [status,setStatus]=useState<State>('unknown');
 const [notice,setNotice]=useState(false);
 const refresh=useCallback(async()=>{
  if(!buildingId){setStatus('unknown');return;}
  const {data,error}=await supabase.rpc('read_building_subscription',{p_building_id:buildingId});
  if(!error && data && typeof data.status==='string') setStatus(data.status as State);
 },[buildingId]);
 useEffect(()=>{
  setStatus('unknown');void refresh();
  const onVisible=()=>{if(document.visibilityState!=='hidden')void refresh();};
  window.addEventListener('focus',onVisible);
  document.addEventListener('visibilitychange',onVisible);
  const timer=window.setInterval(onVisible,60000);
  return()=>{window.removeEventListener('focus',onVisible);document.removeEventListener('visibilitychange',onVisible);window.clearInterval(timer);};
 },[refresh]);
 const expired=status==='expired';
 const blockActions=(event:React.MouseEvent<HTMLElement>)=>{
  if(!expired)return;
  const target=event.target as HTMLElement;
  if(!target.closest('button,input[type="submit"],[role="button"],a[href]'))return;
  event.preventDefault();event.stopPropagation();setNotice(true);
 };
 const blockSubmit=(event:React.FormEvent<HTMLElement>)=>{if(!expired)return;event.preventDefault();event.stopPropagation();setNotice(true)};
 return {expired,status,notice,setNotice,blockActions,blockSubmit,refresh};
}
export function SubscriptionReadOnlyNotice({isAdmin,onClose,onRenew}:{isAdmin:boolean;onClose:()=>void;onRenew?:()=>void}){
 return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/65 p-4" dir="rtl" role="alertdialog" aria-modal="true" aria-label="انتهت الفترة التجريبية">
  <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
   <h2 className="mb-3 text-xl font-black text-rose-700">انتهت الفترة التجريبية</h2>
   <p className="text-sm leading-7 text-slate-700">{isAdmin?'يمكنك الاطلاع على بيانات العمارة، لكن الخدمات متوقفة لحين تجديد الاشتراك.':'يمكنك الاطلاع على بيانات العمارة، لكن الخدمات متوقفة. يُرجى التواصل مع مدير العمارة لتجديد الاشتراك.'}</p>
   {isAdmin && onRenew && <button type="button" onClick={onRenew} className="mt-5 w-full rounded-xl bg-teal-700 px-4 py-3 font-bold text-white">تجديد الاشتراك</button>}
   <button type="button" onClick={onClose} className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-3 font-bold text-slate-700">العودة لعرض البيانات</button>
  </div>
 </div>
}
