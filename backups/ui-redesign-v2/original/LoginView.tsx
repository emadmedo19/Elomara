import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  LogIn,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  UserRound,
  UserPlus,
  MailCheck,
  Chrome,
} from 'lucide-react';

export const LoginView: React.FC = () => {
  const {
    signUpWithEmail,
    resendSignupConfirmation,
    signInWithEmail,
    signInWithGoogle,
    authError,
    isLoading,
    clearError,
    user,
    userProfile,
    isAdmin,
    signOut,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [localValidation, setLocalValidation] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalValidation(null);
    setSuccessMessage(null);
    if (!email.trim()) {
      setLocalValidation('يرجى إدخال البريد الإلكتروني.');
      return;
    }
    if (!password) {
      setLocalValidation('يرجى إدخال كلمة المرور.');
      return;
    }
    if (password.length < 6) {
      setLocalValidation('كلمة المرور يجب ألا تقل عن 6 أحرف.');
      return;
    }
    if (isSignUp && !fullName.trim()) {
      setLocalValidation('يرجى إدخال الاسم بالكامل.');
      return;
    }
    if (isSignUp) {
      const created = await signUpWithEmail(email, password, fullName);
      if (created) setSuccessMessage('تم إرسال طلب إنشاء الحساب. راجع بريدك الإلكتروني لتأكيد الحساب، وبعدها انتظر موافقة إدارة العقار.');
    } else {
      await signInWithEmail(email, password);
    }
  };



  const handleGoogleSignIn = async () => {
    clearError();
    setLocalValidation(null);
    setSuccessMessage(null);
    await signInWithGoogle();
  };

  const handleResendConfirmation = async () => {
    clearError();
    setSuccessMessage(null);
    const sent = await resendSignupConfirmation(email);
    if (sent) setSuccessMessage('تمت إعادة إرسال رسالة التأكيد. راجع البريد الوارد ومجلد الرسائل غير المرغوب فيها.');
  };

  const switchMode = (signup: boolean) => {
    setIsSignUp(signup);
    setLocalValidation(null);
    setSuccessMessage(null);
    clearError();
  };

  return (
    <div className="min-h-screen bg-[#07131e] text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 selection:bg-teal-500 selection:text-white font-sans relative overflow-hidden" dir="rtl">
      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-teal-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full bg-[#0d1e2e]/90 backdrop-blur-xl border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-200">
        <div className="text-center space-y-3 mb-6">
          <div className="inline-flex p-2 rounded-2xl bg-gradient-to-br from-amber-400/20 to-teal-500/20 border border-amber-400/30 shadow-lg">
            <img src="/icon.png" alt="شعار برج الفتوح" className="w-16 h-16 rounded-xl object-cover shadow-md" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-wide">برج الفتوح</h1>
            <p className="text-xs text-slate-400 mt-1">بوابة تسجيل الدخول الآمن لإدارة العقار والملاك</p>
          </div>
        </div>

        {user && !isAdmin ? (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-center space-y-3 animate-in fade-in">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-amber-200">تم تسجيل حسابك بنجاح</h3>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                {userProfile?.status === 'suspended'
                  ? 'الحساب موقوف حاليًا. تواصل مع إدارة العقار.'
                  : userProfile?.status === 'active'
                    ? 'تم اعتماد حسابك بنجاح، لكن لم يتم ربط حسابك بعمارة وشقة حتى الآن. تواصل مع المدير لتخصيص وحدتك، وبعدها تقدر تدخل على خدمات السكان.'
                    : 'حسابك في انتظار موافقة مدير العقار. هتقدر تستخدم التطبيق فور اعتماد الحساب.'}
              </p>
              <p className="text-[11px] text-slate-400 mt-2" dir="ltr">{user.email}</p>
            </div>
            <button onClick={signOut} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold py-2.5 px-4 rounded-xl border border-slate-600 transition">
              تسجيل الخروج
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void handleGoogleSignIn()}
              disabled={isLoading}
              className="w-full mb-4 bg-white hover:bg-slate-100 disabled:opacity-60 text-slate-800 font-bold py-3 px-4 rounded-xl shadow-md transition active:scale-[0.98] flex items-center justify-center gap-2 text-xs sm:text-sm"
            >
              <Chrome className="w-5 h-5 text-[#4285F4]" />
              <span>{isLoading ? 'جارٍ الاتصال بحساب Google...' : 'المتابعة باستخدام Google'}</span>
            </button>
            {(authError || localValidation) && (
              <div className="p-3 mb-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <span className="leading-relaxed">{authError || localValidation}</span>
              </div>
            )}
            {successMessage && (
              <div className="p-3 mb-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs leading-relaxed flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </div>
            )}
            {isSignUp && successMessage && (
              <button
                type="button"
                onClick={() => void handleResendConfirmation()}
                disabled={isLoading || !email.trim()}
                className="w-full mb-4 bg-teal-500/10 hover:bg-teal-500/20 text-teal-200 font-bold py-2.5 px-4 rounded-xl border border-teal-500/30 transition flex items-center justify-center gap-2 text-xs disabled:opacity-50"
              >
                <MailCheck className="w-4 h-4" />
                إعادة إرسال رسالة تأكيد البريد الإلكتروني
              </button>
            )}

            <div className="text-center text-[11px] text-slate-400 mb-3">سجّل الدخول بالبريد الإلكتروني أو أنشئ حساب ساكن جديد</div>
            <form onSubmit={handleSubmit} className="space-y-3">
              {isSignUp && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 block">الاسم بالكامل:</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400"><UserRound className="w-4 h-4" /></div>
                    <input type="text" placeholder="الاسم كما سيظهر في التطبيق" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full bg-[#07131e] border border-slate-700 rounded-xl py-2.5 pr-10 pl-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition" />
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">البريد الإلكتروني:</label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400"><Mail className="w-4 h-4" /></div>
                  <input type="email" dir="ltr" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-[#07131e] border border-slate-700 rounded-xl py-2.5 pr-10 pl-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition font-mono" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">كلمة المرور:</label>
                <div className="relative">
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400"><Lock className="w-4 h-4" /></div>
                  <input type={showPassword ? 'text' : 'password'} dir="ltr" placeholder="6 أحرف على الأقل" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-[#07131e] border border-slate-700 rounded-xl py-2.5 pr-10 pl-10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition font-mono" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 hover:text-slate-200 transition">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={isLoading} className="w-full bg-gradient-to-r from-teal-600 to-[#00668b] hover:from-teal-500 hover:to-[#007ea8] text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-teal-900/30 transition active:scale-[0.98] flex items-center justify-center gap-2 text-xs sm:text-sm disabled:opacity-50">
                {isLoading ? <span>جارٍ التحقق والاتصال...</span> : isSignUp ? <><UserPlus className="w-4 h-4" /><span>إنشاء حساب جديد</span></> : <><LogIn className="w-4 h-4" /><span>دخول الإدارة</span></>}
              </button>
            </form>
            <div className="text-center mt-4">
              {isSignUp ? (
                <button type="button" onClick={() => switchMode(false)} className="text-xs text-teal-300 hover:text-teal-200 font-semibold">لديك حساب بالفعل؟ تسجيل الدخول</button>
              ) : (
                <button type="button" onClick={() => switchMode(true)} className="text-xs text-teal-300 hover:text-teal-200 font-semibold">مقيم جديد؟ إنشاء حساب بالبريد الإلكتروني</button>
              )}
            </div>
          </>
        )}

        <div className="mt-6 pt-4 border-t border-slate-800 space-y-2 text-[11px] text-slate-400">
          <div className="flex items-center gap-2 text-teal-300 font-semibold">
            <ShieldCheck className="w-4 h-4 text-teal-400" />
            <span>الحسابات الجديدة تنتظر موافقة إدارة العقار قبل الدخول</span>
          </div>
        </div>
      </div>
    </div>
  );
};
