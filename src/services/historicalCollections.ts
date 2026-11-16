/** Allocate previously paid monthly dues from the oldest period; no writes here. */
export interface HistoricalMonthlyAllocation { month: string; amount: number; status: 'paid' | 'partial' }
const validMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const cents = (value: number) => Math.round(value * 100);
const collectionMonthFormatter = new Intl.DateTimeFormat('en', {timeZone:'Africa/Cairo',year:'numeric',month:'2-digit'});
export function currentCollectionMonth(now = new Date()): string {
  const parts = collectionMonthFormatter.formatToParts(now);
  return `${parts.find(p=>p.type==='year')!.value}-${parts.find(p=>p.type==='month')!.value}`;
}
export function historicalDueMonths(start?: string, throughMonth = currentCollectionMonth()): number {
  if (!start || !validMonth(start) || !validMonth(throughMonth) || start > throughMonth) return 0;
  const [sy,sm]=start.split('-').map(Number),[ey,em]=throughMonth.split('-').map(Number);
  return (ey-sy)*12+em-sm+1;
}
export function allocateHistoricalMonthlyPayments(startMonth: string, monthlyFee: number, paidAmount: number, throughMonth: string): { allocations: HistoricalMonthlyAllocation[]; unallocatedCredit: number } {
  if (!validMonth(startMonth) || !validMonth(throughMonth) || startMonth > throughMonth) throw new Error('راجع شهر بداية التحصيل ونهاية الفترة');
  if (!Number.isFinite(monthlyFee) || monthlyFee <= 0 || Math.abs(cents(monthlyFee) - monthlyFee * 100) > 0.00001) throw new Error('الاشتراك الشهري غير صالح');
  if (!Number.isFinite(paidAmount) || paidAmount < 0 || Math.abs(cents(paidAmount) - paidAmount * 100) > 0.00001) throw new Error('المبلغ المسدد غير صالح');
  const fee = cents(monthlyFee); let remaining = cents(paidAmount);
  const [sy, sm] = startMonth.split('-').map(Number); const [ey, em] = throughMonth.split('-').map(Number);
  const allocations: HistoricalMonthlyAllocation[] = [];
  for (let i = sy * 12 + sm - 1; i <= ey * 12 + em - 1 && remaining > 0; i++) {
    const amount = Math.min(fee, remaining);
    allocations.push({ month: `${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`, amount: amount / 100, status: amount === fee ? 'paid' : 'partial' });
    remaining -= amount;
  }
  return { allocations, unallocatedCredit: remaining / 100 };
}
