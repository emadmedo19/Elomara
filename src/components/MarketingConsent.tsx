import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { isNeonBackend } from '../lib/neon';

type Choice = 'unknown' | 'subscribed' | 'declined';
const pendingKey = (email: string) => 'elomara:marketing-signup:' + email.trim().toLowerCase();

async function readChoice(): Promise<Choice> {
  const { data, error } = await supabase.rpc('get_my_marketing_preference');
  if (error) throw error;
  if (data !== 'unknown' && data !== 'subscribed' && data !== 'declined') throw new Error('Invalid marketing preference');
  return data;
}
async function writeChoice(subscribe: boolean): Promise<Choice> {
  const { data, error } = await supabase.rpc('set_my_marketing_preference', { p_subscribe: subscribe });
  if (error) throw error;
  if (data !== 'subscribed' && data !== 'declined') throw new Error('Unable to save preference');
  return data;
}

export function MarketingConsentPrompt() {
  const { user, isLoading, isPasswordRecovery } = useAuth();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    setChoice(null); setError(''); setChecked(false);
    if (!isNeonBackend || !user?.email || isLoading || isPasswordRecovery) return;
    let active = true;
    const email = user.email;
    try { setChecked(sessionStorage.getItem(pendingKey(email)) === 'yes'); } catch { /* storage may be disabled */ }
    void readChoice().then(value => { if (active) setChoice(value); }).catch(() => {
      // Consent is optional: a temporary backend failure must not block login.
      if (active) setChoice(null);
    });
    return () => { active = false; };
  }, [user?.id, user?.email, isLoading, isPasswordRecovery]);
  if (!user || isLoading || isPasswordRecovery || choice !== 'unknown') return null;
  const save = async (subscribe: boolean) => {
    setBusy(true); setError('');
    try {
      const next = await writeChoice(subscribe);
      setChoice(next);
      try { if (user.email) sessionStorage.removeItem(pendingKey(user.email)); } catch { /* optional */ }
    } catch { setError('تعذر حفظ اختيارك. حاول مرة أخرى.'); }
    finally { setBusy(false); }
  };
  return <div dir="rtl" className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/70 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="marketing-consent-title" className="w-full max-w-md rounded-3xl bg-white p-6 text-slate-900 shadow-2xl">
      <h2 id="marketing-consent-title" className="mb-3 text-xl font-bold">تحب توصلك عروض العمارة؟</h2>
      <p className="mb-5 text-sm leading-7 text-slate-600">ممكن نبعتلك عروض الاشتراكات والخصومات على بريدك الإلكتروني. القرار اختياري ومش هيأثر على استخدام التطبيق، وتقدر تلغي موافقتك من الإعدادات في أي وقت.</p>
      <label className="mb-5 flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 h-5 w-5" checked={checked} onChange={e=>setChecked(e.target.checked)}/><span>أوافق على استقبال العروض والخصومات التسويقية عبر البريد الإلكتروني.</span></label>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p>}
      <div className="flex gap-3">
        <button type="button" disabled={busy} onClick={()=>void save(checked)} className="flex-1 rounded-xl bg-teal-700 px-4 py-3 font-bold text-white disabled:opacity-50">حفظ اختياري</button>
        <button type="button" disabled={busy} onClick={()=>void save(false)} className="rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-700 disabled:opacity-50">ليس الآن</button>
      </div>
    </section>
  </div>;
}

export function MarketingPreferenceSettings() {
  const { user } = useAuth();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!isNeonBackend || !user?.email) return;
    let active = true;
    void readChoice().then(value => { if (active) setChoice(value); }).catch(()=>{ if (active) setError('تعذر تحميل حالة الموافقة.'); });
    return () => { active = false; };
  }, [user?.id, user?.email]);
  if (!isNeonBackend || !user) return null;
  const save = async (value: boolean) => {
    setBusy(true); setError('');
    try { setChoice(await writeChoice(value)); }
    catch { setError('تعذر حفظ التغيير. حاول مرة أخرى.'); }
    finally { setBusy(false); }
  };
  return <div className="settings-panel">
    <h2 className="font-bold">العروض عبر البريد الإلكتروني</h2>
    <p className="text-sm leading-7">الموافقة اختيارية، ويمكنك إيقاف الرسائل التسويقية في أي وقت.</p>
    <label className="mt-3 flex items-center gap-3 text-sm">
      <input type="checkbox" checked={choice === 'subscribed'} disabled={busy || choice === null} onChange={e=>void save(e.target.checked)}/>
      أوافق على استقبال العروض والخصومات
    </label>
    {choice === null && !error && <p className="text-xs">جارٍ تحميل اختيارك...</p>}
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {choice && <p className="text-xs text-slate-500">{choice === 'subscribed' ? 'أنت مشترك في رسائل العروض.' : 'لن نرسل لك عروضًا تسويقية.'}</p>}
  </div>;
}
