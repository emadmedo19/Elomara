export type UserRole = 'manager' | 'owner' | 'resident';

export interface Building {
  id: string;
  name: string;
  address: string;
  totalUnits: number;
  totalFloors?: number;
  balance: number;
  monthlyTarget: number;
  reserveFund: number;
  managerName: string;
  managerPhone: string;
  manager2Name?: string;
  manager2Phone?: string;
  manager3Name?: string;
  manager3Phone?: string;
}

export type PaymentStatus = 'paid' | 'overdue' | 'pending';

export interface Apartment {
  id: string;
  buildingId: string;
  unitNumber: string;
  floor: number;
  residentName: string;
  residentPhone: string;
  isOwner: boolean;
  monthlyFee: number;
  status: PaymentStatus;
  overdueMonths: number;
  lastPaymentDate?: string;
  paidAmount?: number;
  creditBalance?: number;
}

export interface PaymentAuditLog {
  id: string;
  action: 'create' | 'update' | 'delete';
  paymentId: string;
  apartmentId: string;
  unitNumber: string;
  buildingId: string;
  timestamp: string;
  performedBy: string;
  previousData?: Partial<Payment>;
  newData?: Partial<Payment>;
  notes?: string;
}

export interface Payment {
  id: string;
  apartmentId: string;
  buildingId: string;
  unitNumber: string;
  residentName: string;
  amount: number;
  date: string;
  month: string;
  method: string;
  notes?: string;
  receiptNumber?: string;
  recordedAt: string;
  paymentType?: 'monthly' | 'exceptional';
  isAssessment?: boolean;
  assessmentCancelled?: boolean;
  exceptionalChargeId?: string;
}

export interface Expense {
  id: string;
  buildingId?: string;
  title: string;
  category: 'مصاعد' | 'كهرباء' | 'مياه ومضخات' | 'نظافة' | 'أمن وحراسة' | 'صيانة عامة' | 'أخرى';
  amount: number;
  date: string;
  vendor: string;
  notes?: string;
  receiptUrl?: string;
  approvedBy: string;
}

export interface MaintenanceTicket {
  id: string;
  buildingId?: string;
  unitNumber: string;
  residentName: string;
  category: 'سباكة' | 'كهرباء' | 'مصاعد' | 'نظافة' | 'أمن' | 'أخرى';
  title: string;
  description: string;
  date: string;
  urgency: 'عاجل' | 'متوسط' | 'عادي';
  status: 'جديد' | 'قيد التنفيذ' | 'مكتمل';
}

export interface FacilityBooking {
  id: string;
  buildingId?: string;
  facility: 'روف العمارة' | 'غرفة الاجتماعات بالبدروم' | 'موقف الزوار' | 'شاحن السيارة الكهربائية';
  unitNumber: string;
  residentName: string;
  date: string;
  timeSlot: string;
  status: 'مؤكد' | 'قيد المراجعة' | 'ملغي';
}

export interface Announcement {
  id: string;
  buildingId?: string;
  title: string;
  content: string;
  date: string;
  type: 'urgent' | 'maintenance' | 'meeting' | 'general';
  imageUrl?: string;
  pinned: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

export type GeminiModel = 'gemini-3.1-flash-lite';

export interface AppSettings {
  guardName?: string;
  guardPhone?: string;
  guardNote?: string;
  managerName?: string;
  managerPhone?: string;
  emergencyPhone?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  paymentMethods?: string[];
  currency?: string;
  collectionDay?: number;
  autoWhatsAppReceipt?: boolean;
  overdueAlert?: boolean;
  customGeminiApiKey?: string;
  backendUrl?: string;
}

