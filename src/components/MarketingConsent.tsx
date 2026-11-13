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

// Persist only the explicit choice made during signup; existing accounts are
// never prompted or subscribed automatically when they sign in.
export function MarketingSignupConsentSync() {
  const { user, isLoading, isPasswordRecovery } = useAuth();
  useEffect(() => {
    if (!isNeonBackend || !user?.email || isLoading || isPasswordRecovery) return;
    const key = pendingKey(user.email);
    let pending: string | null;
    try { pending = sessionStorage.getItem(key); } catch { return; }
    if (pending !== 'yes' && pending !== 'no') return;
    let active = true;
    void readChoice().then(async choice => {
      if (!active) return;
      if (choice === 'unknown') await writeChoice(pending === 'yes');
      if (active) {
        try { sessionStorage.removeItem(key); } catch { /* optional */ }
      }
    }).catch(() => { /* Retain the signup choice for a later attempt. */ });
    return () => { active = false; };
  }, [user?.id, user?.email, isLoading, isPasswordRecovery]);
  return null;
}

export function MarketingPreferenceSettings() {
  const { user } = useAuth();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!isNeonBackend || !user?.email) return;
    let active = true;
    void readChoice().then(value => { if (active) { setChoice(value); setError(''); } }).catch((failure)=>{ if (active) setError('تعذر تحميل حالة الموافقة: ' + (failure instanceof Error ? failure.message : String(failure))); });
    return () => { active = false; };
  }, [user?.id, user?.email, retry]);
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
    {error && <p role="alert" className="text-sm text-rose-700">{error} <button type="button" className="underline" onClick={()=>setRetry(x=>x+1)}>إعادة المحاولة</button></p>}
    {choice && <p className="text-xs text-slate-500">{choice === 'subscribed' ? 'أنت مشترك في رسائل العروض.' : 'لن نرسل لك عروضًا تسويقية.'}</p>}
  </div>;
}
