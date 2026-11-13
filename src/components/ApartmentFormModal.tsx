import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { Apartment, PaymentStatus } from '../types';
import { Building2, Check, X, User } from 'lucide-react';

interface ApartmentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  apartmentToEdit?: Apartment | null;
  buildingId: string;
  onSave: (apartmentData: {
    unitNumber: string;
    floor: number;
    residentName: string;
    residentPhone: string;
    isOwner: boolean;
    monthlyFee: number;
    status: PaymentStatus;
    overdueMonths: number;
  }) => void;
}

export const ApartmentFormModal: React.FC<ApartmentFormModalProps> = ({
  isOpen,
  onClose,
  apartmentToEdit,
  buildingId,
  onSave,
}) => {
  const [unitNumber, setUnitNumber] = useState('');
  const [floor, setFloor] = useState<number>(1);
  const [residentName, setResidentName] = useState('');
  const [residentPhone, setResidentPhone] = useState('+2010');
  const [isOwner, setIsOwner] = useState(true);
  const [monthlyFee, setMonthlyFee] = useState<number>(1500);
  const [status, setStatus] = useState<PaymentStatus>('pending');
  const [overdueMonths, setOverdueMonths] = useState<number>(0);

  useEffect(() => {
    if (apartmentToEdit) {
      setUnitNumber(apartmentToEdit.unitNumber);
      setFloor(apartmentToEdit.floor);
      setResidentName(apartmentToEdit.residentName);
      setResidentPhone(apartmentToEdit.residentPhone);
      setIsOwner(apartmentToEdit.isOwner);
      setMonthlyFee(apartmentToEdit.monthlyFee);
      setStatus(apartmentToEdit.status);
      setOverdueMonths(apartmentToEdit.overdueMonths);
    } else {
      setUnitNumber('');
      setFloor(1);
      setResidentName('');
      setResidentPhone('+2010');
      setIsOwner(true);
      setMonthlyFee(1500);
      setStatus('pending');
      setOverdueMonths(0);
    }
  }, [apartmentToEdit, isOpen]);

  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitNumber.trim() || !residentName.trim()) return;

    onSave({
      unitNumber: unitNumber.trim(),
      floor: Number(floor) || 0,
      residentName: residentName.trim(),
      residentPhone: residentPhone.trim() || '+201000000000',
      isOwner,
      monthlyFee: Number(monthlyFee) || 0,
      status,
      overdueMonths: status === 'overdue' ? Math.max(1, Number(overdueMonths)) : 0,
    });

    onClose();
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="apartment-form-title" dir="rtl" className="fixed inset-0 z-50 bg-[#0f2537]/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <form data-tour="apartment-form" onSubmit={handleSubmit} className="bg-white rounded-3xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[90dvh] overscroll-contain overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 id="apartment-form-title" className="font-bold text-sm text-slate-900">
                {apartmentToEdit ? `تعديل بيانات: ${apartmentToEdit.unitNumber}` : 'إضافة شقة سكنية جديدة'}
              </h3>
              <p className="text-xs text-slate-500">
                {apartmentToEdit ? 'تعديل رقم الشقة، الدور، الساكن، وقيمة الاشتراك' : 'تسجيل وحدة جديدة في سجل العمارة'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-tour="apartment-close" aria-label="إغلاق تعديل الشقة"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Fields */}
        <div className="my-4 space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">رقم الشقة / الوحدة *</label>
              <input
                type="text"
                required
                data-tour="apartment-unit" value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                placeholder="مثال: شقة 101 أو روف 501"
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">رقم الدور *</label>
              <input
                type="number"
                min="0"
                max="50"
                required
                value={floor}
                onChange={(e) => setFloor(Number(e.target.value))}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">اسم الساكن / المالك *</label>
              <input
                type="text"
                required
                data-tour="apartment-name" value={residentName}
                onChange={(e) => setResidentName(e.target.value)}
                placeholder="مثال: أ/ أحمد محمد"
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">رقم هاتف الساكن / واتساب</label>
              <input
                type="text"
                value={residentPhone}
                onChange={(e) => setResidentPhone(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                placeholder="+201000000000"
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">الاشتراك الشهري (ج.م) *</label>
              <input
                type="number"
                min="0"
                required
                data-tour="apartment-fee" value={monthlyFee}
                onChange={(e) => setMonthlyFee(Number(e.target.value))}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 font-bold text-teal-800"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">صفة الشاغل</label>
              <select
                value={isOwner ? 'owner' : 'tenant'}
                onChange={(e) => setIsOwner(e.target.value === 'owner')}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              >
                <option value="owner">مالك الوحدة</option>
                <option value="tenant">مستأجر / ساكن</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">حالة السداد الأولية</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PaymentStatus)}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              >
                <option value="pending">قيد الانتظار</option>
                <option value="paid">خالص السداد</option>
                <option value="overdue">متأخر عن السداد</option>
              </select>
            </div>

            {status === 'overdue' && (
              <div className="space-y-1 animate-in fade-in">
                <label className="text-xs font-bold text-rose-700">عدد أشهر التأخير</label>
                <input
                  type="number"
                  min="1"
                  value={overdueMonths}
                  onChange={(e) => setOverdueMonths(Number(e.target.value))}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full text-xs bg-rose-50 border border-rose-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 font-bold text-rose-800"
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
          >
            إلغاء
          </button>
          <button
            data-tour="apartment-save" type="submit"
            className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md transition active:scale-95 flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>{apartmentToEdit ? 'حفظ تعديلات الشقة' : 'إضافة الشقة للسجل'}</span>
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
};
