export interface PaymentAccount { name: string; account: string; }
export const MAX_PAYMENT_ACCOUNTS = 10;
// Old installations save one destination in bankAccountName/bankAccountNumber.
// Keep it first, then include the manager's explicitly configured extra entries.
export function getPaymentAccounts(value: unknown): PaymentAccount[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const settings = value as Record<string, unknown>;
  const candidates: unknown[] = [
    { name: settings.bankAccountName || 'وسيلة الدفع', account: settings.bankAccountNumber },
    ...(Array.isArray(settings.paymentAccounts) ? settings.paymentAccounts.slice(0, MAX_PAYMENT_ACCOUNTS) : []),
  ];
  const seen = new Set<string>();
  return candidates.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string,unknown>;
    if (typeof item.name !== 'string' || typeof item.account !== 'string') return [];
    const name = item.name.trim(), account = item.account.trim();
    if (!name || !account || name.length > 80 || account.length > 200) return [];
    const key = `${name.toLowerCase()}:${account.toLowerCase()}`;
    if (seen.has(key)) return [];
    seen.add(key); return [{name,account}];
  });
}
