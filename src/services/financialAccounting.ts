import { Apartment, Payment, PaymentStatus, Building } from '../types';

export interface ApartmentFinancials {
  apartmentId: string;
  unitNumber: string;
  residentName: string;
  monthlyFee: number;
  overdueMonths: number;
  totalDue: number;
  totalPaid: number;
  remaining: number;
  creditBalance: number;
  status: PaymentStatus;
  periodPayments: Payment[];
  allPayments: Payment[];
  lastPaymentDate?: string;
  advanceCreditOrigin?: {
    month: string;
    amount: number;
    paymentId?: string;
    receiptNumber?: string;
  };
}

export interface BuildingFinancials {
  buildingId: string;
  totalExpectedDues: number;
  totalCollected: number;
  totalRemaining: number;
  totalCreditBalance: number;
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
  totalUnits: number;
  collectionRate: number;
}

/**
 * Calculates standard and unified accounting financials for a single apartment.
 * Complies strictly with the fundamental equations:
 * 1. Total Dues = monthly fee * (overdueMonths || 1)
 * 2. Total Paid = sum of payments for apartment
 * 3. Remaining = max(0, Total Dues - Total Paid)
 * 4. Credit Balance = max(0, Total Paid - Total Dues)
 * 5. Status:
 *    - remaining === 0 => 'paid'
 *    - totalPaid > 0 && remaining > 0 => 'pending' (سداد جزئي)
 *    - totalPaid === 0 => (overdueMonths > 0 ? 'overdue' : 'pending')
 */
export function calculateApartmentFinancials(
  apartment: Apartment,
  payments: Payment[],
  periodMonth?: string
): ApartmentFinancials {
  const aptPayments = payments.filter((p) => p.apartmentId === apartment.id && p.paymentType !== 'exceptional');
  
  // Filter by period month if provided, otherwise consider all/relevant payments
  const relevantPayments = periodMonth
    ? aptPayments.filter((p) => p.month === periodMonth)
    : aptPayments;

  // The receipt ledger is authoritative, including an empty ledger after deletion.
  // A cached apartment summary must not resurrect a deleted receipt.
  const totalPaid = relevantPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

  // Calculate total dues:
  // If apartment has overdue months > 0, total dues is monthlyFee * overdueMonths
  // Otherwise, single month due = monthlyFee
  const dueMonthsCount = apartment.overdueMonths && apartment.overdueMonths > 0 
    ? apartment.overdueMonths 
    : 1;
  const totalDue = apartment.monthlyFee * dueMonthsCount;

  // Strict mathematical formulas
  const remaining = Math.max(0, totalDue - totalPaid);
  const creditBalance = Math.max(0, totalPaid - totalDue);

  // Status determination
  let status: PaymentStatus = 'pending';
  if (remaining === 0) {
    status = 'paid';
  } else if (totalPaid > 0 && remaining > 0) {
    status = 'pending';
  } else {
    status = apartment.overdueMonths && apartment.overdueMonths > 0 ? 'overdue' : 'pending';
  }

  // Latest payment date
  const lastPayment = relevantPayments.length > 0
    ? [...relevantPayments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
    : undefined;
  const lastPaymentDate = lastPayment?.date;

  // Track advance credit origin
  let advanceCreditOrigin;
  if (creditBalance > 0) {
    advanceCreditOrigin = {
      month: lastPayment?.month || periodMonth || 'أكتوبر 2024',
      amount: creditBalance,
      paymentId: lastPayment?.id,
      receiptNumber: lastPayment?.receiptNumber,
    };
  }

  return {
    apartmentId: apartment.id,
    unitNumber: apartment.unitNumber,
    residentName: apartment.residentName,
    monthlyFee: apartment.monthlyFee,
    overdueMonths: apartment.overdueMonths,
    totalDue,
    totalPaid,
    remaining,
    creditBalance,
    status,
    periodPayments: relevantPayments,
    allPayments: aptPayments,
    lastPaymentDate,
    advanceCreditOrigin,
  };
}

/**
 * Calculates aggregate financials for a building across all apartments.
 */
export function calculateBuildingFinancials(
  buildingId: string,
  apartments: Apartment[],
  payments: Payment[],
  periodMonth?: string
): BuildingFinancials {
  const buildingApts = apartments.filter(
    (a) => !a.buildingId || a.buildingId === buildingId
  );

  let totalExpectedDues = 0;
  let totalCollected = 0;
  let totalRemaining = 0;
  let totalCreditBalance = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let overdueCount = 0;

  buildingApts.forEach((apt) => {
    const fin = calculateApartmentFinancials(apt, payments, periodMonth);
    totalExpectedDues += fin.totalDue;
    totalCollected += fin.totalPaid;
    totalRemaining += fin.remaining;
    totalCreditBalance += fin.creditBalance;

    if (fin.status === 'paid') {
      paidCount++;
    } else if (fin.status === 'overdue') {
      overdueCount++;
    } else {
      pendingCount++;
    }
  });

  const totalUnits = buildingApts.length;
  const collectionRate = totalExpectedDues > 0
    ? Math.min(100, Math.round((totalCollected / totalExpectedDues) * 100))
    : 0;

  return {
    buildingId,
    totalExpectedDues,
    totalCollected,
    totalRemaining,
    totalCreditBalance,
    paidCount,
    pendingCount,
    overdueCount,
    totalUnits,
    collectionRate,
  };
}

/**
 * Reconciles apartment objects to ensure their state matches payments ledger.
 */
export function reconcileApartment(
  apartment: Apartment,
  payments: Payment[],
  periodMonth?: string
): Apartment {
  const fin = calculateApartmentFinancials(apartment, payments, periodMonth);
  return {
    ...apartment,
    paidAmount: fin.totalPaid,
    creditBalance: fin.creditBalance,
    status: fin.status,
    lastPaymentDate: fin.lastPaymentDate,
    overdueMonths: fin.remaining === 0 ? 0 : apartment.overdueMonths,
  };
}
