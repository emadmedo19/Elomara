import React, { useState } from 'react';
import { Building, Apartment, Expense, Payment } from '../types';
import { calculateBuildingFinancials } from '../services/financialAccounting';
import { 
  FileText, Download, Printer, CheckCircle2, TrendingUp, 
  Calendar, ArrowDownRight, ArrowUpLeft, ShieldCheck, Share2 
} from 'lucide-react';

interface ReportsViewProps {
  building: Building;
  apartments: Apartment[];
  payments?: Payment[];
  expenses: Expense[];
  onOpenPdfModal: () => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  building,
  apartments,
  payments = [],
  expenses,
  onOpenPdfModal,
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState('أكتوبر 2024');

  const buildingFin = calculateBuildingFinancials(building.id, apartments, payments, selectedPeriod);
  const totalInflow = buildingFin.totalCollected;
  const totalOutflow = expenses.reduce((acc, e) => acc + e.amount, 0);
  const netMonthlySurplus = totalInflow - totalOutflow;

  const categories = [
    { name: 'مصاعد', color: 'bg-indigo-500' },
    { name: 'كهرباء', color: 'bg-amber-500' },
    { name: 'مياه ومضخات', color: 'bg-cyan-500' },
    { name: 'نظافة', color: 'bg-emerald-500' },
    { name: 'أمن وحراسة', color: 'bg-slate-700' },
    { name: 'صيانة عامة', color: 'bg-rose-500' },
  ];

  const categoryTotals = categories.map((cat) => {
    const sum = expenses
      .filter((e) => e.category === cat.name)
      .reduce((acc, e) => acc + e.amount, 0);
    return {
      ...cat,
      amount: sum,
      percentage: totalOutflow > 0 ? Math.round((sum / totalOutflow) * 100) : 0,
    };
  });

  return (
    <div className="fotouh-reports space-y-4" dir="rtl">
      {/* Top Banner */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-teal-50 text-teal-700">
              <FileText className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold text-slate-900">التقارير المالية والختامية</h1>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  <span>دورة معتمدة</span>
                </span>
              </div>
              <p className="text-xs text-slate-500">كشوف الحسابات المعتمدة والتدقيق المالي لعمارة {building.name}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs">
            {['أكتوبر 2024', 'سبتمبر 2024', 'أغسطس 2024'].map((period) => (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                className={`px-3 py-1.5 rounded-lg font-medium transition ${
                  selectedPeriod === period
                    ? 'bg-white text-slate-900 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {period}
              </button>
            ))}
          </div>

          <button
            onClick={onOpenPdfModal}
            className="bg-[#0f2537] hover:bg-[#1a3852] text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition active:scale-95 shadow-sm"
          >
            <Printer className="w-4 h-4 text-teal-300" />
            <span>طباعة وتصدير كشف حساب PDF</span>
          </button>
        </div>
      </div>

      {/* Financial Summary Bento Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Inflow */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-1 text-slate-500 text-xs">
            <span>إجمالي الإيرادات المحصلة</span>
            <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowUpLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl sm:text-2xl font-bold text-slate-900">{totalInflow.toLocaleString()}</span>
            <span className="text-xs text-slate-500 font-bold">ج.م</span>
          </div>
          <span className="block mt-2 text-[11px] text-emerald-600 font-bold">
            تحصيل {buildingFin.paidCount} من {buildingFin.totalUnits} شقة (متبقي {buildingFin.totalRemaining.toLocaleString()} ج.م)
          </span>
        </div>

        {/* Total Outflow */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-1 text-slate-500 text-xs">
            <span>إجمالي المصروفات المنفذة</span>
            <div className="w-7 h-7 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
              <ArrowDownRight className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl sm:text-2xl font-bold text-rose-600">{totalOutflow.toLocaleString()}</span>
            <span className="text-xs text-slate-500 font-bold">ج.م</span>
          </div>
          <span className="block mt-2 text-[11px] text-slate-500">
            {expenses.length} فواتير وعقود صيانة
          </span>
        </div>

        {/* Net Monthly Flow */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-1 text-slate-500 text-xs">
            <span>صافي حركة الشهر (الفائض)</span>
            <div className="w-7 h-7 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className={`text-xl sm:text-2xl font-bold ${netMonthlySurplus >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {netMonthlySurplus >= 0 ? `+${netMonthlySurplus.toLocaleString()}` : netMonthlySurplus.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500 font-bold">ج.م</span>
          </div>
          <span className="block mt-2 text-[11px] text-teal-700 font-medium">
            تغذية الرصيد التراكمي للخزينة
          </span>
        </div>

        {/* Closing Balance */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-1 text-slate-500 text-xs">
            <span>الرصيد الختامي المرحل</span>
            <div className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl sm:text-2xl font-bold text-indigo-900">{building.balance.toLocaleString()}</span>
            <span className="text-xs text-slate-500 font-bold">ج.م</span>
          </div>
          <span className="block mt-2 text-[11px] text-slate-500">
            يشمل الوديعة الاحتياطية
          </span>
        </div>
      </div>

      {/* Two Column Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Category breakdown */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <h3 className="font-bold text-sm text-slate-900 mb-1">توزيع المصروفات حسب الأبواب الخدمية</h3>
          <p className="text-xs text-slate-500 mb-4">نسب الصرف على الصيانة والمرافق في الدورة المحاسبية الحالية</p>

          <div className="space-y-3.5">
            {categoryTotals.map((cat) => (
              <div key={cat.name}>
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="font-medium text-slate-700">{cat.name}</span>
                  <span className="font-bold text-slate-900">
                    {cat.amount.toLocaleString()} ج.م ({cat.percentage}%)
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    className={`${cat.color} h-full rounded-full transition-all duration-500`}
                    style={{ width: `${Math.max(5, cat.percentage)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Statement certification box */}
        <div className="bg-gradient-to-br from-[#0f2537] to-[#1c3f5e] text-white p-5 rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 rounded-full bg-emerald-400" />
              <h3 className="font-bold text-sm text-white">إقرار اعتماد الحسابات المالية</h3>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed mb-4">
              تمت مراجعة جميع القيود المالية والإيصالات والفواتير المرفقة بمعرفة أمين صندوق اتحاد شاغلي عقار {building.name} طبقاً للقانون رقم 119 لسنة 2008 ولائحته التنفيذية المنظمة لاتحادات الشاغلين في جمهورية مصر العربية.
            </p>

            <div className="bg-white/10 p-3 rounded-xl border border-white/15 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-300">أمين الصندوق المسؤول:</span>
                <span className="font-bold text-white">{building.managerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">تاريخ إغلاق الدورة:</span>
                <span className="font-mono text-white">2024-10-27</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">الرقم المرجعي للكشف:</span>
                <span className="font-mono text-teal-300 font-bold">BYN-EGY-2024-10-A14</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between">
            <span className="text-[11px] text-slate-300">متاح لجميع الملاك والشاغلين</span>
            <button
              onClick={onOpenPdfModal}
              className="bg-teal-500 hover:bg-teal-400 text-[#0f2537] text-xs font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition active:scale-95 shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>معاينة الكشف المعتمد</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
