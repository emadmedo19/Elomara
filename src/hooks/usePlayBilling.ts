import { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { billingRequest, hasPlayBilling, PlayBilling, type PlayProduct, type PlayPurchase } from '../services/playBilling';

export function usePlayBilling(buildingId: string | undefined, open: boolean, refresh: () => Promise<void>) {
  const [products, setProducts] = useState<PlayProduct[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    setProducts([]); setReady(false); setMessage('');
    if (!buildingId || !open || !hasPlayBilling()) return;
    let disposed = false;
    const handles: Array<{ remove(): Promise<void> }> = [];
    const verify = async (purchases: PlayPurchase[]) => {
      let failures = 0;
      for (const purchase of purchases) {
        try { await billingRequest(buildingId, 'verify', purchase.token); }
        catch { failures++; }
      }
      if (!disposed) {
        if (failures) setMessage('بعض المشتريات لم يتم التحقق منها لهذه العمارة. أعد محاولة الاستعادة من حساب المدير الذي اشترى الاشتراك.');
        await refresh();
      }
    };
    const restore = async () => {
      try {
        await billingRequest(buildingId, 'refresh');
        await verify((await PlayBilling.restore()).purchases);
      } catch { if (!disposed) setMessage('تعذر تحديث اشتراك Google Play. حاول الاستعادة مرة أخرى.'); }
    };
    void (async () => {
      try {
        const context = await billingRequest(buildingId, 'context');
        if (!context.available || disposed) return;
        const catalog = await PlayBilling.catalog();
        if (disposed) return;
        setProducts(catalog.products); setReady(true);
        const purchaseListener = await PlayBilling.addListener('purchasesUpdated', data => { void verify(data.purchases); });
        if (disposed) { await purchaseListener.remove(); return; }
        handles.push(purchaseListener);
        const resumeListener = await App.addListener('appStateChange', state => { if (state.isActive) void restore(); });
        if (disposed) { await resumeListener.remove(); return; }
        handles.push(resumeListener);
        await restore();
      } catch { if (!disposed) setMessage('الشراء متاح لمدير العمارة من نسخة Google Play بعد تجهيز الخدمة.'); }
    })();
    return () => { disposed = true; for (const handle of handles) void handle.remove(); };
  }, [buildingId, open, refresh]);
  const purchase = async (product: PlayProduct) => {
    if (!buildingId || busy) return;
    setBusy(true); setMessage('');
    try {
      const context = await billingRequest(buildingId, 'context');
      if (!context.available) throw new Error('خدمة الاشتراك غير متاحة حاليًا.');
      const result = await PlayBilling.purchase({ productId: product.productId, offerToken: product.offerToken, accountId: context.accountId, profileId: context.profileId });
      // The native event also covers purchases completed after the original call or app restart.
      for (const item of result.purchases) await billingRequest(buildingId, 'verify', item.token);
      await refresh();
      setMessage(result.purchases.some(p => p.pending) ? 'الدفعة قيد الانتظار. يتم التفعيل بعد تأكيد Google Play.' : 'تم تحديث الاشتراك بعد التحقق من Google Play.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'تعذر إتمام الشراء.'); }
    finally { setBusy(false); }
  };
  const restore = async () => {
    if (!buildingId || busy) return;
    setBusy(true); setMessage('');
    try {
      await billingRequest(buildingId, 'refresh');
      const { purchases } = await PlayBilling.restore();
      let verified = 0;
      for (const item of purchases) {
        try { await billingRequest(buildingId, 'verify', item.token); verified++; } catch { /* Other buildings/accounts must never be rebound. */ }
      }
      await refresh();
      setMessage(verified ? 'تم التحقق من مشتريات هذه العمارة.' : 'تم تحديث الحالة. لا توجد مشتريات قابلة للاستعادة لهذا المدير وهذه العمارة.');
    } catch { setMessage('تعذر استعادة المشتريات. حاول مرة أخرى.'); }
    finally { setBusy(false); }
  };
  return { products, ready, busy, message, purchase, restore,
    manage: () => Browser.open({ url: 'https://play.google.com/store/account/subscriptions?package=app.bunyan.residential' }) };
}
