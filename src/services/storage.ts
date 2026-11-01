import { 
  Building, Apartment, Payment, Expense, MaintenanceTicket, 
  FacilityBooking, Announcement, AppSettings, PaymentStatus, PaymentAuditLog 
} from '../types';

const STORAGE_KEYS = {
  BUILDINGS: 'bunyan_buildings_v3',
  APARTMENTS: 'bunyan_apartments_v3',
  PAYMENTS: 'bunyan_payments_v3',
  EXPENSES: 'bunyan_expenses_v3',
  TICKETS: 'bunyan_tickets_v3',
  BOOKINGS: 'bunyan_bookings_v3',
  ANNOUNCEMENTS: 'bunyan_announcements_v3',
  ACTIVE_BUILDING: 'bunyan_active_building_id_v3',
  SETTINGS: 'bunyan_settings_v3',
  AUDIT_LOGS: 'bunyan_audit_logs_v3',
};

// Safe localStorage wrapper
function load<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Error loading ${key} from storage:`, e);
    return defaultValue;
  }
}

function save<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Error saving ${key} to storage:`, e);
  }
}

// ---------------------- BUILDINGS ----------------------
export function getStoredBuildings(): Building[] {
  return load<Building[]>(STORAGE_KEYS.BUILDINGS, []);
}

export function saveStoredBuildings(buildings: Building[]): void {
  save(STORAGE_KEYS.BUILDINGS, buildings);
}

export function getActiveBuildingId(): string {
  const storedId = load<string>(STORAGE_KEYS.ACTIVE_BUILDING, '');
  const buildings = getStoredBuildings();
  if (storedId && buildings.some((b) => b.id === storedId)) {
    return storedId;
  }
  const defaultId = buildings[0]?.id || ''
  save(STORAGE_KEYS.ACTIVE_BUILDING, defaultId);
  return defaultId;
}

export function setActiveBuildingId(buildingId: string): void {
  save(STORAGE_KEYS.ACTIVE_BUILDING, buildingId);
}

// ---------------------- APARTMENTS ----------------------
export function getStoredApartments(): Apartment[] {
  return load<Apartment[]>(STORAGE_KEYS.APARTMENTS, []);
}

export function saveStoredApartments(apartments: Apartment[]): void {
  save(STORAGE_KEYS.APARTMENTS, apartments);
}

// ---------------------- PAYMENTS ----------------------
export function getStoredPayments(): Payment[] {
  return load<Payment[]>(STORAGE_KEYS.PAYMENTS, []);
}

export function saveStoredPayments(payments: Payment[]): void {
  save(STORAGE_KEYS.PAYMENTS, payments);
}

// ---------------------- EXPENSES ----------------------
export function getStoredExpenses(): Expense[] {
  return load<Expense[]>(STORAGE_KEYS.EXPENSES, []);
}

export function saveStoredExpenses(expenses: Expense[]): void {
  save(STORAGE_KEYS.EXPENSES, expenses);
}

// ---------------------- TICKETS ----------------------
export function getStoredTickets(): MaintenanceTicket[] {
  return load<MaintenanceTicket[]>(STORAGE_KEYS.TICKETS, []);
}

export function saveStoredTickets(tickets: MaintenanceTicket[]): void {
  save(STORAGE_KEYS.TICKETS, tickets);
}

// ---------------------- BOOKINGS ----------------------
export function getStoredBookings(): FacilityBooking[] {
  return load<FacilityBooking[]>(STORAGE_KEYS.BOOKINGS, []);
}

export function saveStoredBookings(bookings: FacilityBooking[]): void {
  save(STORAGE_KEYS.BOOKINGS, bookings);
}

// ---------------------- ANNOUNCEMENTS ----------------------
export function getStoredAnnouncements(): Announcement[] {
  return load<Announcement[]>(STORAGE_KEYS.ANNOUNCEMENTS, []);
}

export function saveStoredAnnouncements(announcements: Announcement[]): void {
  save(STORAGE_KEYS.ANNOUNCEMENTS, announcements);
}

// ---------------------- SETTINGS ----------------------
export function getStoredSettings(): AppSettings {
  return load<AppSettings>(STORAGE_KEYS.SETTINGS, {
    customGeminiApiKey: '',
    backendUrl: '',
  });
}

export function saveStoredSettings(settings: AppSettings): void {
  save(STORAGE_KEYS.SETTINGS, settings);
}

// ---------------------- AUDIT LOGS ----------------------
export function getStoredAuditLogs(): PaymentAuditLog[] {
  return load<PaymentAuditLog[]>(STORAGE_KEYS.AUDIT_LOGS, []);
}

export function saveStoredAuditLogs(logs: PaymentAuditLog[]): void {
  save(STORAGE_KEYS.AUDIT_LOGS, logs);
}

// ---------------------- BACKUP & RESTORE ----------------------
export function exportDatabaseBackup(): string {
  const payload = {
    version: '3.0',
    exportedAt: new Date().toISOString(),
    buildings: getStoredBuildings(),
    apartments: getStoredApartments(),
    payments: getStoredPayments(),
    auditLogs: getStoredAuditLogs(),
    expenses: getStoredExpenses(),
    tickets: getStoredTickets(),
    bookings: getStoredBookings(),
    announcements: getStoredAnnouncements(),
    settings: getStoredSettings(),
  };
  return JSON.stringify(payload, null, 2);
}

export function importDatabaseBackup(jsonString: string): { success: boolean; message: string } {
  try {
    const data = JSON.parse(jsonString);
    if (!data.buildings || !Array.isArray(data.buildings) || data.buildings.length === 0) {
      return { success: false, message: 'ملف النسخة الاحتياطية غير صالح: لا يحتوي على بيانات عمارات.' };
    }

    if (data.buildings) saveStoredBuildings(data.buildings);
    if (data.apartments) saveStoredApartments(data.apartments);
    if (data.payments) saveStoredPayments(data.payments);
    if (data.auditLogs) saveStoredAuditLogs(data.auditLogs);
    if (data.expenses) saveStoredExpenses(data.expenses);
    if (data.tickets) saveStoredTickets(data.tickets);
    if (data.bookings) saveStoredBookings(data.bookings);
    if (data.announcements) saveStoredAnnouncements(data.announcements);
    if (data.settings) saveStoredSettings(data.settings);

    return { success: true, message: 'تمت استعادة كافة البيانات بنجاح!' };
  } catch (error: any) {
    return { success: false, message: `فشل استيراد الملف: ${error.message}` };
  }
}
