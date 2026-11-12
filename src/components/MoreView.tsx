import React from 'react';
import { Settings, LogOut, CreditCard } from 'lucide-react';
import { useState } from 'react';
import { SettingsList, SettingsPage, type SettingsListItem } from './SettingsList';
import { AccountDeletionButton } from './AccountDeletionButton';
export function MoreView({ items, onBack, onOpenAppSettings, onSignOut }: { items: SettingsListItem[]; onBack: () => void; onOpenAppSettings: () => void; onSignOut: () => void }) {
  const [showPlans, setShowPlans] = useState(false);
  const [promo, setPromo] = useState('');
  const eligible = promo.trim().toLowerCase() === 'elomara50off';
  return <SettingsPage title="المزيد" onBack={onBack}><SettingsList items={[
    ...items,
    { id: 'subscription', label: 'الاشتراك والباقات', icon: CreditCard, onClick: () => setShowPlans(value => !value) },
    { id: 'app-settings', label: 'إعدادات التطبيق', icon: Settings, onClick: onOpenAppSettings },
    { id: 'logout', label: 'تسجيل الخروج', icon: LogOut, tone: 'rose', onClick: onSignOut },
  ]}/>{showPlans && <section dir="rtl" className="mx-4 my-4 rounded-2xl border border-slate-200 p-4 space-y-3">
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
