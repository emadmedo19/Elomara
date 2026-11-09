import React, { useEffect, useState } from 'react';
import { Building } from '../types';
import { supabase } from '../lib/supabase';
import { Building2, Save, X, Phone, MapPin, Layers, LocateFixed } from 'lucide-react';

interface BuildingManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  buildings?: Building[];
  currentBuilding: Building;
  onSelectBuilding?: (building: Building) => void;
  onAddBuilding?: (newBuilding: Omit<Building, 'id'>) => void;
  onUpdateBuilding: (id: string, updatedBuilding: Partial<Building>) => void;
  onDeleteBuilding?: (id: string) => void;
}

export const BuildingManagementModal: React.FC<BuildingManagementModalProps> = ({
  isOpen, onClose, buildings = [], currentBuilding, onAddBuilding, onUpdateBuilding,
}) => {
  const isNewBuilding = buildings.length === 0;
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [position, setPosition] = useState<{latitude:number;longitude:number}|null>(null);
  const locateBuilding = () => {
    if (!navigator.geolocation) { setLocationMessage('تحديد الموقع غير متاح على هذا الجهاز.'); return; }
    setLocating(true); setLocationMessage('');
    navigator.geolocation.getCurrentPosition(async ({coords}) => {
      const location = {latitude:coords.latitude,longitude:coords.longitude};
      setPosition(location);
      try {
        const params = new URLSearchParams({lat:String(coords.latitude),lon:String(coords.longitude),format:'jsonv2','accept-language':'ar',zoom:'18'});
        const response = await fetch('https://nominatim.openstreetmap.org/reverse?' + params);
        if (response.ok) {
          const result:{display_name?:string} = await response.json();
          if (result.display_name) setAddress(result.display_name);
        }
      } catch { /* Coordinates remain available when lookup fails. */ }
      setLocating(false);
      setLocationMessage('تم تحديد الموقع. اضغط حفظ التعديلات لحفظه مع العنوان.');
    }, () => {setLocating(false);setLocationMessage('تعذر تحديد الموقع. تأكد من السماح بصلاحية الموقع.');}, {enableHighAccuracy:true,timeout:15000,maximumAge:0});
  };
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
    if (isNewBuilding) {
      setName('');
      setAddress('');
      setPosition(null); setLocationMessage('');
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
      setPosition(null); setLocationMessage('');
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (position && !isNewBuilding) {
      void supabase.rpc('set_building_location', {
        target_building_id: currentBuilding.id,
        new_latitude: position.latitude,
        new_longitude: position.longitude,
      }).then(({error}) => { if (error) console.error('Unable to save building location:', error.message); });
    }
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
    if (isNewBuilding) {
      if (!onAddBuilding) return;
      onAddBuilding(data);
    } else {
      onUpdateBuilding(currentBuilding.id, data);
    }
    onClose();
  };

  const field = 'w-full text-sm px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500';
  const label = 'block text-xs font-bold text-slate-700 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 bg-[#0f2537]/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl max-w-xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{isNewBuilding ? 'إضافة أول عمارة' : 'بيانات العمارة'}</h2>
              <p className="text-xs text-slate-500">{isNewBuilding ? 'ابدأ بإدخال بيانات العمارة؛ لن يتم إنشاء شقق تلقائيًا' : 'تعديل بيانات العمارة الحالية'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className={label}>اسم العمارة *</label>
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="اكتب اسم العمارة" className={field} />
          </div>
          <div>
            <label className={label}><MapPin className="w-3.5 h-3.5 inline ml-1" />العنوان</label>
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="المدينة والحي والشارع" className={field} />
            <button type="button" disabled={locating || isNewBuilding} onClick={locateBuilding} className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl border border-teal-300 bg-teal-50 px-3 py-2.5 text-sm font-bold text-teal-800 disabled:opacity-50"><LocateFixed className="h-4 w-4"/>{locating ? 'جارٍ تحديد موقع الهاتف...' : 'تحديد موقع العمارة من هاتفي'}</button>
            {locationMessage && <p role="status" className="mt-2 text-xs text-slate-600">{locationMessage}</p>}
            {position && <a target="_blank" rel="noopener noreferrer" className="mt-2 block text-xs font-bold text-teal-700 underline" href={`https://www.openstreetmap.org/?mlat=${position.latitude}&mlon=${position.longitude}#map=18/${position.latitude}/${position.longitude}`}>معاينة الموقع على الخريطة</a>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}><Layers className="w-3.5 h-3.5 inline ml-1" />عدد الأدوار</label>
              <input type="number" min="1" max="100" required value={totalFloors} onChange={e => setTotalFloors(Number(e.target.value))} onFocus={e => e.currentTarget.select()} className={field} />
            </div>
            <div>
              <label className={label}>إجمالي الوحدات (للتعريف فقط)</label>
              <input type="number" min="0" required value={totalUnits} onChange={e => setTotalUnits(Number(e.target.value))} onFocus={e => e.currentTarget.select()} className={field} />
            </div>
          </div>
          <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">تحديد إجمالي الوحدات لا ينشئ شققًا. الأدمن سيضيف كل شقة وبياناتها لاحقًا من شاشة الشقق.</p>
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
          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold">إلغاء</button>
            <button type="submit" className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5">
              <Save className="w-4 h-4" /><span>{isNewBuilding ? 'إضافة العمارة' : 'حفظ التعديلات'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
