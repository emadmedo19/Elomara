import {BuildingSetupWizard} from './BuildingSetupWizard';
import React, { useEffect, useState } from 'react';
import { Building } from '../types';
import { supabase } from '../lib/supabase';
import { Building2, Save, X, Phone, MapPin, Layers } from 'lucide-react';
import { BuildingDataDeletionButton } from './BuildingDataDeletionButton';
import { currentCollectionMonth } from '../services/historicalCollections';
import { HistoricalMonthlyDistribution } from './HistoricalMonthlyDistribution';
import { mapBuildingFinancialSnapshot, baseOpeningBalance, previewBuildingBalance, type BuildingFinanceDraft, type BuildingFinancialSnapshot } from '../services/buildingFinancialSettings';

interface BuildingManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  buildings?: Building[];
  currentBuilding: Building;
  onSelectBuilding?: (building: Building) => void;
  onAddBuilding?: (newBuilding: Omit<Building, 'id'>, finance?: BuildingFinanceDraft) => Promise<void>;
  onUpdateBuilding: (id: string, updatedBuilding: Partial<Building>, finance?: BuildingFinanceDraft) => Promise<void>;
  onDeleteBuilding?: (id: string) => void;
  onRefreshData?: () => Promise<void>;
}

export const BuildingManagementModal: React.FC<BuildingManagementModalProps> = ({
  isOpen, onClose, buildings = [], currentBuilding, onAddBuilding, onUpdateBuilding, onRefreshData,
}) => {
  const isNewBuilding = buildings.length === 0;
  const [guidedSetup,setGuidedSetup]=useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [totalFloors, setTotalFloors] = useState(1);
  const [totalUnits, setTotalUnits] = useState(0);
  const [monthlyTarget, setMonthlyTarget] = useState(0);
  const [applyMonthlyFeeToAll,setApplyMonthlyFeeToAll]=useState(false);
  const [reserveFund, setReserveFund] = useState(0);
  const [collectionStartMonth, setCollectionStartMonth] = useState('');
  const [historicalExpensesTotal, setHistoricalExpensesTotal] = useState(0);
  const [historicalExceptionalCollectionsTotal, setHistoricalExceptionalCollectionsTotal] = useState(0);
  const [managerName, setManagerName] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [manager2Name, setManager2Name] = useState('');
  const [manager2Phone, setManager2Phone] = useState('');
  const [manager3Name, setManager3Name] = useState('');
  const [manager3Phone, setManager3Phone] = useState('');
  const [financialSnapshot,setFinancialSnapshot]=useState<BuildingFinancialSnapshot|null>(null);
  const [openingBase,setOpeningBase]=useState('0');
  const [openingIncluded,setOpeningIncluded]=useState<'included'|'add'|''>('');
  const [financeLoading,setFinanceLoading]=useState(false);
  const [financeError,setFinanceError]=useState('');
  const [financeReload,setFinanceReload]=useState(0);
  const [distributionReload,setDistributionReload]=useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setSaveError('');
    setApplyMonthlyFeeToAll(false);
    if (isNewBuilding) {
      setName('');
      setAddress('');
      setTotalFloors(1);
      setTotalUnits(0);
      setMonthlyTarget(0);
      setReserveFund(0);
      setCollectionStartMonth(''); setHistoricalExpensesTotal(0); setHistoricalExceptionalCollectionsTotal(0);
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
      setCollectionStartMonth(currentBuilding.collectionStartMonth || '');
      setHistoricalExpensesTotal(currentBuilding.historicalExpensesTotal || 0);
      setHistoricalExceptionalCollectionsTotal(currentBuilding.historicalExceptionalCollectionsTotal || 0);
      setManagerName(currentBuilding.managerName || '');
      setManagerPhone(currentBuilding.managerPhone || '');
      setManager2Name(currentBuilding.manager2Name || '');
      setManager2Phone(currentBuilding.manager2Phone || '');
      setManager3Name(currentBuilding.manager3Name || '');
      setManager3Phone(currentBuilding.manager3Phone || '');
    }
  // Refreshing balances must not erase edits already typed in this form.
  }, [isOpen, isNewBuilding, currentBuilding.id]);

  // Building counts may change on the server while this modal or an OTA is open.
  // Always fetch the persisted count before displaying/editing it.
  useEffect(() => {
    if (!isOpen || isNewBuilding || !currentBuilding.id) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.from('buildings')
        .select('total_units,total_floors').eq('id', currentBuilding.id).single();
      if (cancelled || error || !data) return;
      setTotalUnits(Number(data.total_units ?? 0));
      setTotalFloors(Number(data.total_floors ?? 1));
    })();
    return () => { cancelled = true; };
  }, [isOpen, isNewBuilding, currentBuilding.id]);

  useEffect(()=>{
    if(!isOpen)return;
    if(isNewBuilding){setFinancialSnapshot(null);setOpeningBase('0');setOpeningIncluded('');setFinanceLoading(false);setFinanceError('');return;}
    let active=true;setFinanceLoading(true);setFinanceError('');
    void (async()=>{
      try {
        const {data,error}=await supabase.from('buildings').select('opening_cash_includes_history,balance,opening_balance,reserve_fund,historical_adjustment_applied,historical_monthly_collections_total,historical_expenses_total,historical_exceptional_collections_total,collection_start_month').eq('id',currentBuilding.id).single();
        if(!active)return;
        if(error||!data)throw new Error('تعذر تحميل أرصدة العمارة. أعد المحاولة قبل الحفظ.');
        const snapshot=mapBuildingFinancialSnapshot(data);
        setFinancialSnapshot(snapshot);setOpeningBase(baseOpeningBalance(snapshot)===null?'':String(baseOpeningBalance(snapshot)));setOpeningIncluded('');
        setReserveFund(snapshot.reserveFund);setCollectionStartMonth(snapshot.startMonth||'');setHistoricalExpensesTotal(snapshot.expenses);setHistoricalExceptionalCollectionsTotal(snapshot.exceptional);
      }catch(error){if(active)setFinanceError(error instanceof Error?error.message:'تعذر تحميل الأرصدة.');}
      finally{if(active)setFinanceLoading(false);}
    })();
    return()=>{active=false};
  },[isOpen,isNewBuilding,currentBuilding.id,financeReload]);

  if(!isOpen)return null;

  const savedBase=financialSnapshot?baseOpeningBalance(financialSnapshot):0;
  const financialChanged=isNewBuilding||!!financialSnapshot&&(
    openingBase!==(savedBase===null?'':String(savedBase))||openingIncluded!==''||reserveFund!==financialSnapshot.reserveFund||
    collectionStartMonth!==(financialSnapshot.startMonth||'')||historicalExpensesTotal!==financialSnapshot.expenses||historicalExceptionalCollectionsTotal!==financialSnapshot.exceptional);
  const preview=financialSnapshot?previewBuildingBalance(financialSnapshot,{baseOpening:Number(openingBase||0),expenses:historicalExpensesTotal,exceptional:historicalExceptionalCollectionsTotal,openingAlreadyIncluded:openingIncluded===''?null:openingIncluded==='included'}):Number(openingBase||0)+historicalExceptionalCollectionsTotal-historicalExpensesTotal;

  const hasUnsavedBuildingDetails = [
    [name,currentBuilding.name],[address,currentBuilding.address],[totalFloors,currentBuilding.totalFloors||1],[totalUnits,currentBuilding.totalUnits||0],
    [monthlyTarget,currentBuilding.monthlyTarget||0],[reserveFund,financialSnapshot?.reserveFund??currentBuilding.reserveFund??0],
    [collectionStartMonth,financialSnapshot?.startMonth??currentBuilding.collectionStartMonth??''],[historicalExpensesTotal,financialSnapshot?.expenses??currentBuilding.historicalExpensesTotal??0],
    [historicalExceptionalCollectionsTotal,financialSnapshot?.exceptional??currentBuilding.historicalExceptionalCollectionsTotal??0],
    [managerName,currentBuilding.managerName||''],[managerPhone,currentBuilding.managerPhone||''],
    [manager2Name,currentBuilding.manager2Name||''],[manager2Phone,currentBuilding.manager2Phone||''],
    [manager3Name,currentBuilding.manager3Name||''],[manager3Phone,currentBuilding.manager3Phone||'']
  ].some(([value,saved])=>value!==saved)||financialChanged||applyMonthlyFeeToAll;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const submitter=(e.nativeEvent as SubmitEvent).submitter;
    const continueToDistribution=submitter instanceof HTMLElement&&submitter.hasAttribute('data-save-building-for-distribution');
    if (saving || financeLoading || financeError || !name.trim()) return;
    if(!isNewBuilding&&!financialSnapshot){setSaveError('أعد تحميل أرصدة العمارة قبل الحفظ.');return;}
    const data = {
      name: name.trim(),
      address: address.trim(),
      totalFloors: Math.max(1, Number(totalFloors) || 1),
      totalUnits: Math.max(0, Number(totalUnits) || 0),
      balance: 0,
      applyMonthlyFeeToAll,
      monthlyTarget: Math.max(0, Number(monthlyTarget) || 0),
      collectionStartMonth: collectionStartMonth || undefined,
      historicalExpensesTotal,
      historicalExceptionalCollectionsTotal,
      reserveFund: Math.max(0, Number(reserveFund) || 0),
      managerName: managerName.trim(),
      managerPhone: managerPhone.trim(),
      manager2Name: manager2Name.trim(), manager2Phone: manager2Phone.trim(),
      manager3Name: manager3Name.trim(), manager3Phone: manager3Phone.trim(),
    };
    if ([historicalExpensesTotal,historicalExceptionalCollectionsTotal].some(value=>!Number.isFinite(value)||value<0||value>999999999999.99||Math.abs(Math.round(value*100)-value*100)>.00001)) { setSaveError('راجع الأرصدة السابقة: مبالغ غير سالبة وبحد أقصى رقمين عشريين.'); return; }
    if(collectionStartMonth && (collectionStartMonth<'1900-01'||collectionStartMonth>currentCollectionMonth())) {setSaveError('شهر بداية التحصيل لا يمكن أن يكون في المستقبل.');return;}
    let finance:BuildingFinanceDraft|undefined;
    if(financialChanged){
      const base=Number(openingBase);
      if(!openingBase.trim()||!Number.isFinite(base)||base<0||base>9999999999.99||Math.abs(Math.round(base*100)-base*100)>.00001||!Number.isFinite(reserveFund)||reserveFund<0||reserveFund>9999999999.99||Math.abs(Math.round(reserveFund*100)-reserveFund*100)>.00001){setSaveError('اكتب الرصيد المبدئي وصندوق الطوارئ بقيم غير سالبة وبحد أقصى رقمين عشريين.');return;}
      if(!isNewBuilding&&financialSnapshot?.openingBalance===null&&openingIncluded===''){setSaveError('حدد هل الرصيد المبدئي موجود ضمن الخزينة الحالية حتى لا يُحسب مرتين.');return;}
      finance={baseOpening:base,reserve:reserveFund,startMonth:collectionStartMonth||null,expenses:historicalExpensesTotal,exceptional:historicalExceptionalCollectionsTotal,expected:financialSnapshot,openingAlreadyIncluded:openingIncluded===''?null:openingIncluded==='included'};
      if(!isNewBuilding&&!window.confirm('تأكيد حفظ أرصدة العمارة؟ ستتغير الخزينة بصافي الفرق فقط، دون إضافة الرصيد المبدئي أو الأرصدة السابقة كإيصالات جديدة.'))return;
    }
    setSaving(true); setSaveError('');
    try {
      if (isNewBuilding) {
        if (!onAddBuilding) throw new Error('تعذر بدء إضافة العمارة. حاول مرة أخرى.');
        await onAddBuilding(data,finance);
      } else {
        await onUpdateBuilding(currentBuilding.id, data,finance);
      }
      setApplyMonthlyFeeToAll(false);
      if(continueToDistribution){
        setDistributionReload(v=>v+1);
        setName(data.name);setAddress(data.address);setTotalFloors(data.totalFloors||1);setTotalUnits(data.totalUnits);setMonthlyTarget(data.monthlyTarget);
        setManagerName(data.managerName);setManagerPhone(data.managerPhone);setManager2Name(data.manager2Name||'');setManager2Phone(data.manager2Phone||'');setManager3Name(data.manager3Name||'');setManager3Phone(data.manager3Phone||'');
        setFinanceReload(v=>v+1);
      }else onClose();
    } catch (failure) {
      setSaveError(failure instanceof Error ? failure.message : 'تعذر حفظ بيانات العمارة. حاول مرة أخرى.');
    } finally { setSaving(false); }

  };

  const field = 'w-full bg-white text-slate-900 placeholder:text-slate-400 text-sm px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500';
  const label = 'block text-xs font-bold text-slate-700 mb-1.5';

  if(guidedSetup)return <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-100 p-3"><BuildingSetupWizard buildingId={isNewBuilding?undefined:currentBuilding.id} onCancel={()=>setGuidedSetup(false)} onDone={()=>{setGuidedSetup(false);void onRefreshData?.();onClose();}}/></div>;
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
          <button type="button" data-tour="building-close" disabled={saving} onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>

        <button type="button" onClick={()=>setGuidedSetup(true)} className="my-4 min-h-12 w-full rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm font-bold text-teal-800">تسجيل الحسابات خطوة بخطوة</button>
        <form data-tour="building-form" onSubmit={handleSubmit} className="mt-4">
          {financeError&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-800">{financeError}</p>}
          {!isNewBuilding&&<button type="button" disabled={saving||financeLoading} className="min-h-11 text-xs text-teal-800 underline" onClick={()=>{if(!financialChanged||window.confirm('سيتم إعادة تحميل الأرصدة المحفوظة وإلغاء تعديلات الأرصدة غير المحفوظة. هل تريد المتابعة؟'))setFinanceReload(v=>v+1);}}>إعادة تحميل أرصدة العمارة</button>}
          {financeLoading&&<p role="status" className="text-xs text-slate-500">جارٍ تحميل الأرصدة...</p>}
          <fieldset disabled={saving||financeLoading||!!financeError} className="space-y-4">
          <div>
            <label className={label}>اسم العمارة *</label>
            <input required data-tour="building-name" value={name} onChange={e => setName(e.target.value)} placeholder="اكتب اسم العمارة" className={field} />
          </div>
          <div>
            <label className={label}><MapPin className="w-3.5 h-3.5 inline ml-1" />العنوان</label>
            <input data-tour="building-address" value={address} onChange={e => setAddress(e.target.value)} placeholder="المدينة والحي والشارع" className={field} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}><Layers className="w-3.5 h-3.5 inline ml-1" />عدد الأدوار</label>
              <input type="number" min="1" max="100" required value={totalFloors} onChange={e => setTotalFloors(Number(e.target.value))} onFocus={e => e.currentTarget.select()} className={field} />
            </div>
            <div>
              <label className={label}>{isNewBuilding ? 'عدد الشقق التي ستُنشأ' : 'إجمالي الوحدات'}</label>
              <input type="number" min="0" required data-tour="building-units" value={totalUnits} onChange={e => setTotalUnits(Number(e.target.value))} onFocus={e => e.currentTarget.select()} className={field} />
            </div>
          </div>
          <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">{isNewBuilding ? 'سيتم إنشاء الشقق بأرقام متسلسلة وتوزيعها على الأدوار، وتطبيق الاشتراك الشهري الافتراضي عليها. يمكنك تخصيص اشتراك أي شقة لاحقًا من شاشة الشقق.' : 'عند زيادة العدد، تُضاف الشقق الناقصة تلقائيًا بالاشتراك الشهري الافتراضي. يُطبّق أيضًا على الشقق التي لم يُحدد لها اشتراك (قيمتها صفر)، مع الحفاظ على الاشتراكات المخصصة والمدفوعات الحالية. لا يمكن تقليل العدد عن الشقق المسجلة.'}</p>
          <div className="grid grid-cols-1 gap-3">
            <div><label className={label}>الاشتراك الشهري الافتراضي للشقة</label><input type="number" min="0" value={monthlyTarget} onChange={e => setMonthlyTarget(Number(e.target.value))} onFocus={e => e.currentTarget.select()} className={field} /></div>

          </div>
          {!isNewBuilding&&<label className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-slate-700"><input type="checkbox" checked={applyMonthlyFeeToAll} onChange={e=>setApplyMonthlyFeeToAll(e.target.checked)} className="mt-1 h-5 w-5 shrink-0"/><span>تطبيق الاشتراك على كل الشقق الحالية عند الحفظ ({monthlyTarget.toLocaleString('ar-EG')} جنيه شهريًا). سيستبدل أي اشتراك مخصص ويعيد حساب المستحقات؛ المدفوعات المسجلة تبقى كما هي.</span></label>}
          <section className="space-y-3 rounded-xl border border-sky-100 bg-sky-50/50 p-3" data-tour="treasury-page">
            <h3 className="text-sm font-bold text-slate-800">الرصيد المبدئي وصندوق الطوارئ</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className={label}>{financialSnapshot?.openingIncludesHistory?'رصيد الخزينة عند بدء استخدام التطبيق (جنيه)':'الرصيد المبدئي (جنيه)'}<input data-tour="treasury-opening" type="number" min="0" max="9999999999.99" step="0.01" value={openingBase} onChange={e=>setOpeningBase(e.target.value)} className={field}/></label>
              <label className={label}>رصيد صندوق الطوارئ (جنيه)<input data-tour="treasury-reserve" type="number" min="0" max="9999999999.99" step="0.01" value={reserveFund} onChange={e=>setReserveFund(Number(e.target.value))} className={field}/></label>
            </div>
            <p className="text-[11px] leading-6 text-slate-600">{financialSnapshot?.openingIncludesHistory?'هذا الرصيد يشمل الحسابات القديمة؛ تعديل توزيعها لا يضيفها للخزينة مرة ثانية.':'الرصيد المبدئي قبل إضافة التحصيلات السابقة وخصم المصروفات السابقة.'} صندوق الطوارئ مبلغ مخصص منفصل، ولا يُضاف تلقائيًا للخزينة أو لتحصيل الشقق.</p>
            {!isNewBuilding&&financialSnapshot?.openingBalance===null&&<fieldset className="space-y-2 rounded-lg border bg-white p-3 text-xs"><legend className="font-bold">هل الرصيد المبدئي موجود ضمن الخزينة الحالية؟</legend><label className="block"><input type="radio" name="opening-included" checked={openingIncluded==='included'} onChange={()=>setOpeningIncluded('included')}/> نعم، تسجيله دون إضافته مرة ثانية</label><label className="block"><input type="radio" name="opening-included" checked={openingIncluded==='add'} onChange={()=>setOpeningIncluded('add')}/> لا، إضافته إلى الخزينة الحالية</label></fieldset>}
          </section>
          <section className="space-y-3 rounded-xl border border-teal-100 bg-teal-50/50 p-3">
            <h3 className="text-sm font-bold text-slate-800">الأرصدة السابقة — قابلة للتعديل</h3>
            <div><label className={label}>شهر بداية التحصيل</label><input aria-label="شهر بداية التحصيل" type="month" max={currentCollectionMonth()} value={collectionStartMonth} onChange={e => setCollectionStartMonth(e.target.value)} className={field} /></div>
            <div><label className={label}>إجمالي المصروفات السابقة (جنيه)</label><input aria-label="إجمالي المصروفات السابقة" type="number" min="0" step="0.01" value={historicalExpensesTotal} onChange={e => setHistoricalExpensesTotal(Number(e.target.value))} onFocus={e => e.currentTarget.select()} className={field} /></div>
            <div><label className={label}>المحصل فعليًا من التحصيلات الاستثنائية السابقة (جنيه)</label><input aria-label="المحصل فعليًا من التحصيلات الاستثنائية السابقة" readOnly={financialSnapshot?.openingIncludesHistory===true} type="number" min="0" step="0.01" value={historicalExceptionalCollectionsTotal} onChange={e => setHistoricalExceptionalCollectionsTotal(Number(e.target.value))} onFocus={e => e.currentTarget.select()} className={field} /><p className="mt-1 text-[11px] leading-5 text-amber-800">{financialSnapshot?.openingIncludesHistory?'هذا الإجمالي محسوب من مدفوعات الشقق المسجلة في نقل الحسابات. المدفوعات السابقة محفوظة كتسويات، وليست إيصالات جديدة.':'اكتب مجموع المبالغ التي استلمتها العمارة بالفعل من الشقق، وليس إجمالي المطلوب عليها. في خطوات نقل الحسابات، يُسجّل المطلوب والمدفوع لكل شقة بصورة منفصلة عن الاشتراكات الشهرية.'}</p></div>
            {historicalExpensesTotal>historicalExceptionalCollectionsTotal && <p data-historical-deficit role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs leading-6 text-amber-900">المصروفات السابقة أعلى من التحصيل الاستثنائي السابق بـ {(historicalExpensesTotal-historicalExceptionalCollectionsTotal).toLocaleString('ar-EG',{maximumFractionDigits:2})} ج.م. سيظهر عجز إذا لم تغطّه التحصيلات الشهرية السابقة أو الأرصدة الأخرى.</p>}
            <p className="text-[11px] text-slate-600">التحصيلات الاستثنائية السابقة مستقلة عن اشتراكات الشهور الرجعية، وتظهر أيضًا في قسم التحصيلات الاستثنائية. يمكن تصحيح هذه القيم لاحقًا. لا يتم خصمها من الخزنة الحالية مرة ثانية؛ تسوية الرصيد الافتتاحي تتم منفصلة.</p>
          </section>
          <div data-building-finance-preview className="rounded-xl border border-teal-100 bg-teal-50 p-3 text-xs leading-7 text-teal-900">
            {!isNewBuilding&&financialSnapshot&&<p>الخزينة الحالية: <strong>{financialSnapshot.balance.toLocaleString('ar-EG')} ج.م</strong></p>}
            <p>التحصيلات الشهرية السابقة المحفوظة: <strong>{(financialSnapshot?.historicalMonthly||0).toLocaleString('ar-EG')} ج.م</strong></p>
            <p>الخزينة بعد حفظ التعديلات: <strong>{preview===null?'حدد طريقة تسجيل الرصيد المبدئي':preview.toLocaleString('ar-EG',{maximumFractionDigits:2})+' ج.م'}</strong></p>
            <p className="text-[11px]">الحساب يشمل الرصيد المبدئي والأرصدة السابقة وحركات السداد والمصروفات المسجلة. تغيير صندوق الطوارئ وحده لا يغيّر إجمالي الخزينة.</p>
          </div>
          {!isNewBuilding && collectionStartMonth!==(financialSnapshot?.startMonth||'') && <button type="button" className="min-h-11 text-xs text-teal-800 underline" onClick={()=>setCollectionStartMonth(financialSnapshot?.startMonth||'')}>استعادة شهر البداية المحفوظ</button>}
          {!isNewBuilding && <HistoricalMonthlyDistribution buildingId={currentBuilding.id} key={currentBuilding.id} canSaveBuilding reloadKey={distributionReload} defaultMonthlyFee={currentBuilding.monthlyTarget||0} startMonth={financialSnapshot?.startMonth || ''} disabledReason={hasUnsavedBuildingDetails ? 'احفظ بيانات العمارة أولًا لفتح خانات التوزيع.' : undefined} onSaved={async () => { await onRefreshData?.(); setFinanceReload(v=>v+1); }} />}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={label}>اسم المسؤول الأول</label><input data-tour="building-manager" value={managerName} onChange={e => setManagerName(e.target.value)} className={field} /></div>
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
