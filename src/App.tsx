import { isNeonBackend, updateNeonBuilding } from './lib/neon';
import { IntroWindowLights } from './components/IntroWindowLights';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { 
  Building, UserRole, Apartment, Payment, Expense, MaintenanceTicket, 
  FacilityBooking, Announcement, AppSettings, PaymentStatus, PaymentAuditLog 
} from './types';
import { 
  getStoredBuildings, saveStoredBuildings, getActiveBuildingId, setActiveBuildingId,
  getStoredApartments, saveStoredApartments,
  getStoredPayments, saveStoredPayments,
  getStoredExpenses, saveStoredExpenses,
  getStoredTickets, saveStoredTickets,
  getStoredBookings, saveStoredBookings,
  getStoredAnnouncements, saveStoredAnnouncements,
  getStoredSettings, saveStoredSettings,
  getStoredAuditLogs, saveStoredAuditLogs
} from './services/storage';
import { 
  calculateApartmentFinancials, 
  calculateBuildingFinancials, 
  reconcileApartment 
} from './services/financialAccounting';
import { Header } from './components/Header';
import { IntroCity } from './components/IntroCity';
import { AppTour, TourHelpButton } from './components/AppTour';
import { DashboardView } from './components/DashboardView';
import { CollectionsView } from './components/CollectionsView';
import { ExpensesView } from './components/ExpensesView';
import { ReportsView } from './components/ReportsView';
import { ResidentView } from './components/ResidentView';
import { ResidentPortal } from './components/ResidentPortal';
import { AiChatView } from './components/AiChatView';
import { AiStudioView } from './components/AiStudioView';
import { PdfStatementModal } from './components/PdfStatementModal';
import { BuildingManagementModal } from './components/BuildingManagementModal';
import { SettingsModal } from './components/SettingsModal';
import { MoreView } from './components/MoreView';
import { ServiceDirectory } from './components/ServiceDirectory';
import { AppPreferencesView } from './components/AppPreferencesView';
import { TreasurySettingsView } from './components/TreasurySettingsView';
import { initializeDevicePreferences } from './services/appPreferences';
import { RegistrationApprovalsView } from './components/RegistrationApprovalsView';
import { PollsView } from './components/PollsView';
import { ExceptionalCollectionsView } from './components/ExceptionalCollectionsView';
import { CheckCircle2, AlertCircle, X, Wallet, BarChart3, FileText, Wrench, Sparkles, Palette, Building2, SlidersHorizontal } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { LoginView } from './components/LoginView';
import { supabase } from './lib/supabase';
import { checkForOtaUpdate } from './services/otaUpdates';

const managerTabs = ['dashboard', 'collections', 'expenses', 'reports', 'resident', 'chat', 'image-studio', 'approvals', 'polls', 'exceptional-collections', 'services', 'more', 'app-settings', 'treasury-settings'];
const tabFromLocation = () => {
  const tab = new URLSearchParams(window.location.search).get('tab');
  return tab && managerTabs.includes(tab) ? tab : 'dashboard';
};

