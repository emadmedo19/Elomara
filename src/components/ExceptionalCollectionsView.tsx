import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Bell, CheckCircle2, CircleDollarSign, Plus, RefreshCw, X } from 'lucide-react';
import { Apartment, Building } from '../types';
import { supabase } from '../lib/supabase';

type AmountMode = 'total' | 'per_apartment';
type CollectionRow = {
  id: string; building_id: string; title: string; description: string;
  amount_mode: AmountMode; total_amount: number | null; per_apartment_amount: number | null;
  target_apartment_ids: string[]; keywords: string[]; notify_residents: boolean;
  status: 'active' | 'closed'; created_at: string;
};
type CreatePayload = {
  title: string; description: string; amountMode: AmountMode;
  totalAmount: number; perApartmentAmount: number;
  targetApartmentIds: string[]; keywords: string[]; notifyResidents: boolean;
};
interface Props {
  building: Building;
  apartments: Apartment[];
  onCreateCollection: (payload: CreatePayload) => Promise<boolean>;
}
const money = (value: number) => Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 });

export const ExceptionalCollectionsView: React.FC<Props> = ({ building, apartments, onCreateCollection }) => {
  const [rows, setRows] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<AmountMode>('per_apartment');
  const [totalAmount, setTotalAmount] = useState('');
  const [perApartmentAmount, setPerApartmentAmount] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [keywords, setKeywords] = useState('');
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState('');

  const activeApartments = useMemo(() => apartments.filter(a => a.buildingId === building.id), [apartments, building.id]);
  const loadRows = async () => {
    if (!building.id) return;
    setLoading(true);
    const { data, error: loadError } = await supabase.from('exceptional_collections')
      .select('id,building_id,title,description,amount_mode,total_amount,per_apartment_amount,target_apartment_ids,keywords,notify_residents,status,created_at')
      .eq('building_id', building.id).order('created_at', { ascending: false });
    if (loadError) setError('تعذر تحميل التحصيلات: ' + loadError.message);
    else { setRows((data || []) as CollectionRow[]); setError(''); }
    setLoading(false);
  };
  useEffect(() => { void loadRows(); }, [building.id]);

  const toggleApartment = (id: string) => setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  const resetForm = () => {
    setTitle(''); setDescription(''); setMode('per_apartment'); setTotalAmount('');
    setPerApartmentAmount(''); setSelected([]); setKeywords(''); setNotify(true); setError(''); setShowForm(false);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    const amount = Number(mode === 'total' ? totalAmount : perApartmentAmount);
    if (!title.trim()) { setError('اكتب اسم التحصيل.'); return; }
    if (!selected.length) { setError('حدد شقة واحدة على الأقل.'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setError('أدخل مبلغًا صحيحًا أكبر من صفر.'); return; }
    setSaving(true);
    const ok = await onCreateCollection({
      title: title.trim(), description: description.trim(), amountMode: mode,
      totalAmount: mode === 'total' ? amount : 0,
      perApartmentAmount: mode === 'per_apartment' ? amount : 0,
      targetApartmentIds: selected,
      keywords: keywords.split(/[،,\n]/).map(x => x.trim()).filter(Boolean),
      notifyResidents: notify,
    });
    setSaving(false);
    if (ok) { resetForm(); await loadRows(); }
  };

  return (
    <section className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-amber-100 bg-gradient-to-l from-amber-50 to-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"><CircleDollarSign className="h-6 w-6" /></span>
          <div><h2 className="text-lg font-black text-slate-900">التحصيلات الاستثنائية</h2><p className="mt-1 text-xs text-slate-500">تحصيلات إضافية مستقلة عن الاشتراك الشهري</p></div>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="inline-flex items-center gap-2 rounded-2xl bg-teal-700 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-teal-800">
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{showForm ? 'إغلاق' : 'إنشاء تحصيل'}
        </button>
      </div>

      {showForm && <form onSubmit={submit} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div><label className="mb-1 block text-xs font-bold text-slate-700">اسم التحصيل</label><input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} required className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-teal-500" placeholder="مثال: صيانة طلمبة المياه" /></div>
        <div><label className="mb-1 block text-xs font-bold text-slate-700">التفاصيل</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-teal-500" placeholder="اكتب سبب التحصيل وأي تفاصيل للسكان" /></div>
        <div><label className="mb-2 block text-xs font-bold text-slate-700">طريقة تحديد المبلغ</label><div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setMode('per_apartment')} className={`rounded-xl border p-3 text-xs font-bold ${mode === 'per_apartment' ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600'}`}>مبلغ ثابت لكل شقة</button>
          <button type="button" onClick={() => setMode('total')} className={`rounded-xl border p-3 text-xs font-bold ${mode === 'total' ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600'}`}>مبلغ إجمالي يتوزع بالتساوي</button>
        </div></div>
        <div><label className="mb-1 block text-xs font-bold text-slate-700">{mode === 'total' ? 'إجمالي المبلغ (جنيه)' : 'نصيب كل شقة (جنيه)'}</label><input type="number" min="0.01" step="0.01" value={mode === 'total' ? totalAmount : perApartmentAmount} onChange={e => mode === 'total' ? setTotalAmount(e.target.value) : setPerApartmentAmount(e.target.value)} required className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" /></div>
        <div><div className="mb-2 flex items-center justify-between"><label className="text-xs font-bold text-slate-700">الشقق المستهدفة</label><button type="button" onClick={() => setSelected(selected.length === activeApartments.length ? [] : activeApartments.map(a => a.id))} className="text-xs font-bold text-teal-700">{selected.length === activeApartments.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}</button></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{activeApartments.map(a => <label key={a.id} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-xs ${selected.includes(a.id) ? 'border-teal-500 bg-teal-50' : 'border-slate-200'}`}><input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggleApartment(a.id)} className="accent-teal-700" /><span className="font-bold">شقة {a.unitNumber}</span><span className="truncate text-slate-500">{a.residentName}</span></label>)}</div>
          <p className="mt-2 text-[11px] text-slate-500">تم تحديد {selected.length} من {activeApartments.length} شقة</p>
        </div>
        <div><label className="mb-1 block text-xs font-bold text-slate-700">كلمات توضيحية (اختياري)</label><input value={keywords} onChange={e => setKeywords(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" placeholder="صيانة، مصعد، طوارئ" /></div>
        <label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-700"><input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} className="accent-teal-700" /><Bell className="h-4 w-4 text-teal-700" />إرسال إشعار للسكان المستهدفين</label>
        {error && <p className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle className="h-4 w-4" />{error}</p>}
        <button disabled={saving} className="w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-black text-white disabled:opacity-60">{saving ? 'جارٍ حفظ التحصيل وتسجيل المستحقات...' : 'حفظ التحصيل وتسجيل المستحقات'}</button>
      </form>}

      <div className="flex items-center justify-between"><h3 className="font-black text-slate-800">سجل التحصيلات</h3><button onClick={() => void loadRows()} className="inline-flex items-center gap-1 text-xs font-bold text-teal-700"><RefreshCw className="h-3.5 w-3.5" />تحديث</button></div>
      {loading ? <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">جارٍ تحميل التحصيلات...</div> : rows.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">لا توجد تحصيلات استثنائية مسجلة حتى الآن.</div> : <div className="space-y-3">{rows.map(row => {
        const targets = activeApartments.filter(a => row.target_apartment_ids.includes(a.id));
        const total = row.amount_mode === 'total' ? Number(row.total_amount || 0) : Number(row.per_apartment_amount || 0) * row.target_apartment_ids.length;
        return <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><h4 className="font-black text-slate-900">{row.title}</h4><p className="mt-1 text-xs text-slate-500">{new Date(row.created_at).toLocaleDateString('ar-EG')}</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-bold ${row.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{row.status === 'active' ? 'نشط' : 'مغلق'}</span></div>
          {row.description && <p className="mt-3 text-sm leading-6 text-slate-600">{row.description}</p>}
          <div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-500">إجمالي التحصيل</p><p className="mt-1 font-black text-teal-800">{money(total)} ج.م</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-500">الشقق المستهدفة</p><p className="mt-1 font-black text-slate-800">{row.target_apartment_ids.length} شقة</p></div></div>
          <p className="mt-3 text-xs text-slate-500">الشقق: {targets.map(a => a.unitNumber).join('، ') || '—'}</p>
          {row.keywords?.length > 0 && <p className="mt-2 text-[11px] text-slate-500">الكلمات: {row.keywords.join(' • ')}</p>}
          {row.notify_residents && <p className="mt-2 flex items-center gap-1 text-[11px] text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />تم طلب إرسال إشعار للسكان</p>}
        </article>;
      })}</div>}
    </section>
  );
};
