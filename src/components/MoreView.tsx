import React from 'react';
import { Settings, LogOut, CreditCard } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { SettingsList, SettingsPage, type SettingsListItem } from './SettingsList';
import { AccountDeletionButton } from './AccountDeletionButton';
export function MoreView({ items, onBack, onOpenAppSettings, onSignOut }: { items: SettingsListItem[]; onBack: () => void; onOpenAppSettings: () => void; onSignOut: () => void }) {
  const [showPlans, setShowPlans] = useState(false);
  const [promo, setPromo] = useState('');
  const [ownerSummary, setOwnerSummary] = useState<{ buildings: number; trial: number; active: number; vip: number; codes_available: number; codes_used: number } | null>(null);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [newVipCode, setNewVipCode] = useState('');
  const [ownerError, setOwnerError] = useState('');
  const [generating, setGenerating] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase.rpc('platform_subscription_admin', { p_action: 'summary' }).then(({data,error}) => {
      if (active && !error && data && typeof data === 'object') setOwnerSummary(data as typeof ownerSummary);
    });
    return () => { active = false; };
  }, []);
  const generateVip = async () => {
    if (generating) return;
    setGenerating(true); setOwnerError(''); setNewVipCode('');
    try {
      const {data,error} = await supabase.rpc('platform_subscription_admin', {p_action:'generate'});
      if (error) throw new Error(error.message);
      if (!data?.code) throw new Error('لم يتم إنشاء الكود');
      setNewVipCode(String(data.code));
      const {data:summary} = await supabase.rpc('platform_subscription_admin', {p_action:'summary'});
      if (summary) setOwnerSummary(summary as typeof ownerSummary);
    } catch (error) { setOwnerError(error instanceof Error ? error.message : 'تعذر إنشاء الكود'); }
    finally { setGenerating(false); }
  };
  const eligible = promo.trim().toLowerCase() === 'elomara50off';
  return <SettingsPage title="المزيد" onBack={onBack}><SettingsList items={[
    ...items,
    ...(ownerSummary ? [{ id: 'platform-subscriptions', label: 'إدارة اشتراكات المنصة', icon: CreditCard, onClick: () => setOwnerOpen(value => !value) }] : []),
    { id: 'subscription', label: 'الاشتراك والباقات', icon: CreditCard, onClick: () => setShowPlans(value => !value) },
    { id: 'app-settings', label: 'إعدادات التطبيق', icon: Settings, onClick: onOpenAppSettings },
    { id: 'logout', label: 'تسجيل الخروج', icon: LogOut, tone: 'rose', onClick: onSignOut },
  ]}/>{ownerSummary && ownerOpen && <section dir="rtl" className="mx-4 my-4 rounded-2xl border border-slate-200 p-4 space-y-3">
    <h3 className="text-lg font-bold">إدارة اشتراكات المنصة</h3>
    <p className="text-sm">العمارات: {ownerSummary.buildings} · تجريبي: {ownerSummary.trial} · نشط: {ownerSummary.active} · مجاني VIP: {ownerSummary.vip}</p>
    <p className="text-sm">أكواد متاحة: {ownerSummary.codes_available} · مستخدمة: {ownerSummary.codes_used}</p>
    <button type="button" disabled={generating} onClick={() => void generateVip()} className="rounded-xl bg-slate-900 px-4 py-3 text-white disabled:opacity-50">{generating ? 'جارٍ الإنشاء...' : 'إنشاء كود VIP مجاني'}</button>
    {newVipCode && <div className="rounded-xl bg-slate-50 p-3 break-all"><p className="text-sm font-semibold">انسخ الكود الآن؛ لن يظهر مرة أخرى:</p><code dir="ltr">{newVipCode}</code><button type="button" className="block mt-2 underline" onClick={() => void navigator.clipboard.writeText(newVipCode)}>نسخ الكود</button></div>}
    {ownerError && <p role="alert" className="text-sm text-red-600">{ownerError}</p>}
    <p className="text-xs text-slate-500">توليد الأكواد جاهز. تفعيلها داخل حساب العمارة والدفع الإلكتروني قيد الإعداد.</p>
  </section>}{showPlans && <section dir="rtl" className="mx-4 my-4 rounded-2xl border border-slate-200 p-4 space-y-3">
    <h3 className="text-lg font-bold">باقات العمارة</h3>
    <p className="text-sm text-slate-500">14 يوم تجربة مجانية لكل عمارة جديدة. السكان يستخدمون التطبيق مجانًا.</p>
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-xl bg-slate-50 p-3"><div className="font-semibold">شهري</div><div className="text-xl font-bold">{eligible ? '49.50' : '99'} ج</div><div className="text-xs text-slate-500">كل شهر</div></div>
      <div className="rounded-xl bg-slate-50 p-3"><div className="font-semibold">سنوي</div><div className="text-xl font-bold">{eligible ? '499.50' : '999'} ج</div><div className="text-xs text-slate-500">كل سنة</div></div>
    </div>
    <label className="block text-sm font-medium" htmlFor="subscription-promo">كود الخصم</label>
    <input id="subscription-promo" value={promo} onChange={event => setPromo(event.target.value)} placeholder="أدخل كود الخصم" className="w-full rounded-xl border border-slate-300 p-3" autoComplete="off" />
    {eligible && <p className="text-sm text-emerald-700">خصم 50% مبدئيًا. التفعيل النهائي مشروط بتوافر مكان ضمن أول 10 عمارات وإتمام أول دفعة.</p>}
    <p className="text-sm text-slate-500">الدفع الإلكتروني قيد التجهيز. الأسعار المعروضة للتعريف فقط؛ لم يتم تفعيل أي اشتراك أو حجز الخصم.</p>
  </section>}<AccountDeletionButton/></SettingsPage>;
}
