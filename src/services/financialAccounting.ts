import { Apartment, Payment, PaymentStatus } from '../types';

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

/** Monthly dues and exceptional assessments have independent receipt allocations.
 * Monthly advance credit never hides an unpaid exceptional assessment.
 */
export function calculateApartmentFinancials(
  apartment: Apartment,
  payments: Payment[],
  periodMonth?: string
): ApartmentFinancials {
  const allRows = payments.filter(p => p.apartmentId === apartment.id);
  const aptPayments = allRows.filter(p => !p.isAssessment && p.paymentType !== 'exceptional');
  
  // Filter by period month if provided, otherwise consider all/relevant payments
  const relevantPayments = periodMonth
    ? aptPayments.filter((p) => p.month === periodMonth)
    : aptPayments;

  // The receipt ledger is authoritative, including an empty ledger after deletion.
  // A cached apartment summary must not resurrect a deleted receipt.
  const monthlyPaid = relevantPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

  // Calculate total dues:
  // If apartment has overdue months > 0, total dues is monthlyFee * overdueMonths
  // Otherwise, single month due = monthlyFee
  const dueMonthsCount = apartment.overdueMonths && apartment.overdueMonths > 0 
    ? apartment.overdueMonths 
    : 1;
  const monthlyDue = apartment.monthlyFee * dueMonthsCount;
  // Exceptional receipts settle their own assessment, never monthly subscriptions.
  // Assessments remain outstanding until their linked receipts are recorded.
  const charges = allRows.filter(p => p.isAssessment && (!periodMonth || p.month === periodMonth));
  const exceptionalPaid = charges.reduce((sum, charge) => sum + allRows
    .filter(p => !p.isAssessment && p.exceptionalChargeId === charge.id)
    .reduce((paid, p) => paid + Number(p.amount || 0), 0), 0);
  const exceptionalDue = charges.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const totalDue = monthlyDue + exceptionalDue;
  const totalPaid = monthlyPaid + exceptionalPaid;

  // Strict mathematical formulas
  const remaining = Math.max(0, monthlyDue - monthlyPaid) + Math.max(0, exceptionalDue - exceptionalPaid);
  const creditBalance = Math.max(0, monthlyPaid - monthlyDue);

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
    allPayments: allRows.filter(p => !p.isAssessment),
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
