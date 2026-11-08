import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { AppSettings } from '../types';
export function GuardContact({buildingId}: {buildingId: string}) {
  const [entry,setEntry] = useState<{id:string;settings:AppSettings}|null>(null);
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      const {data,error}=await supabase.from('app_settings').select('setting_value').eq('building_id',buildingId).eq('setting_key','general').maybeSingle();
      if(active && !error) setEntry({id:buildingId,settings:data?.setting_value || {}});
    };
    void load(); window.addEventListener('focus',load);
    return ()=>{active=false;window.removeEventListener('focus',load);};
  },[buildingId]);
  const settings=entry?.id===buildingId?entry.settings:null;
  if(!settings || (!settings.guardName && !settings.guardPhone)) return null;
  return <div className="mt-3 rounded-xl border bg-slate-50 p-3"><p className="text-xs text-slate-500">حارس العقار</p><p className="font-bold">{settings.guardName}</p>{settings.guardNote && <p className="text-sm">{settings.guardNote}</p>}{settings.guardPhone && <a className="block text-teal-700 mt-2" dir="ltr" href={`tel:${settings.guardPhone.replace(/[^+0-9]/g,'')}`}>{settings.guardPhone} 📞</a>}</div>;
}
