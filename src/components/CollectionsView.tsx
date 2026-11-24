import {requestPaymentReceipt} from '../services/paymentReceipts';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { Building, Apartment, Payment, PaymentStatus, UserRole, PaymentAuditLog } from '../types';
import { calculateApartmentFinancials, calculateBuildingFinancials, classifyApartmentPayment, type ApartmentPaymentFilter } from '../services/financialAccounting';
import { 
  Building2, Search, Filter, CheckCircle2, AlertCircle, Clock, 
  DollarSign, UserCheck, Phone, Plus, Edit2, Trash2, Eye, Share2, 
  ArrowUpRight, AlertTriangle, Check, X, Receipt, History, ShieldCheck,
  Calendar, CreditCard, ArrowDownRight, User
} from 'lucide-react';
import { ApartmentDetailsModal } from './ApartmentDetailsModal';
import { ApartmentFormModal } from './ApartmentFormModal';
import { PaymentModal } from './PaymentModal';
import { getStoredSettings } from '../services/storage';

interface CollectionsViewProps {
  currentBuilding: Building;
  apartments: Apartment[];
  payments: Payment[];
  role?: UserRole;
  auditLogs?: PaymentAuditLog[];
  onAddApartment: (apartmentData: Omit<Apartment, 'id'>) => void;
  onUpdateApartment: (id: string, updatedData: Partial<Apartment>) => void;
  onDeleteApartment: (id: string) => void;
  onSavePayment: (paymentData: {
    apartmentId: string;
    exceptionalChargeId?: string;
    amount: number;
    date: string;
    month: string;
    method: Payment['method'];
    notes?: string;
    receiptNumber?: string;
    requestId?: string;
  }) => Promise<boolean>;
  onEditPayment: (payment: Payment) => Promise<boolean> | boolean;
  paymentMethods?: string[];
  onDeletePayment: (paymentId: string) => Promise<boolean | void> | void;
  paymentRequest?: number;
  initialPaymentFilter?: ApartmentPaymentFilter;
}

