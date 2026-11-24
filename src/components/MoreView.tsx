import React, { useCallback, useId, useRef } from 'react';
import { usePlayBilling } from '../hooks/usePlayBilling';
import { TourHelpButton } from './AppTour';
import { Settings, CreditCard, CalendarDays, CalendarRange, ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { SettingsList, SettingsPage, type SettingsListItem } from './SettingsList';

const subscriptionPlans = [
  { id: 'elomara_building_monthly', title: 'شهري', interval: 'دفعة كل شهر', icon: CalendarDays },
  { id: 'elomara_building_annual', title: 'سنوي', interval: 'دفعة كل سنة', icon: CalendarRange },
] as const;

type VipCode = { id: string; code: string | null; created_at: string; status: 'available' | 'paused' | 'revoked' | 'used' };
type VipCodeAction = 'generate' | 'pause' | 'resume' | 'delete';
const vipCodeStatus: Record<VipCode['status'], string> = {
  available: 'متاح', paused: 'موقوف', revoked: 'ملغي', used: 'مستخدم',
};

export function MoreView({ items, buildingId, onBack, onOpenAppSettings, onSignOut }: { items: SettingsListItem[]; buildingId?: string; onBack: () => void; onOpenAppSettings: () => void; onSignOut: () => void }) {
  const [showPlans, setShowPlans] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const planGroupId = useId();
  const [subscription, setSubscription] = useState<{status: string; plan?: string | null; trial_ends_at?: string | null; paid_through?: string | null; days_remaining?: number} | null>(null);
  const activeBuilding = useRef(buildingId);
  activeBuilding.current = buildingId;
  const refreshSubscription = useCallback(async () => {
    if (!buildingId) return;
    const {data,error} = await supabase.rpc('get_building_subscription', {p_building_id:buildingId});
    if (activeBuilding.current === buildingId && !error && data) setSubscription(data as typeof subscription);
  }, [buildingId]);
  const billing = usePlayBilling(buildingId, showPlans && subscription?.status !== 'vip', refreshSubscription);
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
  const [vipCodes, setVipCodes] = useState<VipCode[] | null>(null);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [codeToDelete, setCodeToDelete] = useState<string | null>(null);
  const [codeMessage, setCodeMessage] = useState('');
  const [ownerError, setOwnerError] = useState('');
  const [codeAction, setCodeAction] = useState<VipCodeAction | null>(null);
  const loadVipCodes = async () => {
    setLoadingCodes(true);
    setOwnerError('');
    try {
      const {data, error} = await supabase.rpc('platform_subscription_admin', {p_action: 'list'});
      if (error) throw new Error(error.message);
      if (!Array.isArray(data)) throw new Error('تعذر قراءة قائمة الأكواد');
      const codes: VipCode[] = data;
      setVipCodes(codes);
      setOwnerSummary(previous => previous && {
        ...previous,
        codes_available: codes.filter(code => code.status === 'available').length,
        codes_used: codes.filter(code => code.status === 'used').length,
      });
    } catch (error) {
      setOwnerError(error instanceof Error ? error.message : 'تعذر تحديث قائمة الأكواد');
    } finally {
      setLoadingCodes(false);
    }
  };
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
  const changeVipCode = async (action: VipCodeAction, id?: string) => {
    if (codeAction || loadingCodes) return;
    setCodeAction(action);
    setOwnerError('');
    setCodeMessage('');
    try {
      const {data,error} = await supabase.rpc('platform_subscription_admin', {p_action: action, ...(id && {p_code_id: id})});
      if (error) throw new Error(error.message);
      if (!(action === 'generate' ? data?.code : data?.ok)) throw new Error('تعذر تنفيذ العملية');
      setCodeToDelete(null);
      setCodeMessage({ generate: 'تم إنشاء الكود', pause: 'تم إيقاف الكود', resume: 'تم إعادة تفعيل الكود', delete: 'تم حذف الكود' }[action]);
      await loadVipCodes();
    } catch (error) {
      setOwnerError(error instanceof Error ? error.message : 'تعذر تحديث الكود');
    } finally {
      setCodeAction(null);
    }
  };
  const copyVipCode = async (code: string) => {
    setOwnerError('');
    try {
      await navigator.clipboard.writeText(code);
      setCodeMessage('تم نسخ الكود');
    } catch {
      setCodeMessage('');
      setOwnerError('تعذر نسخ الكود. يمكنك تحديد النص ونسخه يدويًا.');
    }
  };
  const codesBusy = loadingCodes || codeAction !== null;
  const eligible = promoApplied;
  const isVip = subscription?.status === 'vip';
  const plans = subscriptionPlans.map(plan => ({
    ...plan,
    product: billing.products.find(product => product.productId === plan.id),
  }));
  const selectedPlan = plans.find(plan => plan.id === selectedPlanId && plan.product) ?? plans.find(plan => plan.product);
  const trialDays = Math.max(0, subscription?.days_remaining ?? 0);
  const trialProgress = Math.min(14, trialDays) / 14;
  const canPurchase = billing.ready && !billing.busy && subscription?.status !== 'active';
  return <SettingsPage tourTarget="more-page" title={ownerOpen ? "إدارة اشتراكات المنصة" : showPlans ? "الاشتراك والباقات" : "المزيد"} onBack={ownerOpen ? () => setOwnerOpen(false) : showPlans ? () => setShowPlans(false) : onBack} subpage={ownerOpen || showPlans}>{!ownerOpen && !showPlans && <div className="px-4 pb-3"><TourHelpButton /></div>}{!ownerOpen && !showPlans && <div className="space-y-4">
    {[
      { title: 'الحسابات والتقارير', ids: ['exceptional','reports'] },
      { title: 'خدمات السكان', ids: ['services','polls','maintenance','bookings','announcements','building'] },
      { title: 'أدوات مساعدة', ids: ['chat','studio'] },
      { title: 'إدارة العمارة', ids: ['buildings','building-settings'] },
    ].map(group => { const rows = items.filter(item => group.ids.includes(item.id)); return rows.length ? <section key={group.title}><h2 className="px-4 py-2 text-sm font-bold text-slate-600">{group.title}</h2><SettingsList items={rows}/></section> : null; })}
    <section><h2 className="px-4 py-2 text-sm font-bold text-slate-600">الإعدادات والحساب</h2><SettingsList items={[
      ...items.filter(item => !['exceptional','reports','services','polls','maintenance','bookings','announcements','building','chat','studio','buildings','building-settings'].includes(item.id)),
      ...(ownerSummary ? [{ id: 'platform-subscriptions', label: 'إدارة اشتراكات المنصة', icon: CreditCard, onClick: () => { setShowPlans(false); setOwnerOpen(true); setCodeToDelete(null); if (!codesBusy) void loadVipCodes(); } }] : []),
      ...(buildingId ? [{ id: 'subscription', label: 'الاشتراك والباقات', icon: CreditCard, onClick: () => { setOwnerOpen(false); setSelectedPlanId(null); setShowPlans(true); } }] : []),
      { id: 'app-settings', label: 'إعدادات التطبيق والحساب', icon: Settings, onClick: onOpenAppSettings },
    ]}/></section>
  </div>}{ownerSummary && ownerOpen && <section dir="rtl" className="mx-4 my-4 rounded-2xl border border-slate-200 p-4 space-y-3">
    <h3 className="text-lg font-bold">إدارة اشتراكات المنصة</h3>
    <p className="text-sm">العمارات: {ownerSummary.buildings} · تجريبي: {ownerSummary.trial} · نشط: {ownerSummary.active} · مجاني VIP: {ownerSummary.vip}</p>
    <p className="text-sm">أكواد متاحة: {ownerSummary.codes_available} · مستخدمة: {ownerSummary.codes_used}</p>
    <section className="space-y-2" aria-label="أكواد اشتراك VIP">
      <h4 className="font-semibold">أكواد اشتراك VIP</h4>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={codesBusy} onClick={() => void changeVipCode('generate')} className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">{codeAction === 'generate' ? 'جارٍ الإنشاء...' : 'إنشاء كود VIP مجاني'}</button>
        <button type="button" disabled={codesBusy} onClick={() => void loadVipCodes()} className="rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">تحديث الأكواد</button>
      </div>
      {codeMessage && <p role="status" className="text-sm">{codeMessage}</p>}
      {ownerError && <p role="alert" className="text-sm text-red-600">{ownerError}</p>}
      {loadingCodes && <p role="status" className="text-sm text-slate-500">جارٍ تحميل الأكواد...</p>}
      {vipCodes?.length === 0 && !loadingCodes && <p className="text-sm text-slate-500">مفيش أكواد اشتراك VIP لعرضها.</p>}
      {vipCodes?.map(item => <div key={item.id} className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <span className="font-semibold">{vipCodeStatus[item.status]}</span>
          <span className="text-slate-500">{new Date(item.created_at).toLocaleString('ar-EG')}</span>
        </div>
        {item.code ? <code dir="ltr" className="block select-all break-all">{item.code}</code>
          : <p className="text-slate-500">المرجع <bdi>{item.id.slice(0, 8)}</bdi>{item.status !== 'used' && ' · نص الكود غير محفوظ'}</p>}
        <div className="flex flex-wrap gap-2">
          {item.code && <button type="button" disabled={codesBusy} onClick={() => void copyVipCode(item.code!)} className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-50">نسخ</button>}
          {(item.status === 'available' || item.status === 'paused') && <button type="button" disabled={codesBusy} onClick={() => void changeVipCode(item.status === 'available' ? 'pause' : 'resume', item.id)} className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-50">{item.status === 'available' ? 'إيقاف' : 'إعادة تفعيل'}</button>}
          {item.status !== 'used' && codeToDelete !== item.id && <button type="button" disabled={codesBusy} onClick={() => setCodeToDelete(item.id)} className="rounded-lg border border-red-200 px-3 py-2 text-red-700 disabled:opacity-50">حذف</button>}
        </div>
        {item.status !== 'used' && codeToDelete === item.id && <div className="space-y-2">
          <p>حذف الكود نهائيًا؟ بعد الحذف مش هيكون ممكن استخدامه.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={codesBusy} onClick={() => void changeVipCode('delete', item.id)} className="rounded-lg bg-red-700 px-3 py-2 text-white disabled:opacity-50">تأكيد الحذف</button>
            <button type="button" disabled={codesBusy} onClick={() => setCodeToDelete(null)} className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-50">رجوع</button>
          </div>
        </div>}
      </div>)}
    </section>
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
  </section>}{showPlans && <section dir="rtl" className="mx-4 my-4 space-y-4">
    {!isVip && <fieldset className="min-w-0 space-y-3">
      <legend className="mb-2 text-lg font-bold">باقات العمارة</legend>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {plans.map(({ id, title, interval, icon: Icon, product }) => (
          <label key={id} className="relative min-w-0">
            <input type="radio" name={planGroupId} checked={selectedPlan?.id === id} disabled={!product}
              onChange={() => setSelectedPlanId(id)} className="peer sr-only" />
            <span className="flex h-full min-h-32 flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-slate-900 shadow-sm transition duration-200 peer-enabled:cursor-pointer peer-checked:-translate-y-0.5 peer-checked:border-sky-600 peer-checked:bg-sky-50 peer-checked:shadow-md peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky-600 motion-reduce:transform-none motion-reduce:transition-none">
              <span className="flex items-center gap-2 font-bold"><Icon size={18} aria-hidden="true" className="shrink-0 text-sky-700" />{title}</span>
              <span className="break-words text-sm font-extrabold tabular-nums sm:text-lg">{product?.price || 'السعر متاح عبر Google Play'}</span>
              <span className="mt-auto text-xs text-slate-600">{interval} لكل عمارة</span>
            </span>
          </label>
        ))}
      </div>
      {selectedPlan?.product && <button type="button" disabled={!canPurchase}
        onClick={() => selectedPlan.product && void billing.purchase(selectedPlan.product)}
        className="min-h-11 w-full rounded-xl bg-slate-900 px-4 py-2.5 font-bold text-white transition-transform enabled:active:scale-[.98] disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none">
        {selectedPlan.id === 'elomara_building_monthly' ? 'اشتراك شهري' : 'اشتراك سنوي'}
      </button>}
    </fieldset>}
    {buildingId && subscription && <div className="rounded-2xl border border-sky-100 bg-sky-50 p-3 text-sm text-slate-900">
      <p className="font-semibold">حالة الاشتراك: {subscription.status === 'vip' ? 'VIP مجاني مدى الحياة' : subscription.status === 'active' ? 'نشط' : subscription.status === 'trial' ? 'تجريبي' : 'منتهي'}</p>
      {subscription.status === 'trial' && <p>متبقي من التجربة: {subscription.days_remaining ?? 0} يوم · تنتهي {subscription.trial_ends_at ? new Date(subscription.trial_ends_at).toLocaleDateString('ar-EG') : '—'}</p>}
      {subscription.status === 'trial' && <div role="progressbar" aria-label="المتبقي من الفترة التجريبية" aria-valuemin={0} aria-valuemax={14} aria-valuenow={Math.min(trialDays, 14)}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-sky-100">
        <div className="h-full origin-right rounded-full bg-sky-600 transition-transform motion-reduce:transition-none" style={{ transform: `scaleX(${trialProgress})` }} />
      </div>}
      {subscription.status !== 'vip' && subscription.paid_through && <p>تاريخ التجديد: {new Date(subscription.paid_through).toLocaleDateString('ar-EG')}</p>}
      {subscription.status === 'expired' && <p>لم يتم تقييد استخدام العمارة؛ الدفع الإلكتروني قيد التجهيز.</p>}
    </div>}
    {isVip ? <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
      <p className="font-bold">اشتراك VIP مجاني مدى الحياة</p>
      <p className="mt-2 text-sm">تم تفعيل الاشتراك المجاني الدائم لهذه العمارة. لن يُطلب منك اشتراك شهري أو سنوي أو تجديد.</p>
      {subscription?.paid_through && <button type="button" onClick={() => void billing.manage()} className="mt-3 rounded-lg border border-emerald-300 px-3 py-2 text-sm">إدارة اشتراك Google Play السابق</button>}
    </div> : <>
    <p className="text-sm text-slate-500">14 يوم تجربة مجانية لكل عمارة جديدة. السكان يستخدمون التطبيق مجانًا.</p>
    {billing.ready && <div className="grid grid-cols-2 gap-2 text-sm"><button disabled={billing.busy} onClick={() => void billing.restore()} className="rounded-lg border border-slate-300 px-3 py-2">استعادة المشتريات</button><button onClick={() => void billing.manage()} className="rounded-lg border border-slate-300 px-3 py-2">إدارة أو إلغاء الاشتراك</button></div>}
    {billing.loading && <p role="status" className="text-sm">جارٍ تحميل أسعار Google Play...</p>}
    {billing.products.length < 2 && <button type="button" disabled={billing.loading || billing.busy} onClick={billing.reload} className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-50">إعادة تحميل الباقات</button>}
    {billing.message && <p role="status" className="text-sm">{billing.message}</p>}
    {buildingId && <details className="group rounded-xl border border-slate-200 p-3">
      <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
        كود خاص أو كود خصم <ChevronDown size={16} aria-hidden="true" className="transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="mt-2 space-y-2">
      <label className="sr-only" htmlFor="subscription-special-code">كود خاص أو كود خصم</label>
      <input id="subscription-special-code" dir="ltr" value={specialCode} onChange={event => { setSpecialCode(event.target.value); setPromoApplied(false); setVipMessage(''); }} placeholder="أدخل الكود هنا" autoComplete="off" className="w-full rounded-xl border border-slate-300 p-3" />
      <button type="button" disabled={!specialCode.trim() || vipRedeeming} onClick={() => void applySpecialCode()} className="rounded-xl bg-slate-900 px-4 py-3 text-white disabled:opacity-50">{vipRedeeming ? 'جارٍ التحقق...' : 'تطبيق الكود'}</button>
      {vipMessage && <p role="status" className="text-sm">{vipMessage}</p>}
      {eligible && <p className="text-sm text-emerald-700">عرض المؤسسين لأول 10 عمارات محفوظ. لا يُطبق أي خصم إلا إذا كان مُعدًا ومتحققًا منه عبر Google Play؛ الشراء الحالي بالسعر الظاهر من المتجر.</p>}
      </div>
    </details>}
    <p className="text-sm text-slate-500">الاشتراك للعمارة كاملة بواسطة مديرها فقط. يتجدد تلقائيًا حتى إلغائه من Google Play. لا توجد قيود دفع على استخدام التطبيق.</p>
    </>}
  </section>}</SettingsPage>;
}
