import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Wallet, Plus, X, Bell, RefreshCw } from 'lucide-react';
import { Apartment } from '../types';
import { supabase } from '../lib/supabase';

type CollectionRow = {
  id: string; title: string; description: string; amount_mode: 'total' | 'per_apartment';
  total_amount: number | null; per_apartment_amount: number | null;
  target_apartment_ids: string[]; status: 'active' | 'closed'; created_at: string;
};

interface Props { buildingId: string; apartments: Apartment[]; }

export const ExceptionalCollectionsView: React.FC<Props> = ({ buildingId, apartments }) => {
  const [items, setItems] = useState<CollectionRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amountMode, setAmountMode] = useState<'per_apartment' | 'total'>('per_apartment');
  const [amount, setAmount] = useState('');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    const { data, error: loadError } = await supabase.from('exceptional_collections')
      .select('id,title,description,amount_mode,total_amount,per_apartment_amount,target_apartment_ids,status,created_at')
      .eq('building_id', buildingId).order('created_at', { ascending: false });
    if (loadError) setError('تعذر تحميل التحصيلات الاستثنائية: ' + loadError.message);
    else setItems((data || []) as CollectionRow[]);
  };
  useEffect(() => { if (buildingId) void load(); }, [buildingId]);

  const toggleApartment = (id: string) => setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setNotice('');
    const numericAmount = Number(amount);
    if (title.trim().length < 3) { setError('اكتب وصفًا واضحًا للتحصيل.'); return; }
    if (!selected.length) { setError('اختار شقة واحدة على الأقل.'); return; }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) { setError('اكتب مبلغًا صحيحًا أكبر من صفر.'); return; }
    setBusy(true);
    const { data, error: saveError } = await supabase.rpc('create_exceptional_collection', {
      p_building_id: buildingId, p_title: title.trim(), p_description: description.trim(),
      p_amount_mode: amountMode, p_total_amount: amountMode === 'total' ? numericAmount : null,
      p_per_apartment_amount: amountMode === 'per_apartment' ? numericAmount : null,
      p_target_apartment_ids: selected, p_notify_residents: notify,
    });
    if (saveError) {
      setError('تعذر إنشاء التحصيل: ' + saveError.message); setBusy(false); return;
    }
    const result = data as { collection_id?: string; total_amount?: number; target_count?: number };
    if (notify && result.collection_id) {
      const { error: pushError } = await supabase.functions.invoke('send-exceptional-collection-push', { body: { collection_id: result.collection_id } });
      if (pushError) console.warn('[Exceptional collection] Saved, but push delivery failed:', pushError.message);
    }
    setTitle(''); setDescription(''); setAmount(''); setSelected([]); setBusy(false);
    setNotice('تم تسجيل التحصيل وتوزيع ' + Number(result.total_amount || numericAmount).toLocaleString('ar-EG') + ' ج.م على ' + Number(result.target_count || selected.length) + ' شقة.');
    await load();
  };

  return <section dir="rtl" className="space-y-4">
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center gap-3"><span className="rounded-2xl bg-amber-50 p-3 text-amber-700"><Wallet className="h-6 w-6"/></span><div><h1 className="text-lg font-black text-slate-900">التحصيلات الاستثنائية</h1><p className="text-xs text-slate-500">إنشاء تحصيل إضافي وتوزيعه على الشقق المستهدفة.</p></div></div>
      {error && <p className="mb-3 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle className="h-4 w-4"/>{error}</p>}
      {notice && <p className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4"/>{notice}</p>}
      <form onSubmit={submit} className="space-y-3">
        <label className="block space-y-1 text-xs font-bold text-slate-700"><span>اسم / سبب التحصيل</span><input value={title} onChange={e=>setTitle(e.target.value)} required minLength={3} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3" placeholder="مثال: صيانة المصعد"/></label>
        <label className="block space-y-1 text-xs font-bold text-slate-700"><span>التوضيحات</span><textarea value={description} onChange={e=>setDescription(e.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3" placeholder="تفاصيل إضافية عن التحصيل"/></label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={()=>setAmountMode('per_apartment')} className={`rounded-xl border p-3 text-xs font-bold ${amountMode==='per_apartment'?'border-teal-600 bg-teal-50 text-teal-800':'border-slate-200 text-slate-600'}`}>مبلغ ثابت لكل شقة</button>
          <button type="button" onClick={()=>setAmountMode('total')} className={`rounded-xl border p-3 text-xs font-bold ${amountMode==='total'?'border-teal-600 bg-teal-50 text-teal-800':'border-slate-200 text-slate-600'}`}>مبلغ إجمالي بالتساوي</button>
        </div>
        <label className="block space-y-1 text-xs font-bold text-slate-700"><span>{amountMode==='total'?'إجمالي المبلغ المطلوب (ج.م)':'المبلغ لكل شقة (ج.م)'}</span><input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3" placeholder="0.00"/></label>
        <div className="rounded-2xl border border-slate-200 p-3"><div className="mb-2 flex items-center justify-between"><strong className="text-xs text-slate-800">الشقق المستهدفة</strong><button type="button" className="text-xs font-bold text-teal-700" onClick={()=>setSelected(selected.length===apartments.length?[]:apartments.map(a=>a.id))}>{selected.length===apartments.length?'إلغاء تحديد الكل':'تحديد الكل'}</button></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{apartments.map(apt=><label key={apt.id} className="flex items-center gap-2 rounded-xl bg-slate-50 p-2 text-xs"><input type="checkbox" checked={selected.includes(apt.id)} onChange={()=>toggleApartment(apt.id)}/><span>{apt.unitNumber} - {apt.residentName || 'بدون اسم'}</span></label>)}</div>
          <p className="mt-2 text-[11px] text-slate-500">تم اختيار {selected.length} شقة</p>
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={notify} onChange={e=>setNotify(e.target.checked)}/><Bell className="h-4 w-4"/>إشعار الحسابات المعتمدة للشقق المختارة</label>
        <button disabled={busy} type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0f2537] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4"/>{busy?'جارٍ تسجيل التحصيل...':'إنشاء التحصيل الاستثنائي'}</button>
      </form>
    </div>
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><h2 className="font-black text-slate-900">سجل التحصيلات</h2><button onClick={()=>void load()} className="rounded-lg p-2 text-slate-500"><RefreshCw className="h-4 w-4"/></button></div>
      {items.length===0?<p className="py-6 text-center text-xs text-slate-400">لا توجد تحصيلات استثنائية مسجلة.</p>:<div className="space-y-2">{items.map(item=><article key={item.id} className="rounded-2xl border border-slate-100 p-3"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-800">{item.title}</h3><p className="mt-1 text-xs text-slate-500">{item.description || 'بدون توضيحات'}</p><p className="mt-2 text-[11px] text-slate-400">{new Date(item.created_at).toLocaleDateString('ar-EG')} • {item.target_apartment_ids.length} شقة</p></div><span className="whitespace-nowrap rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">{Number(item.amount_mode==='total'?item.total_amount:(item.per_apartment_amount||0)*item.target_apartment_ids.length).toLocaleString('ar-EG')} ج.م</span></div></article>)}</div>}
    </div>
  </section>;
};
