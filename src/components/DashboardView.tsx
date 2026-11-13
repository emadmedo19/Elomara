import React from 'react';
import { Building, Apartment, Expense, Announcement, MaintenanceTicket, Payment } from '../types';
import { calculateBuildingFinancials } from '../services/financialAccounting';
import {
  PlusCircle, Receipt, FileText, Sparkles, ArrowDownRight, Wrench,
  Megaphone, TrendingUp, Wallet, ChevronLeft, CalendarDays, BarChart3
} from 'lucide-react';

interface DashboardViewProps {
  building: Building;
  apartments: Apartment[];
  payments?: Payment[];
  expenses: Expense[];
  announcements: Announcement[];
  tickets: MaintenanceTicket[];
  onNavigate: (tab: string) => void;
  onOpenAddExpense: () => void;
  onOpenPdf: () => void;
  onOpenAddPayment: () => void;
  canManageAnnouncements?: boolean;
  onDeleteAnnouncement?: (announcementId: string) => void;
}

const money = (value: number) => Number(value || 0).toLocaleString('en-US');
const dateLabel = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? value + 'T12:00:00' : value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short' }).format(date);
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  building, apartments, payments = [], expenses, announcements, tickets, onNavigate,
  onOpenAddExpense, onOpenPdf, onOpenAddPayment, canManageAnnouncements = false, onDeleteAnnouncement,
}) => {
  const fin = calculateBuildingFinancials(building.id, apartments, payments);
  const expensesTotal = expenses.reduce((sum, item) => sum + item.amount, 0);
  const pendingTickets = tickets.filter(ticket => ticket.status !== 'مكتمل').length;
  const now = new Date();
  const monthName = new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(now);
  const quickActions = [
    { label: 'تسجيل تحصيل', hint: 'إضافة دفعة جديدة', icon: PlusCircle, tone: 'teal', action: onOpenAddPayment },
    { label: 'مصروف جديد', hint: 'تسجيل فاتورة', icon: Receipt, tone: 'rose', action: onOpenAddExpense },
    { label: 'طلبات الصيانة', hint: pendingTickets ? pendingTickets + ' طلب مفتوح' : 'متابعة الطلبات', icon: Wrench, tone: 'violet', action: () => onNavigate('resident') },
    { label: 'التقارير', hint: 'عرض المؤشرات المالية', icon: FileText, tone: 'blue', action: () => onNavigate('reports') },
    { label: 'لوحة الإعلانات', hint: 'النماذج والإعلانات', icon: Megaphone, tone: 'blue', action: () => onNavigate('image-studio') },
    { label: 'استطلاعات الرأي', hint: 'الاستطلاعات والنتائج', icon: BarChart3, tone: 'teal', action: () => onNavigate('polls') },
  ];


  return (
    <div className="elomara-light-dashboard space-y-5 pb-5" dir="rtl">
      <section data-tour="dashboard-welcome" className="light-welcome" aria-label="ملخص العمارة">
        <div className="light-welcome-heading">
          <div><h1>مرحبًا بك</h1><p>في إدارة {building.name || 'العمارة'}</p></div>
          <span className="light-month"><CalendarDays size={15} aria-hidden="true" />{monthName}</span>
        </div>
        <div className="light-welcome-actions">
          <button type="button" onClick={onOpenPdf}><FileText size={16} />كشف PDF</button>
          <button type="button" onClick={() => onNavigate('chat')}><Sparkles size={16} />المساعد الذكي</button>
        </div>
      </section>

      <section className="light-stat-grid" aria-label="المؤشرات المالية">
        <article data-tour="dashboard-balance" className="light-stat light-stat-balance">
          <div><span>رصيد الخزينة</span><span className="light-stat-icon settings-icon settings-icon-blue"><Wallet size={21} /></span></div>
          <strong>{money(building.balance)} <small>ج.م</small></strong>
          <p>الرصيد المسجل بالخزينة</p>
        </article>
        <article data-tour="dashboard-collected" className="light-stat light-stat-collected">
          <div><span>إجمالي المحصل</span><span className="light-stat-icon settings-icon-teal"><ArrowDownRight size={21} /></span></div>
          <strong>{money(fin.totalCollected)} <small>ج.م</small></strong>
          <p>المبالغ المسجلة كتحصيل</p>
        </article>
        <article className="light-stat light-stat-due">
          <div><span>المتبقي للتحصيل</span><span className="light-stat-icon settings-icon-gold"><Wallet size={21} /></span></div>
          <strong>{money(fin.totalRemaining)} <small>ج.م</small></strong>
          <p>{fin.pendingCount + fin.overdueCount} وحدة عليها مستحقات</p>
        </article>
        <article className="light-stat light-stat-expenses">
          <div><span>المصروفات المسجلة</span><span className="light-stat-icon settings-icon-rose"><Receipt size={21} /></span></div>
          <strong>{money(expensesTotal)} <small>ج.م</small></strong>
          <p>{expenses.length} بند • احتياطي {money(building.reserveFund)} ج.م</p>
        </article>
        <article className="light-collection-rate">
          <div><span><TrendingUp size={17} />نسبة التحصيل</span><strong>{fin.collectionRate}%</strong></div>
          <div className="light-rate-track" role="progressbar" aria-label="نسبة التحصيل" aria-valuenow={Math.max(0, Math.min(100, fin.collectionRate))} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.max(0, Math.min(100, fin.collectionRate))}%` }} /></div>
          <p>{fin.paidCount} من {fin.totalUnits} وحدة سددت</p>
        </article>
      </section>

      <section className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-2"><div><h2 className="text-base font-extrabold text-slate-900">الوصول السريع</h2><p className="mt-1 text-[11px] text-slate-500">أهم العمليات اليومية في مكان واحد</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-500">إجراءات سريعة</span></div>
        <div data-tour="dashboard-actions" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {quickActions.map(item => { const Icon=item.icon; return <button key={item.label} onClick={item.action} className="group flex min-w-0 items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-right transition hover:-translate-y-0.5 hover:border-teal-200 hover:bg-white hover:shadow-md sm:flex-col sm:items-start sm:p-4"><span className={`settings-icon settings-icon-${item.tone} quick-action-icon transition group-hover:scale-105`}><Icon className="h-5 w-5" /></span><span className="min-w-0"><strong className="block text-xs font-extrabold text-slate-800">{item.label}</strong><small className="mt-1 block text-[10px] text-slate-500">{item.hint}</small></span></button>; })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5"><div className="flex items-center gap-3"><span className="rounded-2xl bg-indigo-50 p-2.5 text-indigo-700"><Megaphone className="h-5 w-5" /></span><div><h2 className="text-sm font-extrabold text-slate-900">إعلانات العمارة</h2><p className="mt-1 text-[10px] text-slate-500">آخر التنبيهات والقرارات</p></div></div><button onClick={() => onNavigate('image-studio')} className="flex items-center gap-1 text-xs font-bold text-teal-700">إعلان جديد <ChevronLeft className="h-4 w-4" /></button></div>
          <div className="space-y-2 p-3 sm:p-4">
            {announcements.length ? announcements.slice(0,4).map(ann => <article key={ann.id} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="text-xs font-extrabold text-slate-800">{ann.title}</h3><p className="mt-1 text-[10px] text-slate-400">{dateLabel(ann.date)}</p></div>{canManageAnnouncements && <button type="button" onClick={() => onDeleteAnnouncement?.(ann.id)} aria-label={`حذف الإعلان ${ann.title}`} className="rounded-lg px-2 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-50">حذف</button>}</div><p className="mt-2 text-xs leading-6 text-slate-600">{ann.content}</p></article>) : <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center"><Megaphone className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-xs font-semibold text-slate-500">لا توجد إعلانات حالياً</p></div>}
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-[10px] text-slate-500"><span>التواصل مع الإدارة: {building.managerPhone || 'غير مسجل'}</span><button onClick={() => onNavigate('resident')} className="font-bold text-teal-700">بوابة السكان</button></div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5"><div className="flex items-center gap-3"><span className="rounded-2xl bg-rose-50 p-2.5 text-rose-700"><Receipt className="h-5 w-5" /></span><div><h2 className="text-sm font-extrabold text-slate-900">أحدث المصروفات</h2><p className="mt-1 text-[10px] text-slate-500">متابعة آخر الحركات المالية</p></div></div><button onClick={() => onNavigate('expenses')} className="flex items-center gap-1 text-xs font-bold text-teal-700">كل المصروفات <ChevronLeft className="h-4 w-4" /></button></div>
          <div className="space-y-2 p-3 sm:p-4">
            {expenses.length ? expenses.slice(0,5).map(exp => <div key={exp.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 p-3"><div className="flex min-w-0 items-center gap-3"><span className="rounded-xl bg-rose-50 p-2 text-rose-600"><ArrowDownRight className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{exp.title}</p><p className="mt-1 text-[10px] text-slate-400">{exp.vendor} • {dateLabel(exp.date)}</p></div></div><strong className="shrink-0 text-xs font-extrabold text-rose-600">-{money(exp.amount)} ج.م</strong></div>) : <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center"><Receipt className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-xs font-semibold text-slate-500">لا توجد مصروفات مسجلة</p></div>}
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-[10px] text-slate-500"><span>طلبات الصيانة المفتوحة: <strong className="text-slate-800">{pendingTickets}</strong></span><button onClick={() => onNavigate('collections')} className="font-bold text-teal-700">متابعة التحصيل</button></div>
        </section>
      </div>
      <div className="rounded-2xl border border-teal-100 bg-teal-50/70 px-4 py-3 text-[11px] text-teal-900"><span className="font-extrabold">ملخص الإدارة:</span> تم تسجيل {apartments.length} شقة، ومتابعة {payments.length} حركة سداد، مع {pendingTickets} طلب صيانة قيد المتابعة.</div>
    </div>
  );
};
