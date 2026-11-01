import React, { useState } from 'react';
import { Printer as NativePrinter } from '@capgo/capacitor-printer';
import { Building, Apartment, Expense, Payment } from '../types';
import { calculateApartmentFinancials, calculateBuildingFinancials } from '../services/financialAccounting';
import { Printer, Download, X, CheckCircle2, ShieldCheck } from 'lucide-react';

interface PdfStatementModalProps {
  building: Building;
  apartments: Apartment[];
  payments?: Payment[];
  expenses: Expense[];
  onClose: () => void;
}

export const PdfStatementModal: React.FC<PdfStatementModalProps> = ({
  building,
  apartments,
  payments = [],
  expenses,
  onClose,
}) => {
  const buildingFin = calculateBuildingFinancials(building.id, apartments, payments);
  const totalInflow = buildingFin.totalCollected;
  const totalOutflow = expenses.reduce((acc, e) => acc + e.amount, 0);
  const netSurplus = totalInflow - totalOutflow;
  const statementDate = new Date();
  const statementMonth = statementDate.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
  const referenceNumber = `FTU-${statementDate.getFullYear()}${String(statementDate.getMonth() + 1).padStart(2, '0')}${String(statementDate.getDate()).padStart(2, '0')}-${building.id.slice(0, 6).toUpperCase()}`;

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState('');

  const handlePrint = async () => {
    if (isGeneratingPdf) return;
    const element = document.getElementById('printable-statement');
    if (!element) {
      setPdfError('تعذر العثور على كشف الحساب للطباعة.');
      return;
    }

    setIsGeneratingPdf(true);
    setPdfError('');
    const printStyle = document.createElement('style');
    printStyle.id = 'bunyan-native-print-style';
    printStyle.textContent = `
      @media print {
        @page { size: A3 landscape; margin: 8mm; }
        html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
        body * { visibility: hidden !important; }
        #printable-statement, #printable-statement * { visibility: visible !important; }
        #printable-statement {
          position: static !important;
          display: block !important;
          width: 100% !important;
          max-width: none !important;
          padding: 0 !important;
          margin: 0 !important;
          background: #fff !important;
          color: #111827 !important;
          overflow: visible !important;
          height: auto !important;
          min-height: 0 !important;
          box-sizing: border-box !important;
          direction: rtl !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        #printable-statement table { width: 100% !important; max-width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; direction: rtl !important; }
        #printable-statement th, #printable-statement td { box-sizing: border-box !important; overflow-wrap: anywhere !important; word-break: break-word !important; padding: 5px 4px !important; font-size: 9pt !important; }
        #printable-statement h1 { font-size: 18pt !important; }
        #printable-statement .grid { min-width: 0 !important; grid-template-columns: repeat(4, minmax(0, 1fr)) !important; gap: 6px !important; }
        #printable-statement > div { max-width: 100% !important; }
        #printable-statement img { max-width: 42px !important; }
        #printable-statement table { break-inside: auto !important; page-break-inside: auto !important; }
        #printable-statement thead { display: table-header-group !important; }
        #printable-statement tfoot { display: table-footer-group !important; }
        #printable-statement tr { break-inside: avoid !important; page-break-inside: avoid !important; }
        #printable-statement tr { break-inside: avoid !important; page-break-inside: avoid !important; }
      }
    `;
    document.head.appendChild(printStyle);

    try {
      if (document.fonts?.ready) await document.fonts.ready;
      await NativePrinter.printWebView({ name: `كشف حساب ${building.name || 'برج الفتوح'}` });
    } catch (error) {
      console.error('Native printing failed:', error);
      setPdfError('تعذر فتح شاشة الطباعة. تأكد من تثبيت خدمة الطباعة على الهاتف ثم حاول مرة أخرى.');
    } finally {
      printStyle.remove();
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0f2537]/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-5xl p-4 sm:p-8 shadow-2xl border border-slate-300 my-auto text-slate-800 animate-in fade-in zoom-in-95 print:w-full print:max-w-none print:p-0 print:border-none print:shadow-none print:m-0">
        {/* Action Top Bar (Hidden during print) */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-6 print:hidden">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-[#0f2537] text-teal-300">
              <Printer className="w-5 h-5" />
            </span>
            <div>
              <h2 className="font-bold text-base text-slate-900">معاينة وطباعة كشف الحساب المالي المعتمد</h2>
              <p className="text-xs text-slate-500">جاهز للتصدير كملف PDF والطباعة لأعضاء اتحاد الشاغلين</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              disabled={isGeneratingPdf}
              className="bg-[#0f2537] hover:bg-[#1a3852] disabled:opacity-60 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 transition active:scale-95 shadow-sm"
            >
              <Printer className="w-4 h-4 text-teal-300" />
              <span>{isGeneratingPdf ? 'جارٍ فتح الطباعة...' : 'طباعة / حفظ PDF'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {pdfError && (
          <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm p-3 text-right" role="alert">
            {pdfError}
          </div>
        )}

        {/* Printable Official Statement Sheet */}
        <div className="space-y-6 text-right font-sans" id="printable-statement">
          {/* Document Header */}
          <div className="flex items-center justify-between border-b-2 border-[#0f2537] pb-4">
            <div className="flex items-center gap-3">
              <img
                src="/icon.png"
                alt="شعار برج الفتوح"
                className="w-12 h-12 rounded-xl object-cover shadow-sm border border-slate-200"
              />
              <div>
                <h1 className="text-xl font-bold text-[#0f2537]">اتحاد شاغلي {building.name}</h1>
                <p className="text-xs text-slate-500">{building.address}</p>
                <p className="text-[11px] text-slate-400">مشهر طبقاً لأحكام القانون رقم 119 لسنة 2008 ولائحته التنفيذية</p>
              </div>
            </div>

            <div className="text-left">
              <span className="text-xs font-bold text-[#0f2537] block">كشف حساب الدورة المالية</span>
              <span className="text-sm font-bold text-teal-700 block">{statementMonth}</span>
              <span className="text-[10px] text-slate-400 font-mono block">رقم المرجع: {referenceNumber}</span>
            </div>
          </div>

          {/* KPI Mini Bento in Statement */}
          <div className="grid grid-cols-4 gap-3 text-center">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] text-slate-500 block">إجمالي التحصيلات</span>
              <span className="text-base font-bold text-slate-900 block mt-0.5">{totalInflow.toLocaleString()} ج.م</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] text-slate-500 block">إجمالي المصروفات</span>
              <span className="text-base font-bold text-rose-600 block mt-0.5">{totalOutflow.toLocaleString()} ج.م</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] text-slate-500 block">فائض حركة الشهر</span>
              <span className="text-base font-bold text-emerald-600 block mt-0.5">+{netSurplus.toLocaleString()} ج.م</span>
            </div>
            <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200">
              <span className="text-[11px] text-teal-800 block">رصيد الصندوق المرحل</span>
              <span className="text-base font-bold text-teal-900 block mt-0.5">{building.balance.toLocaleString()} ج.م</span>
            </div>
          </div>

          {/* Section 1: Collections Table */}
          <div>
            <h3 className="font-bold text-sm text-[#0f2537] mb-2 flex items-center gap-1.5">
              <span>أولاً: بيان تحصيل اشتراكات الصيانة (الوحدات والشقق)</span>
            </h3>
            <table className="w-full text-xs text-right border-collapse border border-slate-200 rounded-xl overflow-hidden">
              <thead className="bg-[#0f2537] text-white">
                <tr>
                  <th className="p-2 border border-slate-300">الوحدة</th>
                  <th className="p-2 border border-slate-300">اسم الشاغل / المالك</th>
                  <th className="p-2 border border-slate-300">المستحق</th>
                  <th className="p-2 border border-slate-300">المسدد</th>
                  <th className="p-2 border border-slate-300">المتبقي</th>
                  <th className="p-2 border border-slate-300">رصيد دائن</th>
                  <th className="p-2 border border-slate-300">الحالة</th>
                  <th className="p-2 border border-slate-300">تاريخ السداد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {apartments.map((apt) => {
                  const fin = calculateApartmentFinancials(apt, payments);
                  return (
                    <tr key={apt.id} className="hover:bg-slate-50">
                      <td className="p-2 font-bold border border-slate-200">{apt.unitNumber}</td>
                      <td className="p-2 border border-slate-200">{apt.residentName}</td>
                      <td className="p-2 border border-slate-200 font-mono">{fin.totalDue.toLocaleString()} ج.م</td>
                      <td className="p-2 border border-slate-200 font-mono font-bold text-teal-700">
                        {fin.totalPaid.toLocaleString()} ج.م
                      </td>
                      <td className="p-2 border border-slate-200 font-mono font-bold text-rose-600">
                        {fin.remaining > 0 ? `${fin.remaining.toLocaleString()} ج.م` : '0 ج.م'}
                      </td>
                      <td className="p-2 border border-slate-200 font-mono text-indigo-700 font-bold">
                        {fin.creditBalance > 0 ? `+${fin.creditBalance.toLocaleString()} ج.م` : '-'}
                      </td>
                      <td className="p-2 border border-slate-200">
                        {fin.status === 'paid' ? (
                          <span className="text-emerald-700 font-bold">خالص السداد ✓</span>
                        ) : fin.status === 'overdue' ? (
                          <span className="text-rose-600 font-bold">متأخر ({apt.overdueMonths || 1} شهر)</span>
                        ) : (
                          <span className="text-amber-700 font-bold">سداد جزئي</span>
                        )}
                      </td>
                      <td className="p-2 border border-slate-200 font-mono text-slate-500">
                        {fin.lastPaymentDate || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Section 2: Itemized Expenditures */}
          <div>
            <h3 className="font-bold text-sm text-[#0f2537] mb-2 flex items-center gap-1.5">
              <span>ثانياً: بيان المصروفات وفواتير الصيانة الدورية</span>
            </h3>
            <table className="w-full text-xs text-right border-collapse border border-slate-200 rounded-xl overflow-hidden">
              <thead className="bg-[#0f2537] text-white">
                <tr>
                  <th className="p-2 border border-slate-300">البند والبيان</th>
                  <th className="p-2 border border-slate-300">التصنيف</th>
                  <th className="p-2 border border-slate-300">الجهة / المورد</th>
                  <th className="p-2 border border-slate-300">التاريخ</th>
                  <th className="p-2 border border-slate-300">المبلغ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50">
                    <td className="p-2 font-bold border border-slate-200">{exp.title}</td>
                    <td className="p-2 border border-slate-200">{exp.category}</td>
                    <td className="p-2 border border-slate-200">{exp.vendor}</td>
                    <td className="p-2 border border-slate-200 font-mono text-slate-500">{exp.date}</td>
                    <td className="p-2 border border-slate-200 font-mono font-bold text-rose-600">
                      {exp.amount.toLocaleString()} ج.م
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Signatures & Accreditation Footer */}
          <div className="pt-6 border-t border-slate-300 grid grid-cols-3 gap-6 text-center text-xs">
            <div>
              <span className="text-slate-500 block mb-6">أمين صندوق العمارة:</span>
              <p className="font-bold text-slate-900 border-t border-dashed border-slate-400 pt-1">
                اسم أمين الصندوق
              </p>
            </div>
            <div>
              <span className="text-slate-500 block mb-6">مراقب الحسابات / لجنة المراجعة:</span>
              <p className="font-bold text-slate-900 border-t border-dashed border-slate-400 pt-1">
                اسم مراقب الحسابات
              </p>
            </div>
            <div>
              <span className="text-slate-500 block mb-6">خاتم وتصديق اتحاد الشاغلين:</span>
              <div className="w-20 h-20 mx-auto rounded-full border-2 border-teal-600/40 flex items-center justify-center text-[10px] text-teal-800 font-bold p-1">
                اتحاد شاغلي {building.name}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
