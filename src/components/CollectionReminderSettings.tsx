import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const settingKey = 'collection_reminders';
const defaults = { day: 5, before: false, after: false };

export function CollectionReminderSettings({ buildingId, collectionStartMonth }: {
  buildingId: string;
  collectionStartMonth?: string;
}) {
  const [preferences, setPreferences] = useState(defaults);
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'unavailable'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data, error } = await supabase.from('app_settings').select('setting_value')
          .eq('building_id', buildingId).eq('setting_key', settingKey).maybeSingle();
        if (error) throw error;
        if (!active) return;
        const saved = data?.setting_value;
        setPreferences({
          day: Number.isInteger(saved?.day) && saved.day >= 2 && saved.day <= 28 ? saved.day : defaults.day,
          before: saved?.before === true,
          after: saved?.after === true,
        });
        setStatus('ready');
      } catch {
        if (!active) return;
        setStatus('unavailable');
        setMessage('تعذر تحميل إعدادات تذكير هذه العمارة.');
      }
    }
    void load();
    return () => { active = false; };
  }, [buildingId]);

  async function save() {
    setStatus('saving');
    setMessage('');
    try {
      const { error } = await supabase.from('app_settings').upsert({
        building_id: buildingId,
        setting_key: settingKey,
        setting_value: preferences,
      }, { onConflict: 'building_id,setting_key' });
      if (error) throw error;
      setMessage('تم حفظ تذكيرات الاشتراك لهذه العمارة.');
    } catch {
      setMessage('تعذر حفظ تذكيرات الاشتراك. حاول مرة أخرى.');
    } finally {
      setStatus('ready');
    }
  }

  return (
    <fieldset disabled={status !== 'ready'} className="space-y-2 rounded-2xl border border-slate-200 p-3 text-xs">
      <legend className="px-1 font-bold text-slate-800">تذكيرات الاشتراك الشهرية</legend>
      <label className="flex items-center justify-between gap-2">
        <span>موعد السداد للتذكيرات</span>
        <select value={preferences.day} onChange={event => setPreferences({ ...preferences, day: Number(event.target.value) })} className="rounded-lg border bg-white px-2 py-1">
          {Array.from({ length: 27 }, (_, index) => index + 2).map(day => <option key={day} value={day}>يوم {day} من الشهر</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={preferences.before} onChange={event => setPreferences({ ...preferences, before: event.target.checked })} />
        تذكير قبل الموعد بيوم للشقق اللي عليها مستحقات
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={preferences.after} onChange={event => setPreferences({ ...preferences, after: event.target.checked })} />
        تذكير للمتأخرين بعد الموعد
      </label>
      {!collectionStartMonth && <p className="text-amber-800">حدد شهر بداية التحصيل من إدارة العقار عشان يبدأ الحساب الشهري وتشتغل التذكيرات.</p>}
      {status === 'loading' && <p role="status">جارٍ تحميل إعدادات التذكير…</p>}
      {message && <p role="status">{message}</p>}
      <button type="button" className="min-h-10 rounded-xl bg-teal-700 px-3 font-bold text-white disabled:opacity-50" onClick={() => void save()}>
        {status === 'saving' ? 'جارٍ الحفظ…' : 'حفظ إعدادات التذكير'}
      </button>
    </fieldset>
  );
}
