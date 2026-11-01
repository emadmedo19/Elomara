import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Lock, Mail, Eye, EyeOff, LogIn, ShieldCheck, AlertCircle, CheckCircle2,
  UserRound, UserPlus, MailCheck, Chrome, Wallet, Users, Building2, Sparkles,
  ArrowLeft, Receipt, Wrench, FileText
} from 'lucide-react';

export const LoginView: React.FC = () => {
  const {
    signUpWithEmail, resendSignupConfirmation, signInWithEmail, signInWithGoogle,
    authError, isLoading, clearError, user, userProfile, isAdmin, signOut,
  } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [localValidation, setLocalValidation] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); clearError(); setLocalValidation(null); setSuccessMessage(null);
    if (!email.trim()) return setLocalValidation('يرجى إدخال البريد الإلكتروني.');
    if (!password) return setLocalValidation('يرجى إدخال كلمة المرور.');
    if (password.length < 6) return setLocalValidation('كلمة المرور يجب ألا تقل عن 6 أحرف.');
    if (isSignUp && !fullName.trim()) return setLocalValidation('يرجى إدخال الاسم بالكامل.');
    if (isSignUp) {
      const created = await signUpWithEmail(email, password, fullName);
      if (created) setSuccessMessage('تم إرسال طلب إنشاء الحساب. راجع بريدك الإلكتروني ثم انتظر موافقة إدارة العقار.');
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
            <p>سجّل الدخول بحسابك للوصول إلى لوحة العمارة. يتم ربط حسابك بعمارة وشقة بعد اعتماد مدير النظام.</p>
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
              <h2>تم تسجيل حسابك بنجاح</h2>
              <p className="leading-8 text-slate-500">{userProfile?.status === 'suspended' ? 'الحساب موقوف حاليًا. تواصل مع إدارة العقار.' : userProfile?.status === 'active' ? 'تم اعتماد حسابك، لكن لم يتم ربط حسابك بعمارة وشقة حتى الآن. تواصل مع المدير.' : 'حسابك في انتظار موافقة مدير العقار. هتقدر تستخدم التطبيق فور اعتماد الحساب.'}</p>
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
                <p>بالبريد الإلكتروني أو بحساب Google. حساب واحد يعمل على كل أجهزتك.</p>
              </div>
              <button type="button" onClick={() => setShowEmailForm(v => !v)} className="fotouh-primary-button w-full">
                <LogIn className="h-5 w-5"/> الدخول / إنشاء حساب
              </button>
              <button type="button" onClick={() => void handleGoogleSignIn()} disabled={isLoading} className="fotouh-google-button w-full">
                <Chrome className="h-5 w-5 text-[#4285F4]"/> {isLoading ? 'جارٍ الاتصال بحساب Google...' : 'المتابعة باستخدام Google'}
              </button>
              {showEmailForm && (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <strong className="text-sm text-[#123c40]">{isSignUp ? 'إنشاء حساب ساكن جديد' : 'الدخول بالبريد الإلكتروني'}</strong>
                    <button type="button" onClick={() => setShowEmailForm(false)} className="text-xs text-slate-400">إغلاق</button>
                  </div>
                  <form onSubmit={handleSubmit} className="space-y-3">
                    {isSignUp && <label className="fotouh-field"><span>الاسم بالكامل</span><div><UserRound/><input value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="الاسم كما سيظهر في التطبيق"/></div></label>}
                    <label className="fotouh-field"><span>البريد الإلكتروني</span><div><Mail/><input type="email" dir="ltr" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></div></label>
                    <label className="fotouh-field"><span>كلمة المرور</span><div><Lock/><input type={showPassword?'text':'password'} dir="ltr" value={password} onChange={e=>setPassword(e.target.value)} placeholder="6 أحرف على الأقل"/><button type="button" onClick={()=>setShowPassword(v=>!v)}>{showPassword?<EyeOff/>:<Eye/>}</button></div></label>
                    {(authError || localValidation) && <p className="fotouh-message error"><AlertCircle/>{authError || localValidation}</p>}
                    {successMessage && <p className="fotouh-message success"><CheckCircle2/>{successMessage}</p>}
                    <button type="submit" disabled={isLoading} className="fotouh-primary-button w-full">{isLoading?'جارٍ التحقق...':isSignUp?'إنشاء حساب جديد':'تسجيل الدخول'}</button>
                    {isSignUp && successMessage && <button type="button" onClick={()=>void handleResendConfirmation()} className="w-full text-xs font-bold text-teal-700"><MailCheck className="ml-1 inline h-4 w-4"/>إعادة إرسال تأكيد البريد</button>}
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
                  <li>الحساب الجديد يبدأ بحالة «بانتظار الاعتماد».</li>
                  <li>مدير النظام يعتمد الحساب ويحدد دوره وعمارة وشقته.</li>
                  <li>الساكن يرى شقته ومدفوعاته فقط، ولا يمكنه قراءة بيانات غيره.</li>
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
