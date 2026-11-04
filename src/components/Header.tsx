import React from 'react';
import { Building } from '../types';
import {
  Building2, ChevronDown, Sparkles, Settings, SlidersHorizontal, LogOut, LogIn,
  UserCheck, LayoutDashboard, Receipt, Wrench, Palette, MoreHorizontal, FileText,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface HeaderProps {
  buildings: Building[];
  currentBuilding: Building;
  onSelectBuilding: (b: Building) => void;
  onOpenBuildingManagement: () => void;
  onOpenSettings: () => void;
  onOpenLogin?: () => void;
  currentTab: string;
  onSelectTab: (tab: string) => void;
  unreadTicketCount?: number;
  unreadAnnouncementCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  buildings, currentBuilding, onSelectBuilding, onOpenBuildingManagement,
  onOpenSettings, onOpenLogin, currentTab, onSelectTab, unreadTicketCount = 0, unreadAnnouncementCount = 0,
}) => {
  const { user, isAdmin, isSuperAdmin, signOut } = useAuth();
  const moreMenuRef = React.useRef<HTMLDetailsElement>(null);
  React.useEffect(() => {
    const close = (event: PointerEvent) => {
      const menu = moreMenuRef.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && moreMenuRef.current?.open) moreMenuRef.current.open = false; };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, []);
  const navItems = [
    { id: 'dashboard', label: 'الرئيسية', icon: LayoutDashboard },
    { id: 'collections', label: 'الشقق والتحصيل', icon: Building2 },
    ...(isAdmin ? [{ id: 'approvals', label: isSuperAdmin ? 'طلبات الانضمام' : 'إدارة السكان', icon: UserCheck }] : []),
    { id: 'expenses', label: 'المصروفات', icon: Receipt },
  ];
  const moreItems = [
    { id: 'reports', label: 'التقارير', icon: FileText },
    { id: 'resident', label: 'بوابة الساكن والمرافق', icon: Wrench },
    { id: 'chat', label: 'المساعد الذكي Gemini', icon: Sparkles },
    { id: 'image-studio', label: 'الإعلانات والتصميم', icon: Palette },
  ];
  const activeItem = [...navItems, ...moreItems].find(item => item.id === currentTab);
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/90 text-slate-900 shadow-[0_5px_24px_rgba(15,40,55,.06)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200 shadow-sm"><img src="/icon.png" alt="شعار العمارة" className="h-full w-full object-cover" /></div>
            <div className="min-w-0"><h1 className="text-base font-black leading-5 tracking-tight text-[#102d3a] sm:text-lg">العمارة</h1><p className="mt-1 text-[10px] font-medium text-slate-500 sm:text-xs">نظام إدارة العقار والملاك</p></div>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <label className="flex max-w-[54vw] items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition focus-within:border-teal-400 focus-within:bg-white">
              <Building2 className="h-4 w-4 shrink-0 text-teal-700" />
              <select aria-label="اختيار العقار" value={currentBuilding.id} onChange={event => { const selected = buildings.find(b => b.id === event.target.value); if (selected) onSelectBuilding(selected); }} className="min-w-0 max-w-[38vw] appearance-none bg-transparent text-right outline-none sm:max-w-[240px]">
                {buildings.map(b => <option key={b.id} value={b.id}>{b.name} • {b.totalUnits} شقة</option>)}
              </select><ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            </label>
            <button onClick={onOpenBuildingManagement} title="إدارة العقارات" aria-label="إدارة العقارات" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-teal-200 hover:text-teal-700"><SlidersHorizontal className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="mx-auto hidden max-w-7xl items-center justify-between px-6 pb-2 md:flex">
          <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500"><span className="text-slate-400">المكان الحالي</span><span>/</span><span className="text-teal-800">{activeItem?.label || 'لوحة الإدارة'}</span></div>
          <span className="text-[10px] text-slate-400">{isSuperAdmin ? 'المدير الرئيسي' : isAdmin ? 'مدير العقار' : 'مستخدم'}</span>
        </div>
      </header>

      <nav aria-label="التنقل الرئيسي" className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200/80 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 shadow-[0_-10px_35px_rgba(15,40,55,.10)] backdrop-blur-xl">
        <div className="mx-auto grid w-full max-w-3xl gap-1" style={{ gridTemplateColumns: `repeat(${navItems.length + 1}, minmax(0, 1fr))` }}>
          {navItems.map(item => { const Icon=item.icon; const active=currentTab===item.id; return <button key={item.id} onClick={() => onSelectTab(item.id)} aria-current={active ? 'page' : undefined} className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[9px] font-bold transition sm:text-[10px] ${active ? 'bg-teal-50 text-teal-800' : 'text-slate-500 hover:bg-slate-50'}`}><span className="relative flex h-7 w-8 items-center justify-center"><Icon className={`h-5 w-5 ${active ? 'text-teal-700' : 'text-slate-500'}`} /></span><span className="w-full truncate text-center">{item.label}</span>{active && <span className="absolute bottom-0 h-0.5 w-7 rounded-full bg-teal-600" />}</button>; })}
          <details ref={moreMenuRef} className="group relative flex min-w-0 flex-col items-center">
            <summary className="flex w-full cursor-pointer list-none flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[9px] font-bold text-slate-500 hover:bg-slate-50 sm:text-[10px]"><span className="flex h-7 w-8 items-center justify-center"><MoreHorizontal className="h-5 w-5" /></span><span>المزيد</span></summary>
            <div className="absolute bottom-[calc(100%+14px)] left-0 z-[60] w-64 rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_20px_60px_rgba(15,40,55,.18)]">
              <div className="flex items-center justify-between px-3 py-2"><span className="text-xs font-extrabold text-slate-800">المزيد من الخدمات</span><X className="h-4 w-4 text-slate-300" /></div>
              {moreItems.map(item => { const Icon=item.icon; const count=item.id==='resident'?unreadTicketCount:item.id==='image-studio'?unreadAnnouncementCount:0; return <button key={item.id} onClick={() => { onSelectTab(item.id); if (moreMenuRef.current) moreMenuRef.current.open=false; }} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-right text-xs font-bold ${currentTab===item.id?'bg-teal-50 text-teal-800':'text-slate-700 hover:bg-slate-50'}`}><span className="relative"><Icon className="h-4 w-4" />{count>0 && <span className="absolute -right-3 -top-3 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-600 px-1 text-[10px] font-black leading-none text-white">{count}</span>}</span><span className="flex-1">{item.label}</span></button>; })}
              <div className="my-2 border-t border-slate-100" />
              <button onClick={onOpenSettings} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-right text-xs font-bold text-slate-700 hover:bg-slate-50"><Settings className="h-4 w-4" />الإعدادات</button>
              <button onClick={onOpenBuildingManagement} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-right text-xs font-bold text-slate-700 hover:bg-slate-50"><Building2 className="h-4 w-4" />إدارة العقارات</button>
              {user ? <button onClick={signOut} className="flex w-full items-center gap-3 rounded-2xl bg-rose-50 px-3 py-3 text-right text-xs font-extrabold text-rose-600"><LogOut className="h-4 w-4" />تسجيل الخروج</button> : onOpenLogin && <button onClick={onOpenLogin} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-right text-xs font-extrabold text-teal-700"><LogIn className="h-4 w-4" />تسجيل الدخول</button>}
            </div>
          </details>
        </div>
      </nav>
    </>
  );
};
