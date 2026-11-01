import React from 'react';

const displayDateTime = (value?: string) => {
  if (!value) return '—';
  const normalized = value.length === 10 ? `${value}T12:00:00` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: value.length > 10 ? 'short' : undefined }).format(date);
};
import { Building, Apartment, Expense, Announcement, MaintenanceTicket, Payment } from '../types';
import { calculateBuildingFinancials } from '../services/financialAccounting';
import { 
  Wallet, TrendingUp, AlertTriangle, CheckCircle2, PlusCircle, 
  Receipt, FileText, Sparkles, ArrowDownRight, ArrowUpLeft, 
  Calendar, Wrench, Shield, Users, Megaphone
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
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  building,
  apartments,
  payments = [],
  expenses,
  announcements,
  tickets,
  onNavigate,
  onOpenAddExpense,
  onOpenPdf,
  onOpenAddPayment,
}) => {
  // Unified Building Financial Calculations
  const buildingFin = calculateBuildingFinancials(building.id, apartments, payments);
  const totalExpensesThisMonth = expenses.reduce((acc, curr) => acc + curr.amount, 0);
  const pendingTickets = tickets.filter((t) => t.status !== 'مكتمل').length;

  return (
    <div className="space-y-5">
      {/* Hero Welcome Card */}
      <div className="bg-gradient-to-l from-[#0f2537] via-[#16354d] to-[#00668b] p-5 sm:p-6 rounded-2xl text-white shadow-xl relative overflow-hidden">
        {/* Subtle decorative architectural curves */}
        <div className="absolute top-0 left-0 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 right-10 w-48 h-48 bg-cyan-400/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold mb-2.5 border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>دورة أكتوبر 2024 المحاسبية • صندوق نشط</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              {building.name}
            </h1>
            <p className="text-xs sm:text-sm text-slate-200 mt-1 max-w-xl leading-relaxed">
              {building.address} • إدارة شؤون العقار، الخزينة، صيانة المرافق والاتحاد التعاوني للملاك.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onOpenPdf}
              className="bg-white/15 hover:bg-white/25 text-white text-xs font-bold px-3.5 py-2 rounded-xl backdrop-blur-md border border-white/25 flex items-center gap-1.5 transition active:scale-95 shadow-sm"
            >
              <FileText className="w-4 h-4 text-teal-300" />
              <span>كشف الحساب PDF</span>
            </button>
            <button
              onClick={() => onNavigate('chat')}
              className="bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-[#0f2537] text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-md transition active:scale-95"
            >
              <Sparkles className="w-4 h-4 text-[#0f2537]" />
              <span>استشارة الذكاء الاصطناعي</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main KPI Cards Bento */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Treasury Balance */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1.5">
            <span>رصيد خزينة العمارة</span>
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {building.balance.toLocaleString()}
            </span>
            <span className="text-xs font-bold text-slate-500">ج.م</span>
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-600 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>متوفر في الحساب البنكي والخزينة</span>
          </div>
        </div>

        {/* Collections Rate */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1.5">
            <span>نسبة التحصيل الشهري</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl sm:text-2xl font-bold text-emerald-700">
              {buildingFin.collectionRate}%
            </span>
            <span className="text-xs text-slate-500">
              ({buildingFin.paidCount} من {buildingFin.totalUnits} شقة)
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2">
            <span>المحصل: <strong className="text-slate-800">{buildingFin.totalCollected.toLocaleString()} ج.م</strong></span>
            <span className="text-rose-600 font-bold">متبقي: {buildingFin.totalRemaining.toLocaleString()} ج.م</span>
          </div>
        </div>

        {/* Total Expenses */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1.5">
            <span>مصروفات وفواتير الشهر</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl sm:text-2xl font-bold text-rose-600">
              {totalExpensesThisMonth.toLocaleString()}
            </span>
            <span className="text-xs font-bold text-slate-500">ج.م</span>
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-500">
            <span>{expenses.length} بنود وفواتير مدفوعة</span>
          </div>
        </div>

        {/* Reserve Fund & Emergency */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1.5">
            <span>صندوق الطوارئ المحجوز</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl sm:text-2xl font-bold text-amber-800">
              {building.reserveFund.toLocaleString()}
            </span>
            <span className="text-xs font-bold text-slate-500">ج.م</span>
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-amber-700 font-medium">
            <span>وديعة مخصصة لطوارئ المصعد والرفع</span>
          </div>
        </div>
      </div>

      {/* Quick Operations Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-sm">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
          العمليات الإدارية السريعة
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            onClick={onOpenAddPayment}
            className="flex items-center justify-center gap-2 p-3 rounded-xl bg-teal-50 hover:bg-teal-100/80 text-teal-800 font-bold text-xs border border-teal-200 transition active:scale-95"
          >
            <PlusCircle className="w-4 h-4 text-teal-600" />
            <span>تسجيل تحصيل شقة</span>
          </button>

          <button
            onClick={onOpenAddExpense}
            className="flex items-center justify-center gap-2 p-3 rounded-xl bg-rose-50 hover:bg-rose-100/80 text-rose-800 font-bold text-xs border border-rose-200 transition active:scale-95"
          >
            <Receipt className="w-4 h-4 text-rose-600" />
            <span>توثيق مصروف جديد</span>
          </button>

          <button
            onClick={() => onNavigate('image-studio')}
            className="flex items-center justify-center gap-2 p-3 rounded-xl bg-amber-50 hover:bg-amber-100/80 text-amber-800 font-bold text-xs border border-amber-200 transition active:scale-95"
          >
            <Megaphone className="w-4 h-4 text-amber-600" />
            <span>تصميم إعلان بالذكاء الاصطناعي</span>
          </button>

          <button
            onClick={() => onNavigate('resident')}
            className="flex items-center justify-center gap-2 p-3 rounded-xl bg-indigo-50 hover:bg-indigo-100/80 text-indigo-800 font-bold text-xs border border-indigo-200 transition active:scale-95"
          >
            <Wrench className="w-4 h-4 text-indigo-600" />
            <span>طلبات صيانة ({pendingTickets})</span>
          </button>
        </div>
      </div>

      {/* Two Column Layout: Announcements + Recent Ledger Movements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Building Notice Board */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-[#0f2537] text-teal-300">
                  <Megaphone className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">لوحة إعلانات العمارة والجمعية العمومية</h3>
                  <p className="text-[11px] text-slate-500">تنبيهات وقرارات اتحاد الشاغلين المعتمدة</p>
                </div>
              </div>
              <button
                onClick={() => onNavigate('image-studio')}
                className="text-xs text-teal-700 hover:text-teal-900 font-bold"
              >
                + إنشاء إعلان
              </button>
            </div>

            <div className="space-y-3">
              {announcements.map((ann) => (
                <div
                  key={ann.id}
                  className={`p-3.5 rounded-xl border transition ${
                    ann.type === 'maintenance'
                      ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                      : ann.type === 'meeting'
                      ? 'bg-indigo-50/70 border-indigo-200 text-indigo-900'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs">{ann.title}</span>
                    <span className="text-[10px] text-slate-500">{displayDateTime(ann.date)}</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{ann.content}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>للتواصل مع أمين الصندوق: {building.managerPhone}</span>
            <button
              onClick={() => onNavigate('resident')}
              className="text-teal-700 font-bold hover:underline"
            >
              عرض سجل الاجتماعات
            </button>
          </div>
        </div>

        {/* Recent Ledger Movements */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-teal-50 text-teal-700">
                  <FileText className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">آخر حركات الصندوق والخزينة</h3>
                  <p className="text-[11px] text-slate-500">الإيرادات والتحصيلات والمصروفات المباشرة</p>
                </div>
              </div>
              <button
                onClick={() => onNavigate('expenses')}
                className="text-xs text-teal-700 hover:text-teal-900 font-bold"
              >
                عرض الكل
              </button>
            </div>

            <div className="space-y-2.5">
              {/* Sample recent receipts */}
              {expenses.slice(0, 4).map((exp) => (
                <div
                  key={exp.id}
                  className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100/70 border border-slate-200/60 flex items-center justify-between text-xs transition"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                      <ArrowDownRight className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 line-clamp-1">{exp.title}</p>
                      <p className="text-[10px] text-slate-500">{exp.vendor} • {displayDateTime(exp.date)}</p>
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <span className="font-bold text-rose-600">-{exp.amount.toLocaleString()} ج.م</span>
                    <span className="block text-[10px] text-slate-400">{exp.category}</span>
                  </div>
                </div>
              ))}


            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">
              المتبقي الصافي للتحصيل: <strong className="text-rose-600">{buildingFin.totalRemaining.toLocaleString()} ج.م</strong> ({buildingFin.pendingCount + buildingFin.overdueCount} شقق)
            </span>
            <button
              onClick={() => onNavigate('collections')}
              className="text-teal-700 font-bold hover:underline"
            >
              متابعة التحصيل
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
