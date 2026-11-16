import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { Building, Expense } from '../types';
import { 
  Receipt, Plus, Filter, Search, Calendar, Tag, User, 
  Camera, Sparkles, Check, X, ArrowDownRight, FileText, Upload, 
  Edit2, Trash2, AlertTriangle, AlertCircle 
} from 'lucide-react';
import { analyzeReceiptWithGemini } from '../services/geminiService';

interface ExpensesViewProps {
  currentBuilding: Building;
  expenses: Expense[];
  onAddExpense: (expense: Omit<Expense, 'id'>) => Promise<boolean | void> | void;
  onUpdateExpense: (id: string, updatedData: Partial<Expense>) => Promise<boolean | void> | void;
  onDeleteExpense: (id: string) => Promise<boolean | void> | void;
  isOpenAddModal: boolean;
  onCloseAddModal: () => void;
  onOpenAddModal: () => void;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  currentBuilding,
  expenses,
  onAddExpense,
  onUpdateExpense,
  onDeleteExpense,
  isOpenAddModal,
  onCloseAddModal,
  onOpenAddModal,
}) => {
  useBodyScrollLock(isOpenAddModal);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deficitConfirmation, setDeficitConfirmation] = useState('');
  const scanRevision = useRef(0);
  const mutation = useRef({ signature: '', id: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Edit Expense State
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);

  // Form states for new/edit expense
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<Expense['category']>('صيانة عامة');
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [vendor, setVendor] = useState('');
  const [notes, setNotes] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');

  // AI OCR scanning state
  const [isScanningReceipt, setIsScanningReceipt] = useState(false);
  const [scanMessage, setScanMessage] = useState('');

  // Filter expenses by building
  const buildingExpenses = expenses.filter(
    (exp) => !exp.buildingId || exp.buildingId === currentBuilding.id
  );

  const filteredExpenses = buildingExpenses.filter((exp) => {
    const matchesSearch =
      exp.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      exp.vendor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (exp.notes && exp.notes.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = categoryFilter === 'all' || exp.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  const totalExpenseSum = filteredExpenses.reduce((acc, curr) => acc + curr.amount, 0);

  const handleStartEdit = (exp: Expense) => {
    setEditingExpense(exp);
    setTitle(exp.title);
    setCategory(exp.category);
    setAmount(exp.amount);
    setDate(exp.date);
    setVendor(exp.vendor);
    setNotes(exp.notes || '');
    setReceiptUrl(exp.receiptUrl || '');
    onOpenAddModal();
  };

  const handleCloseModal = () => {
    scanRevision.current += 1;
    setIsScanningReceipt(false);
    setEditingExpense(null);
    setTitle('');
    setAmount(0);
    setSaveError('');
    setDeficitConfirmation('');
    mutation.current = { signature: '', id: '' };
    setVendor('');
    setNotes('');
    setReceiptUrl('');
    setScanMessage('');
    onCloseAddModal();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || isScanningReceipt || !title.trim() || amount <= 0) return;
    const data = { buildingId: currentBuilding.id, title: title.trim(), category, amount: Number(amount), date,
      vendor: vendor.trim(), notes: notes.trim(), receiptUrl, approvedBy: currentBuilding.managerName || 'مدير العمارة' };
    const signature = JSON.stringify({ ...data, id: editingExpense?.id });
    const availableBalance = Number(currentBuilding.balance) || 0;
    const additionalExpense = Number(amount) - (editingExpense?.amount || 0);
    if (additionalExpense > 0 && additionalExpense > availableBalance && deficitConfirmation !== `${signature}:${availableBalance}`) {
      setDeficitConfirmation(`${signature}:${availableBalance}`);
      setSaveError('رصيد الخزينة غير كافٍ. راجع العجز المتوقع واضغط تأكيد التسجيل بالعجز إذا كنت تريد الاستمرار.');
      return;
    }
    if (mutation.current.signature !== signature) mutation.current = { signature, id: crypto.randomUUID() };
    setSaving(true); setSaveError('');
    try {
      const saved = editingExpense
        ? await onUpdateExpense(editingExpense.id, { ...data, requestId: mutation.current.id })
        : await onAddExpense({ ...data, requestId: mutation.current.id });
      if (saved === false) setSaveError('لم يتم تأكيد الحفظ. البيانات موجودة؛ راجع الاتصال وحاول مرة أخرى.');
      else handleCloseModal();
    } catch { setSaveError('تعذر حفظ المصروف. البيانات موجودة للمحاولة مرة أخرى.'); }
    finally { setSaving(false); }
  };

  const handleSimulateOrUploadReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const revision = ++scanRevision.current;
    setIsScanningReceipt(true);
    setScanMessage('جارٍ قراءة الفاتورة واستخراج البنود والمبالغ...');

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        if (scanRevision.current !== revision) return;
        const fullBase64 = reader.result as string;
        setReceiptUrl(fullBase64);

        try {
          const result = await analyzeReceiptWithGemini(fullBase64, file.type || 'image/jpeg');
          if (scanRevision.current !== revision) return;
          if (result) {
            if (result.vendor) setVendor(result.vendor);
            if (result.amount) setAmount(Number(result.amount));
            if (result.category) setCategory(result.category as any);
            if (result.date) setDate(result.date);
            if (result.notes) setNotes(result.notes);
            setTitle(result.notes || `فاتورة ${result.category || 'صيانة'} - ${result.vendor || ''}`);
            setScanMessage('✓ تم استخراج بيانات الفاتورة بنجاح بواسطة الذكاء الاصطناعي!');
          }
        } catch {
          if (scanRevision.current !== revision) return;
          setScanMessage('تعذر قراءة الصورة. أرفق صورة أوضح أو اكتب بيانات الفاتورة يدويًا؛ لم يتم تغيير بياناتك.');
        } finally {
          if (scanRevision.current === revision) setIsScanningReceipt(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setIsScanningReceipt(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!expenseToDelete || saving) return;
    setSaving(true); setSaveError('');
    try { if (await onDeleteExpense(expenseToDelete.id) !== false) setExpenseToDelete(null); else setSaveError('تعذر حذف المصروف. حاول مرة أخرى.'); }
    catch { setSaveError('تعذر حذف المصروف. حاول مرة أخرى.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fotouh-expenses space-y-4" dir="rtl">
      {/* Top Header Card */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-rose-50 text-rose-600">
              <Receipt className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold text-slate-900">سجل مصروفات وفواتير العقار</h1>
                <span className="text-xs bg-rose-50 text-rose-700 font-bold px-2.5 py-0.5 rounded-full border border-rose-200">
                  {currentBuilding.name}
                </span>
              </div>
              <p className="text-xs text-slate-500">توثيق الفواتير وسداد أجور الصيانة والنظافة والكهرباء</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="text-left bg-rose-50 px-3.5 py-1.5 rounded-xl border border-rose-200 text-xs">
            <span className="text-rose-500 block text-[10px]">إجمالي المصروفات المعروضة</span>
            <span className="font-bold text-rose-700 text-sm">{totalExpenseSum.toLocaleString()} ج.م</span>
          </div>

          <button
            data-tour="expenses-add" onClick={() => {
              setEditingExpense(null);
              onOpenAddModal();
            }}
            className="bg-[#0f2537] hover:bg-[#1a3852] text-white text-xs font-bold px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 transition active:scale-95 shadow-sm"
          >
            <Plus className="w-4 h-4 text-teal-300" />
            <span>تسجيل مصروف جديد</span>
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {expenseToDelete && (
        <div className="fixed inset-0 z-50 bg-[#0f2537]/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-3">
            <div className="flex items-start gap-3 text-rose-900">
              <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-base">تأكيد حذف المصروف؟</h3>
                <p className="text-xs text-rose-700 leading-relaxed mt-1">
                  سيتم حذف بند "{expenseToDelete.title}" بمبلغ {expenseToDelete.amount.toLocaleString()} ج.م، وإعادة هذا المبلغ تلقائياً لرصيد خزينة العمارة.
                </p>
              </div>
            </div>
            {saveError && <p role="alert" className="text-sm text-rose-800">{saveError}</p>}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setExpenseToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={saving} onClick={handleConfirmDelete}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm"
              >
                {saving ? 'جارٍ الحذف...' : 'تأكيد الحذف'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Categories Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث بالبند، اسم المورد، أو الملاحظات..."
            className="w-full text-xs bg-slate-50 pr-8 pl-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full sm:w-auto text-xs pb-1 sm:pb-0">
          {['all', 'مصاعد', 'كهرباء', 'مياه ومضخات', 'نظافة', 'أمن وحراسة', 'صيانة عامة'].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition ${
                categoryFilter === cat
                  ? 'bg-[#0f2537] text-white font-bold shadow-2xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {cat === 'all' ? 'جميع البنود' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Expenses Table / Cards */}
      <div className="space-y-3">
        {filteredExpenses.length === 0 ? (
          <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center text-slate-400 text-xs">
            لا توجد مصروفات مسجلة مطابقة للبحث.
          </div>
        ) : (
          filteredExpenses.map((exp) => (
            <div
              key={exp.id}
              className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-xs transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold shrink-0 mt-0.5">
                  <ArrowDownRight className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900">{exp.title}</h3>
                    <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-bold">
                      {exp.category}
                    </span>
                    {exp.receiptUrl && (
                      <span className="text-[10px] bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full font-medium">
                        مرفق فاتورة ✓
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                    <span>المورد: <strong className="text-slate-700">{exp.vendor}</strong></span>
                    <span>•</span>
                    <span>التاريخ: {exp.date}</span>
                    <span>•</span>
                    <span>اعتماد: {exp.approvedBy}</span>
                  </div>
                  {exp.notes && (
                    <p className="text-xs text-slate-600 mt-1.5 bg-slate-50 p-2 rounded-xl border border-slate-100">
                      {exp.notes}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                <div className="text-left">
                  <span className="text-base sm:text-lg font-bold text-rose-600 block">
                    -{exp.amount.toLocaleString()} ج.م
                  </span>
                  <span className="text-[10px] text-emerald-600 font-medium">تم الصرف من الخزينة ✓</span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleStartEdit(exp)}
                    className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                    title="تعديل بيانات المصروف"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setExpenseToDelete(exp)}
                    className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition"
                    title="حذف المصروف واسترجاع المبلغ"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add / Edit Expense Modal */}
      {isOpenAddModal && createPortal(
        <div className="fixed inset-0 z-50 bg-[#0f2537]/70 backdrop-blur-xs flex items-center justify-center p-4">
          <form data-tour="expense-form" onSubmit={handleSubmit} className="bg-white rounded-3xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-2xl bg-rose-50 text-rose-600">
                  {editingExpense ? <Edit2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                </span>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    {editingExpense ? 'تعديل بيانات المصروف' : 'تسجيل وتوثيق مصروف أو فاتورة جديدة'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {editingExpense ? 'تعديل القيمة أو البند مع إعادة تسوية الخزينة' : 'سيتم خصم المبلغ مباشرة من رصيد الخزينة المتاح'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                data-tour="expense-close" onClick={() => { if (!saving) handleCloseModal(); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* AI Receipt Scanning Bar */}
            {!editingExpense && (
              <div className="my-3.5 p-3 rounded-2xl bg-gradient-to-r from-teal-50 to-indigo-50 border border-teal-200">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-teal-600" />
                    <span className="text-xs font-bold text-slate-800">قارئ الفواتير الذكي</span>
                  </div>
                  <div className="flex items-center gap-2">

                    <label className="text-[11px] bg-teal-600 hover:bg-teal-700 text-white px-2.5 py-1 rounded-xl font-bold cursor-pointer transition flex items-center gap-1">
                      <Camera className="w-3.5 h-3.5" />
                      <span>تصوير فاتورة</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleSimulateOrUploadReceipt}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
                {isScanningReceipt && (
                  <div className="mt-2 text-xs text-teal-700 flex items-center gap-1.5 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-teal-500" />
                    <span>{scanMessage}</span>
                  </div>
                )}
                {!isScanningReceipt && scanMessage && (
                  <p className="mt-1.5 text-xs text-slate-700 font-medium" role="status">{scanMessage}</p>
                )}
              </div>
            )}

            {saveError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{saveError}</p>}
            {Number(amount) > 0 && Number(amount) - (editingExpense?.amount || 0) > Number(currentBuilding.balance || 0) && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950" role="status">
                <p className="font-bold">تحذير: المصروف سيتسبب في عجز بالخزينة</p>
                <p className="mt-1">الرصيد الحالي: {Number(currentBuilding.balance || 0).toLocaleString('ar-EG')} ج.م — الرصيد بعد الحفظ: {(Number(currentBuilding.balance || 0) - (Number(amount) - (editingExpense?.amount || 0))).toLocaleString('ar-EG')} ج.م</p>
                <p className="mt-1">لن يتم تسجيل المصروف إلا بعد تأكيدك الصريح.</p>
              </div>
            )}
            <div className="space-y-3.5 my-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">عنوان البند أو المصروف *</label>
                <input
                  type="text"
                  required
                  data-tour="expense-title" value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: إصلاح ماتور المياه، راتب حارس، صيانة مصعد..."
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">التصنيف *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600"
                  >
                    <option value="مصاعد">مصاعد</option>
                    <option value="كهرباء">كهرباء</option>
                    <option value="مياه ومضخات">مياه ومضخات</option>
                    <option value="نظافة">نظافة</option>
                    <option value="أمن وحراسة">أمن وحراسة</option>
                    <option value="صيانة عامة">صيانة عامة</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">المبلغ بالجنيه (ج.م) *</label>
                  <input
                    type="number"
                    min="0.01" step="0.01"
                    required
                    data-tour="expense-amount" value={amount || ''}
                    onChange={(e) => setAmount(Number(e.target.value))}
                onFocus={(e) => e.currentTarget.select()}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 font-bold text-rose-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">اسم المورد أو الفني</label>
                  <input
                    type="text"
                    data-tour="expense-vendor" value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                    placeholder="اسم الشركة أو الفني"
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">تاريخ الصرف</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">ملاحظات أو تفاصيل القطع المستبدلة</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="تفاصيل إضافية..."
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => { if (!saving) handleCloseModal(); }}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                data-tour="expense-save" type="submit" disabled={saving || isScanningReceipt}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md transition active:scale-95 flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{saving ? 'جارٍ الحفظ...' : deficitConfirmation === `${JSON.stringify({ buildingId: currentBuilding.id, title: title.trim(), category, amount: Number(amount), date, vendor: vendor.trim(), notes: notes.trim(), receiptUrl, approvedBy: currentBuilding.managerName || 'مدير العمارة', id: editingExpense?.id })}:${Number(currentBuilding.balance) || 0}` ? 'تأكيد التسجيل بالعجز' : editingExpense ? 'حفظ تعديلات المصروف' : 'توثيق وخصم من الخزينة'}</span>
              </button>
            </div>
          </form>
        </div>, document.body
      )}
    </div>
  );
};
