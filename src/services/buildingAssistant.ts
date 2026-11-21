import type { Announcement, Apartment, Building, Expense, FacilityBooking, MaintenanceTicket, Payment } from '../types';
import { calculateApartmentFinancials, classifyApartmentPayment } from './financialAccounting';

export interface BuildingAssistantData {
  building: Building;
  apartments: Apartment[];
  payments: Payment[];
  expenses: Expense[];
  tickets: MaintenanceTicket[];
  bookings: FacilityBooking[];
  announcements: Announcement[];
}

const paymentLabels = {
  paid: 'سددت بالكامل',
  unpaid: 'لم تسدد أي مبلغ',
  partial: 'سددت جزءًا من المستحق',
  unconfigured: 'لم تحدد لها مستحقات',
};

function paymentRows(data: BuildingAssistantData) {
  return data.apartments.filter(apt => apt.buildingId === data.building.id).map(apt => {
    const payments = data.payments.filter(payment => payment.buildingId === data.building.id && payment.apartmentId === apt.id);
    const totals = calculateApartmentFinancials(apt, payments);
    return {
      unit: apt.unitNumber,
      name: apt.residentName,
      state: classifyApartmentPayment(totals),
      due: totals.totalDue,
      paid: totals.totalPaid,
      remaining: totals.remaining,
    };
  });
}

export function answerBuildingQuestion(question: string, data: BuildingAssistantData): string | undefined {
  const text = question.replace(/[أإآ]/g, 'ا').replace(/[؟?!،.]/g, '').trim();
  if (/^(?:(?:كام|كم) )?(?:رصيد الخزين[هة]|الخزين[هة] فيها كام)$/.test(text)) {
    return `رصيد خزينة العمارة الحالي ${data.building.balance.toLocaleString('ar-EG')} ج.م.`;
  }

  if (/^(?:كام|كم|اجمالي|مجموع) (?:المصروفات|مصروفات العمارة)$/.test(text)) {
    const expenses = data.expenses.filter(row => row.buildingId === data.building.id);
    const total = expenses.reduce((sum, row) => sum + row.amount, 0);
    const historical = data.building.historicalExpensesTotal || 0;
    return `إجمالي المصروفات المسجلة ${total.toLocaleString('ar-EG')} ج.م في ${expenses.length} سجل.`
      + (historical ? ` المصروفات السابقة المسجلة كرصيد افتتاحي: ${historical.toLocaleString('ar-EG')} ج.م.` : '');
  }

  const match = /^(?:عاوز اعرف |ممكن تقولي )?(?:(?:كام|كم) (?:شقه|شقة|وحده|وحدة) |مين |من )(?:اللي )?(?:(مس+د+ت?ش|ما ?سددت?ش|لم يسدد|لم تسدد|لسه ما ?سددت?ش|عليه مستحقات)|(سددت?( بالكامل)?|دفعت?))(?: و(?:مين|من) (?:اللي )?(سددت?|مس+د+ت?ش))?$/.exec(text);
  if (!match) return undefined;

  const showBoth = Boolean(match[4]);
  const states: Array<keyof typeof paymentLabels> = showBoth ? ['paid', 'unpaid', 'partial']
    : match[1] ? ['unpaid', 'partial'] : match[3] ? ['paid'] : ['paid', 'partial'];
  const rows = paymentRows(data);
  if (!rows.length) return 'لا توجد شقق مسجلة للعمارة الحالية.';
  return [
    'حسب سجل التحصيل الحالي للعمارة:',
    ...(match[1] ? [`عدد الشقق اللي لسه عليها مستحقات: ${rows.filter(row => row.remaining > 0).length}.`] : []),
    ...states.map(state => {
      const matching = rows.filter(row => row.state === state);
      const names = matching.map(row => `شقة ${row.unit}${row.name ? ` (${row.name})` : ''}`);
      return `${paymentLabels[state]}: ${matching.length} شقة${names.length ? ` — ${names.join('، ')}` : ''}.`;
    }),
  ].join('\n');
}

export function buildingAssistantContext(data: BuildingAssistantData): string {
  const { building } = data;
  const rows = paymentRows(data).map(({ name: _name, ...row }) => row);
  const recent = <T extends { date: string }>(items: T[]) =>
    [...items].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const expenses = data.expenses.filter(row => row.buildingId === building.id);
  const tickets = data.tickets.filter(row => row.buildingId === building.id);
  const bookings = data.bookings.filter(row => row.buildingId === building.id);
  const announcements = data.announcements.filter(row => row.buildingId === building.id);
  const payments = data.payments.filter(row => row.buildingId === building.id && !row.isAssessment);
  return JSON.stringify({
    balance: building.balance,
    monthlyTarget: building.monthlyTarget,
    reserveFund: building.reserveFund,
    collectionStartMonth: building.collectionStartMonth,
    registeredUnits: rows.length,
    paymentCounts: Object.fromEntries(Object.keys(paymentLabels).map(state => [state, rows.filter(row => row.state === state).length])),
    paymentStateLabels: paymentLabels,
    totalDue: rows.reduce((sum, row) => sum + row.due, 0),
    totalRemaining: rows.reduce((sum, row) => sum + row.remaining, 0),
    unitsShown: rows.slice(0, 30),
    historicalExpenses: building.historicalExpensesTotal || 0,
    expensesTotal: expenses.reduce((sum, row) => sum + row.amount, 0),
    expenseCount: expenses.length,
    ticketCount: tickets.length,
    bookingCount: bookings.length,
    announcementCount: announcements.length,
    recentExpenses: recent(expenses).map(({ category, amount, date }) => ({ category, amount, date })),
    recentPayments: recent(payments).map(({ unitNumber, amount, date, month, paymentType }) => ({ unitNumber, amount, date, month: month.slice(0, 32), paymentType })),
    recentTickets: recent(tickets).map(({ unitNumber, category, urgency, status, date }) => ({ unitNumber, category, urgency, status, date })),
    recentBookings: recent(bookings).map(({ facility, date, timeSlot, status }) => ({ facility, date, timeSlot, status })),
    recentAnnouncements: recent(announcements).map(({ type, date }) => ({ type, date })),
  });
}
