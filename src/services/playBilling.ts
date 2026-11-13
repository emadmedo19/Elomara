import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { isNeonBackend } from '../lib/neon';
export interface PlayProduct { productId: string; basePlanId: string; price: string; offerToken: string }
export interface PlayPurchase { token: string; pending: boolean }
interface PlayBillingPlugin {
  catalog(): Promise<{ products: PlayProduct[] }>;
  purchase(options: { productId: string; offerToken: string; accountId: string; profileId: string }): Promise<{ purchases: PlayPurchase[] }>;
  restore(): Promise<{ purchases: PlayPurchase[] }>;
  addListener(event: 'purchasesUpdated', callback: (data: { purchases: PlayPurchase[] }) => void): Promise<PluginListenerHandle>;
}
export const PlayBilling = registerPlugin<PlayBillingPlugin>('PlayBilling');
export function playBillingUnavailableMessage(): string | null {
  if (Capacitor.getPlatform() !== 'android') return 'الاشتراك متاح من تطبيق أندرويد المثبّت من Google Play.';
  if (!isNeonBackend || !Capacitor.isPluginAvailable('PlayBilling')) return 'حدّث التطبيق من Google Play؛ النسخة المثبّتة حاليًا لا تدعم شراء الاشتراكات.';
  return null;
}
export const hasPlayBilling = () => playBillingUnavailableMessage() === null;
export async function billingRequest(buildingId: string, action: 'context' | 'verify' | 'refresh', token?: string) {
  const { data, error } = await supabase.functions.invoke('play-billing', { body: { buildingId, action, ...(token ? { token } : {}) } });
  if (error || data?.error) {
    const status = error && 'context' in error && error.context instanceof Response ? error.context.status : undefined;
    if (status === 401) throw new Error('تعذر تأكيد تسجيل الدخول. سجّل الدخول مجددًا ثم أعد تحميل الباقات.');
    if (status === 403) throw new Error('شراء اشتراك العمارة متاح لمدير العمارة المعتمد فقط. السكان يستخدمون التطبيق مجانًا.');
    throw new Error('تعذر الاتصال بخدمة الاشتراكات. حاول إعادة تحميل الباقات.');
  }
  return data as { available?: boolean; accountId: string; profileId: string; verified?: boolean; pending?: boolean };
}
