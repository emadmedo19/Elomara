import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Apartment, Payment } from '../types';
import { DollarSign, Calendar, Check, X, AlertTriangle, CreditCard, Tag } from 'lucide-react';

const DEFAULT_PAYMENT_METHODS = ['إنستاباي', 'تحويل بنكي', 'فودافون كاش', 'نقدي', 'أخرى'];

const getCurrentPaymentPeriod = () => new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(new Date());

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  apartments: Apartment[];
  selectedApartment?: Apartment | null;
  editingPayment?: Payment | null;
  onSavePayment: (paymentData: {
    apartmentId: string;
    exceptionalChargeId?: string;
    amount: number;
    date: string;
    month: string;
    method: Payment['method'];
    notes?: string;
    receiptNumber?: string;
  }) => Promise<boolean>;
  existingPayments: Payment[];
  paymentMethods?: string[];
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  apartments,
  selectedApartment,
  editingPayment,
  onSavePayment,
  existingPayments,
  paymentMethods = DEFAULT_PAYMENT_METHODS,
}) => {
  const [apartmentId, setApartmentId] = useState<string>(selectedApartment?.id || apartments[0]?.id || '');
  const [amount, setAmount] = useState<number>(selectedApartment?.monthlyFee || 1500);
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [month, setMonth] = useState<string>(getCurrentPaymentPeriod());
  const [method, setMethod] = useState<string>(paymentMethods[0] || 'نقدي');
  const [notes, setNotes] = useState<string>('سداد اشتراك الصيانة الشهري');
  const [receiptNumber, setReceiptNumber] = useState<string>(`REC-${Date.now().toString().slice(-5)}`);

  const [chargeId, setChargeId] = useState('');
  const [saving, setSaving] = useState(false);

  // Duplicate warning state
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  useEffect(() => {
    setChargeId(editingPayment?.exceptionalChargeId || '');
    if (editingPayment) {
      setApartmentId(editingPayment.apartmentId);
      setAmount(editingPayment.amount);
      setDate(editingPayment.date);
      setMonth(editingPayment.month);
      setMethod(editingPayment.method);
      setNotes(editingPayment.notes || '');
      setReceiptNumber(editingPayment.receiptNumber || '');
      setDuplicateWarning(null);
    } else if (selectedApartment) {
      setApartmentId(selectedApartment.id);
      setAmount(selectedApartment.monthlyFee);
      setDate(new Date().toISOString().split('T')[0]);
      setMonth(getCurrentPaymentPeriod());
      setMethod(paymentMethods[0] || 'نقدي');
      setNotes(`سداد اشتراك الصيانة عن ${selectedApartment.unitNumber}`);
      setReceiptNumber(`REC-${Date.now().toString().slice(-5)}`);
      setDuplicateWarning(null);
    }
  }, [selectedApartment, editingPayment, isOpen, paymentMethods]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isOpen]);

  if (!isOpen) return null;

  const currentApt = apartments.find((a) => a.id === apartmentId);

  const charges = existingPayments.filter(p => p.isAssessment && p.apartmentId === apartmentId);
  const chargeRemaining = (id: string) => Math.max(0, Number(charges.find(c => c.id === id)?.amount || 0) - existingPayments
    .filter(p => !p.isAssessment && p.exceptionalChargeId === id && p.id !== editingPayment?.id)
    .reduce((sum,p) => sum + Number(p.amount || 0),0));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !apartmentId || amount <= 0 || (chargeId && amount > chargeRemaining(chargeId))) return;

    // Check for duplicate payment when adding new payment
    if (!editingPayment && !duplicateWarning) {
      const isDuplicate = existingPayments.some(
        (p) =>
          !p.isAssessment && (p.exceptionalChargeId || '') === chargeId && p.apartmentId === apartmentId &&
          (p.date === date || p.month === month) &&
          Math.abs(p.amount - amount) < 1
      );

      if (isDuplicate) {
        setDuplicateWarning(
          `تنبيه: تم العثور على دفعة سابقة مسجلة لنفس الشقة (${currentApt?.unitNumber}) بنفس المبلغ (${amount.toLocaleString()} ج.م) عن نفس التاريخ أو الشهر. هل تريد تأكيد التسجيل مرة أخرى؟`
        );
        return;
      }
    }

    setSaving(true);
    try {
      const saved = await onSavePayment({
        apartmentId,
        exceptionalChargeId: chargeId || undefined,
        amount: Number(amount),
        date,
        month,
        method,
        notes: notes.trim(),
        receiptNumber: receiptNumber.trim(),
      });

      if (saved) onClose();
    } finally { setSaving(false); }
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="payment-modal-title" dir="rtl" className="fixed inset-0 z-[60] bg-[#0f2537]/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-3xl max-w-lg w-full min-w-0 p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 id="payment-modal-title" className="font-bold text-sm text-slate-900">
                {editingPayment ? 'تعديل دفعة سابقة' : 'تسجيل وقيد دفعة سداد جديدة'}
              </h3>
              <p className="text-xs text-slate-500">
                {editingPayment
                  ? 'تعديل المبلغ أو التاريخ وإعادة احتساب الرصيد تلقائياً'
                  : 'إضافة مبلغ لخزينة العمارة وتحديث حالة الشقة'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق نافذة السداد"
            className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* Duplicate Payment Alert */}
          {duplicateWarning && (
            <div className="my-3.5 p-3.5 rounded-2xl bg-amber-50 border border-amber-300 space-y-2 animate-in fade-in">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-900 font-medium leading-relaxed">
                  {duplicateWarning}
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDuplicateWarning(null)}
                  className="text-xs bg-white text-slate-700 font-bold px-3 py-1.5 rounded-xl border border-slate-200"
                >
                  تعديل البيانات
                </button>
                <button
                  type="submit"
                  className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold px-3.5 py-1.5 rounded-xl shadow-xs"
                >
                  نعم، تسجيل الدفعة رغم التشابه
                </button>
              </div>
            </div>
          )}

          {/* Form Fields */}
          <div className="my-4 space-y-3.5">
            {/* Select Apartment */}
            <div className="min-w-0 space-y-1">
              <label className="text-xs font-bold text-slate-700">الشقة المستهدفة *</label>
              <select
                value={apartmentId}
                disabled={Boolean(editingPayment)}
                onChange={(e) => {
                  setApartmentId(e.target.value);
                  setChargeId('');
                  const apt = apartments.find((a) => a.id === e.target.value);
                  if (apt && !editingPayment) {
                    setAmount(apt.monthlyFee);
                    setNotes(`سداد اشتراك الصيانة عن ${apt.unitNumber}`);
                  }
                }}
                className="min-w-0 max-w-full w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              >
                {apartments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.unitNumber} - {a.residentName} (الدور {a.floor} • اشتراك {a.monthlyFee} ج.م)
                  </option>
                ))}
              </select>
            </div>

            {(charges.length > 0 || chargeId) && <label className="block space-y-1 text-xs font-bold text-slate-700">
              <span>السداد عن</span>
              <select aria-label="السداد عن" disabled={Boolean(editingPayment)} value={chargeId} onChange={e => {
                const id = e.target.value; setChargeId(id); setDuplicateWarning(null);
                setAmount(id ? chargeRemaining(id) : (currentApt?.monthlyFee || 0));
                setNotes(id ? (charges.find(c => c.id === id)?.notes || 'سداد تحصيل استثنائي') : 'سداد اشتراك الصيانة الشهري');
              }} className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5">
                <option value="">الاشتراك الشهري</option>
                {charges.map(c => <option key={c.id} value={c.id}>{c.notes || 'تحصيل استثنائي'} — متبقي {chargeRemaining(c.id).toLocaleString()} ج.م</option>)}
              </select>
              {chargeId && <p className="text-slate-500">يمكن سداد جزء من المبلغ؛ المدفوع فقط يدخل الخزينة.</p>}
            </label>}
            <div className="grid grid-cols-2 gap-3">
              {/* Amount */}
              <div className="min-w-0 space-y-1">
                <label className="text-xs font-bold text-slate-700">المبلغ المدفوع (ج.م) *</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={chargeId ? chargeRemaining(chargeId) : undefined}
                  required
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 max-w-full w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 font-bold text-teal-800"
                />
              </div>

              {/* Date */}
              <div className="min-w-0 space-y-1">
                <label className="text-xs font-bold text-slate-700">تاريخ السداد *</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="min-w-0 max-w-full w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Month/Period */}
              <div className="min-w-0 space-y-1">
                <label className="text-xs font-bold text-slate-700">عن شهر / دورة</label>
                <input
                  type="text"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  placeholder="مثال: الشهر الحالي"
                  className="min-w-0 max-w-full w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                />
              </div>

              {/* Payment Method */}
              <div className="min-w-0 space-y-1">
                <label className="text-xs font-bold text-slate-700">طريقة السداد</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="min-w-0 max-w-full w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                >
                  {[...new Set([...(method && !paymentMethods.includes(method) ? [method] : []), ...paymentMethods])].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Receipt Number */}
              <div className="min-w-0 space-y-1">
                <label className="text-xs font-bold text-slate-700">رقم الإيصال / المعاملة</label>
                <input
                  type="text"
                  value={receiptNumber}
                  onChange={(e) => setReceiptNumber(e.target.value)}
                  className="min-w-0 max-w-full w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 font-mono"
                />
              </div>

              {/* Notes */}
              <div className="min-w-0 space-y-1">
                <label className="text-xs font-bold text-slate-700">ملاحظات إضافية</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="أي ملاحظات حول السداد..."
                  className="min-w-0 max-w-full w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                />
              </div>
            </div>
          </div>

        </div>
        {/* Footer Buttons */}
        <div className="flex shrink-0 items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md transition active:scale-95 flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>{editingPayment ? 'حفظ تعديل الدفعة' : 'تأكيد وقيد السداد'}</span>
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
};
