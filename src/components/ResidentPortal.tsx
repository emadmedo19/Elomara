import { BrandLogo } from './BrandLogo';
import { GuardContact } from './GuardContact';
import React, { useEffect, useRef, useState } from 'react';
import { NotificationBell } from './NotificationBell';
import { MoreView } from './MoreView';
import { ServiceDirectory } from './ServiceDirectory';
import { AppPreferencesView } from './AppPreferencesView';
import { calculateApartmentFinancials } from '../services/financialAccounting';
import { supabase } from '../lib/supabase';
import { PollsView } from './PollsView';
import { useAuth } from '../context/AuthContext';
import { Home, Receipt, Megaphone, LogOut, AlertCircle, Building2, Wrench, CalendarDays, Plus, Clock, CheckCircle2, Wallet, Phone, RefreshCw, MoreHorizontal, BarChart3 } from 'lucide-react';

type ResidentTab = 'home' | 'payments' | 'reports' | 'announcements' | 'maintenance' | 'bookings' | 'building' | 'polls' | 'services' | 'more' | 'app-settings';

const money = (v: unknown) => Number(v || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 });
const dateLabel = (v: string) => { if (!v) return '—'; const d = new Date(v.length === 10 ? `${v}T12:00:00` : v); return Number.isNaN(d.getTime()) ? v : new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: v.length > 10 ? 'short' : undefined }).format(d); };

