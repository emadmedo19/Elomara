import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { SettingsPage } from './SettingsList';
interface TreasurySnapshot { balance: number; openingBalance: number | null; reserveFund: number; }
const money = (value: number) => value.toLocaleString('ar-EG', { maximumFractionDigits: 2 });
const validAmount = (value: string) => /^\d+(\.\d{1,2})?$/.test(value.trim()) && Number(value) <= 9999999999.99;
export function TreasurySettingsView({ buildingId, onBack, onSaved }: { buildingId: string; onBack: () => void; onSaved: (value: TreasurySnapshot) => void }) {
  const [snapshot, setSnapshot] = useState<TreasurySnapshot | null>(null);
  const [opening, setOpening] = useState('');
  const [reserve, setReserve] = useState('');
  const [included, setIncluded] = useState<'included' | 'add' | ''>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setNotice('');
    const load = async () => {
      try {
        const { data, error: loadError } = await supabase.from('buildings').select('balance,opening_balance,reserve_fund').eq('id', buildingId).single();
        if (!active) return;
        if (loadError || !data) { setError('تعذر تحميل الأرصدة. حدّث البيانات وحاول مرة أخرى.'); return; }
        const next = { balance: Number(data.balance), openingBalance: data.opening_balance == null ? null : Number(data.opening_balance), reserveFund: Number(data.reserve_fund) };
        setSnapshot(next); setOpening(next.openingBalance == null ? '' : String(next.openingBalance)); setReserve(String(next.reserveFund)); setIncluded('');
      } catch { if (active) setError('تعذر الاتصال بالخادم. حاول مرة أخرى.'); }
      finally { if (active) setLoading(false); }
    };
    void load(); return () => { active = false; };
  }, [buildingId, reload]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (saving || !snapshot) return;
    setNotice(''); setError('');
    if (!validAmount(opening) || !validAmount(reserve)) { setError('أدخل مبالغ من صفر إلى 9,999,999,999.99 بحد أقصى رقمين بعد العلامة العشرية.'); return; }
    if (snapshot.openingBalance === null && !included) { setError('حدد هل الرصيد الافتتاحي مشمول بالفعل في رصيد الخزينة الحالي.'); return; }
    setSaving(true);
    try {
      const { data, error: saveError } = await supabase.rpc('update_building_treasury_settings', {
        target_building_id: buildingId, new_opening_balance: Number(opening), new_reserve_fund: Number(reserve),
        expected_balance: snapshot.balance, expected_opening_balance: snapshot.openingBalance, expected_reserve_fund: snapshot.reserveFund,
        opening_already_included: snapshot.openingBalance === null ? included === 'included' : null,
      });
      if (saveError) { setError(saveError.message); return; }
      if (!data || !Number.isFinite(Number(data.balance)) || data.opening_balance == null || data.reserve_fund == null) { setError('تعذر التحقق من نتيجة الحفظ. حدّث البيانات قبل المحاولة مرة أخرى.'); return; }
      const next = { balance: Number(data.balance), openingBalance: Number(data.opening_balance), reserveFund: Number(data.reserve_fund) };
      setSnapshot(next); setOpening(String(next.openingBalance)); setReserve(String(next.reserveFund)); setIncluded(''); onSaved(next);
      setNotice('تم حفظ الرصيد الافتتاحي ووديعة الصيانة. لم تُضف أي مبالغ إلى تحصيل الشقق.');
    } catch { setError('تعذر الاتصال بالخادم. حدّث البيانات للتحقق من الحفظ.'); }
    finally { setSaving(false); }
  };
  const delta = snapshot && validAmount(opening) ? (snapshot.openingBalance === null && included !== 'add' ? 0 : Number(opening) - (snapshot.openingBalance || 0)) : 0;
  return <SettingsPage tourTarget="treasury-page" title="الرصيد الافتتاحي ووديعة الصيانة" onBack={onBack}>
    {error && <p role="alert" className="settings-error">{error}</p>}
    {notice && <p role="status" className="settings-notice">{notice}</p>}
    {loading ? <p role="status" className="settings-help">جارٍ تحميل الأرصدة...</p> : <>
      <button type="button" className="text-sm text-sky-700 mb-4" disabled={saving} onClick={()=>setReload(value=>value+1)}>تحديث الأرصدة من الخادم</button>
      {snapshot && <form className="settings-panel" onSubmit={save}>
        <div className="settings-finance-summary"><div><span>رصيد الخزينة الحالي</span><strong>{money(snapshot.balance)} ج.م</strong></div><div><span>وديعة الصيانة المسجلة</span><strong>{money(snapshot.reserveFund)} ج.م</strong></div></div>
        <label className="settings-form-label">الرصيد الافتتاحي (ج.م)<input type="number" inputMode="decimal" min="0" max="9999999999.99" step="0.01" required disabled={saving} data-tour="treasury-opening" value={opening} onChange={event=>setOpening(event.target.value)}/></label>
        {snapshot.openingBalance === null ? <>
          <p className="settings-help">لم يُحفظ الرصيد الافتتاحي لهذه العمارة بشكل منفصل من قبل. راجع سجلاتك وحدد طريقة تسجيله حتى لا يُضاف مرتين.</p>
          <fieldset className="settings-finance-choice" disabled={saving}><legend>هل المبلغ موجود ضمن الخزينة الحالية؟</legend><label><input type="radio" name="opening-included" checked={included==='included'} onChange={()=>setIncluded('included')} required/>نعم، تسجيل الرصيد فقط دون إضافته للخزينة</label><label><input type="radio" name="opening-included" checked={included==='add'} onChange={()=>setIncluded('add')} required/>لا، إضافة المبلغ إلى رصيد الخزينة الحالي</label></fieldset>
        </> : <p className="settings-help">تعديل الرصيد الافتتاحي يغيّر الخزينة بقيمة الفرق فقط، مع الاحتفاظ بحركات التحصيل والمصروفات.</p>}
        <label className="settings-form-label">وديعة الصيانة / الصندوق الاحتياطي (ج.م)<input type="number" inputMode="decimal" min="0" max="9999999999.99" step="0.01" required disabled={saving} data-tour="treasury-reserve" value={reserve} onChange={event=>setReserve(event.target.value)}/></label>
        <p className="settings-help">تُحفظ الوديعة في بند الصندوق الاحتياطي الموجود ببيانات العمارة، ولا تُسجل كتحصيل جديد أو تُضاف تلقائيًا لرصيد الخزينة.</p>
        <p className="settings-help">رصيد الخزينة بعد الحفظ: <strong>{money(snapshot.balance + delta)} ج.م</strong></p>
        <button type="submit" className="settings-save" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ الأرصدة'}</button>
      </form>}
    </>}
  </SettingsPage>;
}
