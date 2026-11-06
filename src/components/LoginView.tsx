import React, { useEffect, useState } from 'react';
import { AlertCircle, Building2, CheckCircle2, Chrome, LogOut, ShieldCheck, Users, Mail, Lock, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

type JoinRequestStatus = 'pending' | 'approved' | 'rejected' | null;

export const LoginView: React.FC = () => {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, sendPasswordReset, updatePassword, isPasswordRecovery, clearPasswordRecovery, authError, isLoading, clearError, user, userProfile, isAdmin, signOut } = useAuth();
  const [buildingName, setBuildingName] = useState('');
  const [buildingAddress, setBuildingAddress] = useState('');
  const [unitsCount, setUnitsCount] = useState('0');
  const [floorsCount, setFloorsCount] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [fullName, setFullName] = useState(userProfile?.displayName || '');
  const [requestedFloor, setRequestedFloor] = useState('');
  const [requestedUnit, setRequestedUnit] = useState('');
  const [residentType, setResidentType] = useState<'owner' | 'tenant'>('owner');
  const [requestStatus, setRequestStatus] = useState<JoinRequestStatus>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!user) return;
    let active = true;
    supabase.from('building_join_requests').select('status')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (active) setRequestStatus((data?.status as JoinRequestStatus) || null); });
    return () => { active = false; };
  }, [user?.id]);

  const createBuilding = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setNotice('');
    if (!buildingName.trim()) { setError('اكتب اسم العمارة.'); return; }
    setBusy(true);
    const { error: actionError } = await supabase.rpc('create_building_for_current_user', {
      building_name: buildingName.trim(),
      building_address: buildingAddress.trim(),
      units_count: Math.max(0, Number(unitsCount) || 0),
      floors_count: floorsCount.trim() ? Math.max(0, Number(floorsCount) || 0) : null,
    });
    setBusy(false);
    if (actionError) setError(actionError.message);
    else window.location.reload();
  };

  const submitJoinRequest = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setNotice('');
    if (!inviteCode.trim() || !fullName.trim() || !requestedFloor.trim() || !requestedUnit.trim()) {
      setError('اكمل كود العمارة والاسم والدور ورقم الشقة.'); return;
    }
    setBusy(true);
    const { error: actionError } = await supabase.rpc('submit_building_join_request', {
      target_code: inviteCode.trim(),
      applicant_full_name: fullName.trim(),
      applicant_floor: Number(requestedFloor),
      applicant_unit_number: requestedUnit.trim(),
      applicant_resident_type: residentType,
    });
    setBusy(false);
    if (actionError) setError(actionError.message);
    else { setRequestStatus('pending'); setNotice('تم إرسال طلب الانضمام لمدير العمارة.'); }
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
            <h2>إدارة العمارة بسهولة وأمان</h2>
            <p>حساب Google واحد للدخول، مع صلاحيات مستقلة لكل عمارة.</p>
          </div>
        </div>
        <div className="fotouh-feature-grid">
          <article><Building2/><div><strong>إدارة العمارة</strong><p>مدير مستقل لكل عمارة.</p></div></article>
          <article><Users/><div><strong>طلبات انضمام</strong><p>المدير يراجع كل ساكن قبل اعتماده.</p></div></article>
          <article><ShieldCheck/><div><strong>خصوصية البيانات</strong><p>لا تظهر بيانات العمارة قبل الموافقة.</p></div></article>
        </div>
      </section>

      <section className="fotouh-login-lower">
        <div className="fotouh-login-card">
          {isPasswordRecovery ? (
            <form className="space-y-4 py-5" onSubmit={async event => {
              event.preventDefault(); setError(''); setNotice('');
              if (password.length < 8) { setError('كلمة المرور لازم تكون 8 أحرف على الأقل.'); return; }
              if (password !== confirmPassword) { setError('تأكيد كلمة المرور غير مطابق.'); return; }
              try { await updatePassword(password); setPassword(''); setConfirmPassword(''); setNotice('تم تغيير كلمة المرور بنجاح. سجّل الدخول بكلمة المرور الجديدة.'); clearPasswordRecovery(); }
              catch { setError('تعذر تغيير كلمة المرور. افتح رابط الاستعادة مرة أخرى وحاول.'); }
            }}>
              <div className="text-center"><div className="fotouh-login-card-icon"><Lock className="h-8 w-8"/></div><h2 className="text-xl font-bold">تعيين كلمة مرور جديدة</h2><p className="text-sm text-slate-500">اكتب كلمة المرور الجديدة وأكدها.</p></div>
              {authError && <p className="fotouh-message error"><AlertCircle/>{authError}</p>}
              {error && <p className="fotouh-message error"><AlertCircle/>{error}</p>}
              {notice && <p className="fotouh-message success"><CheckCircle2/>{notice}</p>}
              <label className="fotouh-field"><span>كلمة المرور الجديدة</span><div><Lock/><input type="password" minLength={8} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="8 أحرف على الأقل"/></div></label>
              <label className="fotouh-field"><span>تأكيد كلمة المرور</span><div><Lock/><input type="password" minLength={8} autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required placeholder="أعد كتابة كلمة المرور"/></div></label>
              <button disabled={isLoading} className="fotouh-primary-button w-full" type="submit">{isLoading ? 'جارٍ الحفظ...' : 'حفظ كلمة المرور'}</button>
            </form>
          ) : !user ? (
            <div className="space-y-5 py-4">
              <div className="text-center">
                <div className="fotouh-login-card-icon"><ShieldCheck className="h-8 w-8"/></div>
                <h2>مرحبًا بك في العمارة</h2>
                <p className="text-sm leading-7 text-slate-500">سجّل الدخول أو أنشئ حسابًا جديدًا.</p>
              </div>
              {(authError || error) && <p className="fotouh-message error"><AlertCircle/>{error || authError}</p>}
              {notice && <p className="fotouh-message success"><CheckCircle2/>{notice}</p>}
              {authMode === 'signup' && <label className="fotouh-field"><span>الاسم بالكامل</span><div><User/><input form="auth-form" value={fullName} onChange={e=>setFullName(e.target.value)} autoComplete="name" required placeholder="اسمك بالكامل"/></div></label>}
              <label className="fotouh-field"><span>البريد الإلكتروني</span><div><Mail/><input form="auth-form" type="email" dir="ltr" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required placeholder="name@example.com"/></div></label>
              {authMode !== 'forgot' && <label className="fotouh-field"><span>كلمة المرور</span><div><Lock/><input form="auth-form" type="password" dir="ltr" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={authMode==='signup'?'new-password':'current-password'} required placeholder={authMode==='signup'?'8 أحرف على الأقل':'كلمة المرور'}/></div></label>}
              {authMode === 'signup' && <label className="fotouh-field"><span>تأكيد كلمة المرور</span><div><Lock/><input form="auth-form" type="password" dir="ltr" minLength={8} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} autoComplete="new-password" required placeholder="أعد كتابة كلمة المرور"/></div></label>}
              <form onSubmit={async event => {
                event.preventDefault(); setError(''); setNotice(''); clearError();
                if (authMode === 'forgot') {
                  try { await sendPasswordReset(email); setNotice('لو البريد مسجل، هيوصلك رابط استعادة كلمة المرور. راجع صندوق الوارد والرسائل غير المرغوب فيها.'); }
                  catch { setError('تعذر إرسال رابط الاستعادة. راجع البريد وحاول مرة أخرى.'); }
                  return;
                }
                if (authMode === 'signup') {
                  if (!fullName.trim()) { setError('اكتب اسمك بالكامل.'); return; }
                  if (password.length < 8) { setError('كلمة المرور لازم تكون 8 أحرف على الأقل.'); return; }
                  if (password !== confirmPassword) { setError('تأكيد كلمة المرور غير مطابق.'); return; }
                  const hasSession = await signUpWithEmail(fullName, email, password);
                  if (!hasSession) setNotice('تم إرسال رسالة تأكيد إلى بريدك الإلكتروني. أكد البريد ثم ارجع وسجّل الدخول.');
                } else await signInWithEmail(email, password);
              }}>
                <button type="submit" disabled={isLoading} className="fotouh-primary-button w-full">{isLoading ? 'جارٍ التنفيذ...' : authMode==='signup'?'إنشاء حساب بالبريد الإلكتروني':authMode==='forgot'?'إرسال رابط الاستعادة':'تسجيل الدخول بالبريد الإلكتروني'}</button>
              </form>
              <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-bold">
                {authMode !== 'login' && <button type="button" onClick={()=>{setAuthMode('login');setError('');setNotice('');}}>العودة لتسجيل الدخول</button>}
                {authMode === 'login' && <><button type="button" onClick={()=>{setAuthMode('signup');setError('');setNotice('');}}>إنشاء حساب جديد</button><button type="button" onClick={()=>{setAuthMode('forgot');setError('');setNotice('');}}>نسيت كلمة المرور؟</button></>}
                {authMode === 'signup' && <button type="button" onClick={()=>setAuthMode('login')}>لديك حساب؟ تسجيل الدخول</button>}
              </div>
              {authMode === 'login' && <>
                <div className="relative py-1 text-center text-xs text-slate-400"><span className="bg-white px-3">أو</span><div className="absolute left-0 right-0 top-1/2 -z-10 border-t border-slate-200"/></div>
                <button type="button" onClick={() => { clearError(); void signInWithGoogle(); }} disabled={isLoading} className="fotouh-google-button w-full"><Chrome className="h-5 w-5 text-[#4285F4]"/> {isLoading ? 'جارٍ الاتصال...' : 'المتابعة باستخدام Google'}</button>
              </>}
              <div className="fotouh-login-help text-right">
                <strong className="block text-slate-700">إرشادات التسجيل في العمارة</strong>
                <ul><li>بعد تأكيد البريد، سجّل الدخول.</li><li>لو أنت مدير العمارة، اختار «أنا مدير عمارة» وأنشئ عمارتك.</li><li>لو أنت ساكن، اختار «أنا ساكن» واكتب كود العمارة وبيانات شقتك.</li><li>طلب الساكن بيتراجع من مدير العمارة قبل اعتماد الحساب.</li></ul>
              </div>
            </div>
          ) : isAdmin ? (
            <div className="space-y-4 py-5 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-teal-600"/>
              <h2 className="text-xl font-bold">تم إنشاء العمارة بنجاح</h2>
              <p className="text-sm text-slate-500">جارٍ تجهيز لوحة الإدارة...</p>
            </div>
          ) : userProfile?.status === 'suspended' ? (
            <div className="space-y-4 py-6 text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-rose-600"/>
              <h2 className="text-xl font-bold">الحساب موقوف</h2>
              <p className="leading-8 text-slate-600">تم إيقاف هذا الحساب. تواصل مع إدارة العمارة إذا كنت تعتقد أن ذلك حدث بالخطأ.</p>
              <button onClick={signOut} className="fotouh-primary-button w-full"><LogOut className="h-4 w-4"/> تسجيل الخروج</button>
            </div>
          ) : requestStatus === 'pending' ? (
            <div className="space-y-4 py-6 text-center">
              <div className="fotouh-login-card-icon"><ShieldCheck className="h-8 w-8"/></div>
              <h2 className="text-xl font-bold">طلبك قيد المراجعة</h2>
              <p className="leading-8 text-slate-600">تم إرسال طلب الانضمام بنجاح. هتقدر تشوف بيانات العمارة بعد موافقة مديرها.</p>
              <span className="inline-block rounded-full bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800">في انتظار موافقة مدير العمارة</span>
              <button onClick={signOut} className="fotouh-primary-button w-full"><LogOut className="h-4 w-4"/> تسجيل الخروج</button>
            </div>
          ) : (
            <div className="space-y-5 py-3">
              <div className="text-center">
                <div className="fotouh-login-card-icon"><Building2 className="h-8 w-8"/></div>
                <h2 className="text-xl font-bold">اختار طريقة البدء</h2>
                <p className="mt-2 text-sm text-slate-500">تقدر تنشئ عمارة جديدة أو تقدم طلب انضمام بكود العمارة.</p>
              </div>
              {error && <p className="fotouh-message error"><AlertCircle/>{error}</p>}
              {notice && <p className="fotouh-message success"><CheckCircle2/>{notice}</p>}
              <form onSubmit={createBuilding} className="space-y-3 rounded-2xl border border-slate-200 p-4">
                <h3 className="font-bold text-slate-800">أنا مدير عمارة — إنشاء عمارة</h3>
                <label className="fotouh-field"><span>اسم العمارة</span><div><Building2/><input value={buildingName} onChange={e=>setBuildingName(e.target.value)} placeholder="اسم العمارة" required/></div></label>
                <label className="fotouh-field"><span>العنوان</span><div><Building2/><input value={buildingAddress} onChange={e=>setBuildingAddress(e.target.value)} placeholder="العنوان"/></div></label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="fotouh-field"><span>عدد الشقق</span><div><Users/><input type="number" min="0" value={unitsCount} onChange={e=>setUnitsCount(e.target.value)}/></div></label>
                  <label className="fotouh-field"><span>عدد الأدوار</span><div><Building2/><input type="number" min="0" value={floorsCount} onChange={e=>setFloorsCount(e.target.value)} placeholder="اختياري"/></div></label>
                </div>
                <button type="submit" disabled={busy} className="fotouh-primary-button w-full">{busy ? 'جارٍ إنشاء العمارة...' : 'إنشاء العمارة'}</button>
              </form>
              <form onSubmit={submitJoinRequest} className="space-y-3 rounded-2xl border border-teal-200 bg-teal-50/50 p-4">
                <h3 className="font-bold text-slate-800">أنا ساكن — الانضمام لعمارة</h3>
                <label className="fotouh-field"><span>كود العمارة العام</span><div><Building2/><input dir="ltr" value={inviteCode} onChange={e=>setInviteCode(e.target.value)} placeholder="أدخل كود العمارة"/></div></label>
                <label className="fotouh-field"><span>الاسم بالكامل</span><div><Users/><input value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="الاسم بالكامل"/></div></label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="fotouh-field"><span>الدور</span><div><input type="number" min="0" value={requestedFloor} onChange={e=>setRequestedFloor(e.target.value)} placeholder="رقم الدور"/></div></label>
                  <label className="fotouh-field"><span>رقم الشقة</span><div><input value={requestedUnit} onChange={e=>setRequestedUnit(e.target.value)} placeholder="رقم الشقة"/></div></label>
                </div>
                <label className="fotouh-field"><span>الصفة</span><div><select value={residentType} onChange={e=>setResidentType(e.target.value as 'owner'|'tenant')}><option value="owner">مالك</option><option value="tenant">مستأجر</option></select></div></label>
                <button type="submit" disabled={busy} className="fotouh-primary-button w-full">{busy ? 'جارٍ إرسال الطلب...' : 'إرسال طلب الانضمام'}</button>
              </form>
              <p className="text-center text-xs text-slate-400" dir="ltr">{user.email}</p>
              <button onClick={signOut} className="w-full text-sm font-bold text-slate-500">تسجيل الخروج</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