export const ResidentPortal: React.FC = () => {
  const { user, userProfile, signOut } = useAuth();
  const [apartment, setApartment] = useState<any>(null);
  const [building, setBuilding] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [financialReport, setFinancialReport] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<ResidentTab>('home');
  const navigateSettings = (tab: ResidentTab) => {
    if (tab === activeTab) return;
    window.history.pushState({ ...window.history.state, residentPage: tab }, '', window.location.href);
    setActiveTab(tab);
  };
  useEffect(() => {
    const back = (event: PopStateEvent) => {
      if (document.querySelector('[data-settings-subpage], [data-notification-dialog]')) return;
      const previous = event.state?.residentPage;
      setActiveTab((['home', 'payments', 'reports', 'announcements', 'maintenance', 'bookings', 'building', 'polls', 'services', 'more', 'app-settings'] as ResidentTab[]).includes(previous) ? previous : 'home');
    };
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  const [seenTicketIds, setSeenTicketIds] = useState<string[]>([]);
  const [seenAnnouncementIds, setSeenAnnouncementIds] = useState<string[]>([]);
  const notificationKey = (kind: 'tickets' | 'announcements') => `bunyan-resident-seen-${kind}-${user?.id || 'guest'}-${userProfile?.buildingId || 'building'}`;
  const unreadTicketCount = tickets.filter(item => !seenTicketIds.includes(String(item.id))).length;
  const unreadAnnouncementCount = announcements.filter(item => !seenAnnouncementIds.includes(String(item.id))).length;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [ticketForm, setTicketForm] = useState({ category: 'سباكة', title: '', description: '', urgency: 'عادي' });
  const [bookingForm, setBookingForm] = useState({ facility: 'الروف', booking_date: '', time_slot: '' });
  const [submitting, setSubmitting] = useState(false);
  const pullStartY = useRef<number | null>(null);
  const pullDistance = useRef(0);
  const [pullHint, setPullHint] = useState(false);

  const getPageScrollTop = () =>
    document.scrollingElement?.scrollTop ?? document.documentElement.scrollTop ?? window.scrollY ?? 0;

  const handlePullStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (getPageScrollTop() <= 2 && !refreshing && !loading) {
      pullStartY.current = event.touches[0]?.clientY ?? null;
      pullDistance.current = 0;
    } else {
      pullStartY.current = null;
    }
  };

  const handlePullMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (pullStartY.current === null || refreshing || loading) return;
    const distance = Math.max(0, (event.touches[0]?.clientY ?? 0) - pullStartY.current);
    pullDistance.current = distance;
    if (distance > 18 && getPageScrollTop() <= 2) setPullHint(true);
    else setPullHint(false);
  };

  const handlePullEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const startY = pullStartY.current;
    const distance = Math.max(pullDistance.current, startY === null ? 0 : (event.changedTouches[0]?.clientY ?? 0) - startY);
    pullStartY.current = null;
    pullDistance.current = 0;
    setPullHint(false);
    if (startY !== null && distance > 75 && getPageScrollTop() <= 2 && !refreshing && !loading) {
      void load(true);
    }
  };

  const handlePullCancel = () => {
    pullStartY.current = null;
    pullDistance.current = 0;
    setPullHint(false);
  };

  const load = async (quiet = false) => {
    if (!user || !userProfile?.apartmentId || !userProfile?.buildingId) { setLoading(false); return; }
    if (quiet) setRefreshing(true); else setLoading(true);
    setError('');
    const [apt, bld, pay, news, maintenance, facility, report] = await Promise.all([
      supabase.from('apartments').select('id,unit_number,floor,resident_name,resident_phone,is_owner,monthly_fee,payment_status,overdue_months,paid_amount,credit_balance,last_payment_date').eq('id', userProfile.apartmentId).single(),
      supabase.from('buildings').select('id,name,address,manager_name,manager_phone,balance,monthly_target,reserve_fund,total_units,total_floors').eq('id', userProfile.buildingId).single(),
      supabase.from('payments').select('id,amount,payment_date,month,method,receipt_number,notes,payment_type,is_assessment,exceptional_charge_id,assessment_cancelled').eq('apartment_id', userProfile.apartmentId).order('payment_date',{ascending:false}),
      supabase.from('announcements').select('id,title,content,announcement_type,created_at,pinned').eq('building_id', userProfile.buildingId).order('pinned',{ascending:false}).order('created_at',{ascending:false}),
      supabase.from('maintenance_tickets').select('id,category,title,description,urgency,status,created_at,updated_at').eq('apartment_id', userProfile.apartmentId).order('created_at',{ascending:false}),
      supabase.from('facility_bookings').select('id,facility,booking_date,time_slot,status,created_at').eq('apartment_id', userProfile.apartmentId).order('booking_date',{ascending:false}),
      supabase.rpc('get_building_financial_summary', { p_building_id: userProfile.buildingId }),
    ]);
    const firstError = apt.error || bld.error;
    if (firstError) setError('تعذر تحميل بيانات الحساب: ' + firstError.message);
    const rows = pay.data || [];
    const totals = apt.data ? calculateApartmentFinancials({
      ...apt.data, buildingId: userProfile.buildingId, unitNumber: apt.data.unit_number,
      residentName: apt.data.resident_name, residentPhone: apt.data.resident_phone, isOwner: apt.data.is_owner,
      status: apt.data.payment_status, monthlyFee: Number(apt.data.monthly_fee || 0), overdueMonths: apt.data.overdue_months,
    }, rows.map((p: any) => ({ ...p, apartmentId: apt.data.id, paymentType: p.payment_type,
      isAssessment: p.is_assessment, assessmentCancelled: p.assessment_cancelled, exceptionalChargeId: p.exceptional_charge_id,
      date: p.payment_date, amount: Number(p.amount || 0) }))) : null;
    setApartment(apt.data ? { ...apt.data, paid_amount: totals?.totalPaid || 0,
      remaining: totals?.remaining || 0, payment_status: totals?.status } : null);
    setBuilding(bld.data); setPayments(rows.filter((p: any) => !p.is_assessment));
    if (news.error) {
      console.error('[Elomara resident announcements]', news.error);
      setError(previous => previous || 'تعذر تحميل الإعلانات: ' + news.error.message);
    }
    setAnnouncements(news.data || []); setTickets(maintenance.data || []); setBookings(facility.data || []);
    // Legacy Base64 images are fetched individually, so the announcements list stays below
    // the API response-size limit. Do not drop the image from the stored announcement.
    if (!news.error && news.data?.length) {
      const buildingId = userProfile.buildingId;
      void (async () => {
        for (const announcement of news.data) {
          const { data: image, error: imageError } = await supabase.from('announcements')
            .select('image_url').eq('id', announcement.id).eq('building_id', buildingId).maybeSingle();
          if (imageError) {
            console.warn('[Elomara resident announcement image]', announcement.id, imageError);
            continue;
          }
          if (image?.image_url) setAnnouncements(items => items.map(item =>
            item.id === announcement.id ? { ...item, image_url: image.image_url } : item));
        }
      })();
    }
    if (report.error) console.error('[Bunyan financial summary]', report.error);
    setFinancialReport(report.data || null);
    setLoading(false); setRefreshing(false);
  };

  useEffect(() => {
    try {
      setSeenTicketIds(JSON.parse(localStorage.getItem(notificationKey('tickets')) || '[]'));
      setSeenAnnouncementIds(JSON.parse(localStorage.getItem(notificationKey('announcements')) || '[]'));
    } catch { setSeenTicketIds([]); setSeenAnnouncementIds([]); }
  }, [user?.id, userProfile?.buildingId]);

  useEffect(() => {
    if (activeTab === 'maintenance' && tickets.length) {
      const next = Array.from(new Set([...seenTicketIds, ...tickets.map(item => String(item.id))]));
      setSeenTicketIds(next);
      try { localStorage.setItem(notificationKey('tickets'), JSON.stringify(next)); } catch {}
    }
    if (activeTab === 'announcements' && announcements.length) {
      const next = Array.from(new Set([...seenAnnouncementIds, ...announcements.map(item => String(item.id))]));
      setSeenAnnouncementIds(next);
      try { localStorage.setItem(notificationKey('announcements'), JSON.stringify(next)); } catch {}
    }
  }, [activeTab, tickets, announcements]);

  useEffect(() => {
    let active = true;
    const run = async () => { await load(); };
    void run();
    return () => { active = false; };
  }, [user?.id, userProfile?.apartmentId, userProfile?.buildingId]);

  const submitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketForm.title.trim() || !ticketForm.description.trim() || !user || !apartment || !building) return;
    setSubmitting(true); setNotice(''); setError('');
    const { error: insertError } = await supabase.from('maintenance_tickets').insert({
      building_id: building.id, apartment_id: apartment.id, unit_number: apartment.unit_number,
      resident_name: userProfile?.displayName || apartment.resident_name || user.email || '', category: ticketForm.category,
      title: ticketForm.title.trim(), description: ticketForm.description.trim(),
      urgency: ticketForm.urgency, status: 'جديد', created_by: user.id,
    });
    setSubmitting(false);
    if (insertError) { setError('لم نتمكن من إرسال البلاغ: ' + insertError.message); return; }
    setTicketForm({ category: 'سباكة', title: '', description: '', urgency: 'عادي' });
    setNotice('تم إرسال بلاغ الصيانة للإدارة بنجاح.');
    await load(true);
  };

  const submitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingForm.booking_date || !bookingForm.time_slot.trim() || !user || !apartment || !building) return;
    if (bookingForm.booking_date < new Date().toISOString().slice(0,10)) { setError('اختار تاريخًا قادمًا للحجز.'); return; }
    setSubmitting(true); setNotice(''); setError('');
    const { error: insertError } = await supabase.from('facility_bookings').insert({
      building_id: building.id, apartment_id: apartment.id, facility: bookingForm.facility,
      unit_number: apartment.unit_number, resident_name: userProfile?.displayName || apartment.resident_name || user.email || '',
      booking_date: bookingForm.booking_date, time_slot: bookingForm.time_slot.trim(),
      status: 'قيد المراجعة', created_by: user.id,
    });
    setSubmitting(false);
    if (insertError) { setError('لم نتمكن من إرسال طلب الحجز: ' + insertError.message); return; }
    setBookingForm({ facility: 'الروف', booking_date: '', time_slot: '' });
    setNotice('تم إرسال طلب الحجز للإدارة.');
    await load(true);
  };

  if (loading) return <div className="min-h-screen bg-[#07131e] text-white flex items-center justify-center">جارٍ تحميل بيانات شقتك بأمان...</div>;
  if (!userProfile?.apartmentId || !userProfile?.buildingId) return <div dir="rtl" className="min-h-screen bg-[#07131e] text-white flex items-center justify-center p-5"><div className="max-w-md w-full rounded-3xl bg-[#10283a] p-6 text-center"><Home className="w-10 h-10 text-amber-300 mx-auto mb-3"/><h2 className="font-bold text-lg">حسابك معتمد — في انتظار تخصيص الشقة</h2><p className="text-sm text-slate-300 leading-7 mt-2">مدير العقار اعتمد حسابك. بمجرد ربطه بشقتك ستظهر بياناتك هنا.</p><button onClick={() => void signOut()} className="mt-5 rounded-xl bg-slate-700 px-5 py-3">تسجيل الخروج</button></div></div>;

  const primaryNav: { id: ResidentTab; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: 'الرئيسية', icon: <Home className="w-5 h-5"/> },
    { id: 'payments', label: 'حسابي المالي', icon: <Receipt className="w-5 h-5"/> },
    { id: 'maintenance', label: 'الصيانة والبلاغات', icon: <Wrench className="w-5 h-5"/> },
  ];
  const moreNav: { id: ResidentTab; label: string; icon: React.ReactNode }[] = [
    { id: 'polls', label: 'تصويت الجمعية والقرارات', icon: <BarChart3 className="w-5 h-5"/> },
    { id: 'reports', label: 'تقارير العمارة', icon: <Wallet className="w-5 h-5"/> },
    { id: 'bookings', label: 'حجز المرافق', icon: <CalendarDays className="w-5 h-5"/> },
    { id: 'announcements', label: 'إعلانات العمارة', icon: <Megaphone className="w-5 h-5"/> },
    { id: 'building', label: 'عن العمارة', icon: <Building2 className="w-5 h-5"/> },
  ];
  const statusLabel = apartment?.payment_status === 'paid' ? 'مسدد' : apartment?.payment_status === 'overdue' ? 'متأخر' : 'قيد المتابعة';
  const ticketStatus = (s: string) => s === 'مكتمل' ? 'مكتمل' : s === 'قيد التنفيذ' ? 'قيد التنفيذ' : 'جديد';

  return <div dir="rtl" onTouchStart={handlePullStart} onTouchMove={handlePullMove} onTouchEnd={handlePullEnd} onTouchCancel={handlePullCancel} className="bunyan-resident fotouh-portal min-h-screen bg-[#f4f7fb] text-slate-800" style={{ overscrollBehaviorY: 'contain', touchAction: 'pan-y' }}>
    {(pullHint || refreshing) && <div className="fixed top-0 inset-x-0 z-[60] flex justify-center pt-2 pointer-events-none"><div className="rounded-full bg-[#0f2537] text-white text-xs px-4 py-2 shadow-lg flex items-center gap-2"><RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}/>{refreshing ? 'جارٍ تحديث البيانات...' : 'اترك الشاشة للتحديث'}</div></div>}
    <header className="bg-[#0f2537] text-white sticky top-0 z-40 shadow-lg">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <BrandLogo id="resident-brand-lockup" className="h-20 w-[72px] shrink-0 object-contain"/>
          <div className="min-w-0"><p id="resident-building-subtitle" className="text-[11px] truncate" style={{ color: "#35565a", opacity: 1, fontWeight: 700 }}>{building?.name || 'بوابة السكان'} • شقة {apartment?.unit_number}</p></div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button id="resident-refresh-button" onClick={() => void load(true)} disabled={refreshing} className="p-2 rounded-xl" style={{ backgroundColor: "#e6f4f1", color: "#0f766e", border: "1px solid #9acfc4", opacity: 1, minWidth: 42, minHeight: 42 }} title="تحديث البيانات"><RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} style={{ color: "#0f766e", stroke: "#0f766e" }}/></button>
          <NotificationBell onNavigate={page => {
            const allowed: ResidentTab[] = ['home','payments','reports','announcements','maintenance','bookings','building','polls'];
            setActiveTab(allowed.includes(page as ResidentTab) ? page as ResidentTab : 'home');
            setNotice(''); setError(''); void load(true);
          }}/>
        </div>
      </div>

    </header>

    <nav aria-label="التنقل الرئيسي" className="resident-bottom-nav fixed bottom-0 inset-x-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur-md shadow-[0_-5px_20px_rgba(15,40,50,.08)]" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}>
      <div className="mx-auto grid max-w-xl grid-cols-4 gap-1 px-2 pt-2">
        {primaryNav.map(item => <button key={item.id} aria-current={activeTab===item.id ? 'page' : undefined} onClick={() => { setActiveTab(item.id); setNotice(''); setError(''); }} className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-bold transition ${activeTab === item.id ? 'bg-teal-50 text-teal-800' : 'text-slate-500'}`}><span className={`settings-icon settings-icon-${item.id==='maintenance'?'violet':item.id==='payments'?'teal':'blue'} nav-color-icon`}>{item.icon}{item.id==='maintenance' && unreadTicketCount>0 && <span className="absolute -right-3 -top-3 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-600 px-1 text-[10px] font-black leading-none text-white">{unreadTicketCount}</span>}</span><span className="truncate max-w-full">{item.label}</span></button>)}
        <button onClick={() => navigateSettings('more')} aria-current={['more', 'app-settings', ...moreNav.map(item => item.id)].includes(activeTab) ? 'page' : undefined} className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-bold ${['more', 'app-settings', ...moreNav.map(item => item.id)].includes(activeTab) ? 'bg-teal-50 text-teal-800' : 'text-slate-500'}`}><span className="settings-icon settings-icon-blue nav-color-icon"><MoreHorizontal className="w-5 h-5"/></span><span>المزيد</span></button>
      </div>
    </nav>
    <main key={activeTab} className="bunyan-page-enter max-w-6xl mx-auto p-3 sm:p-5 pb-28 space-y-4">
      {error && <div className="rounded-xl bg-rose-50 text-rose-800 border border-rose-100 p-3 text-sm flex gap-2"><AlertCircle className="w-5 h-5 shrink-0"/>{error}</div>}
      {notice && <div className="rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-100 p-3 text-sm flex gap-2"><CheckCircle2 className="w-5 h-5 shrink-0"/>{notice}</div>}

      {activeTab === 'more' && <MoreView onBack={() => window.history.back()} onOpenAppSettings={() => navigateSettings('app-settings')} onSignOut={() => void signOut()} items={[
        { id: 'services', label: 'دليل الخدمات وأرقام الفنيين', icon: Wrench, tone: 'teal', onClick: () => navigateSettings('services') },
        { id: 'polls', label: 'تصويت الجمعية والقرارات', icon: BarChart3, tone: 'violet', onClick: () => navigateSettings('polls') },
        { id: 'reports', label: 'تقارير العمارة', icon: Wallet, tone: 'teal', onClick: () => navigateSettings('reports') },
        { id: 'bookings', label: 'حجز المرافق', icon: CalendarDays, tone: 'gold', onClick: () => navigateSettings('bookings') },
        { id: 'announcements', label: 'إعلانات العمارة', icon: Megaphone, count: unreadAnnouncementCount, onClick: () => navigateSettings('announcements') },
        { id: 'building', label: 'عن العمارة', icon: Building2, tone: 'teal', onClick: () => navigateSettings('building') },
      ]}/>}
      {activeTab === 'services' && <ServiceDirectory buildingId={userProfile?.buildingId || ''} canManage={false}/>}
      {activeTab === 'app-settings' && <AppPreferencesView onBack={() => window.history.back()} onSignOut={() => void signOut()}/>}
      {activeTab === 'home' && <>
        <section className="rounded-2xl bg-gradient-to-l from-[#0f2537] to-[#1c4467] text-white p-5 shadow">
          <div className="flex items-center justify-between gap-2"><div className="text-sm text-teal-200">أهلاً بك في بوابة السكان</div><span className="text-[11px] rounded-full bg-emerald-400/15 text-emerald-200 px-3 py-1">حساب معتمد</span></div>
          <h2 className="text-2xl font-black mt-2">{userProfile?.displayName || apartment?.resident_name || user?.email}</h2>
          <p className="mt-1 text-slate-200">شقة {apartment?.unit_number} • الدور {apartment?.floor} • {building?.name}{userProfile?.residentLabel ? ` • ${userProfile.residentLabel}` : ''}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
            <div className="rounded-xl bg-white/10 p-3"><div className="text-xs text-slate-300">الاشتراك الشهري</div><b>{money(apartment?.monthly_fee)} جنيه</b></div>
            <div className="rounded-xl bg-white/10 p-3"><div className="text-xs text-slate-300">حالة السداد</div><b>{statusLabel}</b></div>
            <div className="rounded-xl bg-white/10 p-3 col-span-2 sm:col-span-1"><div className="text-xs text-slate-300">رصيد الشقة</div><b>{money(apartment?.credit_balance)} جنيه</b></div>
          </div>
        </section>
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {label:'مدفوعاتي',value:payments.length,unit:'عملية',icon:<Wallet/>,tab:'payments' as ResidentTab},
            {label:'بلاغات الصيانة',value:tickets.length,unit:'بلاغ',icon:<Wrench/>,tab:'maintenance' as ResidentTab},
            {label:'طلبات الحجز',value:bookings.length,unit:'طلب',icon:<CalendarDays/>,tab:'bookings' as ResidentTab},
            {label:'إعلانات جديدة',value:announcements.length,unit:'إعلان',icon:<Megaphone/>,tab:'announcements' as ResidentTab},
          ].map(card=><button key={card.tab} onClick={()=>setActiveTab(card.tab)} className="bg-white rounded-2xl border p-4 text-right shadow-sm hover:border-teal-300"><div className={`settings-icon settings-icon-${card.tab==='maintenance'?'violet':card.tab==='bookings'?'gold':card.tab==='announcements'?'blue':'teal'} mb-2`}>{card.icon}</div><div className="text-xs text-slate-500">{card.label}</div><div className="text-xl font-black mt-1">{card.value} <span className="text-xs font-normal text-slate-500">{card.unit}</span></div></button>)}
        </section>
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border p-4 shadow-sm"><h3 className="font-bold mb-3">آخر الإعلانات</h3>{announcements.slice(0,3).length ? announcements.slice(0,3).map(n=><div key={n.id} className="border-t py-2"><b className="text-sm">{n.title}</b><p className="text-xs text-slate-500 mt-1 line-clamp-2">{n.content}</p></div>) : <p className="text-sm text-slate-500">لا توجد إعلانات حاليًا.</p>}<button onClick={()=>setActiveTab('announcements')} className="text-teal-700 text-xs font-bold mt-2">عرض كل الإعلانات</button></div>
          <div className="bg-white rounded-2xl border p-4 shadow-sm"><h3 className="font-bold mb-3">التواصل مع الإدارة</h3><p className="text-sm text-slate-600">{building?.manager_name || 'إدارة العمارة'}</p><GuardContact buildingId={userProfile.buildingId} />{building?.manager_phone ? <a className="inline-flex items-center gap-2 mt-3 rounded-xl bg-teal-50 text-teal-800 px-3 py-2 text-sm font-bold" href={`tel:${building.manager_phone}`}><Phone className="w-4 h-4"/> {building.manager_phone}</a> : <p className="text-xs text-slate-500 mt-2">يمكنك إرسال بلاغ صيانة من قسم الصيانة والبلاغات.</p>}</div>
        </section>
      </>}

      {activeTab === 'payments' && <section className="bg-white rounded-2xl border p-4 sm:p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3"><Receipt className="w-5 h-5 text-teal-600"/><h3 className="font-bold">حسابي المالي وسجل المدفوعات</h3></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl bg-slate-50 border p-3"><div className="text-xs text-slate-500">الاشتراك الشهري</div><b>{money(apartment?.monthly_fee)} جنيه</b></div>
          <div className="rounded-xl bg-slate-50 border p-3"><div className="text-xs text-slate-500">إجمالي المسدد</div><b>{money(apartment?.paid_amount)} جنيه</b></div>
          <div className="rounded-xl bg-slate-50 border p-3 col-span-2 sm:col-span-1"><div className="text-xs text-slate-500">المتأخرات بالشهور</div><b>{Number(apartment?.overdue_months || 0)} شهر</b></div>
          <div className="rounded-xl bg-slate-50 border p-3 col-span-2 sm:col-span-3"><div className="text-xs text-slate-500">المتبقي شامل التحصيل الاستثنائي</div><b>{money(apartment?.remaining)} جنيه</b></div>
        </div>
        {payments.length ? payments.map(p=><div key={p.id} className="flex justify-between gap-3 border-t py-3 text-sm"><div><b>{p.month || dateLabel(p.payment_date)}</b><p className="text-xs text-slate-500">{p.method || 'نقدي'} {p.receipt_number ? '• إيصال '+p.receipt_number : ''}</p>{p.notes && <p className="text-xs text-slate-500 mt-1">{p.notes}</p>}</div><div className="text-left"><b className="whitespace-nowrap">{money(p.amount)} جنيه</b><p className="text-[11px] text-slate-400">{dateLabel(p.payment_date)}</p></div></div>) : <p className="text-sm text-slate-500">لا توجد مدفوعات مسجلة لهذه الشقة حتى الآن.</p>}
      </section>}

      {activeTab === 'reports' && <section className="space-y-4">
        <div className="bg-white rounded-2xl border p-4 sm:p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1"><Wallet className="w-5 h-5 text-teal-600"/><h3 className="font-bold">الملخص المالي للعمارة</h3></div>
          <p className="text-xs text-slate-500 mb-4">كشف تحصيل الشقق: رقم الشقة والمبلغ المسدد والمتبقي وحالة السداد، بدون أسماء السكان أو بياناتهم الشخصية.</p>
          {financialReport ? <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3"><div className="text-xs text-emerald-800">إجمالي التحصيلات</div><b className="text-lg text-emerald-900">{money(financialReport.total_collected)} ج.م</b></div>
            <div className="rounded-xl bg-rose-50 border border-rose-100 p-3"><div className="text-xs text-rose-800">إجمالي المصروفات</div><b className="text-lg text-rose-900">{money(financialReport.total_expenses)} ج.م</b></div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3"><div className="text-xs text-amber-800">المتبقي للتحصيل</div><b className="text-lg text-amber-900">{money(financialReport.outstanding_amount)} ج.م</b></div>
            <div className="rounded-xl bg-sky-50 border border-sky-100 p-3"><div className="text-xs text-sky-800">رصيد الخزينة</div><b className="text-lg text-sky-900">{money(financialReport.treasury_balance)} ج.م</b></div>
          </div> : <p className="text-sm text-slate-500">التقرير غير متاح حاليًا. اسحب للتحديث وحاول مرة أخرى.</p>}
        </div>
        {financialReport?.apartments?.length > 0 && <div className="bg-white rounded-2xl border p-4 sm:p-5 shadow-sm">
          <h3 className="font-bold mb-3">موقف السداد لكل شقة</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right min-w-[420px]">
              <thead><tr className="border-b text-slate-500 text-xs"><th className="py-3 px-2">الشقة</th><th className="py-3 px-2">دفعت كام</th><th className="py-3 px-2">باقي كام</th><th className="py-3 px-2">الحالة</th></tr></thead>
              <tbody>{financialReport.apartments.map((apt:any)=><tr key={apt.unit_number} className="border-b last:border-0">
                <td className="py-3 px-2 font-bold">{apt.unit_number}</td>
                <td className="py-3 px-2 text-emerald-700 font-semibold">{money(apt.total_paid)} ج.م</td>
                <td className="py-3 px-2 text-rose-700 font-semibold">{money(apt.remaining)} ج.م</td>
                <td className="py-3 px-2"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${apt.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{apt.status === 'paid' ? 'خالص' : apt.status === 'partial' ? 'سداد جزئي' : apt.status === 'overdue' ? 'متأخر' : 'مطلوب سداد'}</span></td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>}
        {financialReport?.monthly?.length > 0 && <div className="bg-white rounded-2xl border p-4 sm:p-5 shadow-sm">
          <h3 className="font-bold mb-3">الحركة المالية الشهرية – آخر 12 شهرًا</h3>
          <div className="space-y-3">{financialReport.monthly.map((m:any)=><div key={m.month} className="border-t pt-3">
            <div className="flex justify-between text-xs font-bold mb-2"><span>{m.month}</span><span className="text-slate-500">صافي: {money(Number(m.income||0)-Number(m.expenses||0))} ج.م</span></div>
            <div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-emerald-50 p-2 text-emerald-800">تحصيل: {money(m.income)} ج.م</div><div className="rounded-lg bg-rose-50 p-2 text-rose-800">مصروفات: {money(m.expenses)} ج.م</div></div>
          </div>)}</div>
        </div>}
        {financialReport?.expense_categories?.length > 0 && <div className="bg-white rounded-2xl border p-4 sm:p-5 shadow-sm">
          <h3 className="font-bold mb-3">توزيع المصروفات حسب البند</h3>
          {financialReport.expense_categories.map((item:any)=><div key={item.category} className="flex justify-between border-t py-3 text-sm"><span>{item.category}</span><b>{money(item.amount)} ج.م</b></div>)}
        </div>}
      </section>}

      {activeTab === 'maintenance' && <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <form onSubmit={submitTicket} className="bg-white rounded-2xl border p-4 sm:p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2"><Wrench className="w-5 h-5 text-teal-600"/><h3 className="font-bold">إرسال بلاغ صيانة جديد</h3></div>
          <label className="block text-xs font-bold text-slate-600">نوع المشكلة<select value={ticketForm.category} onChange={e=>setTicketForm({...ticketForm,category:e.target.value})} className="mt-1 w-full rounded-xl border p-3 bg-white"><option>سباكة</option><option>كهرباء</option><option>نظافة</option><option>مصعد</option><option>أمن وحراسة</option><option>مرافق مشتركة</option><option>أخرى</option></select></label>
          <label className="block text-xs font-bold text-slate-600">عنوان البلاغ<input required value={ticketForm.title} onChange={e=>setTicketForm({...ticketForm,title:e.target.value})} maxLength={120} className="mt-1 w-full rounded-xl border p-3" placeholder="مثال: تسريب مياه في الحمام"/></label>
          <label className="block text-xs font-bold text-slate-600">التفاصيل<textarea required value={ticketForm.description} onChange={e=>setTicketForm({...ticketForm,description:e.target.value})} maxLength={2000} rows={3} className="mt-1 w-full rounded-xl border p-3" placeholder="اشرح المشكلة ومكانها..."/></label>
          <label className="block text-xs font-bold text-slate-600">الأولوية<select value={ticketForm.urgency} onChange={e=>setTicketForm({...ticketForm,urgency:e.target.value})} className="mt-1 w-full rounded-xl border p-3 bg-white"><option>عادي</option><option>متوسط</option><option>عاجل</option></select></label>
          <button disabled={submitting} className="w-full rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-bold p-3">{submitting?'جارٍ الإرسال...':'إرسال البلاغ للإدارة'}</button>
        </form>
        <div className="bg-white rounded-2xl border p-4 sm:p-5 shadow-sm"><h3 className="font-bold mb-3">بلاغاتي ومتابعة التنفيذ</h3>{tickets.length ? tickets.map(t=><article key={t.id} className="border-t py-3"><div className="flex items-start justify-between gap-2"><b className="text-sm">{t.title}</b><span className="text-[11px] rounded-full bg-slate-100 px-2 py-1 whitespace-nowrap">{ticketStatus(t.status)}</span></div><p className="text-xs text-slate-500 mt-1">{t.category} • أولوية {t.urgency}</p><p className="text-sm text-slate-600 mt-2">{t.description}</p><p className="text-[11px] text-slate-400 mt-2">تاريخ البلاغ: {new Date(t.created_at).toLocaleDateString('ar-EG')}</p></article>) : <p className="text-sm text-slate-500">لم ترسل أي بلاغات حتى الآن.</p>}</div>
      </section>}

      {activeTab === 'bookings' && <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <form onSubmit={submitBooking} className="bg-white rounded-2xl border p-4 sm:p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2"><CalendarDays className="w-5 h-5 text-teal-600"/><h3 className="font-bold">طلب حجز مرفق</h3></div>
          <label className="block text-xs font-bold text-slate-600">المرفق<select value={bookingForm.facility} onChange={e=>setBookingForm({...bookingForm,facility:e.target.value})} className="mt-1 w-full rounded-xl border p-3 bg-white"><option>الروف</option><option>قاعة الاجتماعات</option><option>مكان انتظار الزوار</option><option>موقف الزوار</option><option>أخرى</option></select></label>
          <label className="block text-xs font-bold text-slate-600">التاريخ<input required type="date" min={new Date().toISOString().slice(0,10)} value={bookingForm.booking_date} onChange={e=>setBookingForm({...bookingForm,booking_date:e.target.value})} className="mt-1 w-full rounded-xl border p-3"/></label>
          <label className="block text-xs font-bold text-slate-600">الوقت / الفترة<input required value={bookingForm.time_slot} onChange={e=>setBookingForm({...bookingForm,time_slot:e.target.value})} maxLength={80} className="mt-1 w-full rounded-xl border p-3" placeholder="مثال: من 5 إلى 7 مساءً"/></label>
          <button disabled={submitting} className="w-full rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-bold p-3">{submitting?'جارٍ الإرسال...':'إرسال طلب الحجز'}</button>
          <p className="text-[11px] text-slate-500">الحجز يظل طلبًا قيد المراجعة حتى تؤكده الإدارة.</p>
        </form>
        <div className="bg-white rounded-2xl border p-4 sm:p-5 shadow-sm"><h3 className="font-bold mb-3">حجوزاتي</h3>{bookings.length ? bookings.map(b=><article key={b.id} className="border-t py-3 flex justify-between gap-2"><div><b className="text-sm">{b.facility}</b><p className="text-xs text-slate-500 mt-1">{dateLabel(b.booking_date)} • {b.time_slot}</p></div><span className="text-[11px] bg-amber-50 text-amber-800 rounded-full px-2 py-1 h-fit">{b.status}</span></article>) : <p className="text-sm text-slate-500">لا توجد طلبات حجز حتى الآن.</p>}</div>
      </section>}

      {activeTab === 'announcements' && <section className="bg-white rounded-2xl border p-4 sm:p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3"><Megaphone className="w-5 h-5 text-teal-600"/><h3 className="font-bold">إعلانات العمارة وقرارات الإدارة</h3></div>
        {announcements.length ? announcements.map(n=><article key={n.id} className="border-t py-4"><div className="flex items-center gap-2"><b>{n.title}</b>{n.pinned && <span className="text-[10px] bg-amber-50 text-amber-700 rounded-full px-2 py-1">مهم</span>}</div><p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{n.content}</p>{n.image_url && <a href={n.image_url} target="_blank" rel="noreferrer" className="block mt-3" aria-label={`عرض صورة الإعلان: ${n.title}`}><img src={n.image_url} alt={`صورة الإعلان: ${n.title}`} loading="lazy" className="w-full max-w-lg mx-auto h-auto rounded-2xl border border-slate-200 shadow-sm object-contain" /></a>}<p className="text-[11px] text-slate-400 mt-2">{dateLabel(n.created_at)}</p></article>) : <p className="text-sm text-slate-500">لا توجد إعلانات حاليًا.</p>}
      </section>}

      {activeTab === 'polls' && <PollsView buildingId={userProfile.buildingId} canManage={false} />}

      {activeTab === 'building' && <section className="bg-white rounded-2xl border p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2"><Building2 className="w-5 h-5 text-teal-600"/><h3 className="font-bold">معلومات العمارة</h3></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-xl bg-slate-50 border p-3"><p className="text-xs text-slate-500">عدد الشقق</p><b>{building?.total_units ?? '—'}</b></div>
          <div className="rounded-xl bg-slate-50 border p-3"><p className="text-xs text-slate-500">عدد الأدوار</p><b>{building?.total_floors ?? '—'}</b></div>
          <div className="rounded-xl bg-slate-50 border p-3"><p className="text-xs text-slate-500">صندوق الاحتياطي</p><b>{money(building?.reserve_fund)} جنيه</b></div>
        </div>
        <div><p className="text-xs text-slate-500">العنوان</p><p className="font-semibold mt-1">{building?.address || 'غير مسجل'}</p></div>
        <div className="rounded-xl bg-teal-50 border border-teal-100 p-4"><p className="text-sm font-bold text-teal-900">التواصل مع الإدارة</p><p className="text-sm text-teal-800 mt-1">{building?.manager_name || 'إدارة العمارة'}</p><GuardContact buildingId={userProfile.buildingId} />{building?.manager_phone ? <a href={`tel:${building.manager_phone}`} className="inline-flex items-center gap-2 mt-2 text-sm font-bold text-teal-800"><Phone className="w-4 h-4"/>{building.manager_phone}</a> : <p className="text-xs text-teal-700 mt-1">رقم التواصل غير متاح حاليًا.</p>}</div>
        <p className="text-[11px] text-slate-500">المعلومات المعروضة هنا تعريفية فقط. التقارير المالية التفصيلية وبيانات الشقق الأخرى متاحة للإدارة وحدها.</p>
      </section>}
    </main>
  </div>;
};
