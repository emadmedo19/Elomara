import { supabase } from '../lib/supabase';
import type { Apartment, Expense, Payment, PaymentAuditLog } from '../types';

export function mapPayment(row: Record<string, unknown>): Payment {
  return { id: String(row.id), apartmentId: String(row.apartment_id), buildingId: String(row.building_id),
    unitNumber: String(row.unit_number || ''), residentName: String(row.resident_name || ''), amount: Number(row.amount),
    date: String(row.payment_date), month: String(row.month), method: String(row.method), notes: String(row.notes || ''),
    receiptNumber: String(row.receipt_number || ''), recordedAt: String(row.recorded_at || ''),
    paymentType: row.payment_type === 'exceptional' ? 'exceptional' : 'monthly', isAssessment: Boolean(row.is_assessment),
    assessmentCancelled: Boolean(row.assessment_cancelled), exceptionalChargeId: row.exceptional_charge_id ? String(row.exceptional_charge_id) : undefined };
}
export function mapExpense(row: Record<string, unknown>): Expense {
  return { id: String(row.id), buildingId: String(row.building_id), title: String(row.title), category: row.category as Expense['category'],
    amount: Number(row.amount), date: String(row.expense_date), vendor: String(row.vendor || ''), notes: String(row.notes || ''),
    receiptUrl: String(row.receipt_url || ''), approvedBy: String(row.approved_by || '') };
}
export function mapAudit(row: Record<string, unknown>): PaymentAuditLog {
  const before = row.previous_data as Record<string, unknown> | null;
  const after = row.new_data as Record<string, unknown> | null;
  return { id: String(row.id), buildingId: String(row.building_id), paymentId: String(row.entity_id),
    apartmentId: String(row.apartment_id || ''), unitNumber: `${row.entity_type === 'expense' ? 'مصروف: ' : ''}${row.unit_number || ''}`,
    action: row.action as PaymentAuditLog['action'], timestamp: String(row.created_at), performedBy: String(row.performed_by_name),
    previousData: before ? { amount: Number(before.amount) } : undefined, newData: after ? { amount: Number(after.amount) } : undefined,
    notes: row.entity_type === 'expense' ? String(after?.title || before?.title || '') : String(after?.notes || before?.notes || '') };
}
export interface FinancialMutationResult {
  entry: Record<string, unknown> | null;
  apartment: Record<string, unknown> | null;
  balance: number;
}
export async function mutateFinancialEntry(kind: 'payment' | 'expense', action: 'create' | 'update' | 'delete', buildingId: string,
  entryId: string | null, values: object = {}, requestId: string = crypto.randomUUID()): Promise<FinancialMutationResult> {
  const { data, error } = await supabase.rpc('mutate_financial_entry', {
    p_kind: kind, p_action: action, p_building_id: buildingId, p_entry_id: entryId, p_values: values, p_request_id: requestId,
  });
  if (error) throw new Error(error.message || 'تعذر تأكيد الحفظ. بيانات النموذج محفوظة للمحاولة مرة أخرى.');
  if (!data || !Number.isFinite(Number(data.balance))) throw new Error('تعذر تأكيد نتيجة العملية. حدّث البيانات قبل المحاولة مرة أخرى.');
  return data as FinancialMutationResult;
}
export function mergeFinancialApartment(apt: Apartment, row: Record<string, unknown>): Apartment {
  return { ...apt, paidAmount: Number(row.paid_amount), creditBalance: Number(row.credit_balance), status: row.payment_status as Apartment['status'],
    overdueMonths: Number(row.overdue_months), lastPaymentDate: row.last_payment_date ? String(row.last_payment_date) : undefined };
}
