import {calculateReport,type ReportSelection} from '../services/reportAccounting';
import { HistoricalOpeningSummary } from './HistoricalOpeningSummary';
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
  onOpenPdfModal: (selection:ReportSelection) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  building,
  apartments,
  payments = [],
  expenses,
  onOpenPdfModal,
}) => {
  const today = new Date().toLocaleDateString('en-CA');
  const [startDate, setStartDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString('en-CA'));
  const [endDate, setEndDate] = useState(today);
  const validRange = Boolean(startDate && endDate && startDate <= endDate);
  const inRange = (date: string) => validRange && date.slice(0, 10) >= startDate && date.slice(0, 10) <= endDate;
  const [scope,setScope]=useState<'all'|'period'>('all');
  const selection:ReportSelection={scope,startDate,endDate,buildingId:building.id};
  const report=calculateReport(building,payments,expenses,selection);
  const {totalInflow,totalOutflow,openingBalance,closingBalance}=report;
  const periodExpenses=report.selectedExpenses;
  const netMonthlySurplus=report.netSurplus;
  const buildingFin = calculateBuildingFinancials(building.id, apartments, payments);

  const categories = [
    { name: 'مصاعد', label: 'صيانة أسانسير', color: 'bg-indigo-500' },
    { name: 'كهرباء', color: 'bg-amber-500' },
    { name: 'مياه ومضخات', color: 'bg-cyan-500' },
    { name: 'نظافة', color: 'bg-emerald-500' },
    { name: 'أمن وحراسة', color: 'bg-slate-700' },
    { name: 'صيانة عامة', color: 'bg-rose-500' },
    { name: 'أخرى', color: 'bg-slate-400' },
    ...(report.all&&report.historicalExpenses>0?[{name:'مصروفات سابقة',color:'bg-violet-500'}]:[]),
  ];

  const categoryTotals = categories.map((cat) => {
    const sum = cat.name==='مصروفات سابقة'?report.historicalExpenses:periodExpenses
      .filter((e) => cat.name === 'أخرى' ? !categories.filter(c => c.name !== 'أخرى').some(c => c.name === e.category) : e.category === cat.name)
      .reduce((acc, e) => acc + e.amount, 0);
    return {
      ...cat,
      amount: sum,
      percentage: totalOutflow > 0 ? Math.round((sum / totalOutflow) * 100) : 0,
    };
  });

  return (
    <div data-tour="reports-page" className="fotouh-reports space-y-4" dir="rtl">
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
                  <span>حسب السجلات</span>
                </span>
              </div>
              <p className="text-xs text-slate-500">كشوف الحسابات ومراجعة السجلات المالية لعمارة {building.name}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex w-full gap-2" role="group" aria-label="نوع التقرير">
            <button type="button" aria-pressed={scope==='all'} onClick={()=>setScope('all')} className={`min-h-11 rounded-xl border px-3 text-xs font-bold ${scope==='all'?'bg-teal-700 text-white':'bg-white text-slate-700'}`}>الحسابات كاملة</button>
            <button type="button" aria-pressed={scope==='period'} onClick={()=>setScope('period')} className={`min-h-11 rounded-xl border px-3 text-xs font-bold ${scope==='period'?'bg-teal-700 text-white':'bg-white text-slate-700'}`}>حركة فترة محددة</button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1 text-slate-600 font-bold">من
              <input aria-label="من تاريخ" type="date" value={startDate} max={today} onChange={e => {setStartDate(e.target.value);setScope('period');}} disabled={scope==='all'} className="border border-slate-200 rounded-lg p-2 bg-white text-slate-900" />
            </label>
            <label className="flex items-center gap-1 text-slate-600 font-bold">إلى
              <input aria-label="إلى تاريخ" type="date" value={endDate} max={today} onChange={e => {setEndDate(e.target.value);setScope('period');}} disabled={scope==='all'} className="border border-slate-200 rounded-lg p-2 bg-white text-slate-900" />
            </label>
            {!validRange && <span className="text-rose-600">تأكد من ترتيب التاريخين</span>}
          </div>

          <button
            onClick={() => { if (report.all||validRange) { onOpenPdfModal(selection); } }}
            className="bg-[#0f2537] hover:bg-[#1a3852] text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition active:scale-95 shadow-sm"
          >
            <Printer className="w-4 h-4 text-teal-300" />
            <span>طباعة وتصدير كشف حساب PDF</span>
          </button>
        </div>
      </div>

      <HistoricalOpeningSummary building={building} payments={report.rows} included={report.all}/>
      <p data-report-cash-note className="rounded-xl bg-sky-50 p-3 text-xs leading-7 text-slate-700">{report.all?`الكشف يشمل الحسابات القديمة والجديدة. الخزينة عند البداية: ${openingBalance.toLocaleString()} ج.م، والحركة بعد التسجيل: ${report.cashMovement.toLocaleString()} ج.م. التحصيلات القديمة مشمولة بالفعل في رصيد البداية، ولا تُضاف للخزينة مرة ثانية.`:'الكروت تعرض حركة الفترة المحددة فقط. الحسابات القديمة موضحة بصورة مستقلة أعلاه.'}</p>
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
            {report.all?'التحصيلات القديمة + الإيصالات الجديدة':'تحصيلات الفترة المختارة'}
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
            {periodExpenses.length} فواتير وعقود صيانة {report.all&&report.historicalExpenses>0?' + المصروفات السابقة':''}
          </span>
        </div>

        {/* Net Monthly Flow */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-1 text-slate-500 text-xs">
            <span>{report.all?'صافي التحصيلات مقابل المصروفات':'صافي حركة الفترة (الفائض)'}</span>
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
            {report.all?'فرق التحصيلات والمصروفات المسجلة':'تغذية الرصيد التراكمي للخزينة'}
          </span>
        </div>

        {/* Closing Balance */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-1 text-slate-500 text-xs">
            <span>{report.all?'رصيد الخزينة الحالي':'الرصيد الختامي المرحل'}</span>
            <div className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl sm:text-2xl font-bold text-indigo-900">{closingBalance.toLocaleString()}</span>
            <span className="text-xs text-slate-500 font-bold">ج.م</span>
          </div>
          <span className="block mt-2 text-[11px] text-slate-500">
            {report.all?'الرصيد المحفوظ بالخزينة بعد العمليات الجديدة':'الرصيد المحسوب حتى نهاية الفترة'}
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

        {/* Recorded statement summary */}
        <div className="bg-gradient-to-br from-[#0f2537] to-[#1c3f5e] text-white p-5 rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 rounded-full bg-emerald-400" />
              <h3 className="font-bold text-sm text-white">بيانات كشف الحساب</h3>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed mb-4">
              يعرض هذا الكشف التحصيلات والمصروفات المسجلة لعمارة {building.name} {report.all?'بما يشمل الحسابات القديمة والجديدة':'خلال الفترة المختارة فقط'}. راجع القيود والمستندات قبل مشاركة الكشف أو طباعته؛ لا يعني إنشاؤه اعتماد الحسابات أو إغلاقها.
            </p>

            <div className="bg-white/10 p-3 rounded-xl border border-white/15 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-300">مسؤول العمارة:</span>
                <span className="font-bold text-white">{building.managerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">نهاية فترة التقرير:</span>
                <span className="font-mono text-white">{endDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300">الرقم المرجعي للكشف:</span>
                <span className="font-mono text-teal-300 font-bold">{`ELM-${startDate}-${endDate}`}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between">
            <span className="text-[11px] text-slate-300">متاح لجميع الملاك والشاغلين</span>
            <button
              onClick={()=>{if(report.all||validRange)onOpenPdfModal(selection);}}
              className="bg-teal-500 hover:bg-teal-400 text-[#0f2537] text-xs font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition active:scale-95 shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>معاينة كشف الحساب</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