export const CollectionsView: React.FC<CollectionsViewProps> = ({
  currentBuilding,
  apartments,
  payments,
  role = 'manager',
  auditLogs = [],
  onAddApartment,
  onUpdateApartment,
  onDeleteApartment,
  onSavePayment,
  onEditPayment,
  paymentMethods,
  onDeletePayment, paymentRequest = 0, initialPaymentFilter = 'all',
}) => {
  const [deletingPayment, setDeletingPayment] = useState(false);
  const isManager = role === 'manager';

  // Active view tab: 'apartments' | 'payments' | 'audit'
  const [activeSubTab, setActiveSubTab] = useState<'apartments' | 'payments' | 'audit'>('apartments');

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ApartmentPaymentFilter>(initialPaymentFilter);
  const [monthFilter, setMonthFilter] = useState<string>('all');

  // Modals state
  const [isAddAptModalOpen, setIsAddAptModalOpen] = useState(false);
  const [editingApartment, setEditingApartment] = useState<Apartment | null>(null);
  const [detailsApartment, setDetailsApartment] = useState<Apartment | null>(null);

  // Payment modal state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedApartmentForPay, setSelectedApartmentForPay] = useState<Apartment | null>(null);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);

  // Confirm delete states
  const [apartmentToDelete, setApartmentToDelete] = useState<Apartment | null>(null);
  const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);
  useBodyScrollLock(paymentToDelete !== null);

  // Filter apartments by current building
  const buildingApartments = apartments.filter(
    (a) => !a.buildingId || a.buildingId === currentBuilding.id
  );

  // Filter payments by current building
  const buildingPayments = payments.filter(
    (p) => !p.isAssessment && (!p.buildingId || p.buildingId === currentBuilding.id)
  );

  // Filter audit logs by current building
  const buildingAuditLogs = auditLogs.filter(
    (l) => !l.buildingId || l.buildingId === currentBuilding.id
  );

  // Calculate unified building financial metrics
  const buildingFin = calculateBuildingFinancials(
    currentBuilding.id,
    apartments,
    payments
  );

  const paymentStateLabels = { paid: 'خالص السداد', unpaid: 'لم يسدد', partial: 'سداد جزئي', unconfigured: 'لم تحدد المستحقات' };
  const paymentStateCounts = buildingApartments.reduce((counts, apt) => {
    counts[classifyApartmentPayment(calculateApartmentFinancials(apt, payments))] += 1;
    return counts;
  }, { paid: 0, unpaid: 0, partial: 0, unconfigured: 0 });
  const paymentFilters = [
    { value: 'all', label: 'الكل', count: buildingApartments.length },
    { value: 'paid', label: 'خالص السداد', count: paymentStateCounts.paid },
    { value: 'unpaid', label: 'لم يسدد', count: paymentStateCounts.unpaid },
    { value: 'partial', label: 'سداد جزئي', count: paymentStateCounts.partial },
  ] as const;
  const normalizeDigits = (text: string) => text.replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

  // Filter apartments for display
  const filteredApartments = buildingApartments.filter((apt) => {
    const fin = calculateApartmentFinancials(apt, payments);
    const matchesSearch =
      normalizeDigits(apt.unitNumber).includes(normalizeDigits(searchTerm)) ||
      apt.residentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      normalizeDigits(apt.residentPhone).includes(normalizeDigits(searchTerm));

    const matchesStatus = statusFilter === 'all' || (statusFilter === 'outstanding' ? fin.remaining > 0 : classifyApartmentPayment(fin) === statusFilter);

    return matchesSearch && matchesStatus;
  }).sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, 'ar', { numeric: true, sensitivity: 'base' }));

  // Filter payments for payments table
  const filteredPayments = buildingPayments.filter((p) => {
    const matchesSearch =
      p.unitNumber.includes(searchTerm) ||
      p.residentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.receiptNumber && p.receiptNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (p.notes && p.notes.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesMonth = monthFilter === 'all' || p.month === monthFilter;

    return matchesSearch && matchesMonth;
  });

  // Unique months in payments
  const availableMonths = Array.from(new Set(buildingPayments.map((p) => p.month)));

  // Handlers
  const handleOpenAddPayment = (apt?: Apartment) => {
    setDetailsApartment(null);
    setSelectedApartmentForPay(apt || buildingApartments[0] || null);
    setEditingPayment(null);
    setIsPaymentModalOpen(true);
  };

  useEffect(() => {
    if (paymentRequest > 0) handleOpenAddPayment();
  }, [paymentRequest]);

  const handleOpenEditPayment = (p: Payment) => {
    setDetailsApartment(null);
    setEditingPayment(p);
    setIsPaymentModalOpen(true);
  };

  const handleSaveApartmentForm = (data: {
    unitNumber: string;
    floor: number;
    residentName: string;
    residentPhone: string;
    isOwner: boolean;
    monthlyFee: number;
    status: PaymentStatus;
    overdueMonths: number;
  }) => {
    if (editingApartment) {
      onUpdateApartment(editingApartment.id, data);
      if (detailsApartment && detailsApartment.id === editingApartment.id) {
        setDetailsApartment({ ...detailsApartment, ...data });
      }
      setEditingApartment(null);
    } else {
      onAddApartment({
        ...data,
        buildingId: currentBuilding.id,
        paidAmount: data.status === 'paid' ? data.monthlyFee : 0,
        lastPaymentDate: data.status === 'paid' ? new Date().toISOString().split('T')[0] : undefined,
      });
      setIsAddAptModalOpen(false);
    }
  };

  const handleConfirmDeleteApartment = () => {
    if (apartmentToDelete) {
      onDeleteApartment(apartmentToDelete.id);
      if (detailsApartment && detailsApartment.id === apartmentToDelete.id) {
        setDetailsApartment(null);
      }
      setApartmentToDelete(null);
    }
  };

  const handleConfirmDeletePayment = async () => {
    if (!paymentToDelete || deletingPayment) return;
    setDeletingPayment(true);
    try { if (await onDeletePayment(paymentToDelete.id) !== false) setPaymentToDelete(null); }
    finally { setDeletingPayment(false); }
  };

  return (
    <div className="fotouh-collections space-y-4" dir="rtl">
      {/* Top Header & Action Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-teal-50 text-teal-700">
              <Building2 className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold text-slate-900">سجل الشقق والتحصيل والمدفوعات</h1>
                <span className="text-xs bg-teal-50 text-teal-700 font-bold px-2.5 py-0.5 rounded-full border border-teal-200">
                  {currentBuilding.name}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                منظومة موحدة لمتابعة مستحقات الوحدات، قيد وتعديل وحذف الإيصالات، وتدقيق العمليات
              </p>
            </div>
          </div>
        </div>

        {isManager && (
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              data-tour="collections-pay" onClick={() => handleOpenAddPayment()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 transition active:scale-95 shadow-sm"
            >
              <DollarSign className="w-4 h-4" />
              <span>تسجيل سداد جديد</span>
            </button>

            <button
              data-tour="collections-add" onClick={() => {
                setEditingApartment(null);
                setIsAddAptModalOpen(true);
              }}
              className="bg-[#0f2537] hover:bg-[#1a3852] text-white text-xs font-bold px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 transition active:scale-95 shadow-sm"
            >
              <Plus className="w-4 h-4 text-teal-300" />
              <span>إضافة شقة</span>
            </button>
          </div>
        )}
      </div>

      {/* KPI Stats Bento Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Expected Dues */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] text-slate-500 block">إجمالي المستحقات المقررة</span>
          <span className="font-bold text-lg sm:text-xl text-slate-900 block mt-1">
            {buildingFin.totalExpectedDues.toLocaleString()} <span className="text-xs text-slate-500">ج.م</span>
          </span>
          <span className="text-[11px] text-slate-400 block mt-1">{buildingApartments.length} شقة مسجلة</span>
        </div>

        {/* Collected */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] text-emerald-600 block font-medium">إجمالي السداد المرتبط بالشقق</span>
          <span className="font-bold text-lg sm:text-xl text-emerald-700 block mt-1">
            {buildingFin.totalCollected.toLocaleString()} <span className="text-xs text-slate-500">ج.م</span>
          </span>
          <span className="text-[11px] text-emerald-600 block mt-1">{buildingFin.paidCount} شقة خالصة السداد ✓</span>
        </div>

        {/* Remaining Dues */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] text-rose-600 block font-medium">المتبقي الصافي للتحصيل</span>
          <span className="font-bold text-lg sm:text-xl text-rose-700 block mt-1">
            {buildingFin.totalRemaining.toLocaleString()} <span className="text-xs text-slate-500">ج.م</span>
          </span>
          <span className="text-[11px] text-rose-600 block mt-1">
            {paymentStateCounts.unpaid + paymentStateCounts.partial} شقة عليها متبقي
          </span>
        </div>

        {/* Advance Credit Balances */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <span className="text-[11px] text-indigo-600 block font-medium">الأرصدة الدائنة (دفعات مقدمة)</span>
          <span className="font-bold text-lg sm:text-xl text-indigo-700 block mt-1">
            +{buildingFin.totalCreditBalance.toLocaleString()} <span className="text-xs text-slate-500">ج.م</span>
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">
            نسبة التحصيل: {buildingFin.collectionRate}%
          </span>
        </div>
        {activeSubTab === 'apartments' && <section className="payment-status-filters col-span-2 lg:col-span-4" aria-label="تصفية الشقق حسب السداد">
          <h2 className="mb-2 text-xs font-bold text-slate-600">حالة السداد</h2>
          <div className="payment-status-options" role="group" aria-label="حالة السداد">
            {paymentFilters.map(filter => <button key={filter.value} type="button" className="payment-status-button" data-payment-status={filter.value}
              aria-pressed={statusFilter === filter.value} onClick={() => setStatusFilter(filter.value)}>
              <span className="payment-status-label">{filter.label}</span><strong>{filter.count.toLocaleString('ar-EG')}</strong>
            </button>)}
          </div>
          {paymentStateCounts.unconfigured > 0 && <p className="mt-1 text-xs text-slate-500">الشقق بدون مستحقات محددة تظهر في «الكل».</p>}
        </section>}
      </div>

      <div data-tour="collections-tabs" role="group" aria-label="أقسام الشقق والتحصيل"
        className={`grid w-full min-w-0 gap-1.5 rounded-[21px] border border-[#deebe7] bg-[#eaf3f1] p-1.5 text-xs font-bold sm:gap-2 sm:p-2 ${isManager ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {([
          { id: 'apartments', title: 'قائمة الشقق', label: 'كشف الشقق وسداد الوحدات', count: buildingApartments.length, icon: Building2 },
          { id: 'payments', title: 'قائمة الإيصالات', label: 'سجل جميع الإيصالات والمدفوعات', count: buildingPayments.length, icon: Receipt },
          { id: 'audit', title: 'قائمة التدقيق', label: 'سجل تدقيق وتعديل الحسابات', count: buildingAuditLogs.length, icon: History },
        ] as const).filter(tab => tab.id !== 'audit' || isManager).map(({ id, title, label, count, icon: Icon }) => {
          const selected = activeSubTab === id;
          return (
            <button key={id} type="button" aria-pressed={selected} aria-label={`${label} (${count})`}
              onClick={() => setActiveSubTab(id)}
              className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center leading-tight transition-colors ${selected
                ? 'border-transparent bg-[#0b4548] text-white shadow-sm'
                : 'border-[#deebe7] bg-white/80 text-slate-700 hover:bg-white'}`}>
              <span className="flex items-center justify-center gap-1.5">
                <Icon aria-hidden="true" className={`size-3.5 shrink-0 ${selected ? 'text-teal-300' : 'text-teal-700'}`} />
                <span className="tabular-nums">{count}</span>
              </span>
              <span>{title}</span>
            </button>
          );
        })}
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            data-tour="collections-search" value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              activeSubTab === 'payments'
                ? 'بحث بالشقة، الساكن، رقم الإيصال أو الملاحظات...'
                : 'بحث برقم الشقة، اسم الساكن، أو الهاتف...'
            }
            className="w-full text-xs bg-slate-50 pr-8 pl-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto no-scrollbar text-xs">
          {activeSubTab === 'payments' ? (
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="all">جميع الشهور والدورات ({buildingPayments.length})</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  دورة {m}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      {/* Confirmation Modal for Deleting an Apartment */}
      {apartmentToDelete && (
        <div className="fixed inset-0 z-50 bg-[#0f2537]/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-3">
            <div className="flex items-start gap-3 text-rose-900">
              <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-base">تأكيد حذف {apartmentToDelete.unitNumber}؟</h3>
                <p className="text-xs text-rose-700 leading-relaxed mt-1">
                  سيتم حذف الشقة المسجلة باسم "{apartmentToDelete.residentName}" نهائياً من سجلات العمارة، بما فيها سجل المدفوعات التابع لها.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setApartmentToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteApartment}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Deleting a Payment */}
      {paymentToDelete && createPortal(
        <div dir="rtl" className="fixed inset-0 z-[100] bg-[#0f2537]/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:p-5 shadow-2xl border border-rose-300 space-y-4" dir="rtl" role="alertdialog" aria-modal="true" aria-labelledby="delete-payment-title">
            <div className="flex items-start gap-3 text-rose-950">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-2 flex-1 min-w-0">
                <h3 id="delete-payment-title" className="font-bold text-base text-rose-900">تأكيد حذف دفعة السداد</h3>
                <p className="text-xs text-rose-700 leading-relaxed">
                  هل أنت متأكد من حذف هذه الدفعة نهائياً؟ يرجى مراجعة تفاصيلها:
                </p>
                <div className="bg-rose-50/60 p-3 rounded-xl border border-rose-200 grid grid-cols-2 gap-3 text-xs">
                  <div className="min-w-0">
                    <span className="text-slate-500 block text-[10px]">المبلغ:</span>
                    <span className="font-bold text-rose-700 text-sm">{paymentToDelete.amount.toLocaleString()} ج.م</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-slate-500 block text-[10px]">الشقة:</span>
                    <span className="font-bold text-slate-800">{paymentToDelete.unitNumber}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-slate-500 block text-[10px]">رقم الإيصال:</span>
                    <span className="font-mono text-slate-700 font-bold break-all" dir="ltr">{paymentToDelete.receiptNumber || 'بدون إيصال'}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-slate-500 block text-[10px]">الدورة والتاريخ:</span>
                    <span className="block text-slate-700 break-words">{paymentToDelete.month}</span>
                    <span className="block text-slate-600 mt-1" dir="ltr">{paymentToDelete.date}</span>
                  </div>
                </div>
                <p className="text-[11px] text-rose-600 font-medium">
                  ⚠️ سيتم خصم هذا المبلغ فوراً من خزينة العمارة وإعادة احتساب المتبقي للشقة وتوثيق العملية في سجل التدقيق.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPaymentToDelete(null)}
                className="px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={deletingPayment} onClick={handleConfirmDeletePayment}
                className="px-4 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm"
              >
                تأكيد حذف الدفعة
              </button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* SUBTAB 1: APARTMENTS VIEW */}
      {activeSubTab === 'apartments' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600" aria-live="polite" data-payment-filter-summary>
            <strong>{statusFilter === 'outstanding' ? 'الشقق التي عليها متبقي' : statusFilter === 'all' ? 'كل الشقق' : paymentStateLabels[statusFilter]} · {filteredApartments.length.toLocaleString('ar-EG')} شقة</strong>
            <span>المتبقي: {filteredApartments.reduce((sum, apt) => sum + calculateApartmentFinancials(apt, payments).remaining, 0).toLocaleString('ar-EG')} ج.م</span>
            {statusFilter === 'outstanding' && <button type="button" onClick={() => setStatusFilter('all')} className="min-h-11 font-bold text-teal-700">عرض كل الشقق</button>}
          </div>
          {filteredApartments.length === 0 ? (
            <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center text-slate-400 text-xs space-y-2">
              <Building2 className="w-8 h-8 text-slate-300 mx-auto" />
              <p>لا توجد شقق مطابقة للبحث أو الفلتر المختار.</p>
            </div>
          ) : (
            filteredApartments.map((apt) => {
              const fin = calculateApartmentFinancials(apt, payments);
              const paymentState = classifyApartmentPayment(fin);
              const isPaid = paymentState === 'paid';
              const isOverdue = fin.status === 'overdue';

              return (
                <article key={apt.id} className="apartment-compact-card rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <button type="button" onClick={() => setDetailsApartment(apt)} title="عرض كشف حساب وتفاصيل الشقة والإيصالات" className="min-h-11 min-w-0 flex-1 text-right">
                      <span className="block truncate text-sm font-bold text-slate-900">شقة {apt.unitNumber.replace('شقة ', '')} · {apt.residentName || 'بيانات الساكن غير مسجلة'}</span>
                      <span className={`mt-1 block text-xs ${isPaid ? 'text-emerald-700' : isOverdue ? 'text-rose-700' : 'text-slate-600'}`}>
                        <span className="apartment-payment-state" data-payment-status={paymentState}>{paymentStateLabels[paymentState]}</span>
                        {!isPaid && paymentState !== 'unconfigured' && ` · متبقي ${fin.remaining.toLocaleString()} ج.م`}
                        {fin.creditBalance > 0 && ` · مقدم ${fin.creditBalance.toLocaleString()} ج.م`}
                        {' · '}عرض التفاصيل ({fin.allPayments.length})
                      </span>
                    </button>
                    {isManager && <button type="button" onClick={() => handleOpenAddPayment(apt)} title="قيد دفعة سداد جديدة لهذه الشقة" className="min-h-11 shrink-0 rounded-xl bg-teal-700 px-4 text-sm font-bold text-white">سداد</button>}
                  </div>
                  {isManager && <details className="mt-1 border-t border-slate-100 pt-1">
                    <summary className="min-h-11 cursor-pointer py-3 text-xs text-slate-500">خيارات الشقة</summary>
                    <div className="flex flex-wrap gap-2 pb-1">
                      <button type="button" onClick={() => { setEditingApartment(apt); setIsAddAptModalOpen(true); }} title="تعديل بيانات الشقة" className="min-h-11 rounded-xl bg-slate-100 px-4 text-sm font-bold">تعديل بيانات الشقة</button>
                      <button type="button" onClick={() => setApartmentToDelete(apt)} title="حذف الشقة" className="min-h-11 rounded-xl border border-rose-200 px-4 text-sm font-bold text-rose-700">حذف الشقة</button>
                    </div>
                  </details>}
                </article>
              );
            })
          )}
        </div>
      )}

      {/* SUBTAB 2: ALL PAYMENTS & RECEIPTS VIEW */}
      {activeSubTab === 'payments' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-teal-600" />
                <span>سجل الإيصالات والمدفوعات الشامل</span>
              </h3>
              <p className="text-xs text-slate-500">
                عرض تفصيلي لجميع الدفعات مع إمكانية تعديل المبلغ والتاريخ والإيصال أو الحذف
              </p>
            </div>
            {isManager && (
              <button
                onClick={() => handleOpenAddPayment()}
                className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition active:scale-95 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>قيد سداد جديد</span>
              </button>
            )}
          </div>

          {filteredPayments.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              لا توجد دفعات مطابقة لخيارات البحث أو الفلتر المختار.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <tr>
                    <th className="p-3">رقم الإيصال</th>
                    <th className="p-3">الشقة والشاغل</th>
                    <th className="p-3">المبلغ المسدد</th>
                    <th className="p-3">دورة / شهر الاستحقاق</th>
                    <th className="p-3">تاريخ الدفع</th>
                    <th className="p-3">طريقة السداد</th>
                    <th className="p-3">الملاحظات</th>
                    {isManager && <th className="p-3 text-center">الإجراءات</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition">
                      <td className="p-3 font-mono font-bold text-slate-800">
                        {p.isHistorical ? (p.paymentType==='exceptional'?'سداد استثنائي سابق':'رصيد سابق') : p.receiptNumber || 'بدون إيصال'}
                      </td>
                      <td className="p-3">
                        <span className="font-bold text-slate-900 block">{p.unitNumber}</span>
                        <span className="text-[11px] text-slate-500 block">{p.residentName}</span>
                      </td>
                      <td className="p-3 font-bold text-teal-700 font-mono text-sm">
                        {p.amount.toLocaleString()} ج.م
                      </td>
                      <td className="p-3">
                        <span className="bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-md text-[11px]">
                          {p.month}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-slate-600">{p.date}</td>
                      <td className="p-3">
                        <span className="bg-teal-50 text-teal-700 font-bold px-2 py-0.5 rounded-full text-[10px] border border-teal-200">
                          {p.method}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500 max-w-xs truncate">{p.notes || '-'}</td>
                      {isManager && (
                        <td className="p-3 text-center">
                          {!p.isHistorical&&!p.isAssessment&&<button type="button" onClick={()=>requestPaymentReceipt(p.id)} className="min-h-11 rounded-xl bg-teal-50 px-3 text-xs font-bold text-teal-800">عرض إيصال السداد</button>}
                          {p.isHistorical ? <span className="text-xs text-slate-500">{p.paymentType==='exceptional'?'سداد استثنائي سابق من نقل الحسابات':'يُعدّل من توزيع الرصيد السابق في بيانات العمارة'}</span> : <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenEditPayment(p)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-teal-50 hover:text-teal-700 text-slate-700 font-bold text-[11px] flex items-center gap-1 transition"
                              title="تعديل تفاصيل الدفعة"
                            >
                              <Edit2 className="w-3 h-3 text-teal-600" />
                              <span>تعديل</span>
                            </button>
                            <button
                              onClick={() => setPaymentToDelete(p)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                              title="حذف هذه الدفعة"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                            </button>
                          </div>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 3: AUDIT LOG VIEW (Manager Only) */}
      {activeSubTab === 'audit' && isManager && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <History className="w-4 h-4 text-teal-600" />
              <span>سجل العمليات المالية</span>
            </h3>
            <p className="text-xs text-slate-500">
              سجل مركزي من الخادم يوثق السداد والمصروفات والبيانات السابقة والجديدة. أحدث ٥٠٠ عملية.
            </p>
          </div>

          {buildingAuditLogs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              لا توجد عمليات تعديل أو حذف مسجلة في سجل التدقيق حتى الآن.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-xs text-right border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <tr>
                    <th className="p-3 whitespace-nowrap">نوع العملية</th>
                    <th className="p-3">الوحدة المستهدفة</th>
                    <th className="p-3">تفاصيل التغيير</th>
                    <th className="p-3">القائم بالعملية</th>
                    <th className="p-3">تاريخ ووقت العملية</th>
                    <th className="p-3">البيان والملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {buildingAuditLogs.map((log) => {
                    const isCreate = log.action === 'create';
                    const isUpdate = log.action === 'update';
                    const isDelete = log.action === 'delete';

                    return (
                      <tr key={log.id} className="hover:bg-slate-50/70 transition">
                        <td className="p-3">
                          <span
                            className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              isCreate
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : isUpdate
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {isCreate ? 'إضافة' : isUpdate ? 'تعديل' : 'حذف'}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-slate-800">{log.unitNumber}</td>
                        <td className="p-3 font-mono">
                          {isUpdate && log.previousData && log.newData && (
                            <div className="space-y-0.5 text-[11px]">
                              <span className="text-slate-400 line-through block">
                                السابق: {log.previousData.amount?.toLocaleString()} ج.م
                              </span>
                              <span className="text-teal-700 font-bold block">
                                الجديد: {log.newData.amount?.toLocaleString()} ج.م
                              </span>
                            </div>
                          )}
                          {isDelete && log.previousData && (
                            <span className="text-rose-600 font-bold text-[11px]">
                              حذف: {log.previousData.amount?.toLocaleString()} ج.م
                            </span>
                          )}
                          {isCreate && log.newData && (
                            <span className="text-emerald-700 font-bold text-[11px]">
                              إضافة: {log.newData.amount?.toLocaleString()} ج.م
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-slate-700 font-medium">{log.performedBy}</td>
                        <td className="p-3 font-mono text-[11px] text-slate-500">
                          {new Date(log.timestamp).toLocaleString('ar-EG')}
                        </td>
                        <td className="p-3 text-slate-600">{log.notes || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Apartment Modal */}
      {isAddAptModalOpen && (
        <ApartmentFormModal
          isOpen={isAddAptModalOpen}
          onClose={() => {
            setIsAddAptModalOpen(false);
            setEditingApartment(null);
          }}
          apartmentToEdit={editingApartment}
          buildingId={currentBuilding.id}
          onSave={handleSaveApartmentForm}
        />
      )}

      {/* Payment Recording / Editing Modal */}
      {isPaymentModalOpen && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setSelectedApartmentForPay(null);
            setEditingPayment(null);
          }}
          apartments={buildingApartments}
          selectedApartment={selectedApartmentForPay}
          editingPayment={editingPayment}
          onSavePayment={async (pData) => {
            if (editingPayment) {
              return await onEditPayment({
                ...editingPayment,
                ...pData,
              });
            } else {
              const saved = await onSavePayment(pData);
              if (!saved) return false;
              const prefs = getStoredSettings();
              const apt = buildingApartments.find((item) => item.id === pData.apartmentId);
              if (prefs.autoWhatsAppReceipt && apt?.residentPhone) {
                const phone = apt.residentPhone.replace(/\\D/g, '').replace(/^0/, '20');
                const receiptText = [
                  `إيصال سداد - ${currentBuilding.name}`,
                  `اسم الساكن: ${apt.residentName}`,
                  `رقم الشقة: ${apt.unitNumber}`,
                  `المبلغ المدفوع: ${Number(pData.amount).toLocaleString('ar-EG')} ج.م`,
                  `عن: ${pData.month}`,
                  `تاريخ السداد: ${pData.date}`,
                  `طريقة السداد: ${pData.method}`,
                  `رقم الإيصال: ${pData.receiptNumber || 'غير محدد'}`,
                  'شكراً لكم - إدارة العقار',
                ].join('\\n');
                window.open(`https://wa.me/${phone}?text=${encodeURIComponent(receiptText)}`, '_blank', 'noopener,noreferrer');
              }
              return true;
            }
          }}
          existingPayments={payments}
          paymentMethods={paymentMethods}
        />
      )}

      {/* Apartment Details & Payment History Modal */}
      {detailsApartment && (
        <ApartmentDetailsModal
          isOpen={!!detailsApartment}
          onClose={() => setDetailsApartment(null)}
          apartment={buildingApartments.find((a) => a.id === detailsApartment.id) || detailsApartment}
          payments={payments}
          buildingName={currentBuilding.name}
          role={role}
          onEditApartment={(apt) => {
            setDetailsApartment(null);
            setEditingApartment(apt);
            setIsAddAptModalOpen(true);
          }}
          onDeleteApartment={(id) => {
            onDeleteApartment(id);
            setDetailsApartment(null);
          }}
          onOpenAddPaymentForApt={(apt) => handleOpenAddPayment(apt)}
          onEditPayment={(p) => handleOpenEditPayment(p)}
          onDeletePayment={(pId) => onDeletePayment(pId)}
        />
      )}
    </div>
  );
};
