import React from 'react';
import { Building, UserRole } from '../types';
import { 
  Building2, ChevronDown, ShieldCheck, User, Sparkles, 
  Settings, Plus, SlidersHorizontal, LogOut, LogIn, UserCheck 
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
  buildings,
  currentBuilding,
  onSelectBuilding,
  onOpenBuildingManagement,
  onOpenSettings,
  onOpenLogin,
  role,
  onSelectRole,
  currentTab,
  onSelectTab,
}) => {
  const { user, isAdmin, isSuperAdmin, signOut } = useAuth();
  return (
    <header className="bunyan-manager-header bg-[#0f2537] text-white border-b border-slate-700/60 sticky top-0 z-40 shadow-lg">
      {/* Top Utility & Brand Bar */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2">
        {/* Brand identity */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl overflow-hidden shadow-md shadow-teal-950/40 ring-1 ring-white/20 shrink-0 bg-[#0b1723]">
            <img 
              src="/icon.png" 
              alt="شعار برج الفتوح" 
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base sm:text-lg tracking-tight text-white flex items-center gap-2">
                برج الفتوح
                <span className="text-[10px] bg-gradient-to-r from-amber-500/20 to-teal-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded-full font-semibold">
                  إدارة العقار والملاك
                </span>
              </span>
            </div>
            <p className="text-[11px] text-slate-300 hidden sm:block">
              {currentBuilding.name} • {currentBuilding.address}
            </p>
          </div>
        </div>

        {/* Single Building Badge & Management */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Single Building Information Badge */}
          <div className="flex items-center gap-1.5 bg-white/10 px-2.5 sm:px-3 py-1.5 rounded-xl border border-white/20 text-xs font-semibold text-white">
            <Building2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <span className="truncate max-w-[120px] sm:max-w-none">{currentBuilding.name}</span>
            <span className="text-[10px] text-teal-300 bg-teal-950/60 px-1.5 py-0.5 rounded-md border border-teal-500/30 font-mono">
              {currentBuilding.totalUnits} شقة
            </span>
          </div>

          {/* Building Details Edit Trigger */}
          <button
            onClick={onOpenBuildingManagement}
            className="p-1.5 px-2.5 rounded-xl bg-teal-600/30 hover:bg-teal-600/50 text-teal-300 border border-teal-500/40 text-xs font-bold transition flex items-center gap-1"
            title="تعديل بيانات العمارة والأدوار والشقق"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden md:inline">بيانات العمارة</span>
          </button>

          {/* Role Switcher */}
          <div className="hidden sm:flex items-center bg-white/10 p-0.5 rounded-xl border border-white/15 text-[11px]">
            <button
              onClick={() => onSelectRole('manager')}
              className={`px-2 py-1 rounded-lg font-medium transition flex items-center gap-1 ${
                role === 'manager'
                  ? 'bg-teal-500 text-white font-bold shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="مدير العمارة وأمين الصندوق"
            >
              <ShieldCheck className="w-3 h-3" />
              <span className="hidden lg:inline">أمين الصندوق</span>
            </button>
            <button
              onClick={() => onSelectRole('owner')}
              className={`px-2 py-1 rounded-lg font-medium transition flex items-center gap-1 ${
                role === 'owner'
                  ? 'bg-teal-500 text-white font-bold shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="مالك شقة"
            >
              <Building2 className="w-3 h-3" />
              <span className="hidden lg:inline">مالك</span>
            </button>
            <button
              onClick={() => onSelectRole('resident')}
              className={`px-2 py-1 rounded-lg font-medium transition flex items-center gap-1 ${
                role === 'resident'
                  ? 'bg-teal-500 text-white font-bold shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="ساكن أو مستأجر"
            >
              <User className="w-3 h-3" />
              <span className="hidden lg:inline">ساكن</span>
            </button>
          </div>

          {/* Settings Trigger */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 border border-white/15 transition"
            title="إعدادات التطبيق وتفضيلات العمارة"
          >
            <Settings className="w-4 h-4 text-slate-300" />
          </button>

          {/* User Auth Status & Logout */}
          {user ? (
            <div className="flex items-center gap-1.5 pr-2 border-r border-white/10">
              <span 
                className="text-[10px] bg-teal-500/20 text-teal-300 border border-teal-500/30 px-2 py-1 rounded-lg hidden md:flex items-center gap-1" 
                title={user.email || ''}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>{isSuperAdmin ? 'المدير الأساسي' : isAdmin ? 'مدير مساعد' : 'ساكن'}</span>
              </span>
              <button
                onClick={signOut}
                className="p-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition flex items-center gap-1 text-xs"
                title="تسجيل الخروج"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">خروج</span>
              </button>
            </div>
          ) : (
            onOpenLogin && (
              <button
                onClick={onOpenLogin}
                className="p-1.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                title="تسجيل الدخول"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>دخول</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="bg-[#0b1c30] px-3 sm:px-6 overflow-x-auto no-scrollbar border-t border-slate-800">
        <div className="max-w-7xl mx-auto flex items-center gap-1 py-2 text-xs whitespace-nowrap">
          <button
            onClick={() => onSelectTab('dashboard')}
            className={`px-3 py-1.5 rounded-xl font-medium transition flex items-center gap-1.5 ${
              currentTab === 'dashboard'
                ? 'bg-teal-600/30 text-teal-300 border border-teal-500/40 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <span>🏛️</span>
            <span>لوحة التحكم</span>
          </button>

          {isSuperAdmin && (
            <button
              onClick={() => onSelectTab('approvals')}
              className={`px-3 py-1.5 rounded-xl font-medium transition flex items-center gap-1.5 ${
                currentTab === 'approvals'
                  ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40 font-bold'
                  : 'text-amber-300/80 hover:text-amber-200 hover:bg-amber-500/10'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>طلبات الانضمام</span>
            </button>
          )}

          <button
            onClick={() => onSelectTab('collections')}
            className={`px-3 py-1.5 rounded-xl font-medium transition flex items-center gap-1.5 ${
              currentTab === 'collections'
                ? 'bg-teal-600/30 text-teal-300 border border-teal-500/40 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <span>🏢</span>
            <span>سجل الشقق والتحصيل</span>
          </button>

          <button
            onClick={() => onSelectTab('expenses')}
            className={`px-3 py-1.5 rounded-xl font-medium transition flex items-center gap-1.5 ${
              currentTab === 'expenses'
                ? 'bg-teal-600/30 text-teal-300 border border-teal-500/40 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <span>🧾</span>
            <span>المصروفات والفواتير</span>
          </button>

          <button
            onClick={() => onSelectTab('reports')}
            className={`px-3 py-1.5 rounded-xl font-medium transition flex items-center gap-1.5 ${
              currentTab === 'reports'
                ? 'bg-teal-600/30 text-teal-300 border border-teal-500/40 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <span>📊</span>
            <span>التقارير وكشف الحساب</span>
          </button>

          <button
            onClick={() => onSelectTab('resident')}
            className={`px-3 py-1.5 rounded-xl font-medium transition flex items-center gap-1.5 ${
              currentTab === 'resident'
                ? 'bg-teal-600/30 text-teal-300 border border-teal-500/40 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <span>🔑</span>
            <span>بوابة الساكن والمرافق</span>
          </button>

          <button
            onClick={() => onSelectTab('chat')}
            className={`px-3 py-1.5 rounded-xl font-medium transition flex items-center gap-1.5 ${
              currentTab === 'chat'
                ? 'bg-indigo-600/40 text-indigo-300 border border-indigo-400/50 font-bold shadow-sm'
                : 'text-indigo-300 hover:text-white hover:bg-indigo-500/10'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-300" />
            <span className="font-bold">المساعد الذكي Gemini</span>
          </button>

          <button
            onClick={() => onSelectTab('image-studio')}
            className={`px-3 py-1.5 rounded-xl font-medium transition flex items-center gap-1.5 ${
              currentTab === 'image-studio'
                ? 'bg-amber-600/30 text-amber-300 border border-amber-400/40 font-bold'
                : 'text-amber-300/80 hover:text-amber-200 hover:bg-amber-500/10'
            }`}
          >
            <span>🎨</span>
            <span>إعلانات ولوحات العمارة</span>
          </button>
        </div>
      </div>
    </header>
  );
};
