import React from 'react';
import { Building, UserRole } from '../types';
import {
  Building2, ChevronDown, ShieldCheck, User, Sparkles, Settings,
  SlidersHorizontal, LogOut, LogIn, UserCheck, LayoutDashboard, Receipt,
  Wrench, Palette, MoreHorizontal, FileText
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface HeaderProps {
  buildings: Building[];
  currentBuilding: Building;
  onSelectBuilding: (b: Building) => void;
  onOpenBuildingManagement: () => void;
  onOpenSettings: () => void;
  onOpenLogin?: () => void;
  role: UserRole;
  onSelectRole: (r: UserRole) => void;
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  buildings, currentBuilding, onSelectBuilding, onOpenBuildingManagement,
  onOpenSettings, onOpenLogin, role, onSelectRole, currentTab, onSelectTab,
}) => {
  const { user, isAdmin, isSuperAdmin, signOut } = useAuth();
  const navItems = [
    { id: 'dashboard', label: 'الرئيسية', icon: LayoutDashboard },
    { id: 'collections', label: 'الشقق والتحصيل', icon: Building2 },
    ...(isSuperAdmin ? [{ id: 'approvals', label: 'الانضمام', icon: UserCheck }] : []),
    { id: 'expenses', label: 'المصروفات', icon: Receipt },
    { id: 'reports', label: 'التقارير', icon: FileText },
  ];
  const moreItems = [
    { id: 'resident', label: 'بوابة الساكن والمرافق', icon: Wrench },
    { id: 'chat', label: 'المساعد الذكي Gemini', icon: Sparkles },
    { id: 'image-studio', label: 'الإعلانات والتصميم', icon: Palette },
  ];
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/95 text-slate-900 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200">
              <img src="/icon.png" alt="شعار برج الفتوح" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-extrabold leading-5 tracking-tight text-slate-900 sm:text-lg">برج الفتوح</h1>
              <p className="mt-0.5 text-[10px] font-medium text-slate-500 sm:text-xs">إدارة العقار والملاك</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <label className="relative flex max-w-[58vw] items-center gap-2 rounded-full bg-slate-100 py-1.5 pl-3 pr-3 text-xs font-semibold text-slate-700 sm:max-w-none sm:px-4">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
              <select
                aria-label="اختيار العقار"
                value={currentBuilding.id}
                onChange={(event) => { const selected = buildings.find(b => b.id === event.target.value); if (selected) onSelectBuilding(selected); }}
                className="max-w-[42vw] min-w-0 appearance-none bg-transparent pr-0 text-right text-xs font-semibold outline-none sm:max-w-[260px]"
              >
                {buildings.map(b => <option key={b.id} value={b.id}>{b.name} • {b.totalUnits} شقة</option>)}
              </select>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            </label>
            <button onClick={onOpenBuildingManagement} title="إدارة العقارات" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <nav aria-label="التنقل الرئيسي" className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-100 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 shadow-[0_-8px_30px_rgba(15,23,42,0.06)] backdrop-blur-md">
        <div className="mx-auto grid max-w-3xl grid-cols-6 gap-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = currentTab === item.id;
            return <button key={item.id} onClick={() => onSelectTab(item.id)} className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[9px] font-semibold transition sm:text-[10px] ${active ? 'bg-teal-50 text-teal-700' : 'text-slate-500 hover:bg-slate-50'}`}>
              <Icon className={`h-5 w-5 ${active ? 'text-teal-700' : 'text-slate-500'}`} />
              <span className="w-full truncate text-center">{item.label}</span>
            </button>;
          })}
          <details className="group relative flex min-w-0 flex-col items-center">
            <summary className="flex w-full cursor-pointer list-none flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[9px] font-semibold text-slate-500 hover:bg-slate-50 sm:text-[10px]">
              <MoreHorizontal className="h-5 w-5" /><span>المزيد</span>
            </summary>
            <div className="absolute bottom-[calc(100%+12px)] left-0 z-[60] w-60 rounded-2xl border border-slate-100 bg-white p-2 shadow-xl">
              {moreItems.map(item => { const Icon=item.icon; return <button key={item.id} onClick={() => onSelectTab(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right text-sm font-semibold ${currentTab===item.id?'bg-teal-50 text-teal-700':'text-slate-700 hover:bg-slate-50'}`}><Icon className="h-4 w-4" />{item.label}</button>; })}
              <div className="my-2 border-t border-slate-100" />
              <button onClick={onOpenSettings} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right text-sm font-semibold text-slate-700 hover:bg-slate-50"><Settings className="h-4 w-4" />الإعدادات</button>
              <button onClick={onOpenBuildingManagement} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right text-sm font-semibold text-slate-700 hover:bg-slate-50"><Building2 className="h-4 w-4" />إدارة العقارات</button>
              <div className="my-2 border-t border-slate-100" />
              <p className="px-3 py-1 text-[10px] font-bold text-slate-400">تبديل الصفة</p>
              <div className="grid grid-cols-3 gap-1 px-1 pb-2">
                {([{id:'manager',label:'مدير',icon:ShieldCheck},{id:'owner',label:'مالك',icon:Building2},{id:'resident',label:'ساكن',icon:User}] as const).map(item=>{const Icon=item.icon;return <button key={item.id} onClick={()=>onSelectRole(item.id)} className={`flex flex-col items-center gap-1 rounded-lg p-2 text-[10px] ${role===item.id?'bg-teal-50 text-teal-700':'text-slate-500 hover:bg-slate-50'}`}><Icon className="h-4 w-4"/>{item.label}</button>;})}
              </div>
              {user ? <button onClick={signOut} className="flex w-full items-center gap-3 rounded-xl bg-rose-50 px-3 py-3 text-right text-sm font-bold text-rose-600 hover:bg-rose-100"><LogOut className="h-4 w-4"/>تسجيل الخروج</button> : onOpenLogin && <button onClick={onOpenLogin} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right text-sm font-bold text-teal-700"><LogIn className="h-4 w-4"/>تسجيل الدخول</button>}
              <p className="px-3 pt-2 text-[10px] text-slate-400">{isSuperAdmin ? 'المدير الرئيسي' : isAdmin ? 'مدير' : 'مستخدم'}</p>
            </div>
          </details>
        </div>
      </nav>
    </>
  );
};
