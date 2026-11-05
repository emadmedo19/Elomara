import React from 'react';
import { Building, Apartment, Expense, Announcement, MaintenanceTicket, Payment } from '../types';
import { calculateBuildingFinancials } from '../services/financialAccounting';
import {
  CheckCircle2, PlusCircle, Receipt, FileText, Sparkles, ArrowDownRight, Wrench,
  Megaphone, TrendingUp, Wallet, ChevronLeft, CalendarDays
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
  ];
  const tones: Record<string, string> = {
    teal: 'bg-teal-50 text-teal-700 ring-teal-100',
    rose: 'bg-rose-50 text-rose-700 ring-rose-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
    blue: 'bg-sky-50 text-sky-700 ring-sky-100',
  };

  return (
    <div className="fotouh-dashboard space-y-5 pb-5" dir="rtl">
      <section className="relative isolate overflow-hidden rounded-[28px] bg-[#102d3a] p-5 text-white shadow-[0_18px_50px_rgba(15,45,58,.18)] sm:p-7">
        <div className="pointer-events-none absolute -left-12 -top-20 h-64 w-64 rounded-full bg-teal-400/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-1/3 h-64 w-64 rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-teal-100">
              <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_0_4px_rgba(110,231,183,.12)]" />
              لوحة إدارة العقار
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-300"><CalendarDays className="h-3.5 w-3.5" />{monthName}</span>
          </div>
          <div className="mt-7 grid gap-6 md:grid-cols-[1.35fr_.65fr] md:items-end">
            <div>
              <p className="text-sm font-medium text-teal-100/80">الرصيد المتاح في خزينة</p>
              <h1 className="mt-1 text-xl font-bold text-white">{building.name || 'العمارة'}</h1>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-4xl font-black tracking-tight tabular-nums sm:text-5xl">{money(building.balance)}</span>
                <span className="text-sm font-bold text-teal-100">جنيه</span>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-emerald-200"><CheckCircle2 className="h-4 w-4" /> الرصيد المسجل بالخزينة</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={onOpenPdf} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-3 text-xs font-bold text-white transition hover:bg-white/15"><FileText className="h-4 w-4" />كشف PDF</button>
              <button onClick={() => onNavigate('chat')} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-teal-300 px-3 text-xs font-extrabold text-[#102d3a] transition hover:bg-teal-200"><Sparkles className="h-4 w-4" />المساعد الذكي</button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <article className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">نسبة التحصيل</span><span className="rounded-xl bg-emerald-50 p-2 text-emerald-700"><TrendingUp className="h-4 w-4" /></span></div>
          <div className="mt-3 flex items-baseline gap-1"><strong className="text-3xl font-black text-slate-900">{fin.collectionRate}%</strong><span className="text-[10px] text-slate-400">هذا الشهر</span></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-teal-400" style={{width:`${Math.max(0,Math.min(100,fin.collectionRate))}%`}} /></div>
          <p className="mt-2 text-[10px] text-slate-500">{fin.paidCount} من {fin.totalUnits} وحدة سددت</p>
        </article>
        <article className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">إجمالي المحصل</span><span className="rounded-xl bg-teal-50 p-2 text-teal-700"><ArrowDownRight className="h-4 w-4" /></span></div>
          <strong className="mt-3 block text-2xl font-black tabular-nums text-slate-900">{money(fin.totalCollected)} <small className="text-[10px] font-bold text-slate-400">ج.م</small></strong>
          <p className="mt-2 text-[10px] text-slate-500">المبالغ المسجلة كتحصيل</p>
        </article>
        <article className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">المتبقي للتحصيل</span><span className="rounded-xl bg-amber-50 p-2 text-amber-700"><Wallet className="h-4 w-4" /></span></div>
          <strong className="mt-3 block text-2xl font-black tabular-nums text-amber-700">{money(fin.totalRemaining)} <small className="text-[10px] font-bold text-slate-400">ج.م</small></strong>
          <p className="mt-2 text-[10px] text-slate-500">{fin.pendingCount + fin.overdueCount} وحدة عليها مستحقات</p>
        </article>
        <article className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">المصروفات المسجلة</span><span className="rounded-xl bg-rose-50 p-2 text-rose-700"><Receipt className="h-4 w-4" /></span></div>
          <strong className="mt-3 block text-2xl font-black tabular-nums text-slate-900">{money(expensesTotal)} <small className="text-[10px] font-bold text-slate-400">ج.م</small></strong>
          <p className="mt-2 text-[10px] text-slate-500">{expenses.length} بند مصروف • احتياطي {money(building.reserveFund)} ج.م</p>
        </article>
      </section>

      <section className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-2"><div><h2 className="text-base font-extrabold text-slate-900">اختصارات الإدارة</h2><p className="mt-1 text-[11px] text-slate-500">أهم العمليات اليومية في مكان واحد</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-500">إجراءات سريعة</span></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {quickActions.map(item => { const Icon=item.icon; return <button key={item.label} onClick={item.action} className="group flex min-w-0 items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-right transition hover:-translate-y-0.5 hover:border-teal-200 hover:bg-white hover:shadow-md sm:flex-col sm:items-start sm:p-4"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${tones[item.tone]} transition group-hover:scale-105`}><Icon className="h-5 w-5" /></span><span className="min-w-0"><strong className="block text-xs font-extrabold text-slate-800">{item.label}</strong><small className="mt-1 block text-[10px] text-slate-500">{item.hint}</small></span></button>; })}
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