export default function App() {
  useEffect(initializeDevicePreferences, []);
  // Live Updates are initialized once in src/main.tsx. Keeping a second
  // initializer here caused two concurrent ready/download flows on Android.
  useEffect(() => {
    const timer = window.setTimeout(() => setShowIntroSplash(false), 5600);
    return () => window.clearTimeout(timer);
  }, []);

  // 1. Persistent State Initialization
  const [showIntroSplash, setShowIntroSplash] = useState(true);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [currentBuildingId, setCurrentBuildingIdState] = useState<string>('');
  const { user, userProfile, isAdmin, isPasswordRecovery, isLoading: isAuthLoading, signOut, refreshProfile, holdMembership, membershipSyncError, profileRecoveryError } = useAuth();
  const activeUserId = useRef(user?.id); activeUserId.current = user?.id;
  // Only a successful load for this identity can unlock the empty-account flow.
  const managerScope = user && isAdmin ? `${user.id}:${userProfile?.buildingId || ''}` : '';
  const managerScopeRef = useRef(managerScope); managerScopeRef.current = managerScope;
  const [managerLoad, setManagerLoad] = useState<{ scope: string; status: 'loading' | 'ready' | 'error' }>({ scope: '', status: 'loading' });
  const [managerLoadRevision, setManagerLoadRevision] = useState(0);
  const [managerLoadFailure, setManagerLoadFailure] = useState('');
  const isDataLoading = managerLoad.scope !== managerScope || managerLoad.status === 'loading';
  const [role, setRole] = useState<UserRole>('manager');
  
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [auditLogs, setAuditLogs] = useState<PaymentAuditLog[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [bookings, setBookings] = useState<FacilityBooking[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ customGeminiApiKey: '', backendUrl: '' });

  // 2. Active Building Resolver (Safe against deleted or missing IDs)
  const currentBuilding = useMemo(() => {
    return buildings.find((b) => b.id === currentBuildingId) || buildings[0] || {
      id: '',
      name: '',
      address: '',
      totalUnits: 0,
      balance: 0,
      monthlyTarget: 0,
      reserveFund: 0,
      managerName: '',
      managerPhone: '',
    };
  }, [buildings, currentBuildingId]);

  useEffect(() => {
    const clearData = () => {
      setBuildings([]); setApartments([]); setPayments([]); setTickets([]);
      setAnnouncements([]); setExpenses([]); setBookings([]); setAuditLogs([]);
      setCurrentBuildingIdState('');
      setSettings({ customGeminiApiKey: '', backendUrl: '' });
    };
    if (!user || !isAdmin) {
      clearData(); setManagerLoad({ scope: '', status: 'loading' }); return;
    }
    if (managerLoad.scope !== managerScope) clearData();
    let cancelled = false;
    let hadBuilding = Boolean(userProfile?.buildingId) || (managerLoad.scope === managerScope && buildings.length > 0);
    let retryTimer: number | undefined;
    let controller: AbortController | undefined;
    let loadTimeout: number | undefined;
    setManagerLoad({ scope: managerScope, status: 'loading' });
    setManagerLoadFailure('');
    const load = async (attempt = 0) => {
      controller = new AbortController();
      const requestController = controller;
      let timedOut = false;
      const fail = (reason = 'انتهت مهلة الاتصال بالخادم') => {
        if (cancelled) return;
        setManagerLoadFailure(reason);
        if (attempt === 0) retryTimer = window.setTimeout(() => { if (!cancelled) void load(1); }, 800);
        else setManagerLoad({ scope: managerScope, status: 'error' });
      };
      const timeout = window.setTimeout(() => {
        // Native session restoration may hang before fetch sees the abort signal.
        timedOut = true; requestController.abort(); fail();
      }, 15000);
      loadTimeout = timeout;
      try {
        if (attempt > 0) {
          const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
          if (cancelled || timedOut) return;
          if (refreshError) throw refreshError;
          if (refreshed.session?.user.id !== user.id) throw new Error('Account changed during restore');
        }
        const { data, error } = await supabase.from('buildings').select('id,name,address,total_units,total_floors,balance,monthly_target,reserve_fund,manager_name,manager_phone,manager2_name,manager2_phone,manager3_name,manager3_phone').order('created_at').abortSignal(requestController.signal);
        if (cancelled || timedOut) return;
        if (error) throw error;
        if (!Array.isArray(data)) throw new Error('Incomplete building response');
        if (hadBuilding && data.length === 0) throw new Error('Expected building is not available yet');
        if (data.length > 0) hadBuilding = true;
        if (userProfile?.buildingId && !(data || []).some(row => row.id === userProfile.buildingId)) {
          throw new Error('Expected building is not available yet');
        }
        {
          const rows: Building[] = (data || []).map((r: any) => ({ id:r.id,name:r.name,address:r.address || '',totalUnits:Number(r.total_units || 0),totalFloors:r.total_floors ?? undefined,balance:Number(r.balance || 0),monthlyTarget:Number(r.monthly_target || 0),reserveFund:Number(r.reserve_fund || 0),managerName:r.manager_name || '',managerPhone:r.manager_phone || '',manager2Name:r.manager2_name || '',manager2Phone:r.manager2_phone || '',manager3Name:r.manager3_name || '',manager3Phone:r.manager3_phone || '' }));
          setBuildings(rows); setCurrentBuildingIdState(rows[0]?.id || '');
          if (rows.length) {
            const { data: apartmentRows, error: apartmentError } = await supabase.from('apartments')
              .select('id,building_id,unit_number,floor,resident_name,resident_phone,is_owner,monthly_fee,payment_status,overdue_months,last_payment_date,paid_amount,credit_balance')
              .in('building_id', rows.map(b => b.id)).abortSignal(requestController.signal);
            if (cancelled || timedOut) return;
            if (apartmentError) throw apartmentError;
            setApartments((apartmentRows || []).map((r: any) => ({
              id:r.id, buildingId:r.building_id, unitNumber:r.unit_number, floor:r.floor,
              residentName:r.resident_name, residentPhone:r.resident_phone, isOwner:r.is_owner,
              monthlyFee:Number(r.monthly_fee || 0), status:r.payment_status, overdueMonths:r.overdue_months,
              lastPaymentDate:r.last_payment_date || undefined, paidAmount:Number(r.paid_amount || 0),
              creditBalance:Number(r.credit_balance || 0),
            })));

            // Payments are a shared ledger: always hydrate manager views from Supabase,
            // never from this device's localStorage cache.
            const { data: paymentRows, error: paymentError } = await supabase
              .from('payments')
              .select('id,apartment_id,building_id,unit_number,resident_name,amount,payment_date,month,method,notes,receipt_number,recorded_at,payment_type,is_assessment,exceptional_charge_id,assessment_cancelled')
              .in('building_id', rows.map(b => b.id))
              .order('payment_date', { ascending: false }).abortSignal(requestController.signal);
            if (cancelled || timedOut) return;
            if (paymentError) throw paymentError;
            setPayments((paymentRows || []).map((r: any) => ({
              id:r.id, apartmentId:r.apartment_id, buildingId:r.building_id,
              unitNumber:r.unit_number, residentName:r.resident_name || '',
              amount:Number(r.amount || 0), date:r.payment_date, month:r.month,
              method:r.method, notes:r.notes || undefined,
              receiptNumber:r.receipt_number || undefined, recordedAt:r.recorded_at || undefined, paymentType:r.payment_type || 'monthly', isAssessment:r.is_assessment, assessmentCancelled:r.assessment_cancelled, exceptionalChargeId:r.exceptional_charge_id || undefined,
            })));

            const [ticketResult, announcementResult, expenseResult, settingsResult] = await Promise.all([
              supabase.from('maintenance_tickets').select('id,building_id,apartment_id,unit_number,resident_name,category,title,description,urgency,status,created_at').in('building_id', rows.map(b => b.id)).order('created_at', { ascending: false }).abortSignal(requestController.signal),
              supabase.from('announcements').select('id,building_id,title,content,announcement_type,pinned,created_at').in('building_id', rows.map(b => b.id)).order('created_at', { ascending: false }).abortSignal(requestController.signal),
              supabase.from('expenses').select('id,building_id,title,category,amount,expense_date,vendor,notes,receipt_url,approved_by').in('building_id', rows.map(b => b.id)).order('expense_date', { ascending: false }).abortSignal(requestController.signal),
              supabase.from('app_settings').select('setting_value').eq('building_id', rows[0].id).eq('setting_key', 'general').abortSignal(requestController.signal).maybeSingle(),
            ]);
            if (cancelled || timedOut) return;
            if (ticketResult.error) throw ticketResult.error;
            setTickets((ticketResult.data || []).map((r: any) => ({
              id:r.id, buildingId:r.building_id, unitNumber:r.unit_number, residentName:r.resident_name,
              category:r.category, title:r.title, description:r.description, urgency:r.urgency,
              status:r.status, date:r.created_at,
            })));
            if (cancelled || timedOut) return;
            if (announcementResult.error) throw announcementResult.error;
            setAnnouncements((announcementResult.data || []).map((r: any) => ({
              id:r.id, buildingId:r.building_id, title:r.title, content:r.content,
              type:r.announcement_type, imageUrl:undefined, pinned:r.pinned,
              date:r.created_at,
            })));
            if (cancelled || timedOut) return;
            if (expenseResult.error) throw expenseResult.error;
            setExpenses((expenseResult.data || []).map((r: any) => ({
              id:r.id, buildingId:r.building_id, title:r.title, category:r.category,
              amount:Number(r.amount || 0), date:r.expense_date, vendor:r.vendor || '',
              notes:r.notes || undefined, receiptUrl:r.receipt_url || undefined, approvedBy:r.approved_by || '',
            })));
            if (settingsResult.error) throw settingsResult.error;
            { const mergedSettings = { customGeminiApiKey: getStoredSettings().customGeminiApiKey || '', backendUrl: getStoredSettings().backendUrl || '', ...(settingsResult.data?.setting_value || {}) }; setSettings(mergedSettings); saveStoredSettings(mergedSettings); }
          }
        }
        if (!cancelled && !timedOut) setManagerLoad({ scope: managerScope, status: 'ready' });
      } catch (error) {
        if (!timedOut) {
          const failure = error as { message?: string; code?: string; status?: number };
          const detail = [failure?.code || failure?.status, failure?.message].filter(Boolean).join(' — ');
          console.error('Manager building data load failed', error);
          fail(detail || 'فشل غير معروف أثناء تحميل بيانات العمارة');
        }
      } finally { window.clearTimeout(timeout); requestController.abort(); }
    };
    void load();
    return () => { cancelled = true; window.clearTimeout(retryTimer); window.clearTimeout(loadTimeout); controller?.abort(); };
  }, [user?.id, isAdmin, userProfile?.buildingId, managerScope, managerLoadRevision]);

  useEffect(() => {
    if (!managerScope || managerLoad.scope !== managerScope || managerLoad.status !== 'error') return;
    const retry = () => {
      if (managerScopeRef.current === managerScope && document.visibilityState !== 'hidden') setManagerLoadRevision(value => value + 1);
    };
    window.addEventListener('online', retry);
    window.addEventListener('focus', retry);
    document.addEventListener('visibilitychange', retry);
    const nativeListener = CapacitorApp.addListener('appStateChange', state => {
      // Android can announce resume before WebView visibility has caught up.
      if (state.isActive && managerScopeRef.current === managerScope) setManagerLoadRevision(value => value + 1);
    }).catch(() => null);
    return () => {
      window.removeEventListener('online', retry); window.removeEventListener('focus', retry);
      document.removeEventListener('visibilitychange', retry);
      void nativeListener.then(listener => listener?.remove());
    };
  }, [managerScope, managerLoad]);

  // Legacy Base64 announcement images must not block loading the entire building.
  // Load each image separately after the dashboard becomes usable; keep database records intact.
  useEffect(() => {
    if (managerLoad.status !== 'ready' || !managerScope || !announcements.length) return;
    let cancelled = false;
    const missing = announcements.filter(item => !item.imageUrl);
    if (!missing.length) return;
    void (async () => {
      for (const item of missing) {
        if (cancelled) break;
        const { data, error } = await supabase.from('announcements').select('image_url').eq('id', item.id).maybeSingle();
        if (cancelled) break;
        if (error) { console.warn('Announcement image could not load', item.id, error); continue; }
        if (data?.image_url) setAnnouncements(rows => rows.map(row => row.id === item.id ? { ...row, imageUrl: data.image_url } : row));
      }
    })();
    return () => { cancelled = true; };
  }, [managerLoad.status, managerScope, announcements.length]);

  // 3. Navigation State (Defaults directly to 'dashboard')
  const [currentTab, setCurrentTabState] = useState<string>(() => typeof window === 'undefined' ? 'dashboard' : tabFromLocation());

  const notificationStorageKey = (kind: 'tickets' | 'announcements') => `bunyan-seen-${kind}-${user?.id || 'guest'}-${currentBuildingId || 'all'}`;
  const getSeenNotificationIds = (kind: 'tickets' | 'announcements'): string[] => {
    try { return JSON.parse(localStorage.getItem(notificationStorageKey(kind)) || '[]'); } catch { return []; }
  };
  const markNotificationsSeen = (kind: 'tickets' | 'announcements', ids: string[]) => {
    try { localStorage.setItem(notificationStorageKey(kind), JSON.stringify(Array.from(new Set([...getSeenNotificationIds(kind), ...ids])))); } catch {}
  };
  const unreadTicketCount = tickets.filter(item => !getSeenNotificationIds('tickets').includes(item.id)).length;
  const unreadAnnouncementCount = announcements.filter(item => !getSeenNotificationIds('announcements').includes(item.id)).length;

  const setCurrentTab = (tab: string) => {
    if (tab === currentTab) return;
    if (tab === 'resident') markNotificationsSeen('tickets', tickets.map(item => item.id));
    if (tab === 'image-studio') markNotificationsSeen('announcements', announcements.map(item => item.id));
    setCurrentTabState(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.pushState({ managerPreviousTab: currentTab }, '', url.toString());
    }
  };
  const goBack = (fallback: string) => {
    if (window.history.state?.managerPreviousTab) window.history.back();
    else setCurrentTab(fallback);
  };

  const handleSelectBuilding = (b: Building) => {
    setCurrentBuildingIdState(b.id);
    setActiveBuildingId(b.id);
  };

  // 4. Modals State
  const [isBuildingModalOpen, setIsBuildingModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);

  // 5. Toast System
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<{unit: string; month: string; amount: number} | null>(null);
  const paymentSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (paymentSuccessTimer.current) clearTimeout(paymentSuccessTimer.current); }, []);
  const announcePaymentSuccess = (unit: string, month: string, amount: number) => {
    setPaymentSuccess({unit, month, amount});
    if (paymentSuccessTimer.current) clearTimeout(paymentSuccessTimer.current);
    paymentSuccessTimer.current = setTimeout(() => setPaymentSuccess(null), 3200);
    try {
      const sound = new Audio('/sounds/payment-cha-ching.mp3');
      sound.volume = 0.85;
      void sound.play().catch(() => { /* Audio may be disabled; payment confirmation still appears. */ });
    } catch { /* Audio may be disabled; payment confirmation still appears. */ }
  };

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const sendBuildingPush = async (payload: Record<string, unknown>) => {
    try {
      const { error } = await supabase.functions.invoke('send-announcement-push', { body: payload });
      if (error) console.warn('[Bunyan Push] Event saved but notification failed:', error.message);
    } catch (error) {
      console.warn('[Bunyan Push] Event saved but notification failed:', error);
    }
  };

  const persistTreasuryDelta = async (buildingId: string, delta: number) => {
    const building = buildings.find(b => b.id === buildingId);
    if (!building || !delta) return;
    const nextBalance = Math.max(0, building.balance + delta);
    const { error } = await supabase.from('buildings').update({ balance: nextBalance }).eq('id', buildingId);
    if (error) {
      showToast('تم حفظ العملية لكن تعذر تحديث رصيد الخزينة على الخادم: ' + error.message, 'error');
      return;
    }
    setBuildings(rows => rows.map(b => b.id === buildingId ? { ...b, balance: nextBalance } : b));
  };

  // Pull down from the top of the screen to refresh the app's latest data and OTA bundle.
  const pullStartY = useRef<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handlePullStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (window.scrollY <= 2) pullStartY.current = event.touches[0]?.clientY ?? null;
    else pullStartY.current = null;
  };

  const handlePullEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const startY = pullStartY.current;
    pullStartY.current = null;
    const endY = event.changedTouches[0]?.clientY ?? 0;
    if (startY !== null && endY - startY > 85 && window.scrollY <= 2) {
      void refreshAppData();
    }
  };

  const refreshAppData = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const refreshScope = managerScope;
    try {
      // Refresh the entities currently connected to Supabase.
      const { data: buildingRows, error: buildingError } = await supabase
        .from('buildings')
        .select('id,name,address,total_units,total_floors,balance,monthly_target,reserve_fund,manager_name,manager_phone,manager2_name,manager2_phone,manager3_name,manager3_phone')
        .order('created_at');
      if (managerScopeRef.current !== refreshScope) return;
      if (buildingError) throw buildingError;
      if (!Array.isArray(buildingRows)) throw new Error('Incomplete building response');
      if (buildings.length > 0 && buildingRows.length === 0) throw new Error('Expected building is not available yet');
      if (userProfile?.buildingId && !(buildingRows || []).some(row => row.id === userProfile.buildingId)) {
        throw new Error('Expected building is not available yet');
      }

      const refreshedBuildings: Building[] = (buildingRows || []).map((r: any) => ({
        id:r.id, name:r.name, address:r.address || '', totalUnits:Number(r.total_units || 0),
        totalFloors:r.total_floors ?? undefined, balance:Number(r.balance || 0),
        monthlyTarget:Number(r.monthly_target || 0), reserveFund:Number(r.reserve_fund || 0),
        managerName:r.manager_name || '', managerPhone:r.manager_phone || '', manager2Name:r.manager2_name || '', manager2Phone:r.manager2_phone || '', manager3Name:r.manager3_name || '', manager3Phone:r.manager3_phone || '',
      }));
      let refreshedApartments: Apartment[] = [];
      let refreshedPayments: Payment[] = [];
      if (refreshedBuildings.length) {
        const { data: apartmentRows, error: apartmentError } = await supabase
          .from('apartments')
          .select('id,building_id,unit_number,floor,resident_name,resident_phone,is_owner,monthly_fee,payment_status,overdue_months,last_payment_date,paid_amount,credit_balance')
          .in('building_id', refreshedBuildings.map(b => b.id));
        if (apartmentError) throw apartmentError;
        refreshedApartments = (apartmentRows || []).map((r: any) => ({
          id:r.id, buildingId:r.building_id, unitNumber:r.unit_number, floor:r.floor,
          residentName:r.resident_name, residentPhone:r.resident_phone, isOwner:r.is_owner,
          monthlyFee:Number(r.monthly_fee || 0), status:r.payment_status, overdueMonths:r.overdue_months,
          lastPaymentDate:r.last_payment_date || undefined, paidAmount:Number(r.paid_amount || 0),
          creditBalance:Number(r.credit_balance || 0),
        }));
        const { data: paymentRows, error: paymentError } = await supabase
          .from('payments')
          .select('id,apartment_id,building_id,unit_number,resident_name,amount,payment_date,month,method,notes,receipt_number,recorded_at,payment_type,is_assessment,exceptional_charge_id,assessment_cancelled')
          .in('building_id', refreshedBuildings.map(b => b.id))
          .order('payment_date', { ascending: false });
        if (paymentError) throw paymentError;
        refreshedPayments = (paymentRows || []).map((r: any) => ({
          id:r.id, apartmentId:r.apartment_id, buildingId:r.building_id,
          unitNumber:r.unit_number, residentName:r.resident_name || '',
          amount:Number(r.amount || 0), date:r.payment_date, month:r.month,
          method:r.method, notes:r.notes || undefined,
          receiptNumber:r.receipt_number || undefined, recordedAt:r.recorded_at || undefined,
          paymentType:r.payment_type || 'monthly', isAssessment:r.is_assessment, assessmentCancelled:r.assessment_cancelled, exceptionalChargeId:r.exceptional_charge_id || undefined,
        }));
      }
      if (managerScopeRef.current !== refreshScope) return;
      setBuildings(refreshedBuildings);
      setApartments(refreshedApartments);
      setPayments(refreshedPayments);
      if (!refreshedBuildings.some(b => b.id === currentBuildingId)) {
        setCurrentBuildingIdState(refreshedBuildings[0]?.id || '');
      }

      // Expenses and settings are shared Supabase records, not device-local data.
      setBookings(getStoredBookings());
      setAuditLogs(getStoredAuditLogs());

      const [ticketResult, announcementResult, expenseResult, settingsResult] = await Promise.all([
        supabase.from('maintenance_tickets').select('id,building_id,apartment_id,unit_number,resident_name,category,title,description,urgency,status,created_at').in('building_id', refreshedBuildings.map(b => b.id)).order('created_at', { ascending: false }),
        supabase.from('announcements').select('id,building_id,title,content,announcement_type,pinned,created_at').in('building_id', refreshedBuildings.map(b => b.id)).order('created_at', { ascending: false }),
        supabase.from('expenses').select('id,building_id,title,category,amount,expense_date,vendor,notes,receipt_url,approved_by').in('building_id', refreshedBuildings.map(b => b.id)).order('expense_date', { ascending: false }),
        supabase.from('app_settings').select('setting_value').eq('building_id', refreshedBuildings[0]?.id || '').eq('setting_key', 'general').maybeSingle(),
      ]);
      if (managerScopeRef.current !== refreshScope) return;
      if (ticketResult.error) throw ticketResult.error;
      if (announcementResult.error) throw announcementResult.error;
      setTickets((ticketResult.data || []).map((r: any) => ({
        id:r.id, buildingId:r.building_id, unitNumber:r.unit_number, residentName:r.resident_name,
        category:r.category, title:r.title, description:r.description, urgency:r.urgency,
        status:r.status, date:r.created_at,
      })));
      setAnnouncements((announcementResult.data || []).map((r: any) => ({
        id:r.id, buildingId:r.building_id, title:r.title, content:r.content,
        type:r.announcement_type, imageUrl:undefined, pinned:r.pinned,
        date:r.created_at,
      })));
      if (expenseResult.error) throw expenseResult.error;
      setExpenses((expenseResult.data || []).map((r: any) => ({
        id:r.id, buildingId:r.building_id, title:r.title, category:r.category,
        amount:Number(r.amount || 0), date:r.expense_date, vendor:r.vendor || '',
        notes:r.notes || undefined, receiptUrl:r.receipt_url || undefined, approvedBy:r.approved_by || '',
      })));
      if (settingsResult.error) throw settingsResult.error;
      const mergedSettings = { customGeminiApiKey: getStoredSettings().customGeminiApiKey || '', backendUrl: getStoredSettings().backendUrl || '', ...(settingsResult.data?.setting_value || {}) };
      setSettings(mergedSettings);
      saveStoredSettings(mergedSettings);

      // Use the same consent-based prompt as startup, without delaying data refresh.
      void checkForOtaUpdate();
      showToast('تم تحديث البيانات بنجاح.', 'success');
    } catch (error) {
      console.error('[Bunyan refresh] Failed:', error);
      showToast('تعذر إكمال التحديث. تأكد من اتصال الإنترنت وحاول مرة أخرى.', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  // 6. Android Hardware Back Button & Browser History Handling
  useEffect(() => {
    const handlePopState = () => {
      if (document.querySelector('[data-notification-dialog], [data-remove-member-dialog], [data-delete-exceptional-dialog]')) return;
      if (currentTab === 'app-settings' && document.querySelector('[data-settings-subpage]')) return;
      // If any modal is open, close modals first
      if (isBuildingModalOpen || isSettingsModalOpen || isAddExpenseModalOpen || isPdfModalOpen) {
        // These dialogs do not push a route when opened. Preserve their parent
        // entry so closing one with Back does not also consume that page.
        const previousTab = tabFromLocation();
        const url = new URL(window.location.href);
        url.searchParams.set('tab', currentTab);
        window.history.pushState({ managerPreviousTab: previousTab }, '', url.toString());
        setIsBuildingModalOpen(false);
        setIsSettingsModalOpen(false);
        setIsAddExpenseModalOpen(false);
        setIsPdfModalOpen(false);
        return;
      }
      // popstate has already moved the URL to the actual previous/next entry.
      setCurrentTabState(tabFromLocation());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isBuildingModalOpen, isSettingsModalOpen, isAddExpenseModalOpen, isPdfModalOpen, currentTab]);

  // 7. BUILDINGS CRUD
  const handleAddBuilding = async (newBldData: Omit<Building, 'id'>) => {
    if (!user || !isAdmin) throw new Error('لا توجد صلاحية لإضافة عمارة.');
    const actorId = user.id;
    const release = holdMembership();
    try {
      const { data, error } = await supabase.rpc('create_manager_building', { p_details: newBldData });
      if (error || !data?.id) throw new Error('فشل حفظ العمارة: ' + (error?.message || 'لم يتم تأكيد الحفظ'));
      if (activeUserId.current !== actorId) throw new Error('تم تغيير الحساب أثناء الحفظ.');
      const newBld: Building = {
        id: data.id, name: data.name, address: data.address || '', totalUnits: Number(data.total_units || 0),
        totalFloors: data.total_floors ?? undefined, balance: Number(data.balance || 0),
        monthlyTarget: Number(data.monthly_target || 0), reserveFund: Number(data.reserve_fund || 0),
        managerName: data.manager_name || '', managerPhone: data.manager_phone || '', manager2Name: data.manager2_name || '', manager2Phone: data.manager2_phone || '', manager3Name: data.manager3_name || '', manager3Phone: data.manager3_phone || '',
      };
      setBuildings(rows => [...rows, newBld]);
      setCurrentBuildingIdState(newBld.id);
      await refreshProfile(newBld.id);
      showToast('تم حفظ العمارة على قاعدة البيانات بنجاح!');
    } finally { release(); }
  };

  const handleUpdateBuilding = async (id: string, updatedData: Partial<Building>) => {
    const current = buildings.find((b) => b.id === id);
    if (!current) throw new Error('لم يتم العثور على العمارة المطلوبة.');
    const scope = managerScope;
    // This form edits building details; treasury changes use the dedicated RPC.
    const next = { ...current, ...updatedData, balance: current.balance };
    if (isNeonBackend) {
      await updateNeonBuilding(id, next);
    } else {
      const { error } = await supabase.rpc('update_manager_building', {
        p_building_id: id,
        p_details: next,
      });
      if (error) throw new Error('فشل تحديث بيانات العمارة والشقق: ' + error.message);
    }
    if (managerScopeRef.current !== scope) throw new Error('تم تغيير الحساب أثناء الحفظ.');
    // Refresh actual apartment records; dashboards and PDF reports derive totals from these.
    const { data: apartmentRows, error: apartmentError } = await supabase.from('apartments')
      .select('id,building_id,unit_number,floor,resident_name,resident_phone,is_owner,monthly_fee,payment_status,overdue_months,last_payment_date,paid_amount,credit_balance')
      .eq('building_id', id);
    if (apartmentError) throw new Error('تم حفظ التعديل لكن تعذر تحميل الشقق: ' + apartmentError.message);
    if (managerScopeRef.current !== scope) throw new Error('تم تغيير الحساب أثناء تحميل الشقق.');
    const refreshedApartments: Apartment[] = (apartmentRows || []).map((r: any) => ({
      id:r.id, buildingId:r.building_id, unitNumber:r.unit_number, floor:r.floor,
      residentName:r.resident_name || '', residentPhone:r.resident_phone || '',
      isOwner:Boolean(r.is_owner), monthlyFee:Number(r.monthly_fee || 0),
      status:r.payment_status, overdueMonths:Number(r.overdue_months || 0),
      lastPaymentDate:r.last_payment_date || undefined, paidAmount:Number(r.paid_amount || 0),
      creditBalance:Number(r.credit_balance || 0),
    }));
    setApartments(rows => [...rows.filter(a => a.buildingId !== id), ...refreshedApartments]);
    setBuildings(rows => rows.map(b => b.id === id ? next : b));
    showToast('تم تحديث بيانات العمارة والشقق والحسابات بنجاح!');
  };

  const handleDeleteBuilding = (id: string) => {
    if (buildings.length <= 1) {
      showToast('لا يمكن حذف العمارة الوحيدة المتبقية في النظام.', 'error');
      return;
    }

    const bldToDelete = buildings.find((b) => b.id === id);
    const updatedBuildings = buildings.filter((b) => b.id !== id);
    setBuildings(updatedBuildings);
    saveStoredBuildings(updatedBuildings);

    // Clean up associated apartments, payments, and expenses to prevent orphaned records
    const updatedApartments = apartments.filter((a) => a.buildingId !== id);
    setApartments(updatedApartments);
    saveStoredApartments(updatedApartments);

    const updatedPayments = payments.filter((p) => p.buildingId !== id);
    setPayments(updatedPayments);
    saveStoredPayments(updatedPayments);

    const updatedExpenses = expenses.filter((e) => e.buildingId !== id);
    setExpenses(updatedExpenses);
    saveStoredExpenses(updatedExpenses);

    // If deleted building was active, switch to first available building
    if (currentBuildingId === id) {
      const nextBuilding = updatedBuildings[0];
      if (nextBuilding) {
        handleSelectBuilding(nextBuilding);
      }
    }

    showToast(`تم حذف عمارة "${bldToDelete?.name || ''}" وبياناتها المرتبطة بنجاح.`);
  };

  // 8. APARTMENTS CRUD
  const handleAddApartment = async (newAptData: Omit<Apartment, 'id'>) => {
    if (!currentBuilding.id || !user || !isAdmin) return;
    const { data, error } = await supabase.from('apartments').insert({
      building_id: currentBuilding.id, unit_number: newAptData.unitNumber, floor: newAptData.floor,
      resident_name: newAptData.residentName, resident_phone: newAptData.residentPhone,
      is_owner: newAptData.isOwner, monthly_fee: newAptData.monthlyFee,
      payment_status: newAptData.status, overdue_months: newAptData.overdueMonths,
      last_payment_date: newAptData.lastPaymentDate || null, paid_amount: newAptData.paidAmount || 0,
      credit_balance: newAptData.creditBalance || 0,
    }).select().single();
    if (error || !data) { showToast('تعذر حفظ الشقة: ' + (error?.message || 'خطأ غير معروف'), 'error'); return; }
    const apt: Apartment = {
      id:data.id, buildingId:data.building_id, unitNumber:data.unit_number, floor:data.floor,
      residentName:data.resident_name, residentPhone:data.resident_phone, isOwner:data.is_owner,
      monthlyFee:Number(data.monthly_fee || 0), status:data.payment_status, overdueMonths:data.overdue_months,
      lastPaymentDate:data.last_payment_date || undefined, paidAmount:Number(data.paid_amount || 0),
      creditBalance:Number(data.credit_balance || 0),
    };
    setApartments(rows => [...rows, apt]);
    showToast('تم حفظ الشقة على قاعدة البيانات بنجاح!');
  };

  const handleUpdateApartment = async (id: string, updatedData: Partial<Apartment>) => {
    if (!user || !isAdmin) { showToast('لا توجد صلاحية لتعديل بيانات الشقة.', 'error'); return; }
    const oldApartment = apartments.find(a => a.id === id);
    if (!oldApartment) return;
    const next = { ...oldApartment, ...updatedData };
    const { error } = await supabase.from('apartments').update({
      unit_number: next.unitNumber, floor: next.floor, resident_name: next.residentName,
      resident_phone: next.residentPhone, is_owner: next.isOwner, monthly_fee: next.monthlyFee,
      payment_status: next.status, overdue_months: next.overdueMonths,
      last_payment_date: next.lastPaymentDate || null, paid_amount: next.paidAmount || 0,
      credit_balance: next.creditBalance || 0,
    }).eq('id', id);
    if (error) { showToast('تعذر حفظ تعديل الشقة: ' + error.message, 'error'); return; }
    setApartments(rows => rows.map(a => a.id === id ? next : a));
    if (oldApartment.status !== 'overdue' && next.status === 'overdue' && settings.overdueAlert !== false) {
      void sendBuildingPush({ event_type: 'overdue', building_id: next.buildingId, apartment_id: next.id, unit_number: next.unitNumber });
    }
    showToast('تم حفظ تعديل بيانات الشقة على قاعدة البيانات بنجاح!');
  };

  const handleDeleteApartment = async (id: string) => {
    if (!user || !isAdmin) { showToast('لا توجد صلاحية لحذف الشقة.', 'error'); return; }
    const aptToDelete = apartments.find((a) => a.id === id);
    if (!aptToDelete) return;

    // Payments reference apartments with ON DELETE RESTRICT, so remove their ledger rows first.
    const { error: paymentsDeleteError } = await supabase.from('payments').delete().eq('apartment_id', id);
    if (paymentsDeleteError) { showToast('تعذر حذف مدفوعات الشقة: ' + paymentsDeleteError.message, 'error'); return; }
    const { error: unlinkProfilesError } = await supabase.from('profiles').update({ apartment_id: null }).eq('apartment_id', id);
    if (unlinkProfilesError) { showToast('تعذر فك ربط حسابات السكان بالشقة قبل حذفها: ' + unlinkProfilesError.message, 'error'); return; }
    const { data: deletedApartments, error: apartmentDeleteError } = await supabase.from('apartments').delete().eq('id', id).select('id');
    if (apartmentDeleteError) { showToast('تعذر حذف الشقة من قاعدة البيانات: ' + apartmentDeleteError.message, 'error'); return; }
    if (!deletedApartments?.some((row: { id: string }) => row.id === id)) {
      showToast('لم يتم حذف الشقة من قاعدة البيانات. راجع صلاحيات الحذف (RLS) ثم حاول مرة أخرى.', 'error');
      return;
    }

    const updatedApartments = apartments.filter((a) => a.id !== id);
    setApartments(updatedApartments);
    const updatedPayments = payments.filter((p) => p.apartmentId !== id);
    setPayments(updatedPayments);

    const currentBuildingRow = buildings.find(b => b.id === aptToDelete.buildingId);
    if (currentBuildingRow) {
      const nextTotalUnits = Math.max(0, currentBuildingRow.totalUnits - 1);
      const { error: unitCountError } = await supabase.from('buildings')
        .update({ total_units: nextTotalUnits }).eq('id', currentBuildingRow.id);
      if (unitCountError) showToast('حُذفت الشقة، لكن تعذر تحديث عدد الوحدات: ' + unitCountError.message, 'error');
      setBuildings(rows => rows.map(b => b.id === currentBuildingRow.id ? { ...b, totalUnits: nextTotalUnits } : b));
    }
    showToast(`تم حذف الشقة رقم ${aptToDelete.unitNumber} نهائيًا من قاعدة البيانات.`);
  };

  // Helper: Log Payment Audit
  const logPaymentAudit = (
    action: 'create' | 'update' | 'delete',
    payment: Payment,
    previousData?: Partial<Payment>,
    newData?: Partial<Payment>,
    notes?: string
  ) => {
    const newLog: PaymentAuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action,
      paymentId: payment.id,
      apartmentId: payment.apartmentId,
      unitNumber: payment.unitNumber,
      buildingId: payment.buildingId,
      timestamp: new Date().toISOString(),
      performedBy: role === 'manager' ? (settings.managerName || 'أمين الصندوق / المدير') : 'المستخدم',
      previousData,
      newData,
      notes,
    };
    const updatedLogs = [newLog, ...auditLogs];
    setAuditLogs(updatedLogs);
    saveStoredAuditLogs(updatedLogs);
  };

  // 9. PAYMENTS CRUD (Manager Only with Comprehensive Financial Recalculation)
  const handleSavePayment = async (paymentData: {
    apartmentId: string;
    exceptionalChargeId?: string;
    amount: number;
    date: string;
    month: string;
    method: Payment['method'];
    notes?: string;
    receiptNumber?: string;
  }): Promise<boolean> => {
    if (!user || !isAdmin || userProfile?.role !== 'building_admin') {
      showToast('عذراً، تسجيل المدفوعات متاح فقط لمدير العمارة المعتمد.', 'error');
      return false;
    }

    const apt = apartments.find((a) => a.id === paymentData.apartmentId);
    if (!apt) { showToast('لم يتم العثور على الشقة المطلوبة.', 'error'); return false; }

    const buildingId = apt.buildingId || currentBuilding.id;
    if (paymentData.exceptionalChargeId) {
      const { error } = await supabase.rpc('record_exceptional_payment', {
        p_charge_id: paymentData.exceptionalChargeId, p_amount: paymentData.amount,
        p_date: paymentData.date, p_method: paymentData.method,
        p_receipt_number: paymentData.receiptNumber || '', p_notes: paymentData.notes || '',
      });
      if (error) { showToast('تعذر تسجيل السداد الاستثنائي: ' + error.message, 'error'); return false; }
      await refreshAppData();
      announcePaymentSuccess(String(apt.unitNumber), paymentData.month, paymentData.amount);
      showToast('تم تسجيل المبلغ المسدد وإضافته للخزينة.');
      return true;
    }
    const { data: savedRow, error: saveError } = await supabase.from('payments').insert({
      apartment_id: apt.id,
      building_id: buildingId,
      unit_number: apt.unitNumber,
      resident_name: apt.residentName || '',
      amount: paymentData.amount,
      payment_date: paymentData.date,
      month: paymentData.month,
      method: paymentData.method,
      notes: paymentData.notes || null,
      receipt_number: paymentData.receiptNumber || null,
      recorded_by: user.id,
    }).select('id,recorded_at').single();

    if (saveError || !savedRow) {
      console.error('[Bunyan payment] Supabase insert failed:', saveError);
      showToast('فشل تسجيل الدفعة على قاعدة البيانات: ' + (saveError?.message || 'لم يتم تأكيد الحفظ'), 'error');
      return false;
    }

    const newPayment: Payment = {
      ...paymentData,
      id: savedRow.id,
      buildingId,
      unitNumber: apt.unitNumber,
      residentName: apt.residentName,
      recordedAt: savedRow.recorded_at || new Date().toISOString(),
    };

    const updatedPayments = [newPayment, ...payments];
    setPayments(updatedPayments);
    saveStoredPayments(updatedPayments);

    // Unified Financial Recalculation
    const fin = calculateApartmentFinancials(apt, updatedPayments.filter(p => p.paymentType !== 'exceptional'));
    const updatedApartments = apartments.map((a) => {
      if (a.id === apt.id) {
        return {
          ...a,
          paidAmount: fin.totalPaid,
          creditBalance: fin.creditBalance,
          status: fin.status,
          overdueMonths: fin.remaining === 0 ? 0 : a.overdueMonths,
          lastPaymentDate: fin.lastPaymentDate,
        };
      }
      return a;
    });
    setApartments(updatedApartments);
    saveStoredApartments(updatedApartments);

    // Persist the recalculated apartment balance alongside the payment ledger.
    const { error: apartmentSyncError } = await supabase.from('apartments').update({
      paid_amount: fin.totalPaid,
      credit_balance: fin.creditBalance,
      payment_status: fin.status,
      overdue_months: fin.remaining === 0 ? 0 : apt.overdueMonths,
      last_payment_date: fin.lastPaymentDate || null,
    }).eq('id', apt.id);
    if (apartmentSyncError) showToast('تم حفظ الإيصال، لكن تعذر تحديث ملخص الشقة على الخادم: ' + apartmentSyncError.message, 'error');

    // Keep the shared treasury balance in Supabase in sync with the payment ledger.
    await persistTreasuryDelta(buildingId, paymentData.amount);

    // Audit Log Entry
    logPaymentAudit('create', newPayment, undefined, newPayment, `قيد دفعة جديدة بمبلغ ${paymentData.amount.toLocaleString()} ج.م`);

    void sendBuildingPush({ event_type: 'payment', building_id: buildingId, unit_number: apt.unitNumber, amount: paymentData.amount });
    announcePaymentSuccess(String(apt.unitNumber), paymentData.month, paymentData.amount);
    showToast(
      `تم قيد سداد ${paymentData.amount.toLocaleString()} ج.م لـ ${apt.unitNumber} بنجاح! المتبقي: ${fin.remaining.toLocaleString()} ج.م${
        fin.creditBalance > 0 ? ` (رصيد دائن: ${fin.creditBalance.toLocaleString()} ج.م)` : ''
      }`
    );
    return true;
  };

  const handleEditPayment = async (updatedPayment: Payment): Promise<boolean> => {
    if (role !== 'manager') {
      showToast('عذراً، تعديل المدفوعات متاح فقط لمدير العمارة (أمين الصندوق).', 'error');
      return false;
    }

    const oldPayment = payments.find((p) => p.id === updatedPayment.id);
    if (!oldPayment) return false;

    const { error: paymentUpdateError } = await supabase.from('payments').update({
      amount: updatedPayment.amount, payment_date: updatedPayment.date, month: updatedPayment.month,
      method: updatedPayment.method, notes: updatedPayment.notes || null, receipt_number: updatedPayment.receiptNumber || null,
    }).eq('id', updatedPayment.id);
    if (paymentUpdateError) { showToast('تعذر تحديث الدفعة: ' + paymentUpdateError.message, 'error'); return false; }

    const amountDiff = updatedPayment.amount - oldPayment.amount;

    // Update payments list
    const updatedPayments = payments.map((p) => (p.id === updatedPayment.id ? updatedPayment : p));
    setPayments(updatedPayments);
    saveStoredPayments(updatedPayments);

    // Recalculate target apartment financials
    const apt = apartments.find((a) => a.id === updatedPayment.apartmentId);
    let finSummary = '';
    if (apt) {
      const fin = calculateApartmentFinancials(apt, updatedPayments.filter(p => p.paymentType !== 'exceptional'));
      const updatedApartments = apartments.map((a) => {
        if (a.id === apt.id) {
          return {
            ...a,
            paidAmount: fin.totalPaid,
            creditBalance: fin.creditBalance,
            status: fin.status,
            overdueMonths: fin.remaining === 0 ? 0 : a.overdueMonths,
            lastPaymentDate: fin.lastPaymentDate,
          };
        }
        return a;
      });
      setApartments(updatedApartments);
      saveStoredApartments(updatedApartments);
      const { error: apartmentSyncError } = await supabase.from('apartments').update({
        paid_amount: fin.totalPaid,
        credit_balance: fin.creditBalance,
        payment_status: fin.status,
        overdue_months: fin.remaining === 0 ? 0 : apt.overdueMonths,
        last_payment_date: fin.lastPaymentDate || null,
      }).eq('id', apt.id);
      if (apartmentSyncError) showToast('تم تعديل الإيصال، لكن تعذر تحديث ملخص الشقة على الخادم: ' + apartmentSyncError.message, 'error');
      finSummary = ` | المتبقي: ${fin.remaining.toLocaleString()} ج.م`;
    }

    // Persist the exact change in the shared building treasury.
    if (amountDiff !== 0) await persistTreasuryDelta(updatedPayment.buildingId || currentBuilding.id, amountDiff);

    // Audit Log Entry
    logPaymentAudit(
      'update',
      updatedPayment,
      oldPayment,
      updatedPayment,
      `تعديل مبلغ الدفعة من ${oldPayment.amount.toLocaleString()} إلى ${updatedPayment.amount.toLocaleString()} ج.م (فارق: ${amountDiff > 0 ? '+' : ''}${amountDiff.toLocaleString()} ج.م)`
    );

    showToast(`تم حفظ تعديل الدفعة وتحديث رصيد الشقة والخزينة بنجاح!${finSummary}`);
    return true;
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (role !== 'manager') {
      showToast('عذراً، حذف المدفوعات متاح فقط لمدير العمارة (أمين الصندوق).', 'error');
      return;
    }

    const pToDelete = payments.find((p) => p.id === paymentId);
    if (!pToDelete) return;

    const { error: paymentDeleteError } = await supabase.from('payments').delete().eq('id', paymentId);
    if (paymentDeleteError) { showToast('تعذر حذف الدفعة: ' + paymentDeleteError.message, 'error'); return; }
    const updatedPayments = payments.filter((p) => p.id !== paymentId);
    setPayments(updatedPayments);
    saveStoredPayments(updatedPayments);

    // Recalculate apartment financials
    const apt = apartments.find((a) => a.id === pToDelete.apartmentId);
    let finSummary = '';
    if (apt) {
      const fin = calculateApartmentFinancials(apt, updatedPayments.filter(p => p.paymentType !== 'exceptional'));
      const updatedApartments = apartments.map((a) => {
        if (a.id === apt.id) {
          return {
            ...a,
            paidAmount: fin.totalPaid,
            creditBalance: fin.creditBalance,
            status: fin.status,
            lastPaymentDate: fin.lastPaymentDate,
          };
        }
        return a;
      });
      setApartments(updatedApartments);
      saveStoredApartments(updatedApartments);
      const { error: apartmentSyncError } = await supabase.from('apartments').update({
        paid_amount: fin.totalPaid,
        credit_balance: fin.creditBalance,
        payment_status: fin.status,
        overdue_months: fin.remaining === 0 ? 0 : apt.overdueMonths,
        last_payment_date: fin.lastPaymentDate || null,
      }).eq('id', apt.id);
      if (apartmentSyncError) showToast('تم حذف الإيصال، لكن تعذر تحديث ملخص الشقة على الخادم: ' + apartmentSyncError.message, 'error');
      finSummary = ` | المتبقي للشقة الآن: ${fin.remaining.toLocaleString()} ج.م`;
    }

    // Reverse the deleted payment from the shared treasury.
    await persistTreasuryDelta(pToDelete.buildingId || currentBuilding.id, -pToDelete.amount);

    // Audit Log Entry
    logPaymentAudit(
      'delete',
      pToDelete,
      pToDelete,
      undefined,
      `حذف الدفعة رقم ${pToDelete.receiptNumber || pToDelete.id} بمبلغ ${pToDelete.amount.toLocaleString()} ج.م وإعادة احتساب الرصيد`
    );

    showToast(`تم حذف الدفعة بمبلغ ${pToDelete.amount.toLocaleString()} ج.م وخصمها من الخزينة بنجاح!${finSummary}`);
  };

  // 10. EXPENSES CRUD
  const handleAddExpense = async (newExpData: Omit<Expense, 'id'>) => {
    if (!user || !isAdmin || !currentBuilding.id) { showToast('لا توجد صلاحية لتسجيل المصروف.', 'error'); return; }
    const { data, error } = await supabase.from('expenses').insert({
      building_id: currentBuilding.id, title: newExpData.title, category: newExpData.category,
      amount: newExpData.amount, expense_date: newExpData.date, vendor: newExpData.vendor || '',
      notes: newExpData.notes || null, receipt_url: newExpData.receiptUrl || null, approved_by: user.id,
    }).select('id,building_id,title,category,amount,expense_date,vendor,notes,receipt_url,approved_by').single();
    if (error || !data) { showToast('تعذر حفظ المصروف: ' + (error?.message || 'لم يتم تأكيد الحفظ'), 'error'); return; }
    const exp: Expense = {
      id:data.id, buildingId:data.building_id, title:data.title, category:data.category,
      amount:Number(data.amount), date:data.expense_date, vendor:data.vendor || '',
      notes:data.notes || undefined, receiptUrl:data.receipt_url || undefined, approvedBy:data.approved_by || '',
    };
    const updated = [exp, ...expenses];
    setExpenses(updated);
    saveStoredExpenses(updated);

    // Deduct the expense from the shared treasury.
    await persistTreasuryDelta(currentBuilding.id, -exp.amount);

    showToast(`تم توثيق مصروف "${exp.title}" بمبلغ ${exp.amount.toLocaleString()} ج.م وخصمه من الخزينة!`);
    void sendBuildingPush({ event_type: 'expense', building_id: currentBuilding.id, title: exp.title, category: exp.category, amount: exp.amount, reason: exp.notes || exp.title });
  };

  const handleUpdateExpense = async (id: string, updatedData: Partial<Expense>) => {
    const oldExp = expenses.find((e) => e.id === id);
    if (!oldExp) return;

    const amountDiff = (updatedData.amount ?? oldExp.amount) - oldExp.amount;
    const nextExpense = { ...oldExp, ...updatedData };
    const { error } = await supabase.from('expenses').update({
      title: nextExpense.title, category: nextExpense.category, amount: nextExpense.amount,
      expense_date: nextExpense.date, vendor: nextExpense.vendor || '', notes: nextExpense.notes || null,
      receipt_url: nextExpense.receiptUrl || null,
    }).eq('id', id);
    if (error) { showToast('تعذر تعديل المصروف: ' + error.message, 'error'); return; }

    const updated = expenses.map((e) => (e.id === id ? nextExpense : e));
    setExpenses(updated);
    saveStoredExpenses(updated);

    // Persist the expense amount difference in the shared treasury.
    if (amountDiff !== 0) await persistTreasuryDelta(oldExp.buildingId || currentBuilding.id, -amountDiff);

    showToast('تم حفظ تعديل المصروف وتسوية الخزينة بنجاح!');
  };

  const handleDeleteExpense = async (id: string) => {
    const expToDelete = expenses.find((e) => e.id === id);
    if (!expToDelete) return;
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) { showToast('تعذر حذف المصروف: ' + error.message, 'error'); return; }

    const updated = expenses.filter((e) => e.id !== id);
    setExpenses(updated);
    saveStoredExpenses(updated);

    // Reimburse the deleted expense to the shared treasury.
    await persistTreasuryDelta(expToDelete.buildingId || currentBuilding.id, expToDelete.amount);

    showToast(`تم حذف المصروف واسترجاع ${expToDelete.amount.toLocaleString()} ج.م لرصيد الخزينة.`);
  };

  // 11. TICKETS, BOOKINGS, ANNOUNCEMENTS
  const handleAddTicket = async (newTkt: Omit<MaintenanceTicket, 'id'>) => {
    if (!user || !isAdmin || !currentBuilding.id) {
      showToast('لا توجد صلاحية لتسجيل بلاغ الصيانة.', 'error');
      return;
    }
    const matchingApartment = apartments.find(a => String(a.unitNumber) === String(newTkt.unitNumber) && a.buildingId === currentBuilding.id);
    const { data, error } = await supabase.from('maintenance_tickets').insert({
      building_id: currentBuilding.id,
      apartment_id: matchingApartment?.id || null,
      unit_number: String(newTkt.unitNumber),
      resident_name: newTkt.residentName || 'إدارة العمارة',
      category: newTkt.category,
      title: newTkt.title,
      description: newTkt.description,
      urgency: newTkt.urgency,
      status: newTkt.status || 'جديد',
      created_by: user.id,
    }).select('id,building_id,unit_number,resident_name,category,title,description,urgency,status,created_at').single();
    if (error || !data) {
      showToast('تعذر حفظ بلاغ الصيانة: ' + (error?.message || 'لم يتم تأكيد الحفظ'), 'error');
      return;
    }
    const savedTicket: MaintenanceTicket = {
      id:data.id, buildingId:data.building_id, unitNumber:data.unit_number, residentName:data.resident_name,
      category:data.category, title:data.title, description:data.description, urgency:data.urgency,
      status:data.status, date:data.created_at,
    };
    setTickets(rows => [savedTicket, ...rows]);
    showToast('تم حفظ بلاغ الصيانة وإرساله لقاعدة بيانات العمارة.');
  };

  const handleDeleteTicket = async (ticketId: string): Promise<void> => {
    if (!user || !isAdmin || !currentBuilding.id) {
      showToast('لا توجد صلاحية لحذف طلب الصيانة.', 'error');
      return;
    }
    const ticket = tickets.find(item => item.id === ticketId);
    if (!ticket || (ticket.buildingId && ticket.buildingId !== currentBuilding.id)) {
      showToast('طلب الصيانة غير موجود في العمارة الحالية.', 'error');
      return;
    }
    if (!window.confirm('هل أنت متأكد من حذف طلب الصيانة "' + ticket.title + '"؟ لا يمكن التراجع عن الحذف.')) return;
    const { data, error } = await supabase.from('maintenance_tickets')
      .delete()
      .eq('id', ticketId)
      .eq('building_id', currentBuilding.id)
      .select('id')
      .maybeSingle();
    if (error || !data) {
      showToast('تعذر حذف طلب الصيانة. راجع صلاحيات الحساب وحاول مرة أخرى.', 'error');
      return;
    }
    setTickets(rows => rows.filter(item => item.id !== ticketId));
    showToast('تم حذف طلب الصيانة بنجاح.');
  };
  const handleAddBooking = (newBk: Omit<FacilityBooking, 'id'>) => {
    const bk: FacilityBooking = {
      ...newBk,
      id: `bk-${Date.now()}`,
      buildingId: currentBuilding.id,
    };
    const updated = [bk, ...bookings];
    setBookings(updated);
    saveStoredBookings(updated);
    showToast(`تم تأكيد حجز ${newBk.facility} بتاريخ ${newBk.date}.`);
  };

  const handlePinAnnouncement = async (newAnn: Omit<Announcement, 'id'>): Promise<boolean> => {
    if (!user || !isAdmin || !currentBuilding.id) {
      showToast('لا توجد صلاحية لنشر الإعلان.', 'error');
      return false;
    }
    const { data, error } = await supabase.from('announcements').insert({
      building_id: currentBuilding.id,
      title: newAnn.title,
      content: newAnn.content,
      announcement_type: newAnn.type,
      image_url: newAnn.imageUrl || null,
      pinned: newAnn.pinned,
      created_by: user.id,
    }).select('id,building_id,title,content,announcement_type,image_url,pinned,created_at').single();
    if (error || !data) {
      showToast('تعذر نشر الإعلان: ' + (error?.message || 'لم يتم تأكيد الحفظ'), 'error');
      return false;
    }
    const savedAnnouncement: Announcement = {
      id:data.id, buildingId:data.building_id, title:data.title, content:data.content,
      type:data.announcement_type, imageUrl:data.image_url || undefined, pinned:data.pinned,
      date:data.created_at,
    };
    setAnnouncements(rows => [savedAnnouncement, ...rows]);

    // Notification delivery is best-effort: a push failure must never undo a saved announcement.
    try {
      const { error: pushError } = await supabase.functions.invoke('send-announcement-push', {
        body: { announcement_id: data.id },
      });
      if (pushError) {
        console.warn('[Bunyan Push] Announcement was saved, but push delivery is not ready:', pushError.message);
        showToast('تم نشر الإعلان بنجاح. خدمة إشعارات الموبايل تحتاج استكمال الإعداد.', 'info');
      } else {
        showToast('تم نشر الإعلان وإرسال طلب الإشعار للأعضاء المعتمدين.');
      }
    } catch (pushError) {
      console.warn('[Bunyan Push] Announcement was saved, but push delivery failed:', pushError);
      showToast('تم نشر الإعلان بنجاح. تعذر إرسال الإشعار حاليًا.', 'info');
    }
    return true;
  };

  const handleDeleteAnnouncement = async (announcementId: string): Promise<void> => {
    if (!user || !isAdmin || !currentBuilding.id) {
      showToast('لا توجد صلاحية لحذف الإعلان.', 'error');
      return;
    }
    const announcement = announcements.find(item => item.id === announcementId);
    if (!announcement || (announcement.buildingId && announcement.buildingId !== currentBuilding.id)) {
      showToast('الإعلان غير موجود في العمارة الحالية.', 'error');
      return;
    }
    if (!window.confirm(`هل أنت متأكد من حذف إعلان "${announcement.title}"؟ لا يمكن التراجع عن الحذف.`)) return;
    const { data, error } = await supabase.from('announcements')
      .delete()
      .eq('id', announcementId)
      .eq('building_id', currentBuilding.id)
      .select('id')
      .maybeSingle();
    if (error || !data) {
      showToast('تعذر حذف الإعلان. راجع صلاحيات الحساب وحاول مرة أخرى.', 'error');
      return;
    }
    setAnnouncements(rows => rows.filter(item => item.id !== announcementId));
    showToast('تم حذف الإعلان بنجاح.');
  };

  // 12. SETTINGS
  const handleSaveSettings = async (newSettings: AppSettings): Promise<boolean> => {
    if (!user || !isAdmin || !currentBuilding.id) { showToast('لا توجد صلاحية لمزامنة إعدادات العمارة.', 'error'); return false; }
    const sharedSettings = { ...newSettings };
    delete sharedSettings.customGeminiApiKey;
    delete sharedSettings.backendUrl;
    const { error } = await supabase.from('app_settings').upsert({
      building_id: currentBuilding.id, setting_key: 'general', setting_value: sharedSettings, updated_by: user.id,
    }, { onConflict: 'building_id,setting_key' });
    if (error) { showToast('تعذرت مزامنة الإعدادات: ' + error.message, 'error'); return false; }
    setSettings(newSettings);
    saveStoredSettings(newSettings);
    showToast('تم حفظ إعدادات العمارة ومزامنتها مع كل الأجهزة.');
    return true;
  };

  const handleReloadAllStoredData = () => {
    setBuildings(getStoredBuildings());
    setCurrentBuildingIdState(getActiveBuildingId());
    setApartments(getStoredApartments());
    setPayments(getStoredPayments());
    setExpenses(getStoredExpenses());
    setTickets(getStoredTickets());
    setBookings(getStoredBookings());
    setAnnouncements(getStoredAnnouncements());
    setSettings(getStoredSettings());
    showToast('تمت استعادة كافة البيانات وتحديث الواجهة بنجاح!');
  };

  // Full-screen intro using the newly uploaded, individually separated artwork layers.
  if (showIntroSplash) {
    return (
      <div className="elomara-intro" dir="rtl" aria-label="العمارة">
        <style>{`
          @keyframes introBuilding { from { opacity:0; transform:translate(-50%,18px) } to { opacity:1; transform:translate(-50%,0) } }
          @keyframes introLogo { from { opacity:0; transform:translate(-50%,14px) scale(.97) } to { opacity:1; transform:translate(-50%,0) scale(1) } }
          @keyframes introCityBuilding { from { opacity:0; transform:translateX(var(--intro-city-entry)) } to { opacity:1; transform:translateX(0) } }
          @keyframes introCityTree { from { opacity:0; transform:translateY(100%) } to { opacity:1; transform:translateY(0) } }
          @keyframes introBackingHide { from { opacity:1 } to { opacity:0 } }
          @keyframes introProgress { from { transform:translateX(120%) } to { transform:translateX(-120%) } }
          .elomara-intro { position:fixed; inset:0; z-index:9999; width:100%; height:100vh; height:100dvh; overflow:hidden; isolation:isolate; background:radial-gradient(ellipse at 50% 55%,#f2fbff 0%,#d8f1ff 38%,transparent 75%),linear-gradient(155deg,#078cdd 0%,#83d2fb 35%,#c2eaff 74%,#5ebcf0 100%); }
          .elomara-intro:before { content:""; position:absolute; top:0; left:0; width:min(88vw,600px); height:30%; background:url('/splash-hq/curve.png') left top / 100% auto no-repeat; pointer-events:none; }
          .intro-layer { position:absolute; display:block; object-fit:contain; pointer-events:none; user-select:none; opacity:0; }
          /* Frame transparent padding in the high-resolution layers without stretching their artwork. */
          .intro-building { left:50%; top:20%; width:min(58vw,30vh,300px); aspect-ratio:1047 / 1197; overflow:hidden; animation:introBuilding 1s cubic-bezier(.2,.8,.2,1) .75s both; }
          .intro-building-art { position:absolute; width:122.3496%; height:102.5063%; max-width:none; left:-10.4107%; top:-.3342%; }
          /* One combined title/tagline asset keeps the Arabic logo intact and prevents gaps or clipping. */
          .intro-title { left:50%; top:54%; width:min(78vw,40vh,400px); aspect-ratio:1429 / 615; overflow:hidden; animation:introLogo .8s ease 1.8s both; }
          .intro-title-art { position:absolute; width:151.9944%; height:117.7236%; max-width:none; left:-25.8223%; top:-6.8293%; }
          .intro-city { position:absolute; left:0; bottom:0; width:100%; height:22%; overflow:hidden; pointer-events:none; }
          .intro-ground { position:absolute; z-index:2; left:0; bottom:0; width:100%; height:auto; pointer-events:none; }
          .intro-city-art { position:absolute; left:0; bottom:0; width:100%; max-width:none; height:auto; }
          .intro-city-building { position:absolute; inset:0; animation:introCityBuilding .7s cubic-bezier(.2,.8,.2,1) both; }
          .intro-city-tree { animation:introCityTree .65s cubic-bezier(.2,.75,.3,1) both; }
          .intro-city-backing { animation:introBackingHide .01s linear 5.15s both; }
          .intro-progress { position:absolute; z-index:5; left:50%; bottom:24%; transform:translateX(-50%); width:72px; height:4px; border-radius:99px; overflow:hidden; background:#77bce5; }
          .intro-progress:after { content:""; display:block; width:42%; height:100%; border-radius:inherit; background:#f4bd20; animation:introProgress 1.15s ease-in-out infinite; }
          @media (max-height:650px) { .intro-building { top:16%; width:min(52vw,30vh); } .intro-title { top:53%; } .intro-city { height:20%; } }
          @media (prefers-reduced-motion:reduce) { .intro-layer,.intro-city-building,.intro-city-tree,.intro-progress:after { animation:none !important; opacity:1; } .intro-building,.intro-title { transform:translateX(-50%); } .intro-city-backing { display:none; } }
        `}</style>
        <div className="intro-layer intro-building">
          <img className="intro-building-art" src="/splash-hq/building.png" alt="مبنى العمارة" />
          <IntroWindowLights />
        </div>
        <div className="intro-layer intro-title">
          <img className="intro-title-art" src="/splash-hq/title.png" alt="العمارة - نظام إدارة العقارات والملاك" />
        </div>
        <IntroCity />
        <img className="intro-ground" src="/splash-hq/ground.png" alt="" aria-hidden="true" />
        <div className="intro-progress" aria-hidden="true" />
      </div>
    );
  }

  // Auth Protection Gate
  const authLoadingScreen = (
      <div className="min-h-screen bg-[#07131e] flex flex-col items-center justify-center p-4 selection:bg-teal-500 selection:text-white" dir="rtl">
        <div className="text-center space-y-4 animate-pulse">
          <div className="inline-flex p-3 rounded-3xl bg-white/10 border border-white/20 shadow-2xl backdrop-blur-md">
            <img src="/icon.png" alt="شعار العمارة" className="w-20 h-20 rounded-2xl object-cover shadow-lg" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">العمارة</h2>
            <p className="text-xs text-teal-300 mt-1">جارٍ التحقق من هوية الحساب والاتصال الآمن...</p>
          </div>
        </div>
      </div>
    );

  // Keep form state (email, password and OTP) alive across auth requests.
  // Replacing LoginView with the loader loses the email before verification.
  if (!user || isPasswordRecovery) {
    return <>
      <div hidden={isAuthLoading}><LoginView /></div>
      {isAuthLoading && authLoadingScreen}
    </>;
  }
  if (isAuthLoading) return authLoadingScreen;

  if (user && profileRecoveryError) {
    return <div dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50 p-5">
      <div role="alert" className="w-full max-w-lg space-y-4 rounded-3xl border border-slate-200 bg-white p-6 text-center">
        <h1 className="text-xl font-bold text-slate-900">تعذر تحديث بيانات الحساب</h1>
        <p className="text-sm leading-7 text-slate-600">{profileRecoveryError}</p>
        <button type="button" onClick={() => void refreshProfile(undefined, true)} className="w-full rounded-xl bg-teal-700 p-3 font-bold text-white">إعادة المحاولة</button>
        <button type="button" onClick={() => void signOut()} className="text-sm text-slate-600">تسجيل الخروج</button>
      </div>
    </div>;
  }

  if (user && membershipSyncError) {
    return <div dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50 p-5">
      <div role="alert" className="w-full max-w-lg space-y-4 rounded-3xl border border-slate-200 bg-white p-6 text-center">
        <h1 className="text-xl font-bold text-slate-900">العمارة محفوظة</h1>
        <p className="text-sm leading-7 text-slate-600">{membershipSyncError.message}</p>
        <button type="button" onClick={() => void refreshProfile(membershipSyncError.buildingId)} className="w-full rounded-xl bg-teal-700 p-3 font-bold text-white">إعادة المحاولة</button>
        <button type="button" onClick={() => void signOut()} className="text-sm text-slate-600">تسجيل الخروج</button>
      </div>
    </div>;
  }

  if (!isAdmin) {
    if (userProfile?.status === 'active' && (userProfile.role === 'tenant' || userProfile.role === 'owner')) return <ResidentPortal />;
    return <LoginView />;
  }
  if (isDataLoading) {
    return (
      <div className="min-h-screen bg-[#07131e] text-white flex flex-col items-center justify-center p-4" dir="rtl">
        <div className="text-center space-y-4 animate-pulse">
          <div className="inline-flex p-3 rounded-3xl bg-white/10 border border-white/20 shadow-2xl backdrop-blur-md">
            <img src="/icon.png" alt="شعار العمارة" className="w-20 h-20 rounded-2xl object-cover shadow-lg" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">العمارة</h2>
            <p role="status" className="text-xs text-teal-300 mt-1">جارٍ تحميل بيانات العمارة...</p>
          </div>
        </div>
      </div>
    );
  }

  if (managerLoad.status === 'error') {
    return <div dir="rtl" className="min-h-screen w-full bg-slate-50 flex items-center justify-center p-5">
      <div role="alert" className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 text-center space-y-4">
        <AlertCircle className="mx-auto h-10 w-10 text-amber-600"/>
        <h1 className="text-xl font-bold text-slate-900">تعذر تحميل بيانات العمارة</h1>
        <p className="text-sm leading-7 text-slate-600">فشل تحميل البيانات من الخادم. حاول مرة أخرى.</p>
        {managerLoadFailure && <p dir="auto" className="text-xs leading-6 text-slate-700 break-words select-text">تفاصيل الخطأ: {managerLoadFailure}</p>}
        <button type="button" onClick={() => setManagerLoadRevision(value => value + 1)} className="w-full rounded-xl bg-teal-700 p-3 font-bold text-white">إعادة المحاولة</button>
      </div>
    </div>;
  }

  if (buildings.length === 0) {
    return (
      <div className="min-h-screen bg-[#07131e] text-white flex items-center justify-center p-5" dir="rtl">
        <div className="w-full max-w-lg bg-[#10283a] border border-teal-500/20 rounded-3xl p-6 sm:p-8 shadow-2xl text-center">
          <div className="w-20 h-20 mx-auto mb-5 rounded-2xl overflow-hidden bg-white/10 border border-white/20 p-1 shadow-lg">
            <img src="/icon.png" alt="شعار العمارة" className="w-full h-full rounded-xl object-cover" />
          </div>
          <p className="text-teal-300 text-xs font-bold tracking-wide mb-2">العمارة • إدارة العقارات</p>
          <h1 className="text-2xl font-bold mb-3">أهلاً بيك في العمارة</h1>
          <p className="text-slate-300 text-sm leading-7 mb-6">
            حسابك جاهز، لكن لسه مفيش أي عمارات أو شقق أو سكان مسجلين.
            ابدأ بإضافة بيانات أول عمارة وعدد الشقق والأدوار، وسيتم تجهيز الشقق تلقائيًا.
          </p>
          <button
            data-tour="create-building"
            onClick={() => setIsBuildingModalOpen(true)}
            className="w-full rounded-xl bg-teal-500 hover:bg-teal-400 text-[#07131e] font-bold py-3.5 transition"
          >
            + إضافة أول عمارة
          </button>
          <p className="text-[11px] text-slate-400 mt-4">تُنشأ أرقام الشقق تلقائيًا؛ أضف بيانات السكان والاشتراكات لاحقًا.</p>
          <div className="mt-4"><TourHelpButton /></div>
        </div>
        <AppTour key={`${user.id}:empty-manager`} mode="empty-manager" />
        <BuildingManagementModal
          isOpen={isBuildingModalOpen}
          onClose={() => setIsBuildingModalOpen(false)}
          buildings={buildings}
          currentBuilding={currentBuilding}
          onSelectBuilding={handleSelectBuilding}
          onAddBuilding={handleAddBuilding}
          onUpdateBuilding={handleUpdateBuilding}
          onDeleteBuilding={handleDeleteBuilding}
        />
      </div>
    );
  }

  return (
    <div onTouchStart={handlePullStart} onTouchEnd={handlePullEnd} className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center w-full">
      <AppTour key={`${user.id}:manager`} mode="manager" currentPage={currentTab} onNavigate={setCurrentTabState} />
      {/* Toast Notification Floating */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-[#0f2537] text-white px-4 py-3 rounded-2xl shadow-2xl border border-teal-500/40 flex items-center gap-2.5 animate-in fade-in slide-in-from-top-3 text-xs max-w-md w-full">
          {toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span className="flex-1 font-medium">{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {paymentSuccess && <div role="status" aria-live="polite" dir="rtl" className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-5" onClick={() => setPaymentSuccess(null)}>
        <div className="w-full max-w-sm rounded-[2rem] bg-white px-6 py-10 text-center shadow-2xl" onClick={event => event.stopPropagation()}>
          <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 className="h-16 w-16" strokeWidth={2.5}/></div>
          <h2 className="text-2xl font-black text-emerald-700">تم تسجيل الدفع بنجاح!</h2>
          <p className="mt-3 text-slate-600">شقة {paymentSuccess.unit} عن {paymentSuccess.month}</p>
          <p className="mt-2 text-lg font-bold text-slate-800">{paymentSuccess.amount.toLocaleString('ar-EG')} جنيه</p>
          <button type="button" onClick={() => setPaymentSuccess(null)} className="mt-6 rounded-xl bg-emerald-600 px-7 py-3 font-bold text-white">تم</button>
        </div>
      </div>}
      {isRefreshing && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-teal-700 text-white text-center text-xs font-bold py-2 shadow-lg">
          <span className="inline-block animate-spin mr-2">↻</span> جارٍ تحديث البيانات وفحص تحديث التطبيق...
        </div>
      )}

      {/* Main Container: Native full-width on mobile, max-w-7xl on desktop */}
      <div className="bunyan-manager-shell elomara-light-shell w-full flex flex-col min-h-screen bg-slate-50">
        {/* Navigation & Header */}
        <Header
          buildings={buildings}
          currentBuilding={currentBuilding}
          onSelectBuilding={handleSelectBuilding}
          onOpenBuildingManagement={() => setIsBuildingModalOpen(true)}
          onOpenSettings={() => setCurrentTab('app-settings')}
          onOpenLogin={() => window.location.reload()}
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          unreadTicketCount={unreadTicketCount}
          unreadAnnouncementCount={unreadAnnouncementCount}
        />

        {/* Content Body */}
        <main data-tour="manager-page" data-tour-page={currentTab} className="flex-1 p-3 pb-28 sm:p-6 sm:pb-28 max-w-7xl mx-auto w-full">
          {currentTab === 'more' && <MoreView buildingId={isAdmin ? currentBuilding.id : ''} onBack={() => goBack('dashboard')} onOpenAppSettings={() => setCurrentTab('app-settings')} onSignOut={() => void signOut()} items={[
            ...(isAdmin ? [{ id: 'exceptional', label: 'التحصيلات الاستثنائية', icon: Wallet, tone: 'teal' as const, onClick: () => setCurrentTab('exceptional-collections') }] : []),
            { id: 'services', label: 'دليل الخدمات وأرقام الفنيين', icon: Wrench, tone: 'teal', onClick: () => setCurrentTab('services') },
            { id: 'polls', label: 'استطلاعات الرأي', icon: BarChart3, tone: 'violet', onClick: () => setCurrentTab('polls') },
            { id: 'reports', label: 'التقارير', icon: FileText, onClick: () => setCurrentTab('reports') },
            { id: 'maintenance', label: 'بوابة الساكن والمرافق', icon: Wrench, tone: 'gold', count: unreadTicketCount, onClick: () => setCurrentTab('resident') },
            { id: 'chat', label: 'المساعد الذكي Gemini', icon: Sparkles, tone: 'violet', onClick: () => setCurrentTab('chat') },
            { id: 'studio', label: 'الإعلانات والتصميم', icon: Palette, tone: 'gold', count: unreadAnnouncementCount, onClick: () => setCurrentTab('image-studio') },
            ...(isAdmin ? [
              { id: 'treasury', label: 'الرصيد الافتتاحي ووديعة الصيانة', icon: Wallet, tone: 'teal' as const, onClick: () => setCurrentTab('treasury-settings') },
              { id: 'buildings', label: 'إدارة العقارات', icon: Building2, onClick: () => setIsBuildingModalOpen(true) },
              { id: 'building-settings', label: 'إعدادات العمارة والتحصيل', icon: SlidersHorizontal, onClick: () => setIsSettingsModalOpen(true) },
            ] : []),
          ]}/>}
          {currentTab === 'app-settings' && <AppPreferencesView onBack={() => goBack('more')} onSignOut={() => void signOut()} onBuildingSettings={isAdmin ? () => setIsSettingsModalOpen(true) : undefined}/>}
          {currentTab === 'treasury-settings' && isAdmin && <TreasurySettingsView key={currentBuilding.id} buildingId={currentBuilding.id} onBack={() => goBack('more')} onSaved={({ balance, reserveFund }) => setBuildings(rows => rows.map(building => building.id === currentBuilding.id ? { ...building, balance, reserveFund } : building))}/>}

          {currentTab === 'services' && <ServiceDirectory buildingId={currentBuilding.id} canManage={isAdmin}/>}
          {currentTab === 'polls' && <PollsView buildingId={currentBuilding.id} canManage />}
          {currentTab === 'exceptional-collections' && isAdmin && <ExceptionalCollectionsView key={currentBuilding.id} onCreated={() => void refreshAppData()} buildingId={currentBuilding.id} apartments={apartments.filter(a => a.buildingId === currentBuilding.id)} />}

          {currentTab === 'approvals' && (
            <RegistrationApprovalsView apartments={apartments.filter(a => a.buildingId === currentBuilding.id)} />
          )}

          {currentTab === 'dashboard' && (
            <DashboardView
              building={currentBuilding}
              apartments={apartments.filter((a) => !a.buildingId || a.buildingId === currentBuilding.id)}
              payments={payments}
              expenses={expenses.filter((e) => !e.buildingId || e.buildingId === currentBuilding.id)}
              announcements={announcements.filter((a) => !a.buildingId || a.buildingId === currentBuilding.id)}
              canManageAnnouncements={isAdmin}
              onDeleteAnnouncement={handleDeleteAnnouncement}
              tickets={tickets.filter((t) => !t.buildingId || t.buildingId === currentBuilding.id)}
              onNavigate={setCurrentTab}
              onOpenAddExpense={() => { setCurrentTab('expenses'); setIsAddExpenseModalOpen(true); }}
              onOpenPdf={() => setIsPdfModalOpen(true)}
              onOpenAddPayment={() => setCurrentTab('collections')}
            />
          )}

          {currentTab === 'collections' && (
            <CollectionsView
              currentBuilding={currentBuilding}
              apartments={apartments}
              payments={payments}
              role={role}
              paymentMethods={settings.paymentMethods}
              auditLogs={auditLogs}
              onAddApartment={handleAddApartment}
              onUpdateApartment={handleUpdateApartment}
              onDeleteApartment={handleDeleteApartment}
              onSavePayment={handleSavePayment}
              onEditPayment={handleEditPayment}
              onDeletePayment={handleDeletePayment}
            />
          )}

          {currentTab === 'expenses' && (
            <ExpensesView
              currentBuilding={currentBuilding}
              expenses={expenses}
              onAddExpense={handleAddExpense}
              onUpdateExpense={handleUpdateExpense}
              onDeleteExpense={handleDeleteExpense}
              isOpenAddModal={isAddExpenseModalOpen}
              onCloseAddModal={() => setIsAddExpenseModalOpen(false)}
              onOpenAddModal={() => setIsAddExpenseModalOpen(true)}
            />
          )}

          {currentTab === 'reports' && (
            <ReportsView
              building={currentBuilding}
              apartments={apartments.filter((a) => !a.buildingId || a.buildingId === currentBuilding.id)}
              payments={payments}
              expenses={expenses.filter((e) => !e.buildingId || e.buildingId === currentBuilding.id)}
              onOpenPdfModal={() => setIsPdfModalOpen(true)}
            />
          )}

          {currentTab === 'resident' && (
            <ResidentView
              building={currentBuilding}
              apartments={apartments.filter((a) => !a.buildingId || a.buildingId === currentBuilding.id)}
              payments={payments}
              settings={settings}
              tickets={tickets.filter((t) => !t.buildingId || t.buildingId === currentBuilding.id)}
              bookings={bookings.filter((b) => !b.buildingId || b.buildingId === currentBuilding.id)}
              onAddTicket={handleAddTicket}
              onDeleteTicket={handleDeleteTicket}
              isAdmin={isAdmin}
              onAddBooking={handleAddBooking}
            />
          )}

          {currentTab === 'chat' && (
            <AiChatView buildingName={currentBuilding.name} />
          )}

          {currentTab === 'image-studio' && (
            <AiStudioView
              buildingName={currentBuilding.name}
              onPinAnnouncement={handlePinAnnouncement}
            />
          )}
        </main>

        {/* App Footer */}
        <footer className="bg-white text-slate-500 text-xs py-3.5 px-4 text-center border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2 mb-20">
          <div className="flex items-center gap-2">
            <img src="/icon.png" alt="شعار العمارة" className="w-5 h-5 rounded-md object-cover shadow-sm" />
            <span>العمارة • إدارة العقارات السكنية</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span>
              الخزينة المتاحة: <strong className="text-teal-700 font-bold">{currentBuilding.balance.toLocaleString()} ج.م</strong>
            </span>
            <span>•</span>
            <span>{currentBuilding.name}</span>
          </div>
        </footer>
      </div>

      {/* Building Management Modal */}
      <BuildingManagementModal
        isOpen={isBuildingModalOpen}
        onClose={() => setIsBuildingModalOpen(false)}
        buildings={buildings}
        currentBuilding={currentBuilding}
        onSelectBuilding={handleSelectBuilding}
        onAddBuilding={handleAddBuilding}
        onUpdateBuilding={handleUpdateBuilding}
        onDeleteBuilding={handleDeleteBuilding}
      />

      {/* Settings Modal (Building & App Preferences) */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
        currentBuilding={currentBuilding}
      />

      {/* PDF Statement Modal */}
      {isPdfModalOpen && (
        <PdfStatementModal
          building={currentBuilding}
          apartments={apartments.filter((a) => !a.buildingId || a.buildingId === currentBuilding.id)}
          payments={payments}
          expenses={expenses.filter((e) => !e.buildingId || e.buildingId === currentBuilding.id)}
          onClose={() => setIsPdfModalOpen(false)}
        />
      )}
    </div>
  );
}
