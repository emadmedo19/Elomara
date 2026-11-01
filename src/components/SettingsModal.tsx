import React, { useEffect, useState } from 'react';
import { AppSettings, Building } from '../types';
import { 
  Settings, User, Phone, CreditCard, Bell, 
  Check, X, Building2, ShieldCheck, Sparkles 
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => Promise<boolean> | void;
  currentBuilding: Building;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  currentBuilding,
}) => {
  const [managerName, setManagerName] = useState(settings.managerName || 'أمين صندوق العمارة');
  const [managerPhone, setManagerPhone] = useState(settings.managerPhone || '01001234567');
  const [emergencyPhone, setEmergencyPhone] = useState(settings.emergencyPhone || '01229876543');
  const [bankAccountName, setBankAccountName] = useState(settings.bankAccountName || '');
  const [bankAccountNumber, setBankAccountNumber] = useState(settings.bankAccountNumber || '');
  const [paymentMethodsText, setPaymentMethodsText] = useState((settings.paymentMethods || ['إنستاباي', 'تحويل بنكي', 'فودافون كاش', 'نقدي', 'أخرى']).join('، '));
  const [currency, setCurrency] = useState(settings.currency || 'ج.م');
  const [collectionDay, setCollectionDay] = useState(settings.collectionDay || 1);
  const [autoWhatsAppReceipt, setAutoWhatsAppReceipt] = useState(settings.autoWhatsAppReceipt ?? true);
  const [overdueAlert, setOverdueAlert] = useState(settings.overdueAlert ?? true);

  // Settings may arrive asynchronously from Supabase after the modal component mounts.
  useEffect(() => {
    setManagerName(settings.managerName || 'أمين صندوق العمارة');
    setManagerPhone(settings.managerPhone || '01001234567');
    setEmergencyPhone(settings.emergencyPhone || '01229876543');
    setBankAccountName(settings.bankAccountName || 'فودافون كاش / إنستاباي');
    setBankAccountNumber(settings.bankAccountNumber || '01001234567');
    setPaymentMethodsText((settings.paymentMethods || ['إنستاباي', 'تحويل بنكي', 'فودافون كاش', 'نقدي', 'أخرى']).join('، '));
    setCurrency(settings.currency || 'ج.م');
    setCollectionDay(settings.collectionDay || 1);
    setAutoWhatsAppReceipt(settings.autoWhatsAppReceipt ?? true);
    setOverdueAlert(settings.overdueAlert ?? true);
  }, [settings, isOpen]);

  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const saved = await onSaveSettings({
      ...settings,
      managerName: managerName.trim(),
      managerPhone: managerPhone.trim(),
      emergencyPhone: emergencyPhone.trim(),
      bankAccountName: bankAccountName.trim(),
      bankAccountNumber: bankAccountNumber.trim(),
      paymentMethods: paymentMethodsText.split(/[,،]/).map(method => method.trim()).filter(Boolean),
      currency,
      collectionDay: Number(collectionDay) || 1,
      autoWhatsAppReceipt,
      overdueAlert,
    });
    if (saved === false) return;
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0f2537]/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">إعدادات التطبيق والعمارة</h3>
              <p className="text-xs text-slate-500">بيانات المسؤول، الحساب المالي، وتفضيلات النظام</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="my-4 space-y-4">
          {/* Active Building Banner */}
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <Building2 className="w-4 h-4 text-teal-600" />
              <div>
                <span className="text-slate-500 block text-[10px]">العمارة الحالية النشطة</span>
                <span className="font-bold text-slate-900">{currentBuilding.name} ({currentBuilding.totalUnits} شقة)</span>
              </div>
            </div>
            <span className="text-[10px] bg-teal-500/10 text-teal-700 border border-teal-500/20 px-2 py-0.5 rounded-full font-bold">
              نشطة
            </span>
          </div>

          {/* Manager & Contact Information */}
          <div className="space-y-3 p-4 rounded-2xl bg-slate-50/80 border border-slate-200">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-xs">
              <User className="w-4 h-4 text-teal-600" />
              <span>بيانات المسؤول والتواصل</span>
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  اسم مدير العقار / أمين الصندوق
                </label>
                <input
                  type="text"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  placeholder="مثال: أ. أحمد عبد الله"
                  className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    هاتف التواصل والإشعارات
                  </label>
                  <input
                    type="tel"
                    value={managerPhone}
                    onChange={(e) => setManagerPhone(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                    placeholder="010..."
                    className="w-full text-xs font-mono bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    رقم طوارئ الصيانة والمصاعد
                  </label>
                  <input
                    type="tel"
                    value={emergencyPhone}
                    onChange={(e) => setEmergencyPhone(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                    placeholder="012..."
                    className="w-full text-xs font-mono bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Financial Account & Collections */}
          <div className="space-y-3 p-4 rounded-2xl bg-slate-50/80 border border-slate-200">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-xs">
              <CreditCard className="w-4 h-4 text-teal-600" />
              <span>الحساب المالي لتحصيل الاشتراكات</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  اسم وسيلة السداد
                </label>
                <input
                  type="text"
                  value={bankAccountName}
                  onChange={(e) => setBankAccountName(e.target.value)}
                  placeholder="مثال: إنستاباي أو فودافون كاش أو بنك مصر"
                  className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  عنوان الدفع أو رقم المحفظة / الحساب
                </label>
                <input
                  type="text"
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  placeholder="مثال: name@instapay أو رقم المحفظة أو IBAN"
                  className="w-full text-xs font-mono bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">أسماء وسائل الدفع الظاهرة في تسجيل التحصيل (يمكنك تعديلها)</label>
              <input
                type="text"
                value={paymentMethodsText}
                onChange={(e) => setPaymentMethodsText(e.target.value)}
                placeholder="إنستاباي، فودافون كاش، تحويل بنكي، نقدي"
                className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              />
              <p className="text-[10px] text-slate-500 mt-1">اكتب عنوان إنستاباي (IPA) أو رقم المحفظة أو الحساب البنكي. ستظهر البيانات للسكان في صفحة الموقف المالي بعد الحفظ.</p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  موعد تحصيل الاشتراك
                </label>
                <select
                  value={collectionDay}
                  onChange={(e) => setCollectionDay(Number(e.target.value))}
                  className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 cursor-pointer"
                >
                  <option value={1}>اليوم 1 من كل شهر</option>
                  <option value={5}>اليوم 5 من كل شهر</option>
                  <option value={10}>اليوم 10 من كل شهر</option>
                  <option value={15}>اليوم 15 من كل شهر</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  العملة المعتمدة
                </label>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                />
              </div>
            </div>
          </div>

          {/* Preferences & Alerts */}
          <div className="space-y-2.5 p-4 rounded-2xl bg-slate-50/80 border border-slate-200">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-xs">
              <Bell className="w-4 h-4 text-teal-600" />
              <span>تفضيلات التنبيهات والإشعارات</span>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer py-1">
              <input
                type="checkbox"
                checked={autoWhatsAppReceipt}
                onChange={(e) => setAutoWhatsAppReceipt(e.target.checked)}
                className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500 cursor-pointer"
              />
              <span className="text-xs text-slate-700">تجهيز إيصال واتساب تلقائياً بعد كل عملية سداد</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer py-1">
              <input
                type="checkbox"
                checked={overdueAlert}
                onChange={(e) => setOverdueAlert(e.target.checked)}
                className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500 cursor-pointer"
              />
              <span className="text-xs text-slate-700">إظهار شارة تنبيه للوحدات المتأخرة عن موعد السداد</span>
            </label>
          </div>

          {/* AI Status Badge */}
          <div className="p-3 rounded-2xl bg-teal-50/60 border border-teal-200 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              <Sparkles className="w-4 h-4 text-teal-700" />
              <div>
                <span className="font-bold text-teal-900 block">المساعد الذكي (Gemini)</span>
                <span className="text-[11px] text-teal-700">يعمل تلقائياً ومباشرة عبر الخادم الآمن دون الحاجة لمفتاح</span>
              </div>
            </div>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full font-bold">
              متصل ✓
            </span>
          </div>

          {/* Footer Save Button */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              {saveSuccess ? '✓ تم حفظ الإعدادات!' : 'برج الفتوح v2.1.0'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md transition active:scale-95 flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>حفظ التعديلات</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
