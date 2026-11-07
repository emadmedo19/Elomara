import React, { useEffect, useState } from 'react';
import { Globe2, Palette, Type, ShieldCheck, FileText, RotateCcw, LogOut, Building2, SlidersHorizontal, Check } from 'lucide-react';
import { SettingsList, SettingsPage } from './SettingsList';
import { readDevicePreferences, saveDevicePreferences, defaultDevicePreferences, type Appearance, type FontSize } from '../services/appPreferences';

type Page = 'list' | 'language' | 'appearance' | 'font' | 'privacy' | 'terms' | 'reset' | 'about';
const titles: Record<Page, string> = { list: 'إعدادات التطبيق', language: 'اللغة', appearance: 'المظهر', font: 'حجم الخط', privacy: 'سياسة الخصوصية', terms: 'شروط الاستخدام', reset: 'إعادة ضبط إعدادات العرض', about: 'عن التطبيق' };
export function AppPreferencesView({ onBack, onSignOut, onBuildingSettings }: { onBack: () => void; onSignOut: () => void; onBuildingSettings?: () => void }) {
  const [page, setPage] = useState<Page>('list');
  const [preferences, setPreferences] = useState(readDevicePreferences);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (page === 'list') return;
    const back = (event: PopStateEvent) => { event.stopImmediatePropagation(); setPage('list'); setNotice(''); };
    window.addEventListener('popstate', back, true);
    return () => window.removeEventListener('popstate', back, true);
  }, [page]);
  const choose = (next: typeof preferences) => {
    if (!saveDevicePreferences(next)) { setNotice('تعذر حفظ تفضيلات العرض على الجهاز. حاول مرة أخرى.'); return; }
    setPreferences(next); setNotice('تم حفظ تفضيلات العرض على هذا الجهاز.');
  };
  const open = (next: Page) => {
    if (next !== 'list') window.history.pushState({ ...window.history.state, appSettingsPage: next }, '', window.location.href);
    setNotice(''); setPage(next);
  };
  const back = () => { if (page === 'list') onBack(); else window.history.back(); };
  return <SettingsPage title={titles[page]} onBack={back} subpage={page !== 'list'}>
    {notice && <p className="settings-notice" role="status">{notice}</p>}
    {page === 'list' && <>
      <SettingsList items={[
        { id: 'language', label: 'اللغة', icon: Globe2, description: 'العربية', onClick: () => open('language') },
        { id: 'appearance', label: 'المظهر', icon: Palette, tone: 'gold', description: ({light:'فاتح',dark:'داكن',system:'حسب إعداد الجهاز'})[preferences.appearance], onClick: () => open('appearance') },
        { id: 'font', label: 'حجم الخط', icon: Type, tone: 'teal', description: ({normal:'عادي',large:'كبير','extra-large':'كبير جدًا'})[preferences.fontSize], onClick: () => open('font') },
        { id: 'privacy', label: 'سياسة الخصوصية', icon: ShieldCheck, tone: 'violet', onClick: () => open('privacy') },
        { id: 'terms', label: 'شروط الاستخدام', icon: FileText, tone: 'gold', onClick: () => open('terms') },
        ...(onBuildingSettings ? [{ id: 'building-settings', label: 'إعدادات العمارة والتحصيل', icon: SlidersHorizontal, tone: 'teal' as const, onClick: onBuildingSettings }] : []),
        { id: 'about', label: 'عن التطبيق', icon: Building2, onClick: () => open('about') },
        { id: 'reset', label: 'إعادة ضبط إعدادات العرض', icon: RotateCcw, tone: 'gold', onClick: () => open('reset') },
        { id: 'logout', label: 'تسجيل الخروج', icon: LogOut, tone: 'rose', onClick: onSignOut },
      ]}/><p className="settings-help">المظهر وحجم الخط خاصان بهذا الجهاز، ولا يغيران إعدادات العمارة أو بيانات الحساب.</p>
    </>}
    {page === 'appearance' && <div className="settings-panel"><p>اختار المظهر المناسب لك.</p><div className="settings-options">{([['light','فاتح'],['dark','داكن'],['system','حسب إعداد الجهاز']] as [Appearance,string][]).map(([value,label])=><button type="button" key={value} aria-pressed={preferences.appearance===value} onClick={()=>choose({...preferences,appearance:value})}>{label}{preferences.appearance===value && <Check size={18}/>}</button>)}</div></div>}
    {page === 'font' && <div className="settings-panel"><p>التغيير يظهر فورًا في التطبيق.</p><div className="settings-options">{([['normal','عادي'],['large','كبير'],['extra-large','كبير جدًا']] as [FontSize,string][]).map(([value,label])=><button type="button" key={value} aria-pressed={preferences.fontSize===value} onClick={()=>choose({...preferences,fontSize:value})}>{label}{preferences.fontSize===value && <Check size={18}/>}</button>)}</div><div className="settings-font-preview"><strong>أهلًا بك في العمارة</strong><p>تابع أخبار العمارة وبياناتك بسهولة.</p></div></div>}
    {page === 'language' && <div className="settings-panel"><h2>العربية</h2><p>الواجهة الحالية متاحة باللغة العربية.</p></div>}
    {page === 'privacy' && <article className="settings-panel settings-document"><h2>بيانات الحساب والعمارة</h2><p>يستخدم التطبيق بيانات تسجيل الدخول والاسم وبيانات الشقة لربط حسابك بالعمارة ومنحك الصلاحيات المناسبة. تُحفظ سجلات التحصيل والمصروفات وطلبات الصيانة والرسائل التي ترسلها في خدمات التطبيق السحابية.</p><h2>صلاحيات الوصول</h2><p>يدير مدير العمارة بيانات عمارته. يعرض حساب الساكن بيانات شقته والمعلومات المتاحة له بعد موافقة الإدارة. لا تشارك كلمة المرور أو رابط استعادة الحساب مع أي شخص.</p><h2>الخدمات المرتبطة</h2><p>يستخدم التطبيق Supabase لتسجيل الدخول وحفظ البيانات، وقد يستخدم Google عند اختيار تسجيل الدخول به. عند استخدام المساعد الذكي أو إرسال محتوى لخدمة خارجية، قد يُرسل المحتوى اللازم لتلك الخدمة؛ تجنب إدخال كلمات المرور أو المعلومات الحساسة في المحادثات.</p><h2>بيانات الجهاز وطلبات الحساب</h2><p>تُحفظ تفضيلات العرض وبعض بيانات الجلسة والتخزين المؤقت على جهازك. لتصحيح بيانات العمارة أو طلب حذف بيانات حسابك، تواصل مع إدارة العمارة لتنسيق الطلب مع مسؤول التطبيق.</p></article>}
    {page === 'terms' && <article className="settings-panel settings-document"><h2>استخدام التطبيق</h2><p>العمارة أداة لتنظيم بيانات العقارات والتحصيل والمصروفات والتواصل مع السكان. استخدم حسابك بصلاحياته، وأدخل بيانات صحيحة، ولا تشارك بيانات السكان أو سجلات العمارة خارج نطاق الإدارة المصرح به.</p><h2>السجلات المالية</h2><p>راجِع المبالغ والإيصالات قبل الحفظ، وتحقق من السجلات عند وجود اختلاف. مدير العمارة مسؤول عن مراجعة البيانات المدخلة واعتمادها، ولا يُعد إدخال مبلغ إثباتًا لإتمام تحويل بنكي.</p><h2>المحتوى والخدمات</h2><p>استخدم الإعلانات والبلاغات بطريقة مناسبة، وراجع اقتراحات المساعد الذكي قبل الاعتماد عليها. قد تتطلب المزامنة والتحديثات اتصالًا بالإنترنت.</p></article>}
    {page === 'reset' && <div className="settings-panel"><h2>الرجوع للعرض الافتراضي</h2><p>سيعود المظهر إلى الفاتح وحجم الخط إلى العادي على هذا الجهاز. بيانات الحساب والعمارة والسجلات المالية ستظل محفوظة.</p><button type="button" className="settings-save" onClick={()=>choose({...defaultDevicePreferences})}>إعادة ضبط إعدادات العرض</button></div>}
    {page === 'about' && <div className="settings-panel settings-about"><img src="/brand-lockup.png" alt="العمارة"/><h2>العمارة</h2><p>نظام إدارة العقارات والملاك</p></div>}
  </SettingsPage>;
}
