import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, CreditCard, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { type PaymentAccount } from '../services/paymentAccounts';

type View = {scope:string;loading:boolean;methods:PaymentAccount[];error:boolean};
export function MemberPaymentMethods({buildingId,revision=0}:{buildingId:string;revision?:number}) {
  const {user} = useAuth();
  const scope = `${user?.id || ''}:${buildingId}`;
  const current = useRef(scope); current.current=scope;
  const request = useRef(0);
  const [view,setView] = useState<View>({scope,loading:true,methods:[],error:false});
  const [copied,setCopied] = useState<string>('');
  const [copyError,setCopyError] = useState(false);
  const load = useCallback(async()=>{
    if (!user || !buildingId) return;
    const version=++request.current;
    setView({scope,loading:true,methods:[],error:false});setCopied('');setCopyError(false);
    try {
      const {data,error}=await supabase.functions.invoke('get-building-payment-methods',{body:{}});
      if(current.current!==scope||version!==request.current)return;
      if(error||data?.building_id!==buildingId||!Array.isArray(data?.methods)||!data.methods.every((item:PaymentAccount)=>typeof item?.name==='string'&&typeof item?.account==='string'))throw Error('Invalid payment response');
      setView({scope,loading:false,methods:data.methods,error:false});
    }catch{if(current.current===scope&&version===request.current)setView({scope,loading:false,methods:[],error:true});}
  },[scope,user?.id,buildingId]);
  useEffect(()=>{
    void load();
    const refresh=()=>{if(document.visibilityState!=='hidden')void load();};
    const timer=window.setInterval(refresh,45000);
    window.addEventListener('focus',refresh);window.addEventListener('elomara-building-settings-updated',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{++request.current;clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('elomara-building-settings-updated',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[load,revision]);
  const copy=async(account:string)=>{
    setCopied('');setCopyError(false);
    try{await navigator.clipboard.writeText(account);if(current.current===scope)setCopied(account);}catch{if(current.current===scope)setCopyError(true);}
  };
  const visible=view.scope===scope?view:null;
  return <section data-tour="resident-payment-methods" className="my-5 rounded-2xl border border-teal-100 bg-teal-50/50 p-4" aria-labelledby="member-payment-methods-title">
    <div className="mb-2 flex items-center gap-2 text-teal-900"><CreditCard size={21}/><h4 id="member-payment-methods-title" className="font-bold flex-1">وسائل دفع اشتراكات العمارة</h4><button type="button" aria-label="تحديث وسائل الدفع" disabled={!visible||visible.loading} onClick={()=>void load()} className="rounded-lg p-1.5 text-teal-700 disabled:opacity-40"><RefreshCw size={16}/></button></div>
    <p className="mb-3 text-xs leading-6 text-slate-500">بيانات السداد التي أضافها مدير عمارتك. انسخ رقم الحساب أو عنوان الدفع للوسيلة المناسبة.</p>
    {(!visible||visible.loading)?<p role="status" className="text-xs text-slate-500">جارٍ تحميل وسائل الدفع...</p>:visible.error?<div role="status" className="text-xs leading-6 text-slate-600">تعذر تحميل وسائل الدفع.<button type="button" onClick={()=>void load()} className="mr-2 inline-flex items-center gap-1 font-bold text-teal-700"><RefreshCw size={14}/>إعادة المحاولة</button></div>:visible.methods.length?<div className="space-y-3">{visible.methods.map(method=><div key={`${method.name}:${method.account}`} className="rounded-xl border border-teal-100 bg-white p-3"><h5 className="mb-2 text-sm font-bold text-slate-800">{method.name}</h5><div className="flex items-center gap-2"><input aria-label={`عنوان الدفع أو رقم الحساب — ${method.name}`} readOnly value={method.account} dir="ltr" onFocus={event=>event.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 font-mono text-sm text-slate-800"/><button type="button" aria-label={`نسخ بيانات ${method.name}`} onClick={()=>void copy(method.account)} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800"><Copy size={15}/>{copied===method.account?'تم النسخ':'نسخ'}</button></div></div>)}</div>:<p className="text-xs leading-6 text-slate-500">لم يضف مدير العمارة بيانات دفع حتى الآن.</p>}
    {copied&&<p role="status" className="mt-2 text-xs text-teal-700">تم نسخ بيانات الدفع.</p>}
    {copyError&&<p role="status" className="mt-2 text-xs text-slate-600">حدد الرقم أو العنوان واضغط مطولًا لنسخه من الخانة.</p>}
  </section>;
}
