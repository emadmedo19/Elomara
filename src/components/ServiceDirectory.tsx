import React, {useEffect, useState} from 'react';
import {Phone, Plus, Trash2, Pencil, Wrench} from 'lucide-react';
import {supabase} from '../lib/supabase';

type Contact = {id:string; building_id:string; category:string; name:string; phone:string; notes:string};
const DEFAULT_CATEGORIES = ['كهرباء','سباكة','مصاعد','نظافة','أمن وحراسة','نجارة','دهانات','دش وستالايت','تكييف','أخرى'];
export function ServiceDirectory({buildingId, canManage}: {buildingId:string;canManage:boolean}) {
  const [contacts,setContacts] = useState<Contact[]>([]);
  const [category,setCategory] = useState<string | null>(null);
  const [editing,setEditing] = useState<string | null>(null);
  const [name,setName] = useState('');
  const [phone,setPhone] = useState('');
  const [notes,setNotes] = useState('');
  const [customCategory,setCustomCategory] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const load = async () => {
    if (!buildingId) return;
    setLoading(true);
    const {data,error:readError} = await supabase.from('building_service_contacts').select('id,building_id,category,name,phone,notes').eq('building_id',buildingId).order('name');
    if (readError) setError('تعذر تحميل دليل الخدمات: '+readError.message);
    else {setContacts((data || []) as Contact[]);setError('');}
    setLoading(false);
  };
  useEffect(() => {setContacts([]);setCategory(null);void load();},[buildingId]);
  const categories = [...new Set([...DEFAULT_CATEGORIES,...contacts.map(c=>c.category)])];
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage || !category || !name.trim() || !/^[+0-9 ()-]{5,30}$/.test(phone.trim())) {setError('اكتب الاسم ورقم هاتف صحيح.');return;}
    setBusy(true);setError('');
    const record = {building_id:buildingId,category,name:name.trim(),phone:phone.trim(),notes:notes.trim()};
    const result = editing ? await supabase.from('building_service_contacts').update(record).eq('id',editing).eq('building_id',buildingId) : await supabase.from('building_service_contacts').insert(record);
    if (result.error) setError('تعذر حفظ مقدم الخدمة: '+result.error.message);
    else {setEditing(null);setName('');setPhone('');setNotes('');await load();}
    setBusy(false);
  };
  const remove = async (contact:Contact) => {
    if (!canManage || !window.confirm('حذف بيانات '+contact.name+'؟')) return;
    setBusy(true);
    const {error:deleteError} = await supabase.from('building_service_contacts').delete().eq('id',contact.id).eq('building_id',buildingId);
    if (deleteError) setError('تعذر الحذف: '+deleteError.message);
    else await load();
    setBusy(false);
  };
  return <section data-tour={category ? 'services-detail' : 'services-page'} dir="rtl" className="space-y-4 pb-8">
    <header className="rounded-2xl bg-teal-700 p-5 text-center text-2xl font-bold text-white">الخدمات</header>
    {!category ? <div className="grid grid-cols-2 gap-3">
      {categories.map(item=><button type="button" key={item} data-tour="services-category" onClick={()=>{setCategory(item);setEditing(null);setName('');setPhone('');setNotes('');}} className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100 text-center min-h-36 flex flex-col items-center justify-center gap-3">
        <span className="rounded-full bg-teal-50 p-4 text-teal-700"><Wrench size={30}/></span>
        <span className="font-bold text-lg">{item}</span><span className="text-xs text-slate-400">{contacts.filter(c=>c.category===item).length} مقدم خدمة</span>
      </button>)}
    </div> : <>
      <button type="button" data-tour="services-back" onClick={()=>setCategory(null)} className="text-teal-700 font-bold">‹ جميع الأقسام</button>
      <h3 className="text-xl font-bold">{category}</h3>
      {contacts.filter(c=>c.category===category).map(contact=><div key={contact.id} className="rounded-2xl border bg-white p-4 flex justify-between gap-3">
        <div><h4 className="font-bold">{contact.name}</h4><p dir="ltr" className="text-sm text-slate-600 text-right">{contact.phone}</p>{contact.notes && <p className="text-xs text-slate-500 mt-1">{contact.notes}</p>}</div>
        <div className="flex items-center gap-2">
          <a aria-label={'اتصل بـ '+contact.name} href={'tel:'+contact.phone.replace(/[^+0-9]/g,'')} className="rounded-xl bg-teal-50 p-3 text-teal-700"><Phone size={20}/></a>
          {canManage && <><button type="button" aria-label="تعديل" onClick={()=>{setEditing(contact.id);setName(contact.name);setPhone(contact.phone);setNotes(contact.notes);}} className="p-2 text-slate-600"><Pencil size={18}/></button><button type="button" aria-label="حذف" disabled={busy} onClick={()=>void remove(contact)} className="p-2 text-rose-600"><Trash2 size={18}/></button></>}
        </div>
      </div>)}
      {!contacts.some(c=>c.category===category) && <p className="text-center text-slate-500 py-5">لا يوجد مقدمو خدمة في هذا القسم حتى الآن.</p>}
      {canManage && <form onSubmit={event=>void save(event)} className="space-y-3 rounded-2xl border bg-white p-4">
        <h4 className="font-bold">{editing ? 'تعديل مقدم الخدمة' : 'إضافة مقدم خدمة'}</h4>
        <input data-tour="service-name" aria-label="اسم مقدم الخدمة" required maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="الاسم" className="w-full rounded-xl border p-3"/>
        <input aria-label="رقم الهاتف" required type="tel" maxLength={30} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="رقم الهاتف" className="w-full rounded-xl border p-3"/>
        <textarea aria-label="ملاحظات" maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="ملاحظات اختيارية" className="w-full rounded-xl border p-3"/>
        <button type="submit" disabled={busy} className="rounded-xl bg-teal-700 px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? 'جارٍ الحفظ...' : editing ? 'حفظ التعديل' : 'إضافة مقدم الخدمة'}</button>
        {editing && <button type="button" onClick={()=>{setEditing(null);setName('');setPhone('');setNotes('');}} className="mr-3 text-slate-500">إلغاء</button>}
      </form>}
    </>}
    {canManage && !category && <form onSubmit={e=>{e.preventDefault();const value=customCategory.trim();if(value.length>=2 && value.length<=60){setCategory(value);setCustomCategory('');}else setError('اسم القسم يجب أن يكون من حرفين إلى 60 حرفًا.');}} className="flex gap-2"><input aria-label="قسم جديد" maxLength={60} value={customCategory} onChange={e=>setCustomCategory(e.target.value)} placeholder="اسم قسم جديد" className="min-w-0 flex-1 rounded-xl border p-3"/><button type="submit" className="rounded-xl bg-teal-700 px-4 text-white flex items-center gap-1"><Plus size={17}/> إضافة قسم</button></form>}
    {loading && <p className="text-center text-slate-500">جارٍ تحميل الخدمات...</p>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-rose-700">{error}</p>}
  </section>;
}
