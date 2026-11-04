import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  Lock, Mail, Eye, EyeOff, LogIn, ShieldCheck, AlertCircle, CheckCircle2,
  UserRound, UserPlus, MailCheck, Chrome, Wallet, Users, Building2, Sparkles,
  ArrowLeft, Receipt, Wrench, FileText
} from 'lucide-react';

export const LoginView: React.FC = () => {
  const {
    signUpWithEmail, resendSignupConfirmation, signInWithEmail, signUpWithPhone, signInWithPhone, signInWithGoogle,
    authError, isLoading, clearError, user, userProfile, isAdmin, signOut,
  } = useAuth();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneMode, setPhoneMode] = useState(false);
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [localValidation, setLocalValidation] = useState<string | null>(null);
  const [buildingName, setBuildingName] = useState('');
  const [buildingAddress, setBuildingAddress] = useState('');
  const [unitsCount, setUnitsCount] = useState('');
  const [floorsCount, setFloorsCount] = useState('');
  const [creatingBuilding, setCreatingBuilding] = useState(false);
  const [buildingError, setBuildingError] = useState('');
  const [inviteCode, setInviteCode] = useState(() => new URLSearchParams(window.location.search).get('invite') || '');
  const [acceptingInvite, setAcceptingInvite] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); clearError(); setLocalValidation(null); setSuccessMessage(null);
    if (phoneMode && !phone.trim()) return setLocalValidation('يرجى إدخال رقم الموبايل.');
    if (!phoneMode && !email.trim()) return setLocalValidation('يرجى إدخال البريد الإلكتروني.');
    if (!password) return setLocalValidation('يرجى إدخال كلمة المرور.');
    if (password.length < (phoneMode && isSignUp ? 8 : 6)) return setLocalValidation(phoneMode && isSignUp ? 'كلمة المرور يجب ألا تقل عن 8 أحرف.' : 'كلمة المرور يجب ألا تقل عن 6 أحرف.');
    if (isSignUp && !fullName.trim()) return setLocalValidation('يرجى إدخال الاسم بالكامل.');
    if (phoneMode) {
      if (isSignUp && !fullName.trim()) return setLocalValidation('يرجى إدخال الاسم بالكامل.');
      if (isSignUp) {
        const created = await signUpWithPhone(phone, password, fullName);
        if (created) { setIsSignUp(false); setSuccessMessage('تم إنشاء الحساب. سجّل الدخول بنفس رقم الموبايل وكلمة المرور للانضمام إلى العمارة.'); }
      } else await signInWithPhone(phone, password);
    } else if (isSignUp) {
      const created = await signUpWithEmail(email, password, fullName);
      if (created) setSuccessMessage('تم إنشاء الحساب. أكّد بريدك الإلكتروني، ثم ارجع للتطبيق لإنشاء عمارتك أو الانضمام إلى عمارة بكود دعوة.');
    } else await signInWithEmail(email, password);
  };
  const switchMode = (signup: boolean) => {
    setIsSignUp(signup); setShowEmailForm(true); setLocalValidation(null); setSuccessMessage(null); clearError();
  };
  const handleGoogleSignIn = async () => { clearError(); setLocalValidation(null); setSuccessMessage(null); await signInWithGoogle(); };
  const handleResendConfirmation = async () => {
    clearError(); setSuccessMessage(null);
    const sent = await resendSignupConfirmation(email);
    if (sent) setSuccessMessage('تمت إعادة إرسال رسالة التأكيد. راجع البريد الوارد ومجلد الرسائل غير المرغوب فيها.');
  };

  return (
    <div dir="rtl" className="fotouh-login min-h-screen w-full">
      <section className="fotouh-login-hero">
        <div className="fotouh-login-top">
          <div className="fotouh-login-brand">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-white shadow-xl ring-2 ring-white/30">
              <img src="/icon.png" alt="العمارة" className="h-full w-full object-cover" />
            </div>
            <div><h1>العمارة</h1><p>إدارة العقارات السكنية</p></div>
          </div>
          <div className="fotouh-login-intro">
            <h2>إدارة كاملة للعمارة: <span>تحصيل، مصروفات، صيانة، وتقارير.</span></h2>
            <p>سجّل الدخول بحسابك للوصول إلى لوحة العمارة. أنشئ عقارك المستقل أو انضم إلى عقار آخر بدعوة من مديره.</p>
          </div>
        </div>
        <div className="fotouh-feature-grid">
          <article><Wallet/><div><strong>تحصيلات ومحاسبة</strong><p>اشتراكات شهرية، سداد جزئي ومسبق، وكشف حساب لكل شقة.</p></div></article>
          <article><Users/><div><strong>صلاحيات معزولة</strong><p>مدير رئيسي، مدير عقار، وساكن يرى شقته فقط.</p></div></article>
          <article><ShieldCheck/><div><strong>عزل بين العمارات</strong><p>بيانات كل عمارة محمية بصلاحيات مستقلة على الخادم.</p></div></article>
          <article><Sparkles/><div><strong>تقارير ومساعد ذكي</strong><p>تقارير شهرية وسنوية ومساعد يجيب من بياناتك.</p></div></article>
        </div>
      </section>

      <section className="fotouh-login-lower">
        <div className="fotouh-login-card">
          {user && !isAdmin ? (
            <div className="space-y-5 py-4 text-center">
              <div className="fotouh-login-card-icon"><ShieldCheck className="h-8 w-8"/></div>
              <h2>{userProfile?.role === 'pending' && userProfile?.status === 'pending' ? 'أنشئ عقارك وابدأ الإدارة' : 'تم تسجيل حسابك بنجاح'}</h2>
              {userProfile?.role === 'pending' && userProfile?.status === 'pending' ? (
                <form className="space-y-3 text-right" onSubmit={async (e) => {
                  e.preventDefault(); setBuildingError('');
                  if (!buildingName.trim()) { setBuildingError('اكتب اسم العقار أولاً.'); return; }
                  setCreatingBuilding(true);
                  const { error } = await supabase.rpc('create_building_for_current_user', {
                    building_name: buildingName.trim(),
                    building_address: buildingAddress.trim(),
                    units_count: Math.max(0, Number(unitsCount) || 0),
                    floors_count: floorsCount.trim() ? Math.max(0, Number(floorsCount) || 0) : null,
                  });
                  setCreatingBuilding(false);
                  if (error) setBuildingError(error.message);
                  else window.location.reload();
                }}>
                  <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 space-y-2">
                    <b className="text-sm text-teal-900">عندك كود دعوة من مدير عقار؟</b>
                    <input value={inviteCode} onChange={e=>setInviteCode(e.target.value)} placeholder="الصق كود الدعوة هنا (الهاتف أو البريد)" className="w-full rounded-lg border border-teal-200 bg-white p-3 text-sm" dir="ltr"/>
                    <button type="button" disabled={acceptingInvite || !inviteCode.trim()} onClick={async()=>{
                      setBuildingError(''); setAcceptingInvite(true);
                      const isPhoneInvite = inviteCode.trim().startsWith('PH-');
                      const { error } = isPhoneInvite
                        ? await supabase.rpc('accept_building_phone_invite', { target_invite_code: inviteCode.trim() })
                        : await supabase.rpc('accept_building_invite', { target_invite_code: inviteCode.trim() });
                      setAcceptingInvite(false);
                      if (error) setBuildingError(error.message);
                      else window.location.reload();
                    }} className="w-full rounded-lg bg-teal-700 p-3 text-sm font-bold text-white disabled:opacity-50">{acceptingInvite ? 'جارٍ قبول الدعوة...' : 'قبول الدعوة والانضمام للعقار'}</button>
                  </div>
                  <p className="text-sm leading-7 text-slate-500">أو أنشئ عقارك الخاص. حسابك هيكون مدير العقار، وبياناته وأعضاؤه هيبقوا منفصلين عن باقي العقارات.</p>
                  <label className="fotouh-field"><span>اسم العقار</span><div><Building2/><input value={buildingName} onChange={e=>setBuildingName(e.target.value)} placeholder="مثال: عمارة النخيل" required /></div></label>
                  <label className="fotouh-field"><span>العنوان</span><div><Building2/><input value={buildingAddress} onChange={e=>setBuildingAddress(e.target.value)} placeholder="المنطقة والشارع" /></div></label>
                  <label className="fotouh-field"><span>عدد الوحدات</span><div><Users/><input type="number" min="0" value={unitsCount} onChange={e=>setUnitsCount(e.target.value)} placeholder="عدد الشقق" /></div></label>
                  <label className="fotouh-field"><span>عدد الأدوار</span><div><Building2/><input type="number" min="0" value={floorsCount} onChange={e=>setFloorsCount(e.target.value)} placeholder="اختياري" /></div></label>
                  {buildingError && <p className="fotouh-message error"><AlertCircle/>{buildingError}</p>}
                  <button type="submit" disabled={creatingBuilding} className="fotouh-primary-button w-full">{creatingBuilding ? 'جارٍ إنشاء العقار...' : 'إنشاء العقار وفتح لوحة الإدارة'}</button>
                </form>
              ) : (
                <p className="leading-8 text-slate-500">{userProfile?.status === 'suspended' ? 'الحساب موقوف حاليًا. تواصل مع إدارة العقار.' : userProfile?.status === 'active' ? 'تم اعتماد حسابك، لكن لم يتم ربط حسابك بعمارة وشقة حتى الآن. تواصل مع المدير.' : 'حسابك في انتظار موافقة مدير العقار أو دعوة للانضمام إلى عقار.'}</p>
              )}
              <p className="text-xs text-slate-400" dir="ltr">{user.email}</p>
              <button onClick={signOut} className="fotouh-primary-button w-full">تسجيل الخروج</button>
            </div>
          ) : (
            <>
              <div className="fotouh-login-card-heading">
                <div className="mx-auto mb-3 h-14 w-14 overflow-hidden rounded-2xl bg-white p-0.5 shadow-md ring-1 ring-slate-200">
                  <img src="/icon.png" alt="شعار العمارة" className="h-full w-full rounded-xl object-cover" />
                </div>
                <h2>تسجيل الدخول</h2>
                <p>ادخل بالبريد أو رقم الموبايل وكلمة المرور أو Google. حسابك يعمل على أجهزتك.</p>
              </div>
              <button type="button" onClick={() => { setPhoneMode(true); setShowEmailForm(true); setIsSignUp(false); }} className="fotouh-primary-button w-full">
                <LogIn className="h-5 w-5"/> الدخول برقم الموبايل
              </button>
              <button type="button" onClick={() => { setPhoneMode(false); setShowEmailForm(true); setIsSignUp(false); }} className="w-full rounded-xl border border-slate-200 p-3 text-sm font-bold text-slate-700">الدخول بالبريد الإلكتروني / إنشاء حساب</button>
              <button type="button" onClick={() => void handleGoogleSignIn()} disabled={isLoading} className="fotouh-google-button w-full">
                <Chrome className="h-5 w-5 text-[#4285F4]"/> {isLoading ? 'جارٍ الاتصال بحساب Google...' : 'المتابعة باستخدام Google'}
              </button>
              {showEmailForm && (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <strong className="text-sm text-[#123c40]">{isSignUp ? 'إنشاء حساب جديد' : phoneMode ? 'الدخول برقم الموبايل' : 'الدخول بالبريد الإلكتروني'}</strong>
                    <button type="button" onClick={() => setShowEmailForm(false)} className="text-xs text-slate-400">إغلاق</button>
                  </div>
                  <form onSubmit={handleSubmit} className="space-y-3">
                    {isSignUp && <label className="fotouh-field"><span>الاسم بالكامل</span><div><UserRound/><input value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="الاسم كما سيظهر في التطبيق"/></div></label>}
                    {phoneMode ? <label className="fotouh-field"><span>رقم الموبايل</span><div><UserRound/><input type="tel" inputMode="tel" dir="ltr" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="01xxxxxxxxx"/></div></label> : <label className="fotouh-field"><span>البريد الإلكتروني</span><div><Mail/><input type="email" dir="ltr" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></div></label>}
                    <label className="fotouh-field"><span>كلمة المرور</span><div><Lock/><input type={showPassword?'text':'password'} dir="ltr" value={password} onChange={e=>setPassword(e.target.value)} placeholder={phoneMode && isSignUp ? "8 أحرف على الأقل" : "6 أحرف على الأقل"}/><button type="button" onClick={()=>setShowPassword(v=>!v)}>{showPassword?<EyeOff/>:<Eye/>}</button></div></label>
                    {(authError || localValidation) && <p className="fotouh-message error"><AlertCircle/>{authError || localValidation}</p>}
                    {successMessage && <p className="fotouh-message success"><CheckCircle2/>{successMessage}</p>}
                    <button type="submit" disabled={isLoading} className="fotouh-primary-button w-full">{isLoading?'جارٍ التحقق...':isSignUp?'إنشاء حساب جديد':'تسجيل الدخول'}</button>
                    {!phoneMode && isSignUp && successMessage && <button type="button" onClick={()=>void handleResendConfirmation()} className="w-full text-xs font-bold text-teal-700"><MailCheck className="ml-1 inline h-4 w-4"/>إعادة إرسال تأكيد البريد</button>}
                  </form>
                  <div className="mt-4 flex justify-between gap-3 text-xs font-bold text-teal-800">
                    <button type="button" onClick={()=>switchMode(false)}>لديك حساب؟ دخول</button>
                    <button type="button" onClick={()=>switchMode(true)}>إنشاء حساب جديد</button>
                  </div>
                </div>
              )}
              <div className="fotouh-login-help">
                <strong>كيف يعمل الوصول؟</strong>
                <ul>
                  <li>الحساب الجديد يبدأ بتأكيد البريد الإلكتروني.</li>
                  <li>بعد تأكيد البريد، يمكنك إنشاء عقار جديد وتصبح مديره أو قبول دعوة للانضمام.</li>
                  <li>كل مدير يرى بيانات عقاره فقط، ولا يمكنه الوصول إلى بيانات العقارات الأخرى.</li>
                </ul>
              </div>
              <p className="fotouh-login-footnote"><ShieldCheck/> الحسابات الجديدة تنتظر موافقة إدارة العقار قبل الدخول.</p>
            </>
          )}
        </div>
      </section>
    </div>
  );
};
