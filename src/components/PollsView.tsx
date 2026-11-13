import { useSuccessFeedback } from './SuccessFeedback';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, Clock3, LockKeyhole, Plus, Send, ShieldCheck, Users, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

type PollOption = { id: string; poll_id: string; label: string; sort_order: number };
type PollResultOption = { id: string; label: string; votes: number; percentage: number };
type PollResult = {
  has_voted: boolean;
  is_closed: boolean;
  results_visible: boolean;
  participants_count: number | null;
  targeted_count: number | null;
  non_participants_count: number | null;
  turnout_percentage: number | null;
  options: PollResultOption[] | null;
};
type Poll = {
  id: string;
  building_id: string;
  question: string;
  description: string;
  starts_at: string;
  ends_at: string;
  status: 'active' | 'closed';
  show_results_before_close: boolean;
  created_at: string;
  options: PollOption[];
  result?: PollResult;
};

type Props = { buildingId: string; canManage: boolean };

const optionColors = ['#0d9488', '#2563eb', '#d97706', '#9333ea', '#e11d48', '#475569', '#65a30d', '#0891b2'];
const formatDate = (value: string) => new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const isEnded = (poll: Poll) => poll.status === 'closed' || new Date(poll.ends_at).getTime() <= Date.now();

export const PollsView: React.FC<Props> = ({ buildingId, canManage }) => {
  const success = useSuccessFeedback();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [optionText, setOptionText] = useState('موافق\nغير موافق');
  const [showResults, setShowResults] = useState(false);
  const [endsAt, setEndsAt] = useState(() => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16));
  const [residentFilter, setResidentFilter] = useState<'active' | 'ended' | 'participated'>('active');

  const loadPolls = useCallback(async () => {
    if (!buildingId) { setPolls([]); setLoading(false); return; }
    setLoading(true);
    setError('');
    const { data, error: pollsError } = await supabase
      .from('building_polls')
      .select('id,building_id,question,description,starts_at,ends_at,status,show_results_before_close,created_at')
      .eq('building_id', buildingId)
      .order('created_at', { ascending: false });
    if (pollsError) {
      setError('تعذر تحميل استطلاعات الرأي: ' + pollsError.message);
      setPolls([]);
      setLoading(false);
      return;
    }
    const rows = data || [];
    const ids = rows.map((row: any) => row.id);
    let options: PollOption[] = [];
    if (ids.length) {
      const { data: optionRows, error: optionsError } = await supabase
        .from('building_poll_options')
        .select('id,poll_id,label,sort_order')
        .in('poll_id', ids)
        .order('sort_order');
      if (optionsError) setError('تعذر تحميل اختيارات الاستطلاعات: ' + optionsError.message);
      else options = (optionRows || []) as PollOption[];
    }
    const withResults = await Promise.all(rows.map(async (row: any) => {
      const { data: result, error: resultError } = await supabase.rpc('get_building_poll_results', { p_poll_id: row.id });
      if (resultError) console.warn('[Poll results]', resultError.message);
      return {
        ...row,
        options: options.filter(option => option.poll_id === row.id),
        result: resultError ? undefined : result as PollResult,
      } as Poll;
    }));
    setPolls(withResults);
    setLoading(false);
  }, [buildingId]);

  useEffect(() => { void loadPolls(); }, [loadPolls]);

  const notifyResidents = async (pollId: string) => {
    const { error: pushError } = await supabase.functions.invoke('send-poll-push', { body: { poll_id: pollId } });
    if (pushError) {
      console.warn('[Poll push]', pushError.message);
      setNotice('تم إنشاء الاستطلاع، لكن تعذر إرسال إشعار الموبايل حاليًا.');
    } else {
      setNotice('تم نشر الاستطلاع وإرسال طلب الإشعار للأعضاء.');
    }
  };

  const createPoll = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(''); setNotice('');
    const options = Array.from(new Set(optionText.split('\n').map(value => value.trim()).filter(Boolean)));
    if (question.trim().length < 5) { setError('اكتب سؤالًا واضحًا لا يقل عن 5 أحرف.'); return; }
    if (options.length < 2 || options.length > 8) { setError('أضف من اختيارين إلى 8 اختيارات، كل اختيار في سطر.'); return; }
    const end = new Date(endsAt);
    if (Number.isNaN(end.getTime()) || end.getTime() <= Date.now()) { setError('حدد موعد انتهاء في المستقبل.'); return; }
    setBusy(true);
    const { data: pollId, error: createError } = await supabase.rpc('create_building_poll', {
      p_building_id: buildingId,
      p_question: question.trim(),
      p_description: description.trim(),
      p_options: options,
      p_ends_at: end.toISOString(),
      p_show_results_before_close: showResults,
    });
    if (createError || !pollId) {
      setBusy(false);
      setError('تعذر إنشاء الاستطلاع: ' + (createError?.message || 'لم يتم تأكيد الحفظ'));
      return;
    }
    setQuestion(''); setDescription(''); setOptionText('موافق\nغير موافق');
    setBusy(false);
    await notifyResidents(pollId);
    await loadPolls();
  };

  const castVote = async (pollId: string, optionId: string) => {
    if (!canManage) success.prepare();
    setBusy(true); setError(''); setNotice('');
    const { error: voteError } = await supabase.rpc('cast_building_poll_vote', {
      p_poll_id: pollId, p_option_id: optionId,
    });
    setBusy(false);
    if (voteError) {
      setError(voteError.message.includes('already voted') ? 'سبق لك المشاركة في هذا الاستطلاع.' : 'تعذر تسجيل التصويت: ' + voteError.message);
      return;
    }
    setNotice('تم تسجيل صوتك بسرية تامة. لا يمكن لأي شخص معرفة اختيارك.');
    if (!canManage) success.show({ title: 'تم تسجيل صوتك بنجاح', description: 'شكرًا لمشاركتك في قرارات العمارة. اختيارك يظل سريًا.' });
    await loadPolls();
  };

  const closePoll = async (pollId: string) => {
    if (!window.confirm('هل تريد إنهاء الاستطلاع الآن؟ لن يمكن التصويت بعد الإغلاق.')) return;
    setBusy(true); setError('');
    const { error: closeError } = await supabase.rpc('close_building_poll', { p_poll_id: pollId });
    setBusy(false);
    if (closeError) setError('تعذر إغلاق الاستطلاع: ' + closeError.message);
    else { setNotice('تم إغلاق الاستطلاع وحفظ نتائجه في الأرشيف.'); await loadPolls(); }
  };

  const managePoll = async (poll: Poll, remove: boolean) => {
    let question: string | null = poll.question;
    let description: string | null = poll.description;
    if (remove) {
      if (!window.confirm('حذف هذا القرار والتصويت ونتائجه نهائيًا؟')) return;
    } else {
      question = window.prompt('عنوان القرار (التعديل متاح قبل أول مشاركة):', poll.question);
      if (question === null) return;
      description = window.prompt('تفاصيل القرار:', poll.description);
      if (description === null) return;
      if (question.trim().length < 5 || question.trim().length > 300) { setError('عنوان القرار يجب أن يكون بين 5 و300 حرف.'); return; }
    }
    setBusy(true); setError('');
    try {
      const { error } = await supabase.rpc('manage_building_poll', { p_poll_id: poll.id, p_remove: remove, p_question: question, p_description: description });
      if (error) { setError(error.message.includes('Voting has started') ? 'بدأت المشاركة بالفعل. أنشئ قرارًا جديدًا للحفاظ على صحة الأصوات.' : 'تعذر حفظ التغيير. حاول مرة أخرى.'); return; }
      setNotice(remove ? 'تم حذف القرار والتصويت.' : 'تم تعديل القرار.');
      await loadPolls();
    } catch { setError('تعذر الاتصال. حاول مرة أخرى.'); }
    finally { setBusy(false); }
  };

  const visiblePolls = useMemo(() => {
    if (canManage) return polls;
    if (residentFilter === 'participated') return polls.filter(poll => poll.result?.has_voted);
    if (residentFilter === 'ended') return polls.filter(isEnded);
    return polls.filter(poll => !isEnded(poll));
  }, [polls, canManage, residentFilter]);

  return (
    <div data-tour="polls-page" dir="rtl" className="space-y-4">
      {success.feedback}
      <div className="rounded-3xl border border-teal-100 bg-gradient-to-l from-[#0f2d3d] to-[#164e63] p-5 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-white/10 p-3"><BarChart3 className="h-6 w-6" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black">استطلاعات الرأي</h2>
            <p className="mt-1 text-xs text-teal-100">{canManage ? 'أنشئ استطلاعًا وتابع النتائج الإجمالية بسرية كاملة.' : 'شارك برأيك، وصوتك يظل سريًا ولا يظهر اختيارك لأي شخص.'}</p>
          </div>
          <ShieldCheck className="h-6 w-6 shrink-0 text-teal-200" />
        </div>
      </div>

      {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {notice && <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

      {canManage && (
        <form onSubmit={createPoll} className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-2"><h3 className="font-black text-slate-800">إنشاء استطلاع جديد</h3><span className="rounded-full bg-teal-50 px-3 py-1 text-[11px] font-bold text-teal-800">لجميع السكان المعتمدين</span></div>
          <label className="block text-xs font-bold text-slate-600">موضوع / سؤال الاستطلاع
            <input required minLength={5} maxLength={300} data-tour="poll-question" value={question} onChange={event => setQuestion(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-teal-500" placeholder="مثال: هل توافق على تركيب كاميرات للمداخل؟" />
          </label>
          <label className="block text-xs font-bold text-slate-600">تفاصيل إضافية (اختياري)
            <textarea maxLength={1500} rows={2} value={description} onChange={event => setDescription(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-teal-500" placeholder="وضح أي تفاصيل تساعد السكان على اتخاذ القرار..." />
          </label>
          <label className="block text-xs font-bold text-slate-600">الاختيارات (كل اختيار في سطر مستقل)
            <textarea required rows={3} data-tour="poll-options" value={optionText} onChange={event => setOptionText(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm leading-7 outline-none focus:border-teal-500" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-slate-600">موعد انتهاء التصويت
              <input required type="datetime-local" min={new Date().toISOString().slice(0,16)} value={endsAt} onChange={event => setEndsAt(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" />
            </label>
            <label className="flex items-center gap-2 self-end rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-700">
              <input type="checkbox" checked={showResults} onChange={event => setShowResults(event.target.checked)} className="h-4 w-4 accent-teal-700" />
              إظهار النتائج الإجمالية أثناء التصويت
            </label>
          </div>
          <button disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 font-bold text-white transition hover:bg-teal-800 disabled:opacity-50"><Plus className="h-4 w-4" />{busy ? 'جارٍ الحفظ...' : 'إنشاء الاستطلاع وإشعار السكان'}</button>
          <p className="text-[11px] leading-5 text-slate-500">التصويت مرة واحدة لكل حساب، ولا يمكن تعديل الصوت بعد تأكيده. إغلاق الاستطلاع يتم تلقائيًا عند موعد الانتهاء.</p>
        </form>
      )}

      {!canManage && (
        <div className="flex flex-wrap gap-2 rounded-2xl bg-white p-2 shadow-sm">
          {([
            ['active', 'استطلاعات نشطة'],
            ['ended', 'استطلاعات انتهت'],
            ['participated', 'استطلاعات شاركت فيها'],
          ] as const).map(([value, label]) => (
            <button key={value} onClick={() => setResidentFilter(value)} className={'flex-1 rounded-xl px-3 py-2 text-xs font-bold transition ' + (residentFilter === value ? 'bg-teal-700 text-white' : 'text-slate-600 hover:bg-slate-100')}>{label}</button>
          ))}
        </div>
      )}

      {loading ? <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">جارٍ تحميل الاستطلاعات...</div> :
        visiblePolls.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{canManage ? 'لا توجد استطلاعات بعد.' : 'لا توجد استطلاعات في هذا القسم.'}</div> :
        visiblePolls.map(poll => {
          const result = poll.result;
          const ended = isEnded(poll);
          const options = result?.options || [];
          const donut = options.some(option => option.votes > 0) ? 'conic-gradient(' + options.map((option, index) => {
            const start = options.slice(0, index).reduce((sum, item) => sum + item.percentage, 0);
            return optionColors[index % optionColors.length] + ' ' + start + '% ' + (start + option.percentage) + '%';
          }).join(', ') + ')' : '#e2e8f0';
          return (
            <article key={poll.id} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap items-center gap-2"><span className={'rounded-full px-2.5 py-1 text-[10px] font-bold ' + (ended ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700')}>{ended ? 'انتهى التصويت' : 'استطلاع نشط'}</span>{result?.has_voted && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">شاركت بالفعل</span>}</div><h3 className="text-base font-black leading-7 text-slate-900">{poll.question}</h3>{poll.description && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{poll.description}</p>}</div>
                <div className="shrink-0 rounded-xl bg-slate-50 p-2 text-center"><Clock3 className="mx-auto h-4 w-4 text-slate-500" /><span className="mt-1 block text-[10px] text-slate-500">{ended ? 'انتهى في' : 'ينتهي في'}</span><span className="block text-[10px] font-bold text-slate-700">{formatDate(poll.ends_at)}</span></div>
              </div>

              {!canManage && !ended && !result?.has_voted && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-600">اختر إجابة واحدة:</p>
                  {poll.options.map(option => <button key={option.id} disabled={busy} onClick={() => castVote(poll.id, option.id)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-right text-sm font-bold text-slate-700 transition hover:border-teal-500 hover:bg-teal-50 disabled:opacity-50"><span>{option.label}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500">تصويت سري</span></button>)}
                </div>
              )}

              {!canManage && result?.has_voted && <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0" />تم تسجيل مشاركتك. اختيارك نفسه غير محفوظ مع حسابك ولا يمكن لأي شخص الاطلاع عليه.</p>}

              {!canManage && !ended && !result?.has_voted && <p className="flex items-center gap-2 text-[11px] text-slate-500"><LockKeyhole className="h-3.5 w-3.5" />لا يمكن تغيير التصويت بعد التأكيد، ولا تظهر هوية المصوّتين.</p>}

              {result?.results_visible && result && (
                <div className="border-t border-slate-100 pt-4">
                  <div className="mb-3 flex items-center justify-between gap-2"><h4 className="font-black text-slate-800">النتائج الإجمالية</h4><span className="text-[11px] text-slate-500">{result.participants_count} مشارك</span></div>
                  <div className="grid gap-4 sm:grid-cols-[132px_1fr] sm:items-center">
                    <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-full" style={{ background: donut }}><div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-white shadow-inner"><b className="text-lg text-slate-900">{result.participants_count}</b><span className="text-[9px] text-slate-500">صوت</span></div></div>
                    <div className="space-y-3">{options.map((option, index) => <div key={option.id}><div className="mb-1 flex items-center justify-between gap-2 text-xs"><span className="font-bold text-slate-700">{option.label}</span><b className="text-slate-900">{option.votes} صوت • {option.percentage}%</b></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: option.percentage + '%', background: optionColors[index % optionColors.length] }} /></div></div>)}</div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-xl bg-slate-50 p-3"><span className="block text-[10px] text-slate-500">المستهدفون</span><b className="text-lg">{result.targeted_count}</b></div>
                    <div className="rounded-xl bg-slate-50 p-3"><span className="block text-[10px] text-slate-500">نسبة المشاركة</span><b className="text-lg">{result.turnout_percentage}%</b></div>
                    <div className="rounded-xl bg-slate-50 p-3"><span className="block text-[10px] text-slate-500">المشاركون</span><b className="text-lg">{result.participants_count}</b></div>
                    <div className="rounded-xl bg-slate-50 p-3"><span className="block text-[10px] text-slate-500">لم يشاركوا</span><b className="text-lg">{result.non_participants_count}</b></div>
                  </div>
                </div>
              )}
              {!canManage && result && !result.results_visible && <p className="rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-500">ستظهر النتائج الإجمالية بعد مشاركتك أو انتهاء الاستطلاع.</p>}

              {canManage && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-2 text-xs text-slate-500"><Users className="h-4 w-4" />{result?.participants_count ?? 0} من {result?.targeted_count ?? 0} شاركوا</div>
                  <button disabled={busy || (result?.participants_count ?? 0) > 0 || ended} onClick={() => void managePoll(poll, false)} className="rounded-xl border px-3 py-2 text-xs font-bold disabled:opacity-40">تعديل القرار</button>
                  <button disabled={busy} onClick={() => void managePoll(poll, true)} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700">حذف</button>
                  {!ended && <button disabled={busy} onClick={() => closePoll(poll.id)} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><XCircle className="h-4 w-4" />إنهاء الاستطلاع</button>}
                </div>
              )}
            </article>
          );
        })}
    </div>
  );
};
