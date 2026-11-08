import { PollsView } from './PollsView';
import React, { useState } from 'react';

const displayDateTime = (value?: string) => {
  if (!value) return '—';
  const normalized = value.length === 10 ? `${value}T12:00:00` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: value.length > 10 ? 'short' : undefined }).format(date);
};
import { Building, Apartment, MaintenanceTicket, FacilityBooking, Payment, AppSettings } from '../types';
import { calculateApartmentFinancials } from '../services/financialAccounting';
import { 
  Home, Wrench, Calendar, Vote, Plus, CheckCircle2, Clock, 
  AlertTriangle, Shield, Check, Phone, DollarSign, Send, Receipt
} from 'lucide-react';

interface ResidentViewProps {
  building: Building;
  apartments: Apartment[];
  payments?: Payment[];
  settings?: AppSettings;
  tickets: MaintenanceTicket[];
  bookings: FacilityBooking[];
  onAddTicket: (ticket: Omit<MaintenanceTicket, 'id'>) => Promise<void>;
  onDeleteTicket: (ticketId: string) => Promise<void>;
  isAdmin: boolean;
  onAddBooking: (booking: Omit<FacilityBooking, 'id'>) => void;
}

export const ResidentView: React.FC<ResidentViewProps> = ({
  building,
  apartments,
  payments = [],
  settings = {},
  tickets,
  bookings,
  onAddTicket,
  onDeleteTicket,
  isAdmin,
  onAddBooking,
}) => {
  // Current logged in resident unit (defaults to شقة 301)
  const [selectedUnitId, setSelectedUnitId] = useState('apt-301');
  const currentResident = apartments.find((a) => a.id === selectedUnitId) || apartments[0];

  const [activeTab, setActiveTab] = useState<'overview' | 'tickets' | 'booking' | 'voting'>('overview');

  // New ticket state
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticketCategory, setTicketCategory] = useState<MaintenanceTicket['category']>('كهرباء');
  const [ticketTitle, setTicketTitle] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketUrgency, setTicketUrgency] = useState<MaintenanceTicket['urgency']>('عادي');

  // New booking state
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [bookingFacility, setBookingFacility] = useState<FacilityBooking['facility']>('روف العمارة');
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split('T')[0]);
  const [bookingTimeSlot, setBookingTimeSlot] = useState('06:00 م - 09:00 م');



  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketTitle) return;

    await onAddTicket({
      unitNumber: currentResident.unitNumber,
      residentName: currentResident.residentName,
      category: ticketCategory,
      title: ticketTitle,
      description: ticketDescription,
      date: new Date().toISOString().split('T')[0],
      urgency: ticketUrgency,
      status: 'جديد',
    });

    setIsTicketModalOpen(false);
    setTicketTitle('');
    setTicketDescription('');
  };

  const handleCreateBooking = (e: React.FormEvent) => {
    e.preventDefault();
    onAddBooking({
      facility: bookingFacility,
      unitNumber: currentResident.unitNumber,
      residentName: currentResident.residentName,
      date: bookingDate,
      timeSlot: bookingTimeSlot,
      status: 'مؤكد',
    });

    setIsBookingModalOpen(false);
  };

  if (!currentResident) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 text-center shadow-sm">
        <div className="text-4xl mb-3">🏢</div>
        <h2 className="text-lg font-bold text-slate-900 mb-2">لا توجد شقق مسجلة حتى الآن</h2>
        <p className="text-sm text-slate-600 leading-7">ابدأ بإضافة الشقق والسكان من شاشة سجل الشقق والتحصيل، وبعدها ستظهر هنا البيانات المالية وطلبات الصيانة وحجوزات المرافق.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Resident Identity Header Card */}
      <div className="bg-gradient-to-l from-[#0f2537] to-[#1c4467] p-5 rounded-2xl text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-teal-500/20 text-teal-300 border border-teal-500/30 flex items-center justify-center font-bold text-xl">
            {currentResident.unitNumber.replace('شقة ', '')}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold">{currentResident.residentName}</h1>
              <span className="text-[10px] bg-teal-400/20 text-teal-300 border border-teal-400/30 px-2 py-0.5 rounded-full font-medium">
                {currentResident.isOwner ? 'مالك الوحدة' : 'شاغل الوحدة'}
              </span>
            </div>
            <p className="text-xs text-slate-300">
              {currentResident.unitNumber} • الدور {currentResident.floor} • {building.name}
            </p>
          </div>
        </div>

        {/* Change Current Unit for Testing */}
        <div className="flex items-center gap-2 bg-white/10 p-1.5 rounded-xl border border-white/15 text-xs">
          <span className="text-slate-300 text-[11px] pr-1">تغيير الشقة للتجربة:</span>
          <select
            value={selectedUnitId}
            onChange={(e) => setSelectedUnitId(e.target.value)}
            className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer"
          >
            {apartments.map((a) => (
              <option key={a.id} value={a.id} className="text-slate-900 bg-white">
                {a.unitNumber} ({a.residentName})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-sm text-xs">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-2 rounded-xl font-bold transition flex items-center justify-center gap-1.5 ${
            activeTab === 'overview'
              ? 'bg-[#0f2537] text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Home className="w-4 h-4 text-teal-300" />
          <span>موقفي المالي</span>
        </button>

        <button
          onClick={() => setActiveTab('tickets')}
          className={`flex-1 py-2 rounded-xl font-bold transition flex items-center justify-center gap-1.5 ${
            activeTab === 'tickets'
              ? 'bg-[#0f2537] text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Wrench className="w-4 h-4 text-teal-300" />
          <span>طلبات الصيانة</span>
        </button>

        <button
          onClick={() => setActiveTab('booking')}
          className={`flex-1 py-2 rounded-xl font-bold transition flex items-center justify-center gap-1.5 ${
            activeTab === 'booking'
              ? 'bg-[#0f2537] text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Calendar className="w-4 h-4 text-teal-300" />
          <span>حجز المرافق</span>
        </button>

        <button
          onClick={() => setActiveTab('voting')}
          className={`flex-1 py-2 rounded-xl font-bold transition flex items-center justify-center gap-1.5 ${
            activeTab === 'voting'
              ? 'bg-[#0f2537] text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Vote className="w-4 h-4 text-teal-300" />
          <span>تصويت الجمعية</span>
        </button>
      </div>

      {/* Tab 1: Resident Financial Overview */}
      {activeTab === 'overview' && (() => {
        const fin = calculateApartmentFinancials(currentResident, payments);
        const isPaid = fin.status === 'paid';

        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm md:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 mb-0.5">الموقف المالي لاشتراكات صيانة الشقة</h3>
                  <p className="text-xs text-slate-500">دورة الحساب الحالية: شهر أكتوبر 2024</p>
                </div>
                {fin.creditBalance > 0 && (
                  <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1 rounded-full text-xs font-bold">
                    رصيد دائن: +{fin.creditBalance.toLocaleString()} ج.م
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[11px] text-slate-500 block">إجمالي المستحق</span>
                  <span className="text-lg font-bold text-slate-900 mt-1 block">
                    {fin.totalDue.toLocaleString()} ج.م
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {currentResident.overdueMonths && currentResident.overdueMonths > 1
                      ? `شامل متأخرات ${currentResident.overdueMonths} شهور`
                      : 'الاشتراك الشهري'}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-teal-50/70 border border-teal-200">
                  <span className="text-[11px] text-teal-800 block">إجمالي المسدد</span>
                  <span className="text-lg font-bold text-teal-900 mt-1 block">
                    {fin.totalPaid.toLocaleString()} ج.م
                  </span>
                  <span className="text-[10px] text-teal-700">
                    {fin.lastPaymentDate ? `آخر سداد: ${fin.lastPaymentDate}` : 'لم يسدد بعد'}
                  </span>
                </div>

                <div className={`p-3.5 rounded-xl border ${
                  isPaid
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-rose-50 border-rose-200'
                }`}>
                  <span className="text-[11px] text-slate-500 block">المبلغ المتبقي</span>
                  <span className={`text-lg font-bold mt-1 block ${
                    isPaid ? 'text-emerald-700' : 'text-rose-600'
                  }`}>
                    {fin.remaining.toLocaleString()} ج.م
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {isPaid ? 'خالص السداد بالكامل ✓' : 'يرجى سرعة السداد'}
                  </span>
                </div>
              </div>

            <div className="p-4 rounded-xl bg-[#0f2537] text-white space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-xs">طريقة السداد المعتمدة</p>
                  <p className="text-[11px] text-slate-300 mt-1">{settings.bankAccountName?.trim() || 'بيانات التحويل والسداد'}</p>
                </div>
                <span className="shrink-0 text-[10px] bg-teal-400/15 text-teal-200 border border-teal-300/20 font-bold px-3 py-1.5 rounded-lg">
                  {settings.paymentMethods?.filter(Boolean).join(' • ') || 'تحويل أو محفظة إلكترونية'}
                </span>
              </div>
              {settings.bankAccountNumber?.trim() ? (
                <div className="rounded-lg bg-white/10 border border-white/10 px-3 py-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-300">عنوان الدفع / رقم المحفظة / الحساب</span>
                  <span className="text-sm font-mono font-bold text-white break-all text-left" dir="ltr">{settings.bankAccountNumber}</span>
                </div>
              ) : (
                <p className="text-[11px] text-amber-200">لم تُسجل الإدارة بيانات الدفع بعد.</p>
              )}
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900 mb-2">بيانات التواصل مع إدارة العقار</h3>
              <div className="space-y-2 text-xs text-slate-600">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-400 block text-[10px]">أمين الصندوق:</span>
                  <span className="font-bold text-slate-800">{building.managerName}</span>
                  <a href={`tel:${building.managerPhone}`} className="text-teal-700 font-mono block text-[11px] mt-0.5">
                    {building.managerPhone} 📞
                  </a>
                </div>
                {(settings.guardName || settings.guardPhone) && <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-400 block text-[10px]">حارس العقار:</span>
                  <span className="font-bold text-slate-800">{settings.guardName}</span>
                  {settings.guardNote && <p>{settings.guardNote}</p>}
                  {settings.guardPhone && <a dir="ltr" className="text-teal-700 block" href={`tel:${settings.guardPhone.replace(/[^+0-9]/g, '')}`}>{settings.guardPhone} 📞</a>}
                </div>}
              </div>
            </div>
          </div>
        </div>
      );
    })()}

      {/* Tab 2: Maintenance Tickets */}
      {activeTab === 'tickets' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200/80">
            <div>
              <h3 className="font-bold text-sm text-slate-900">سجل طلبات الصيانة والأعطال</h3>
              <p className="text-xs text-slate-500">تقديم شكوى أو طلب صيانة يخص شقتك أو الأجزاء المشتركة</p>
            </div>
            <button
              onClick={() => setIsTicketModalOpen(true)}
              className="bg-[#0f2537] hover:bg-[#1a3852] text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition active:scale-95 shadow-sm"
            >
              <Plus className="w-4 h-4 text-teal-300" />
              <span>تقديم بلاغ عطل</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {tickets.map((t) => (
              <div
                key={t.id}
                className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0 mt-0.5">
                    <Wrench className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-xs text-slate-900">{t.title}</h4>
                      <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-bold">
                        {t.category}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        t.urgency === 'عاجل' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {t.urgency}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{t.description}</p>
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      مقدم البلاغ: {t.residentName} ({t.unitNumber}) • {t.date}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 flex flex-col items-end gap-2">
                  {isAdmin && (
                    <button type="button" onClick={() => void onDeleteTicket(t.id)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50" aria-label={`حذف طلب الصيانة ${t.title}`}>
                      حذف
                    </button>
                  )}
                  <span className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full ${
                    t.status === 'مكتمل'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : t.status === 'قيد التنفيذ'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  }`}>
                    {t.status === 'مكتمل' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                    <span>{t.status}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Facility Bookings */}
      {activeTab === 'booking' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200/80">
            <div>
              <h3 className="font-bold text-sm text-slate-900">حجز المرافق المشتركة للعقار</h3>
              <p className="text-xs text-slate-500">حجز الروف، شاحن السيارة الكهربائية، أو قاعة الاجتماعات</p>
            </div>
            <button
              onClick={() => setIsBookingModalOpen(true)}
              className="bg-[#0f2537] hover:bg-[#1a3852] text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition active:scale-95 shadow-sm"
            >
              <Plus className="w-4 h-4 text-teal-300" />
              <span>طلب حجز مرفق</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {bookings.map((b) => (
              <div key={b.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs text-slate-900">{b.facility}</span>
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                    {b.status}
                  </span>
                </div>
                <div className="space-y-1 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <p>المحجوز باسم: <strong className="text-slate-800">{b.residentName}</strong> ({b.unitNumber})</p>
                  <p>التاريخ: <span className="font-mono">{displayDateTime(b.date)}</span></p>
                  <p>الفترة: <span className="font-mono">{b.timeSlot}</span></p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'voting' && <PollsView buildingId={building.id} canManage={isAdmin} />}

      {/* Ticket Modal */}
      {isTicketModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#0f2537]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleCreateTicket} className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200">
            <h3 className="font-bold text-sm text-slate-900 mb-3 pb-2 border-b">تقديم بلاغ صيانة جديد</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">نوع العطل:</label>
                <select
                  value={ticketCategory}
                  onChange={(e) => setTicketCategory(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs"
                >
                  <option value="كهرباء">كهرباء وإنارة</option>
                  <option value="سباكة">سباكة ومياه</option>
                  <option value="مصاعد">مصاعد</option>
                  <option value="نظافة">نظافة ومخلفات</option>
                  <option value="أمن">أمن وبوابات</option>
                  <option value="أخرى">أخرى</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">عنوان العطل:</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: صوت احتكاك بالمصعد عند الدور الثاني"
                  value={ticketTitle}
                  onChange={(e) => setTicketTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">درجة الأهمية:</label>
                <select
                  value={ticketUrgency}
                  onChange={(e) => setTicketUrgency(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs font-bold"
                >
                  <option value="عادي">عادي</option>
                  <option value="متوسط">متوسط</option>
                  <option value="عاجل">عاجل وطارئ</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">التفاصيل والمكان بدقة:</label>
                <textarea
                  rows={3}
                  value={ticketDescription}
                  onChange={(e) => setTicketDescription(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs"
                  placeholder="اكتب وصف المشكلة لمتابعتها فوراً مع الفني المختص..."
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-slate-100 mt-3">
              <button
                type="submit"
                className="flex-1 bg-[#0f2537] hover:bg-[#1a3852] text-white font-bold py-2 rounded-xl text-xs"
              >
                إرسال الطلب لإدارة العمارة
              </button>
              <button
                type="button"
                onClick={() => setIsTicketModalOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-medium"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Booking Modal */}
      {isBookingModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#0f2537]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleCreateBooking} className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200">
            <h3 className="font-bold text-sm text-slate-900 mb-3 pb-2 border-b">حجز مرفق بالعقار</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">المرفق المطلوب:</label>
                <select
                  value={bookingFacility}
                  onChange={(e) => setBookingFacility(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs font-bold"
                >
                  <option value="روف العمارة">روف العمارة (جلسة عائلية / مناسبة)</option>
                  <option value="شاحن السيارة الكهربائية">شاحن السيارة الكهربائية بالجراج</option>
                  <option value="غرفة الاجتماعات بالبدروم">قاعة الاجتماعات بالبدروم</option>
                  <option value="موقف الزوار">موقف سيارات الزوار</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">التاريخ المحدد:</label>
                <input
                  type="date"
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">الفترة الزمنية:</label>
                <select
                  value={bookingTimeSlot}
                  onChange={(e) => setBookingTimeSlot(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs"
                >
                  <option value="09:00 ص - 12:00 م">صباحاً (09:00 ص - 12:00 م)</option>
                  <option value="01:00 م - 04:00 م">ظهراً (01:00 م - 04:00 م)</option>
                  <option value="05:00 م - 09:00 م">مساءً (05:00 م - 09:00 م)</option>
                  <option value="09:00 م - 12:00 ص">ليلاً (09:00 م - 12:00 ص)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-slate-100 mt-3">
              <button
                type="submit"
                className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 rounded-xl text-xs"
              >
                تأكيد طلب الحجز
              </button>
              <button
                type="button"
                onClick={() => setIsBookingModalOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-medium"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
