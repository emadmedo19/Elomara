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
export const hasPlayBilling = () => isNeonBackend && Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('PlayBilling');
export async function billingRequest(buildingId: string, action: 'context' | 'verify' | 'refresh', token?: string) {
  const { data, error } = await supabase.functions.invoke('play-billing', { body: { buildingId, action, ...(token ? { token } : {}) } });
  if (error || data?.error) throw new Error(data?.error || 'تعذر الاتصال بخدمة الاشتراكات. حاول مرة أخرى.');
  return data as { available?: boolean; accountId: string; profileId: string; verified?: boolean; pending?: boolean };
}
