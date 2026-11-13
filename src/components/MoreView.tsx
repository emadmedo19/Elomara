import React from 'react';
import { TourHelpButton } from './AppTour';
import { Settings, LogOut, CreditCard } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { SettingsList, SettingsPage, type SettingsListItem } from './SettingsList';
import { AccountDeletionButton } from './AccountDeletionButton';
export function MoreView({ items, buildingId, onBack, onOpenAppSettings, onSignOut }: { items: SettingsListItem[]; buildingId?: string; onBack: () => void; onOpenAppSettings: () => void; onSignOut: () => void }) {
  const [showPlans, setShowPlans] = useState(false);
  const [subscription, setSubscription] = useState<{status: string; plan?: string | null; trial_ends_at?: string | null; paid_through?: string | null; days_remaining?: number} | null>(null);
  const [platformBuildings, setPlatformBuildings] = useState<Array<{id:string;name:string;status:string;plan?:string|null;trial_ends_at?:string|null;paid_through?:string|null}>>([]);
  useEffect(() => {
    if (!buildingId) { setSubscription(null); return; }
    let active = true;
    void supabase.rpc('get_building_subscription', {p_building_id:buildingId}).then(({data,error}) => {
      if (active && !error && data) setSubscription(data as typeof subscription);
    });
    return () => {active = false;};
  }, [buildingId]);
  const [specialCode, setSpecialCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [vipRedeeming, setVipRedeeming] = useState(false);
  const [vipMessage, setVipMessage] = useState('');
  const applySpecialCode = async () => {
    if (!buildingId || vipRedeeming || !specialCode.trim()) return;
    setVipMessage('');
    setPromoApplied(false);
    const code = specialCode.trim();
    if (code.toLowerCase() === 'elomara50off') {
      setPromoApplied(true);
      setVipMessage('تم التعرف على كود الخصم. الخصم مبدئي لحين إتمام الدفع والتحقق من توافر العرض.');
      return;
    }
    if (!/^ELM-VIP-[A-F0-9]{24}$/i.test(code)) {
      setVipMessage('الكود غير صحيح. تأكد من كتابته وحاول مرة أخرى.');
      return;
    }
    setVipRedeeming(true);
    try {
      const { data, error } = await supabase.rpc('redeem_building_vip', {p_building_id: buildingId, p_code: code});
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error('تعذر تفعيل الكود');
      setVipMessage('تم تفعيل الاشتراك المجاني مدى الحياة لهذه العمارة بنجاح.');
      setSpecialCode('');
      setSubscription(previous => previous ? {...previous,status:'vip',days_remaining:0} : {status:'vip'});
    } catch (error) { setVipMessage(error instanceof Error ? error.message : 'تعذر تفعيل الكود'); }
    finally { setVipRedeeming(false); }
  };
  const [ownerSummary, setOwnerSummary] = useState<{ buildings: number; trial: number; active: number; vip: number; codes_available: number; codes_used: number } | null>(null);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [buildingSearch, setBuildingSearch] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('all');
  const [refreshingBuildings, setRefreshingBuildings] = useState(false);
  const [buildingsError, setBuildingsError] = useState('');
  const refreshBuildings = async () => {
    if (refreshingBuildings) return;
    setRefreshingBuildings(true); setBuildingsError('');
    try {
      const [{data:list,error}, {data:summary,error:summaryError}] = await Promise.all([
        supabase.rpc('get_building_subscription', {}),
        supabase.rpc('platform_subscription_admin', {p_action:'summary'}),
      ]);
      if (error) throw new Error(error.message);
      if (summaryError) throw new Error(summaryError.message);
      if (!Array.isArray(list?.buildings)) throw new Error('تعذر قراءة قائمة العمارات');
      setPlatformBuildings(list.buildings);
      if (summary) setOwnerSummary(summary as typeof ownerSummary);
    } catch (error) { setBuildingsError(error instanceof Error ? error.message : 'تعذر تحديث الاشتراكات'); }
    finally { setRefreshingBuildings(false); }
  };
  const visibleBuildings = platformBuildings.filter(b =>
    (buildingFilter === 'all' || b.status === buildingFilter) &&
    b.name.toLocaleLowerCase().includes(buildingSearch.trim().toLocaleLowerCase())
  );
  const [newVipCode, setNewVipCode] = useState('');
  const [ownerError, setOwnerError] = useState('');
  const [generating, setGenerating] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase.rpc('platform_subscription_admin', { p_action: 'summary' }).then(({data,error}) => {
      if (active && !error && data && typeof data === 'object') {
        setOwnerSummary(data as typeof ownerSummary);
        void supabase.rpc('get_building_subscription', {}).then(({data:list}) => {
          if (active && Array.isArray(list?.buildings)) setPlatformBuildings(list.buildings);
        });
      }
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
  const eligible = promoApplied;
  return <SettingsPage tourTarget="more-page" title={ownerOpen ? "إدارة اشتراكات المنصة" : showPlans ? "الاشتراك والباقات" : "المزيد"} onBack={ownerOpen ? () => setOwnerOpen(false) : showPlans ? () => setShowPlans(false) : onBack} subpage={ownerOpen || showPlans}>{!ownerOpen && !showPlans && <div className="px-4 pb-3"><TourHelpButton /></div>}{!ownerOpen && !showPlans && <SettingsList items={[
    ...items,
    ...(ownerSummary ? [{ id: 'platform-subscriptions', label: 'إدارة اشتراكات المنصة', icon: CreditCard, onClick: () => { setShowPlans(false); setOwnerOpen(true); } }] : []),
    { id: 'subscription', label: 'الاشتراك والباقات', icon: CreditCard, onClick: () => { setOwnerOpen(false); setShowPlans(true); } },
    { id: 'app-settings', label: 'إعدادات التطبيق', icon: Settings, onClick: onOpenAppSettings },
    { id: 'logout', label: 'تسجيل الخروج', icon: LogOut, tone: 'rose', onClick: onSignOut },
  ]}/>}{ownerSummary && ownerOpen && <section dir="rtl" className="mx-4 my-4 rounded-2xl border border-slate-200 p-4 space-y-3">
    <h3 className="text-lg font-bold">إدارة اشتراكات المنصة</h3>
    <p className="text-sm">العمارات: {ownerSummary.buildings} · تجريبي: {ownerSummary.trial} · نشط: {ownerSummary.active} · مجاني VIP: {ownerSummary.vip}</p>
    <p className="text-sm">أكواد متاحة: {ownerSummary.codes_available} · مستخدمة: {ownerSummary.codes_used}</p>
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold">اشتراكات العمارات</h4>
        <button type="button" disabled={refreshingBuildings} onClick={() => void refreshBuildings()} className="rounded-lg border border-slate-300 px-3 py-2 text-xs disabled:opacity-50">{refreshingBuildings ? 'جارٍ التحديث...' : 'تحديث البيانات'}</button>
      </div>
      <input aria-label="البحث عن عمارة" value={buildingSearch} onChange={event => setBuildingSearch(event.target.value)} placeholder="ابحث باسم العمارة" className="w-full rounded-xl border border-slate-300 p-3 text-sm" />
      <select aria-label="تصفية حسب حالة الاشتراك" value={buildingFilter} onChange={event => setBuildingFilter(event.target.value)} className="w-full rounded-xl border border-slate-300 p-3 text-sm">
        <option value="all">جميع الاشتراكات</option>
        <option value="trial">تجريبي</option>
        <option value="active">نشط</option>
        <option value="vip">مجاني</option>
        <option value="expired">منتهي</option>
      </select>
      <p className="text-xs text-slate-500">النتائج: {visibleBuildings.length} من {platformBuildings.length}</p>
      {buildingsError && <p role="alert" className="text-sm text-red-600">{buildingsError}</p>}
      {visibleBuildings.length === 0 && <p className="text-sm text-slate-500">لا توجد عمارات مطابقة للبحث.</p>}
      {visibleBuildings.map(b => <div key={b.id} className="rounded-xl border border-slate-200 p-3 text-sm">
        <div className="font-semibold">{b.name}</div>
        <div>الحالة: {b.status === 'vip' ? 'مجاني' : b.status === 'active' ? 'نشط' : b.status === 'trial' ? 'تجريبي' : 'منتهي'} · الباقة: {b.plan === 'monthly' ? 'شهري' : b.plan === 'annual' ? 'سنوي' : '—'}</div>
        {b.status === 'trial' && b.trial_ends_at && <div>نهاية التجربة: {new Date(b.trial_ends_at).toLocaleDateString('ar-EG')}</div>}
        {b.paid_through && <div>تاريخ التجديد: {new Date(b.paid_through).toLocaleDateString('ar-EG')}</div>}
      </div>)}
    </div>
    <button type="button" disabled={generating} onClick={() => void generateVip()} className="rounded-xl bg-slate-900 px-4 py-3 text-white disabled:opacity-50">{generating ? 'جارٍ الإنشاء...' : 'إنشاء كود VIP مجاني'}</button>
    {newVipCode && <div className="rounded-xl bg-slate-50 p-3 break-all"><p className="text-sm font-semibold">انسخ الكود الآن؛ لن يظهر مرة أخرى:</p><code dir="ltr">{newVipCode}</code><button type="button" className="block mt-2 underline" onClick={() => void navigator.clipboard.writeText(newVipCode)}>نسخ الكود</button></div>}
    {ownerError && <p role="alert" className="text-sm text-red-600">{ownerError}</p>}
    <p className="text-xs text-slate-500">توليد الأكواد جاهز. تفعيلها داخل حساب العمارة والدفع الإلكتروني قيد الإعداد.</p>
  </section>}{showPlans && <section dir="rtl" className="mx-4 my-4 rounded-2xl border border-slate-200 p-4 space-y-3">
    <h3 className="text-lg font-bold">باقات العمارة</h3>
    {buildingId && subscription && <div className="rounded-xl border border-slate-200 p-3 text-sm">
      <p className="font-semibold">حالة الاشتراك: {subscription.status === 'vip' ? 'مجاني' : subscription.status === 'active' ? 'نشط' : subscription.status === 'trial' ? 'تجريبي' : 'منتهي'}</p>
      {subscription.status === 'trial' && <p>متبقي من التجربة: {subscription.days_remaining ?? 0} يوم · تنتهي {subscription.trial_ends_at ? new Date(subscription.trial_ends_at).toLocaleDateString('ar-EG') : '—'}</p>}
      {subscription.paid_through && <p>تاريخ التجديد: {new Date(subscription.paid_through).toLocaleDateString('ar-EG')}</p>}
      {subscription.status === 'expired' && <p>لم يتم تقييد استخدام العمارة؛ الدفع الإلكتروني قيد التجهيز.</p>}
    </div>}
    <p className="text-sm text-slate-500">14 يوم تجربة مجانية لكل عمارة جديدة. السكان يستخدمون التطبيق مجانًا.</p>
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-xl bg-slate-50 p-3"><div className="font-semibold">شهري</div><div className="text-xl font-bold">{eligible ? '49.50' : '99'} ج</div><div className="text-xs text-slate-500">كل شهر</div></div>
      <div className="rounded-xl bg-slate-50 p-3"><div className="font-semibold">سنوي</div><div className="text-xl font-bold">{eligible ? '499.50' : '999'} ج</div><div className="text-xs text-slate-500">كل سنة</div></div>
    </div>
    {buildingId && <div className="space-y-2 rounded-xl border border-slate-200 p-3">
      <label className="block text-sm font-medium" htmlFor="subscription-special-code">كود خاص أو كود خصم</label>
      <input id="subscription-special-code" dir="ltr" value={specialCode} onChange={event => { setSpecialCode(event.target.value); setPromoApplied(false); setVipMessage(''); }} placeholder="أدخل الكود هنا" autoComplete="off" className="w-full rounded-xl border border-slate-300 p-3" />
      <button type="button" disabled={!specialCode.trim() || vipRedeeming} onClick={() => void applySpecialCode()} className="rounded-xl bg-slate-900 px-4 py-3 text-white disabled:opacity-50">{vipRedeeming ? 'جارٍ التحقق...' : 'تطبيق الكود'}</button>
      {vipMessage && <p role="status" className="text-sm">{vipMessage}</p>}
      {eligible && <p className="text-sm text-emerald-700">خصم 50% مبدئيًا. التفعيل النهائي مشروط بتوافر مكان ضمن أول 10 عمارات وإتمام أول دفعة.</p>}
    </div>}
    <p className="text-sm text-slate-500">الدفع الإلكتروني قيد التجهيز. الأسعار المعروضة للتعريف فقط؛ لم يتم تفعيل أي اشتراك أو حجز الخصم.</p>
  </section>}{!ownerOpen && !showPlans && <AccountDeletionButton/>}</SettingsPage>;
}
