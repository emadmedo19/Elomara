import React, { useState } from 'react';
import { Apartment, Payment, UserRole } from '../types';
import { calculateApartmentFinancials } from '../services/financialAccounting';
import { 
  Building2, User, Phone, DollarSign, Calendar, CheckCircle2, 
  AlertCircle, Clock, Edit2, Trash2, Plus, X, 
  Receipt, ArrowDownRight, Share2, AlertTriangle, ShieldCheck, CreditCard
} from 'lucide-react';

interface ApartmentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apartment: Apartment | null;
  payments: Payment[];
  buildingName: string;
  role?: UserRole;
  onEditApartment: (apartment: Apartment) => void;
  onDeleteApartment: (apartmentId: string) => void;
  onOpenAddPaymentForApt: (apartment: Apartment) => void;
  onEditPayment: (payment: Payment) => void;
  onDeletePayment: (paymentId: string) => void;
}

export const ApartmentDetailsModal: React.FC<ApartmentDetailsModalProps> = ({
  isOpen,
  onClose,
  apartment,
  payments,
  buildingName,
  role = 'manager',
  onEditApartment,
  onDeleteApartment,
  onOpenAddPaymentForApt,
  onEditPayment,
  onDeletePayment,
}) => {
  const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);
  const [isDeletingApartment, setIsDeletingApartment] = useState(false);

  if (!isOpen || !apartment) return null;

  const isManager = role === 'manager';

  // Calculate unified financials strictly according to standard formulas:
  // Total Due = monthlyFee * (overdueMonths || 1)
  // Total Paid = sum of all payments for apartment
  // Remaining = max(0, Total Due - Total Paid)
  // Credit Balance = max(0, Total Paid - Total Due)
  const fin = calculateApartmentFinancials(apartment, payments);
  const aptPayments = fin.allPayments;

  const sendWhatsAppReceipt = () => {
    const text = encodeURIComponent(
      `السلام عليكم ${apartment.residentName} المحترم،\nتحية طيبة من إدارة ${buildingName}.\nموقف حساب ${apartment.unitNumber}:\n• المستحق: ${fin.totalDue.toLocaleString()} ج.م\n• المسدد: ${fin.totalPaid.toLocaleString()} ج.م\n• المتبقي: ${fin.remaining.toLocaleString()} ج.م${
        fin.creditBalance > 0 ? `\n• رصيد دائن (مقدم): ${fin.creditBalance.toLocaleString()} ج.م` : ''
      }\n• الحالة: ${fin.status === 'paid' ? 'خالص السداد ✓' : fin.status === 'overdue' ? `متأخر (${apartment.overdueMonths || 1} شهر)` : 'سداد جزئي'}\nشكراً لتعاونكم وحرصكم الدائم.`
    );
    window.open(`https://wa.me/${apartment.residentPhone.replace('+', '')}?text=${text}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0f2537]/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-sm">
              {apartment.unitNumber.slice(0, 4)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-900">{apartment.unitNumber}</h3>
                <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-bold">
                  الدور {apartment.floor}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    apartment.isOwner
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {apartment.isOwner ? 'مالك وحدة' : 'مستأجر'}
                </span>
              </div>
              <p className="text-xs text-slate-500">{buildingName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Delete Apartment Confirmation Alert */}
        {isDeletingApartment && (
          <div className="my-3.5 p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-3 animate-in fade-in">
            <div className="flex items-start gap-2.5 text-rose-900">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-sm">هل أنت متأكد من حذف {apartment.unitNumber}؟</strong>
                <p className="text-xs text-rose-700 leading-relaxed mt-1">
                  سيتم حذف الشقة وسجل السداد الخاص بها، وتحديث إجمالي وحدات العمارة تلقائياً.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setIsDeletingApartment(false)}
                className="px-3.5 py-1.5 rounded-xl bg-white text-slate-700 text-xs font-bold border border-slate-200"
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  onDeleteApartment(apartment.id);
                  onClose();
                }}
                className="px-4 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700"
              >
                تأكيد حذف الشقة
              </button>
            </div>
          </div>
        )}

        {/* Delete Payment Confirmation Alert Modal */}
        {paymentToDelete && (
          <div className="my-3.5 p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 space-y-3 animate-in fade-in shadow-sm">
            <div className="flex items-start gap-3 text-rose-950">
              <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1.5 flex-1">
                <strong className="block text-sm font-bold text-rose-900">
                  تأكيد حذف دفعة سداد للشقة
                </strong>
                <p className="text-xs text-rose-700 leading-relaxed">
                  أنت على وشك حذف دفعة سداد مسجلة. يرجى مراجعة تفاصيل الدفعة قبل التأكيد:
                </p>
                <div className="bg-white p-3 rounded-xl border border-rose-200 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px]">المبلغ المحذوف:</span>
                    <span className="font-bold text-rose-700 text-sm">{paymentToDelete.amount.toLocaleString()} ج.م</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">الشقة المستهدفة:</span>
                    <span className="font-bold text-slate-800">{apartment.unitNumber} ({apartment.residentName})</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">رقم الإيصال:</span>
                    <span className="font-mono text-slate-700 font-bold">{paymentToDelete.receiptNumber || 'بدون إيصال'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">دورة / تاريخ السداد:</span>
                    <span className="text-slate-700">{paymentToDelete.month} • {paymentToDelete.date}</span>
                  </div>
                </div>
                <p className="text-[11px] text-rose-600 font-medium">
                  ⚠️ سيتم خصم هذا المبلغ فوراً من رصيد الخزينة وإعادة احتساب المتبقي للشقة بدقة وتسجيل العملية في سجل التدقيق.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-rose-200">
              <button
                type="button"
                onClick={() => setPaymentToDelete(null)}
                className="px-4 py-2 rounded-xl bg-white text-slate-700 text-xs font-bold border border-slate-300 hover:bg-slate-50"
              >
                إلغاء التراجع
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeletePayment(paymentToDelete.id);
                  setPaymentToDelete(null);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 shadow-sm"
              >
                تأكيد حذف الدفعة نهائياً
              </button>
            </div>
          </div>
        )}

        {/* Financial & Resident Info Grid */}
        <div className="my-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Resident Info */}
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
            <span className="text-[10px] text-slate-500 block">الشاغل والتواصل</span>
            <span className="font-bold text-xs text-slate-900 block mt-0.5 truncate">{apartment.residentName}</span>
            <span className="text-[10px] text-slate-500 font-mono block mt-0.5">{apartment.residentPhone}</span>
          </div>

          {/* Dues */}
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
            <span className="text-[10px] text-slate-500 block">إجمالي المستحق</span>
            <span className="font-bold text-sm text-slate-900 block mt-0.5">
              {fin.totalDue.toLocaleString()} ج.م
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              {apartment.overdueMonths && apartment.overdueMonths > 1
                ? `${apartment.overdueMonths} شهور متأخرات`
                : 'الاشتراك الشهري'}
            </span>
          </div>

          {/* Total Paid & Remaining */}
          <div className="bg-teal-50/60 p-3 rounded-2xl border border-teal-200">
            <span className="text-[10px] text-teal-700 block font-medium">المسدد / المتبقي</span>
            <span className="font-bold text-xs text-teal-900 block mt-0.5">
              مسدد: {fin.totalPaid.toLocaleString()} ج.م
            </span>
            <span className={`text-xs font-bold block mt-0.5 ${fin.remaining > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
              متبقي: {fin.remaining.toLocaleString()} ج.م
            </span>
          </div>

          {/* Status Badge & Credit Balance */}
          <div
            className={`p-3 rounded-2xl border ${
              fin.status === 'paid'
                ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900'
                : fin.status === 'overdue'
                ? 'bg-rose-50/80 border-rose-300 text-rose-900'
                : 'bg-amber-50/80 border-amber-300 text-amber-900'
            }`}
          >
            <span className="text-[10px] block font-medium">حالة الحساب</span>
            <div className="flex items-center gap-1 mt-0.5">
              {fin.status === 'paid' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
              {fin.status === 'overdue' && <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
              {fin.status === 'pending' && <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
              <span className="font-bold text-xs">
                {fin.status === 'paid' && 'خالص السداد ✓'}
                {fin.status === 'overdue' && `متأخر (${apartment.overdueMonths || 1} شهر)`}
                {fin.status === 'pending' && 'سداد جزئي'}
              </span>
            </div>
            {fin.creditBalance > 0 ? (
              <span className="text-[10px] text-indigo-700 font-bold block mt-1">
                رصيد دائن: +{fin.creditBalance.toLocaleString()} ج.م
              </span>
            ) : (
              <span className="text-[10px] text-slate-500 block mt-1">
                {fin.lastPaymentDate ? `آخر سداد: ${fin.lastPaymentDate}` : 'لا يوجد سداد سابق'}
              </span>
            )}
          </div>
        </div>

        {/* Credit Balance Notice Banner if Overpaid */}
        {fin.creditBalance > 0 && (
          <div className="mb-3 p-3 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-900 flex items-center justify-between text-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
              <div>
                <span className="font-bold">رصيد دائن مرحل للشهر التالي: </span>
                <span className="font-mono font-bold text-indigo-700">+{fin.creditBalance.toLocaleString()} ج.م</span>
                <span className="block text-[11px] text-indigo-600">
                  نشأ هذا الرصيد كدفعة زائدة عن دورة {fin.advanceCreditOrigin?.month || 'أكتوبر 2024'} ويتم ترحيله تلقائياً.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            {isManager && (
              <button
                onClick={() => onOpenAddPaymentForApt(apartment)}
                className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>تسجيل سداد جديد</span>
              </button>
            )}
            <button
              onClick={sendWhatsAppReceipt}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 transition active:scale-95"
              title="إرسال إشعار وكشف حساب عبر واتساب"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>إرسال واتساب</span>
            </button>
          </div>

          {isManager && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onEditApartment(apartment)}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1 transition"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>تعديل الشقة</span>
              </button>
              <button
                onClick={() => setIsDeletingApartment(true)}
                className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition"
                title="حذف الشقة"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Payments History Ledger Table */}
        <div className="my-4 space-y-2.5 flex-1">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-teal-600" />
              <span>سجل المدفوعات والإيصالات السابقة ({aptPayments.length})</span>
            </h4>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-slate-500">
                إجمالي المسدد: <strong className="text-teal-700 font-bold">{fin.totalPaid.toLocaleString()} ج.م</strong>
              </span>
              <span>•</span>
              <span className={fin.remaining > 0 ? 'text-rose-600 font-bold' : 'text-emerald-700 font-bold'}>
                المتبقي: {fin.remaining.toLocaleString()} ج.م
              </span>
            </div>
          </div>

          {aptPayments.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 rounded-2xl border border-slate-200 text-slate-400 text-xs">
              لا توجد إيصالات سداد مسجلة لهذه الشقة بعد. اضغط "تسجيل سداد جديد" لقيد دفعة.
            </div>
          ) : (
            <div className="space-y-2 max-h-[35vh] overflow-y-auto pr-1">
              {aptPayments.map((p) => (
                <div
                  key={p.id}
                  className="p-3 bg-white rounded-2xl border border-slate-200 hover:border-teal-300 transition flex items-center justify-between gap-3 text-xs shadow-2xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">
                        {p.amount.toLocaleString()} ج.م
                      </span>
                      <span className="text-[10px] bg-teal-50 text-teal-700 font-bold px-2 py-0.5 rounded-full border border-teal-200">
                        {p.method}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {p.receiptNumber || 'بدون إيصال'}
                      </span>
                      <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold">
                        دورة {p.month}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      <span>تاريخ السداد: {p.date}</span>
                      {p.notes && (
                        <>
                          <span>•</span>
                          <span className="text-slate-600">{p.notes}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {isManager && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => onEditPayment(p)}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-teal-50 hover:text-teal-700 text-slate-700 font-bold text-[11px] flex items-center gap-1 transition"
                        title="تعديل المبلغ أو التاريخ أو الإيصال"
                      >
                        <Edit2 className="w-3 h-3 text-teal-600" />
                        <span>تعديل</span>
                      </button>
                      <button
                        onClick={() => setPaymentToDelete(p)}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                        title="حذف هذه الدفعة"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
