import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { RegistrationApprovalsView } from './components/RegistrationApprovalsView';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { LoginView } from './components/LoginView';
import { supabase } from './lib/supabase';
import { Capacitor } from '@capacitor/core';
import { LiveUpdate } from '@capawesome/capacitor-live-update';

export default function App() {
  // OTA updates: mark the current bundle healthy, then stage a compatible web update.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    const checkForLiveUpdate = async () => {
      try {
        await LiveUpdate.ready();
        const manifestUrl = 'https://yvoylicirtdarroqcxoq.supabase.co/storage/v1/object/public/bunyan-ota/latest.json';
        const response = await fetch(manifestUrl, { cache: 'no-store' });
        if (!response.ok) return;
        const manifest = await response.json() as { bundleId?: string; url?: string; checksum?: string };
        if (!manifest.bundleId || !manifest.url || cancelled) return;
        const nativeBuildId = import.meta.env.VITE_BUILD_ID || '';
        const { bundleId: currentBundleId } = await LiveUpdate.getCurrentBundle();
        if (manifest.bundleId === nativeBuildId || manifest.bundleId === currentBundleId) return;
        await LiveUpdate.downloadBundle({
          url: manifest.url,
          bundleId: manifest.bundleId,
          ...(manifest.checksum ? { checksum: manifest.checksum } : {}),
        });
        if (cancelled) return;
        await LiveUpdate.setNextBundle({ bundleId: manifest.bundleId });
        console.info('[Bunyan OTA] Update downloaded; it will be applied on next app restart.');
      } catch (error) {
        console.warn('[Bunyan OTA] Update check failed; continuing with the installed app.', error);
      }
    };
    void checkForLiveUpdate();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowIntroSplash(false), 3600);
    return () => window.clearTimeout(timer);
  }, []);

  // 1. Persistent State Initialization
  const [showIntroSplash, setShowIntroSplash] = useState(true);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [currentBuildingId, setCurrentBuildingIdState] = useState<string>('');
  const { user, userProfile, isAdmin, isLoading: isAuthLoading } = useAuth();
  const [isDataLoading, setIsDataLoading] = useState(false);
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
    if (!user || !isAdmin) { setBuildings([]); return; }
    let cancelled = false;
    const load = async () => {
      setIsDataLoading(true);
      const { data, error } = await supabase.from('buildings').select('id,name,address,total_units,total_floors,balance,monthly_target,reserve_fund,manager_name,manager_phone,manager2_name,manager2_phone,manager3_name,manager3_phone').order('created_at');
      if (cancelled) return;
      if (error) showToast('تعذر تحميل العمارات: ' + error.message, 'error');
      else {
        const rows: Building[] = (data || []).map((r: any) => ({ id:r.id,name:r.name,address:r.address || '',totalUnits:Number(r.total_units || 0),totalFloors:r.total_floors ?? undefined,balance:Number(r.balance || 0),monthlyTarget:Number(r.monthly_target || 0),reserveFund:Number(r.reserve_fund || 0),managerName:r.manager_name || '',managerPhone:r.manager_phone || '',manager2Name:r.manager2_name || '',manager2Phone:r.manager2_phone || '',manager3Name:r.manager3_name || '',manager3Phone:r.manager3_phone || '' }));
        setBuildings(rows); setCurrentBuildingIdState(rows[0]?.id || '');
        if (rows.length) {
          const { data: apartmentRows, error: apartmentError } = await supabase.from('apartments')
            .select('id,building_id,unit_number,floor,resident_name,resident_phone,is_owner,monthly_fee,payment_status,overdue_months,last_payment_date,paid_amount,credit_balance')
            .in('building_id', rows.map(b => b.id));
          if (apartmentError) showToast('تعذر تحميل الشقق: ' + apartmentError.message, 'error');
          else setApartments((apartmentRows || []).map((r: any) => ({
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
            .select('id,apartment_id,building_id,unit_number,resident_name,amount,payment_date,month,method,notes,receipt_number,recorded_at')
            .in('building_id', rows.map(b => b.id))
            .order('payment_date', { ascending: false });
          if (paymentError) showToast('تعذر تحميل سجل المدفوعات: ' + paymentError.message, 'error');
          else setPayments((paymentRows || []).map((r: any) => ({
            id:r.id, apartmentId:r.apartment_id, buildingId:r.building_id,
            unitNumber:r.unit_number, residentName:r.resident_name || '',
            amount:Number(r.amount || 0), date:r.payment_date, month:r.month,
            method:r.method, notes:r.notes || undefined,
            receiptNumber:r.receipt_number || undefined, recordedAt:r.recorded_at || undefined,
          })));

          const [ticketResult, announcementResult, expenseResult, settingsResult] = await Promise.all([
            supabase.from('maintenance_tickets').select('id,building_id,apartment_id,unit_number,resident_name,category,title,description,urgency,status,created_at').in('building_id', rows.map(b => b.id)).order('created_at', { ascending: false }),
            supabase.from('announcements').select('id,building_id,title,content,announcement_type,image_url,pinned,created_at').in('building_id', rows.map(b => b.id)).order('created_at', { ascending: false }),
            supabase.from('expenses').select('id,building_id,title,category,amount,expense_date,vendor,notes,receipt_url,approved_by').in('building_id', rows.map(b => b.id)).order('expense_date', { ascending: false }),
            supabase.from('app_settings').select('setting_value').eq('building_id', rows[0].id).eq('setting_key', 'general').maybeSingle(),
          ]);
          if (ticketResult.error) showToast('تعذر تحميل بلاغات الصيانة: ' + ticketResult.error.message, 'error');
          else setTickets((ticketResult.data || []).map((r: any) => ({
            id:r.id, buildingId:r.building_id, unitNumber:r.unit_number, residentName:r.resident_name,
            category:r.category, title:r.title, description:r.description, urgency:r.urgency,
            status:r.status, date:r.created_at,
          })));
          if (announcementResult.error) showToast('تعذر تحميل الإعلانات: ' + announcementResult.error.message, 'error');
          else setAnnouncements((announcementResult.data || []).map((r: any) => ({
            id:r.id, buildingId:r.building_id, title:r.title, content:r.content,
            type:r.announcement_type, imageUrl:r.image_url || undefined, pinned:r.pinned,
            date:r.created_at,
          })));
          if (expenseResult.error) showToast('تعذر تحميل المصروفات: ' + expenseResult.error.message, 'error');
          else setExpenses((expenseResult.data || []).map((r: any) => ({
            id:r.id, buildingId:r.building_id, title:r.title, category:r.category,
            amount:Number(r.amount || 0), date:r.expense_date, vendor:r.vendor || '',
            notes:r.notes || undefined, receiptUrl:r.receipt_url || undefined, approvedBy:r.approved_by || '',
          })));
          if (settingsResult.error) showToast('تعذر تحميل إعدادات العمارة: ' + settingsResult.error.message, 'error');
          else { const mergedSettings = { ...getStoredSettings(), ...(settingsResult.data?.setting_value || {}) }; setSettings(mergedSettings); saveStoredSettings(mergedSettings); }
        }
      }
      setIsDataLoading(false);
    };
    void load(); return () => { cancelled = true; };
  }, [user?.id, isAdmin]);

  // 3. Navigation State (Defaults directly to 'dashboard')
  const [currentTab, setCurrentTabState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam && ['dashboard', 'collections', 'expenses', 'reports', 'resident', 'chat', 'image-studio', 'approvals'].includes(tabParam)) {
        return tabParam;
      }
    }
    return 'dashboard';
  });

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
    if (tab === 'resident') markNotificationsSeen('tickets', tickets.map(item => item.id));
    if (tab === 'image-studio') markNotificationsSeen('announcements', announcements.map(item => item.id));
    setCurrentTabState(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.pushState({}, '', url.toString());
    }
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
    try {
      // Refresh the entities currently connected to Supabase.
      const { data: buildingRows, error: buildingError } = await supabase
        .from('buildings')
        .select('id,name,address,total_units,total_floors,balance,monthly_target,reserve_fund,manager_name,manager_phone,manager2_name,manager2_phone,manager3_name,manager3_phone')
        .order('created_at');
      if (buildingError) throw buildingError;

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
          .select('id,apartment_id,building_id,unit_number,resident_name,amount,payment_date,month,method,notes,receipt_number,recorded_at')
          .in('building_id', refreshedBuildings.map(b => b.id))
          .order('payment_date', { ascending: false });
        if (paymentError) throw paymentError;
        refreshedPayments = (paymentRows || []).map((r: any) => ({
          id:r.id, apartmentId:r.apartment_id, buildingId:r.building_id,
          unitNumber:r.unit_number, residentName:r.resident_name || '',
          amount:Number(r.amount || 0), date:r.payment_date, month:r.month,
          method:r.method, notes:r.notes || undefined,
          receiptNumber:r.receipt_number || undefined, recordedAt:r.recorded_at || undefined,
        }));
      }
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
        supabase.from('announcements').select('id,building_id,title,content,announcement_type,image_url,pinned,created_at').in('building_id', refreshedBuildings.map(b => b.id)).order('created_at', { ascending: false }),
        supabase.from('expenses').select('id,building_id,title,category,amount,expense_date,vendor,notes,receipt_url,approved_by').in('building_id', refreshedBuildings.map(b => b.id)).order('expense_date', { ascending: false }),
        supabase.from('app_settings').select('setting_value').eq('building_id', refreshedBuildings[0]?.id || '').eq('setting_key', 'general').maybeSingle(),
      ]);
      if (ticketResult.error) throw ticketResult.error;
      if (announcementResult.error) throw announcementResult.error;
      setTickets((ticketResult.data || []).map((r: any) => ({
        id:r.id, buildingId:r.building_id, unitNumber:r.unit_number, residentName:r.resident_name,
        category:r.category, title:r.title, description:r.description, urgency:r.urgency,
        status:r.status, date:r.created_at,
      })));
      setAnnouncements((announcementResult.data || []).map((r: any) => ({
        id:r.id, buildingId:r.building_id, title:r.title, content:r.content,
        type:r.announcement_type, imageUrl:r.image_url || undefined, pinned:r.pinned,
        date:r.created_at,
      })));
      if (expenseResult.error) throw expenseResult.error;
      setExpenses((expenseResult.data || []).map((r: any) => ({
        id:r.id, buildingId:r.building_id, title:r.title, category:r.category,
        amount:Number(r.amount || 0), date:r.expense_date, vendor:r.vendor || '',
        notes:r.notes || undefined, receiptUrl:r.receipt_url || undefined, approvedBy:r.approved_by || '',
      })));
      if (settingsResult.error) throw settingsResult.error;
      const mergedSettings = { ...getStoredSettings(), ...(settingsResult.data?.setting_value || {}) };
      setSettings(mergedSettings);
      saveStoredSettings(mergedSettings);

      // Check for a newly published web bundle on native Android/iOS.
      let updateReady = false;
      if (Capacitor.isNativePlatform()) {
        const manifestResponse = await fetch('https://yvoylicirtdarroqcxoq.supabase.co/storage/v1/object/public/bunyan-ota/latest.json', { cache: 'no-store' });
        if (!manifestResponse.ok) throw new Error('تعذر فحص تحديث التطبيق');
        const manifest = await manifestResponse.json() as { bundleId?: string; url?: string; checksum?: string };
        const prefix = 'https://yvoylicirtdarroqcxoq.supabase.co/storage/v1/object/public/bunyan-ota/bundles/';
        if (manifest.bundleId && /^[a-f0-9]{40}$/.test(manifest.bundleId) &&
            manifest.url?.startsWith(prefix) && manifest.url.endsWith(`/${manifest.bundleId}.zip`) &&
            manifest.checksum && /^[a-f0-9]{64}$/.test(manifest.checksum)) {
          const current = await LiveUpdate.getCurrentBundle();
          const next = await LiveUpdate.getNextBundle();
          if (current.bundleId !== manifest.bundleId && next.bundleId !== manifest.bundleId) {
            await LiveUpdate.downloadBundle({ url: manifest.url, bundleId: manifest.bundleId, checksum: manifest.checksum });
            await LiveUpdate.setNextBundle({ bundleId: manifest.bundleId });
            updateReady = true;
          }
        }
      }

      if (updateReady) {
        showToast('تم تنزيل تحديث جديد. اضغط موافق لإعادة تحميل التطبيق وتطبيقه الآن.', 'info');
        if (window.confirm('تم تنزيل تحديث جديد لبرج الفتوح. هل تريد تطبيقه الآن؟ احفظ أي بيانات غير محفوظة قبل المتابعة.')) {
          await LiveUpdate.reload();
          return;
        }
      } else {
        showToast('تم تحديث البيانات بنجاح.', 'success');
      }
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
      // If any modal is open, close modals first
      if (isBuildingModalOpen || isSettingsModalOpen || isAddExpenseModalOpen || isPdfModalOpen) {
        setIsBuildingModalOpen(false);
        setIsSettingsModalOpen(false);
        setIsAddExpenseModalOpen(false);
        setIsPdfModalOpen(false);
        return;
      }
      // If not on dashboard, return to dashboard
      if (currentTab !== 'dashboard') {
        setCurrentTabState('dashboard');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isBuildingModalOpen, isSettingsModalOpen, isAddExpenseModalOpen, isPdfModalOpen, currentTab]);

  // 7. BUILDINGS CRUD
  const handleAddBuilding = async (newBldData: Omit<Building, 'id'>) => {
    if (!user || !isAdmin) { showToast('لا توجد صلاحية لإضافة عمارة.', 'error'); return; }
    const { data, error } = await supabase.from('buildings').insert({
      name: newBldData.name, address: newBldData.address, total_units: newBldData.totalUnits,
      total_floors: newBldData.totalFloors ?? null, balance: 0, monthly_target: newBldData.monthlyTarget,
      reserve_fund: newBldData.reserveFund, manager_name: newBldData.managerName, manager_phone: newBldData.managerPhone, manager2_name: newBldData.manager2Name || '', manager2_phone: newBldData.manager2Phone || '', manager3_name: newBldData.manager3Name || '', manager3_phone: newBldData.manager3Phone || '',
    }).select('id,name,address,total_units,total_floors,balance,monthly_target,reserve_fund,manager_name,manager_phone,manager2_name,manager2_phone,manager3_name,manager3_phone').single();
    if (error || !data) { showToast('فشل حفظ العمارة: ' + (error?.message || 'خطأ غير معروف'), 'error'); return; }
    const newBld: Building = {
      id: data.id, name: data.name, address: data.address || '', totalUnits: Number(data.total_units || 0),
      totalFloors: data.total_floors ?? undefined, balance: Number(data.balance || 0),
      monthlyTarget: Number(data.monthly_target || 0), reserveFund: Number(data.reserve_fund || 0),
      managerName: data.manager_name || '', managerPhone: data.manager_phone || '', manager2Name: data.manager2_name || '', manager2Phone: data.manager2_phone || '', manager3Name: data.manager3_name || '', manager3Phone: data.manager3_phone || '',
    };
    setBuildings(rows => [...rows, newBld]);
    setCurrentBuildingIdState(newBld.id);
    showToast('تم حفظ العمارة على قاعدة البيانات بنجاح!');
  };

  const handleUpdateBuilding = async (id: string, updatedData: Partial<Building>) => {
    const current = buildings.find((b) => b.id === id);
    if (!current) return;
    const next = { ...current, ...updatedData };
    const { error } = await supabase.from('buildings').update({
      name: next.name, address: next.address, total_units: next.totalUnits,
      total_floors: next.totalFloors ?? null, monthly_target: next.monthlyTarget,
      reserve_fund: next.reserveFund, manager_name: next.managerName, manager_phone: next.managerPhone, manager2_name: next.manager2Name || '', manager2_phone: next.manager2Phone || '', manager3_name: next.manager3Name || '', manager3_phone: next.manager3Phone || '',
    }).eq('id', id);
    if (error) { showToast('فشل تحديث بيانات العمارة: ' + error.message, 'error'); return; }
    setBuildings(rows => rows.map(b => b.id === id ? next : b));
    showToast('تم حفظ تعديلات بيانات العمارة على قاعدة البيانات!');
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
    amount: number;
    date: string;
    month: string;
    method: Payment['method'];
    notes?: string;
    receiptNumber?: string;
  }): Promise<boolean> => {
    if (!user || !isAdmin || !['super_admin', 'assistant_admin'].includes(userProfile?.role || '')) {
      showToast('عذراً، تسجيل المدفوعات متاح فقط لمدير العمارة المعتمد.', 'error');
      return false;
    }

    const apt = apartments.find((a) => a.id === paymentData.apartmentId);
    if (!apt) { showToast('لم يتم العثور على الشقة المطلوبة.', 'error'); return false; }

    const buildingId = apt.buildingId || currentBuilding.id;
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
    const fin = calculateApartmentFinancials(apt, updatedPayments);
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
      const fin = calculateApartmentFinancials(apt, updatedPayments);
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
      const fin = calculateApartmentFinancials(apt, updatedPayments);
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

  // Independent animated intro; existing auth and data gates run immediately after it.
  if (showIntroSplash) {
    return (
      <div className="elomara-intro" dir="rtl">
        <style>{'@keyframes introLogo{0%{opacity:0;transform:scale(.6) rotate(-8deg)}70%{opacity:1;transform:scale(1.08)}100%{opacity:1;transform:scale(1)}}@keyframes introUp{from{opacity:0;transform:translateY(45px)}to{opacity:1;transform:translateY(0)}}@keyframes introLeft{from{opacity:0;transform:translate(-55px,35px)}to{opacity:1;transform:translate(0,0)}}@keyframes introRight{from{opacity:0;transform:translate(55px,35px)}to{opacity:1;transform:translate(0,0)}}@keyframes introLoad{from{transform:translateX(120%)}to{transform:translateX(-120%)}}.elomara-intro{position:fixed;inset:0;z-index:9999;overflow:hidden;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#edf8fc 0%,#dceef5 60%,#c5e1eb 100%);color:#124454}.elomara-intro:before,.elomara-intro:after{content:"";position:absolute;left:-12%;width:124%;height:100px;border-radius:50%;border:2px solid #65adc5;opacity:.35}.elomara-intro:before{top:-65px;box-shadow:0 14px 0 -5px #e5bd5c}.elomara-intro:after{bottom:-75px;box-shadow:0 -14px 0 -5px #e5bd5c}.intro-center{position:relative;z-index:3;display:flex;flex-direction:column;align-items:center;text-align:center;padding-bottom:60px}.intro-logo{width:116px;height:116px;padding:9px;border-radius:30px;background:#ffffffd9;border:1px solid white;box-shadow:0 18px 44px #2c78932b;animation:introLogo .9s cubic-bezier(.2,.8,.2,1) .55s both}.intro-logo img{width:100%;height:100%;object-fit:contain;border-radius:22px}.intro-name{margin-top:18px;font-size:clamp(36px,8vw,48px);font-weight:950;letter-spacing:-.05em;animation:introUp .65s ease 1.2s both}.intro-tag{margin-top:8px;color:#497889;font-size:14px;font-weight:650;animation:introUp .65s ease 1.45s both}.intro-skyline{position:absolute;bottom:0;left:0;right:0;height:31%;display:flex;justify-content:space-between;align-items:end;z-index:2;pointer-events:none}.intro-group{height:100%;width:48%;display:flex;align-items:end;gap:5px}.intro-group.left{justify-content:start;padding-left:2%;animation:introLeft .85s ease .1s both}.intro-group.right{justify-content:end;padding-right:2%;animation:introRight .85s ease .2s both}.intro-tower{position:relative;width:clamp(27px,7vw,58px);border:1px solid #83b9c8;border-bottom:0;border-radius:5px 5px 0 0;background:linear-gradient(#fff,#9fcbd7);box-shadow:inset 0 8px 16px #fff9}.intro-tower:after{content:"";position:absolute;inset:12px 7px 8px;background:repeating-linear-gradient(90deg,transparent 0 8px,#609db1 8px 11px),repeating-linear-gradient(0deg,transparent 0 13px,#609db1 13px 16px);opacity:.5}.intro-tower.t1{height:43%}.intro-tower.t2{height:64%}.intro-tower.t3{height:34%}.intro-tower.t4{height:76%}.intro-tower.t5{height:51%}.intro-loading{position:absolute;bottom:27px;z-index:4;width:94px;height:3px;border-radius:5px;background:#9bbdca;overflow:hidden}.intro-loading:after{content:"";display:block;width:40%;height:100%;background:#d4a63d;animation:introLoad 1.2s ease-in-out infinite}'}</style>
        <div className="intro-center">
          <div className="intro-logo"><img src="/icon.png" alt="شعار العمارة" /></div>
          <h1 className="intro-name">العمارة</h1>
          <p className="intro-tag">نظام إدارة العقارات والملاك</p>
        </div>
        <div className="intro-skyline" aria-hidden="true">
          <div className="intro-group left"><i className="intro-tower t1"/><i className="intro-tower t2"/><i className="intro-tower t3"/><i className="intro-tower t5"/></div>
          <div className="intro-group right"><i className="intro-tower t3"/><i className="intro-tower t4"/><i className="intro-tower t1"/><i className="intro-tower t5"/></div>
        </div>
        <div className="intro-loading"/>
      </div>
    );
  }

  // Auth Protection Gate
  if (isAuthLoading) {
    return (
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
  }

  if (!user) return <LoginView />;
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
            <p className="text-xs text-teal-300 mt-1">جارٍ تحميل بيانات العمارة من قاعدة البيانات...</p>
          </div>
        </div>
      </div>
    );
  }

  if (buildings.length === 0) {
    return (
      <div className="min-h-screen bg-[#07131e] text-white flex items-center justify-center p-5" dir="rtl">
        <div className="w-full max-w-lg bg-[#10283a] border border-teal-500/20 rounded-3xl p-6 sm:p-8 shadow-2xl text-center">
          <div className="w-20 h-20 mx-auto mb-5 rounded-2xl overflow-hidden bg-white/10 border border-white/20 p-1 shadow-lg">
            <img src="/icon.png" alt="شعار العمارة" className="w-full h-full rounded-xl object-cover" />
          </div>
          <p className="text-teal-300 text-xs font-bold tracking-wide mb-2">برج الفتوح • إدارة العقارات</p>
          <h1 className="text-2xl font-bold mb-3">أهلاً بيك في برج الفتوح</h1>
          <p className="text-slate-300 text-sm leading-7 mb-6">
            حسابك جاهز، لكن لسه مفيش أي عمارات أو شقق أو سكان مسجلين.
            ابدأ بإضافة بيانات أول عمارة، وبعدها تقدر تضيف الشقق والسكان بنفسك.
          </p>
          <button
            onClick={() => setIsBuildingModalOpen(true)}
            className="w-full rounded-xl bg-teal-500 hover:bg-teal-400 text-[#07131e] font-bold py-3.5 transition"
          >
            + إضافة أول عمارة
          </button>
          <p className="text-[11px] text-slate-400 mt-4">لن يتم إنشاء شقق أو سكان تلقائيًا.</p>
        </div>
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

      {isRefreshing && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-teal-700 text-white text-center text-xs font-bold py-2 shadow-lg">
          <span className="inline-block animate-spin mr-2">↻</span> جارٍ تحديث البيانات وفحص تحديث التطبيق...
        </div>
      )}

      {/* Main Container: Native full-width on mobile, max-w-7xl on desktop */}
      <div className="bunyan-manager-shell w-full flex flex-col min-h-screen bg-slate-50">
        {/* Navigation & Header */}
        <Header
          buildings={buildings}
          currentBuilding={currentBuilding}
          onSelectBuilding={handleSelectBuilding}
          onOpenBuildingManagement={() => setIsBuildingModalOpen(true)}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onOpenLogin={() => window.location.reload()}
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          unreadTicketCount={unreadTicketCount}
          unreadAnnouncementCount={unreadAnnouncementCount}
        />

        {/* Content Body */}
        <main className="flex-1 p-3 pb-28 sm:p-6 sm:pb-28 max-w-7xl mx-auto w-full">
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
