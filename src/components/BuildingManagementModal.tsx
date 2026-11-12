import React, { useEffect, useState } from 'react';
import { Building } from '../types';
import { Building2, Save, X, Phone, MapPin, Layers } from 'lucide-react';
import { BuildingDataDeletionButton } from './BuildingDataDeletionButton';

interface BuildingManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  buildings?: Building[];
  currentBuilding: Building;
  onSelectBuilding?: (building: Building) => void;
  onAddBuilding?: (newBuilding: Omit<Building, 'id'>) => Promise<void>;
  onUpdateBuilding: (id: string, updatedBuilding: Partial<Building>) => Promise<void>;
  onDeleteBuilding?: (id: string) => void;
}

export const BuildingManagementModal: React.FC<BuildingManagementModalProps> = ({
  isOpen, onClose, buildings = [], currentBuilding, onAddBuilding, onUpdateBuilding,
}) => {
  const isNewBuilding = buildings.length === 0;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [totalFloors, setTotalFloors] = useState(1);
  const [totalUnits, setTotalUnits] = useState(0);
  const [monthlyTarget, setMonthlyTarget] = useState(0);
  const [reserveFund, setReserveFund] = useState(0);
  const [managerName, setManagerName] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [manager2Name, setManager2Name] = useState('');
  const [manager2Phone, setManager2Phone] = useState('');
  const [manager3Name, setManager3Name] = useState('');
  const [manager3Phone, setManager3Phone] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSaveError('');
    if (isNewBuilding) {
      setName('');
      setAddress('');
      setTotalFloors(1);
      setTotalUnits(0);
      setMonthlyTarget(0);
      setReserveFund(0);
      setManagerName('');
      setManagerPhone('');
      setManager2Name(''); setManager2Phone('');
      setManager3Name(''); setManager3Phone('');
    } else {
      setName(currentBuilding.name);
      setAddress(currentBuilding.address);
      setTotalFloors(currentBuilding.totalFloors || 1);
      setTotalUnits(currentBuilding.totalUnits || 0);
      setMonthlyTarget(currentBuilding.monthlyTarget || 0);
      setReserveFund(currentBuilding.reserveFund || 0);
      setManagerName(currentBuilding.managerName || '');
      setManagerPhone(currentBuilding.managerPhone || '');
      setManager2Name(currentBuilding.manager2Name || '');
      setManager2Phone(currentBuilding.manager2Phone || '');
      setManager3Name(currentBuilding.manager3Name || '');
      setManager3Phone(currentBuilding.manager3Phone || '');
    }
  }, [isOpen, isNewBuilding, currentBuilding]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !name.trim()) return;
    const data = {
      name: name.trim(),
      address: address.trim(),
      totalFloors: Math.max(1, Number(totalFloors) || 1),
      totalUnits: Math.max(0, Number(totalUnits) || 0),
      balance: 0,
      monthlyTarget: Math.max(0, Number(monthlyTarget) || 0),
      reserveFund: Math.max(0, Number(reserveFund) || 0),
      managerName: managerName.trim(),
      managerPhone: managerPhone.trim(),
      manager2Name: manager2Name.trim(), manager2Phone: manager2Phone.trim(),
      manager3Name: manager3Name.trim(), manager3Phone: manager3Phone.trim(),
    };
    setSaving(true); setSaveError('');
    try {
      if (isNewBuilding) {
        if (!onAddBuilding) throw new Error('تعذر بدء إضافة العمارة. حاول مرة أخرى.');
        await onAddBuilding(data);
      } else {
        await onUpdateBuilding(currentBuilding.id, data);
      }
      onClose();
    } catch (failure) {
      setSaveError(failure instanceof Error ? failure.message : 'تعذر حفظ بيانات العمارة. حاول مرة أخرى.');
    } finally { setSaving(false); }

  };

  const field = 'w-full bg-white text-slate-900 placeholder:text-slate-400 text-sm px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500';
  const label = 'block text-xs font-bold text-slate-700 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 bg-[#0f2537]/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white text-slate-800 rounded-3xl max-w-xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{isNewBuilding ? 'إضافة أول عمارة' : 'بيانات العمارة'}</h2>
              <p className="text-xs text-slate-500">{isNewBuilding ? 'أدخل البيانات وسيتم إنشاء الشقق تلقائيًا حسب العدد والأدوار' : 'تعديل بيانات العمارة الحالية'}</p>
            </div>
          </div>
          <button type="button" disabled={saving} onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4">
          <fieldset disabled={saving} className="space-y-4">
          <div>
            <label className={label}>اسم العمارة *</label>
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="اكتب اسم العمارة" className={field} />
          </div>
          <div>
            <label className={label}><MapPin className="w-3.5 h-3.5 inline ml-1" />العنوان</label>
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="المدينة والحي والشارع" className={field} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}><Layers className="w-3.5 h-3.5 inline ml-1" />عدد الأدوار</label>
              <input type="number" min="1" max="100" required value={totalFloors} onChange={e => setTotalFloors(Number(e.target.value))} onFocus={e => e.currentTarget.select()} className={field} />
            </div>
            <div>
              <label className={label}>{isNewBuilding ? 'عدد الشقق التي ستُنشأ' : 'إجمالي الوحدات'}</label>
              <input type="number" min="0" required value={totalUnits} onChange={e => setTotalUnits(Number(e.target.value))} onFocus={e => e.currentTarget.select()} className={field} />
            </div>
          </div>
          <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">{isNewBuilding ? 'سيتم إنشاء الشقق بأرقام متسلسلة وتوزيعها على الأدوار. يمكنك تعديل أسماء السكان والاشتراكات لاحقًا من شاشة الشقق.' : 'عند زيادة العدد، تُضاف الشقق الناقصة تلقائيًا دون تغيير الشقق الحالية أو مدفوعاتها. تُترك الأدوار الجديدة غير محددة حتى تعدّلها من شاشة الشقق. لا يمكن تقليل العدد عن الشقق المسجلة.'}</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>المستهدف الشهري للتحصيل</label><input type="number" min="0" value={monthlyTarget} onChange={e => setMonthlyTarget(Number(e.target.value))} onFocus={e => e.currentTarget.select()} className={field} /></div>
            <div><label className={label}>صندوق الطوارئ</label><input type="number" min="0" value={reserveFund} onChange={e => setReserveFund(Number(e.target.value))} onFocus={e => e.currentTarget.select()} className={field} /></div>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={label}>اسم المسؤول الأول</label><input value={managerName} onChange={e => setManagerName(e.target.value)} className={field} /></div>
              <div><label className={label}><Phone className="w-3.5 h-3.5 inline ml-1" />هاتف المسؤول الأول</label><input dir="ltr" type="tel" value={managerPhone} onChange={e => setManagerPhone(e.target.value)} className={field} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={label}>اسم المسؤول الثاني</label><input value={manager2Name} onChange={e => setManager2Name(e.target.value)} className={field} /></div>
              <div><label className={label}><Phone className="w-3.5 h-3.5 inline ml-1" />هاتف المسؤول الثاني</label><input dir="ltr" type="tel" value={manager2Phone} onChange={e => setManager2Phone(e.target.value)} className={field} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={label}>اسم المسؤول الثالث</label><input value={manager3Name} onChange={e => setManager3Name(e.target.value)} className={field} /></div>
              <div><label className={label}><Phone className="w-3.5 h-3.5 inline ml-1" />هاتف المسؤول الثالث</label><input dir="ltr" type="tel" value={manager3Phone} onChange={e => setManager3Phone(e.target.value)} className={field} /></div>
            </div>
          </div>
          {saveError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-6 text-rose-700">{saveError}</p>}
          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <button type="button" disabled={saving} onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold">إلغاء</button>
            <button type="submit" className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5">
              <Save className="w-4 h-4" /><span>{saving ? 'جارٍ الحفظ...' : isNewBuilding ? 'إضافة العمارة' : 'حفظ التعديلات'}</span>
            </button>
          </div>
          </fieldset>
        </form>
        {!isNewBuilding && <BuildingDataDeletionButton building={currentBuilding}/>}
      </div>
    </div>
  );
};
