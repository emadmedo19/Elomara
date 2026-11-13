import { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { billingRequest, playBillingUnavailableMessage, PlayBilling, type PlayProduct, type PlayPurchase } from '../services/playBilling';

export function usePlayBilling(buildingId: string | undefined, open: boolean, refresh: () => Promise<void>) {
  const [products, setProducts] = useState<PlayProduct[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setProducts([]); setReady(false); setMessage(''); setLoading(false);
    if (!open) return;
    if (!buildingId) { setMessage('اختار العمارة أولًا لعرض باقاتها.'); return; }
    const unavailable = playBillingUnavailableMessage();
    if (unavailable) { setMessage(unavailable); return; }
    setLoading(true);
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
        if (disposed) return;
        if (!context.available) { setMessage('الشراء غير متاح حاليًا. أعد تحميل الباقات بعد إتاحة الخدمة.'); return; }
        const catalog = await PlayBilling.catalog();
        if (disposed) return;
        setProducts(catalog.products); setReady(true);
        if (catalog.products.length === 0) setMessage('لم يعرض Google Play باقات لهذا الحساب. تأكد من تثبيت آخر نسخة من المتجر والانضمام للاختبار بنفس حساب Google، ثم أعد تحميل الباقات.');
        else if (catalog.products.length < 2) setMessage('لم تكتمل أسعار الباقات من Google Play. حاول إعادة تحميل الباقات.');
        const purchaseListener = await PlayBilling.addListener('purchasesUpdated', data => { void verify(data.purchases); });
        if (disposed) { await purchaseListener.remove(); return; }
        handles.push(purchaseListener);
        const resumeListener = await App.addListener('appStateChange', state => { if (state.isActive) void restore(); });
        if (disposed) { await resumeListener.remove(); return; }
        handles.push(resumeListener);
        await restore();
      } catch (error) {
        if (!disposed) setMessage(error instanceof Error && /[\u0600-\u06FF]/.test(error.message) ? error.message : 'تعذر تحميل الأسعار من Google Play. تأكد من اتصال الإنترنت وحساب المتجر، ثم أعد تحميل الباقات.');
      } finally { if (!disposed) setLoading(false); }
    })();
    return () => { disposed = true; for (const handle of handles) void handle.remove(); };
  }, [buildingId, open, refresh, attempt]);
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
  return { products, ready, busy, loading, message, purchase, restore, reload: () => setAttempt(value => value + 1),
    manage: () => Browser.open({ url: 'https://play.google.com/store/account/subscriptions?package=app.bunyan.residential' }) };
}
