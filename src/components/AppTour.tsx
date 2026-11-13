import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Building2, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

type Mode = 'setup' | 'empty-manager' | 'manager' | 'resident';
type Step = { title: string; body: string; target?: string; page?: string };
const steps: Record<Mode, Step[]> = {
  setup: [
    { title: 'أهلاً بيك في العمارة', body: 'هنمشي معاك خطوة بخطوة. أنت هتدير عمارة، ولا هتنضم كساكن أو عضو؟' },
  ],
  'empty-manager': [
    { title: 'ابدأ بأول عمارة', body: 'اضغط «إضافة أول عمارة» بعد الجولة. اكتب اسمها وعنوانها وعدد الشقق والأدوار.', target: 'create-building' },
    { title: 'جهّز الشقق والخزينة', body: 'الشقق بتتجهز تلقائيًا حسب العدد. الرصيد الافتتاحي هو المبلغ الموجود بالفعل في خزينة العمارة؛ اكتب صفر لو مفيش رصيد.', target: 'create-building' },
    { title: 'بعد إنشاء العمارة', body: 'أضف أسماء السكان وقيمة الاشتراك من «الشقق والتحصيل»، وشارك كود العمارة مع الأعضاء. هنعرّفك على باقي الشاشات بعد الإنشاء.', target: 'create-building' },
  ],
  manager: [
    { title: 'لوحة إدارة عمارتك', body: 'هنا ملخص الخزينة والتحصيل والمصروفات والتنبيهات. «التالي» هيفتح كل ميزة ويشرحها، من غير تسجيل أي بيانات.', page: 'dashboard' },
    { title: 'العقارات وكود العمارة', body: 'من أعلى الشاشة تقدر تختار عمارة أو تفتح إدارة العقارات لإضافة عمارة وتعديل بياناتها. شارك كود العمارة مع السكان عشان يقدموا طلب انضمام.', target: 'manager-header' },
    { title: 'الشقق والتحصيل', body: 'أضف أو عدّل بيانات السكان والاشتراك لكل شقة. سجل دفعات السداد وراجع الإيصالات وكشف الحساب وسجل التعديلات.', page: 'collections' },
    { title: 'طلبات الانضمام', body: 'راجع طلبات السكان، وحدد الشقة والصفة المناسبة ثم وافق على الطلب. العضو لا يشوف بيانات العمارة قبل اعتماد حسابه.', page: 'approvals' },
    { title: 'المصروفات', body: 'سجل مصروفات العمارة وصنّفها، وراجع تفاصيل كل بند. المصروفات بتنعكس على رصيد الخزينة والتقارير.', page: 'expenses' },
    { title: 'التحصيلات الاستثنائية', body: 'للصيانة أو المصروفات الخاصة، أنشئ تحصيلًا استثنائيًا وحدد الشقق والمبالغ المطلوبة، وتابع السداد والمتبقي.', page: 'exceptional-collections' },
    { title: 'التقارير وكشوف الحساب', body: 'راجع الإيرادات والمصروفات والأرصدة، وجهز كشف حساب أو تقرير PDF من الخيارات المتاحة.', page: 'reports' },
    { title: 'الصيانة والمرافق', body: 'من بوابة الساكن والمرافق تابع طلبات الصيانة وحجوزات المرافق والخدمات المرتبطة بعمارتك.', page: 'resident' },
    { title: 'القرارات والتصويت', body: 'اعرض موضوعات الجمعية واستطلاعات الرأي، وتابع التصويت والنتائج داخل العمارة.', page: 'polls' },
    { title: 'دليل الخدمات', body: 'احفظ أرقام الفنيين ومقدمي الخدمات عشان الأعضاء يلاقوها بسهولة.', page: 'services' },
    { title: 'المساعد الذكي', body: 'اسأل المساعد عن تنظيم وإدارة العمارة. الجولة بتشرح الشاشة فقط؛ كتابة سؤال وإرساله باختيارك.', page: 'chat' },
    { title: 'الإعلانات والتصميم', body: 'جهز إعلانات العمارة وتصميماتها من الأدوات المتاحة، وراجع المحتوى قبل نشره للسكان.', page: 'image-studio' },
    { title: 'كل الخيارات في المزيد', body: 'من هنا تلاقي إدارة العقارات، إعدادات الخزينة والتطبيق والباقات. تقدر تعيد «دليل التطبيق» في أي وقت.', page: 'more' },
  ],
  resident: [
    { title: 'أهلاً بيك في عمارتك', body: 'هنا ملخص حساب شقتك والتنبيهات وآخر الأخبار. هنتنقل معاك بين المميزات المتاحة لحسابك.', page: 'home' },
    { title: 'مدفوعات وإيصالات شقتك', body: 'راجع الدفعات المسجلة والإيصالات وتفاصيل حساب شقتك. تسجيل الدفعات واعتمادها مسؤولية الإدارة.', page: 'payments' },
    { title: 'تقارير العمارة', body: 'اطلع على الملخص المالي المتاح للأعضاء. بيانات الشقق الأخرى والتفاصيل الخاصة بالإدارة تظل محمية.', page: 'reports' },
    { title: 'إعلانات العمارة', body: 'تابع أخبار العمارة والإعلانات المثبتة والتعليمات الجديدة من الإدارة.', page: 'announcements' },
    { title: 'طلبات الصيانة', body: 'قدم طلب صيانة، واكتب العنوان والتفاصيل ودرجة الاستعجال. تقدر ترجع تتابع حالة طلبك.', page: 'maintenance' },
    { title: 'حجز المرافق', body: 'اختار المرفق واليوم والوقت من الخيارات المتاحة، ثم تابع حالة الحجز.', page: 'bookings' },
    { title: 'شارك في قرارات العمارة', body: 'تابع موضوعات الجمعية والاستطلاعات وصوّت في الموضوعات المتاحة.', page: 'polls' },
    { title: 'أرقام الفنيين والخدمات', body: 'دليل الخدمات بيجمع وسائل التواصل اللي وفرتها الإدارة عشان ترجع لها بسهولة.', page: 'services' },
    { title: 'بيانات العمارة والتواصل', body: 'اعرف بيانات عمارتك ووسائل التواصل المتاحة مع الإدارة والحارس.', page: 'building' },
    { title: 'المزيد وإعداداتك', body: 'من هنا تفتح باقي الخدمات وتغير مظهر التطبيق وحجم الخط. «دليل التطبيق» موجود لإعادة الجولة وقت ما تحب.', page: 'more' },
  ],
};
const setupSteps: Record<'manager' | 'resident', Step[]> = {
  manager: [
    { title: 'إنشاء عمارة جديدة', body: 'في قسم «أنا مدير عمارة» اكتب اسم العمارة وعنوانها، ثم عدد الشقق والأدوار. الشقق بتتجهز تلقائيًا.', target: 'setup-manager' },
    { title: 'الرصيد الافتتاحي', body: 'اكتب المبلغ الموجود بالفعل في خزينة العمارة قبل بدء الاستخدام، أو اتركه صفر. المبلغ ده منفصل عن تحصيل الشقق.', target: 'setup-opening-balance' },
    { title: 'جاهز لإنشاء عمارتك', body: 'بعد الجولة راجع البيانات واضغط «إنشاء العمارة». بعد الإنشاء هنشرح لوحة الإدارة والتحصيل والتقارير وإضافة الأعضاء.', target: 'setup-manager' },
  ],
  resident: [
    { title: 'انضم بكود عمارتك', body: 'اطلب كود العمارة من مديرها، واكتبه في قسم «أنا ساكن». لازم المدير يكون أنشأ العمارة أولاً.', target: 'setup-resident' },
    { title: 'عرّف الإدارة بنفسك', body: 'اكتب اسمك ورقم الدور والشقة وصفتك، زي مالك أو ساكن. ممكن أكثر من فرد ينضم لنفس الشقة بحساب منفصل.', target: 'setup-resident' },
    { title: 'أرسل طلب الانضمام', body: 'اضغط «إرسال طلب الانضمام» بعد مراجعة بياناتك، وانتظر موافقة المدير. بعد الموافقة هتظهر شقتك وهنشرح مميزات حساب العضو.', target: 'setup-resident' },
  ],
};
const keyFor = (id: string, mode: Mode) => `elomara:tour:v1:${id}:${mode}`;
// Existing accounts can replay from More; automatic tours are for newly created accounts.
const rollout = Date.parse('2026-11-13T00:00:00Z');
const completedThisSession = new Set<string>();
export function TourHelpButton() {
  return <button type="button" onClick={() => window.dispatchEvent(new Event('elomara:open-tour'))} className="inline-flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-bold text-teal-800"><BookOpen size={18}/>دليل التطبيق</button>;
}
export function AppTour({ mode, onNavigate, currentPage }: { mode: Mode; onNavigate?: (page: string) => void; currentPage?: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [journey, setJourney] = useState<'manager' | 'resident' | null>(null);
  const [spot, setSpot] = useState<React.CSSProperties | null>(null);
  const panel = useRef<HTMLElement>(null);
  const originalPage = useRef(currentPage);
  const navigation = useRef(onNavigate); navigation.current = onNavigate;
  const titleId = useId();
  const allSteps = mode === 'setup' && journey ? [...steps.setup, ...setupSteps[journey]] : steps[mode];
  const step = allSteps[index] || allSteps[0];
  useBodyScrollLock(open);
  useEffect(() => {
    if (!user) return;
    const start = () => { originalPage.current = currentPage; setIndex(0); setJourney(null); setOpen(true); };
    window.addEventListener('elomara:open-tour', start);
    return () => window.removeEventListener('elomara:open-tour', start);
  }, [user?.id, currentPage]);
  useEffect(() => {
    if (!user || Date.parse(user.created_at) < rollout || !Number.isFinite(Date.parse(user.created_at))) return;
    if (completedThisSession.has(keyFor(user.id, mode))) return;
    try { if (localStorage.getItem(keyFor(user.id, mode))) return; } catch { /* optional storage */ }
    setOpen(true);
  }, [user?.id, mode]);
  const close = () => {
    if (user) { completedThisSession.add(keyFor(user.id, mode)); try { localStorage.setItem(keyFor(user.id, mode), 'done'); } catch { /* optional storage */ } }
    setOpen(false);
    if (originalPage.current) navigation.current?.(originalPage.current);
  };
  const closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const marker = crypto.randomUUID();
    window.history.pushState({ ...window.history.state, appTour: marker }, '', window.location.href);
    const back = (event: PopStateEvent) => { event.stopImmediatePropagation(); closeRef.current(); };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const controls = panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      const first = controls?.[0], last = controls?.[controls.length - 1];
      if (!panel.current?.contains(document.activeElement) || document.activeElement === panel.current) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('popstate', back, true);
    document.addEventListener('keydown', key, true);
    panel.current?.focus();
    return () => {
      window.removeEventListener('popstate', back, true);
      document.removeEventListener('keydown', key, true);
      if (window.history.state?.appTour === marker) window.history.back();
      previousFocus?.focus({ preventScroll: true });
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    if (step.page) navigation.current?.(step.page);
    const measure = () => {
      const target = document.querySelector<HTMLElement>(`[data-tour="${step.target || (mode === 'resident' ? 'resident-page' : 'manager-page')}"]`);
      if (!target) { setSpot(null); return; }
      const rect = target.getBoundingClientRect();
      const bottom = (panel.current?.getBoundingClientRect().top || innerHeight) - 14;
      const top = Math.max(8, rect.top - 5);
      const height = Math.min(rect.bottom + 5, bottom) - top;
      setSpot(height > 20 ? { left: Math.max(6, rect.left - 5), top, width: Math.min(innerWidth - 12, rect.width + 10), height } : null);
    };
    const target = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
    if (target) target.scrollIntoView({ block: 'start', behavior: 'instant' });
    else window.scrollTo({ top: 0, behavior: 'instant' });
    const frame = requestAnimationFrame(measure);
    const timer = setTimeout(() => { measure(); panel.current?.focus({ preventScroll: true }); }, 350);
    const resize = new ResizeObserver(measure);
    if (panel.current) resize.observe(panel.current);
    window.addEventListener('resize', measure); window.addEventListener('scroll', measure, true);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); resize.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [open, index, journey, mode, step.page, step.target]);
  if (!open || !user) return null;
  const choosing = mode === 'setup' && index === 0;
  return createPortal(<div data-app-tour dir="rtl" className="fixed inset-0 z-[210] isolate">
    {spot ? <div aria-hidden="true" className="pointer-events-none fixed rounded-2xl border-2 border-teal-300 shadow-[0_0_0_9999px_rgba(2,6,23,0.72)]" style={spot}/> : <div aria-hidden="true" className="absolute inset-0 bg-slate-950/70"/>}
    <section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={`${titleId}-body`} className="absolute bottom-3 left-3 right-3 mx-auto max-h-[65dvh] max-w-lg overflow-y-auto rounded-3xl border border-teal-200 bg-white p-5 text-slate-900 shadow-2xl outline-none sm:bottom-6 sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-bold text-teal-700"><BookOpen size={18}/>دليل التطبيق{!choosing && ` · ${index + 1} / ${allSteps.length}`}</span><button type="button" onClick={close} aria-label="إغلاق الجولة" className="rounded-xl bg-slate-100 p-2"><X size={18}/></button></div>
      <div aria-live="polite" aria-atomic="true"><h2 id={titleId} className="text-xl font-black">{step.title}</h2><p id={`${titleId}-body`} className="mt-3 text-sm leading-7 text-slate-600">{step.body}</p></div>
      {choosing ? <div className="mt-5 grid gap-2 sm:grid-cols-2"><button type="button" className="flex items-center justify-center gap-2 rounded-xl bg-teal-700 p-3 font-bold text-white" onClick={() => { setJourney('manager'); setIndex(1); }}><Building2 size={20}/>أنا مدير عمارة</button><button type="button" className="flex items-center justify-center gap-2 rounded-xl border border-teal-300 bg-teal-50 p-3 font-bold text-teal-800" onClick={() => { setJourney('resident'); setIndex(1); }}><Users size={20}/>أنا ساكن أو عضو</button></div> : <div className="mt-5 flex items-center gap-2"><button type="button" onClick={() => index === allSteps.length - 1 ? close() : setIndex(value => value + 1)} className="flex-1 rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white">{index === allSteps.length - 1 ? 'ابدأ الاستخدام' : 'التالي'}</button><button type="button" disabled={index === 0} onClick={() => setIndex(value => value - 1)} className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold disabled:opacity-40">السابق</button></div>}
      <button type="button" onClick={close} className="mt-3 w-full py-2 text-xs font-bold text-slate-500">تخطي الجولة</button>
    </section>
  </div>, document.body);
}
