import React, { useEffect, useState } from 'react';
import { AlertCircle, Building2, CheckCircle2, Chrome, LogOut, ShieldCheck, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

type JoinRequestStatus = 'pending' | 'approved' | 'rejected' | null;

export const LoginView: React.FC = () => {
  const { signInWithGoogle, signUpWithPhone, verifyPhoneSignup, signInWithPhone, authError, isLoading, clearError, user, userProfile, isAdmin, signOut } = useAuth();
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
  const [phoneMode, setPhoneMode] = useState(false);
  const [phoneSignup, setPhoneSignup] = useState(false);
  const [phoneValue, setPhoneValue] = useState('');
  const [phonePassword, setPhonePassword] = useState('');
  const [phoneFullName, setPhoneFullName] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneOtpRequested, setPhoneOtpRequested] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    supabase.from('building_join_requests').select('status')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (active) setRequestStatus((data?.status as JoinRequestStatus) || null); });
    return () => { active = false; };
  }, [user?.id]);


  const submitPhoneAuth = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); clearError();
    if (!phoneValue.trim()) { setError('اكتب رقم الموبايل.'); return; }
    if (phoneOtpRequested) {
      if (!/^\d{6}$/.test(phoneOtp.trim())) { setError('أدخل رمز التحقق المكوّن من 6 أرقام.'); return; }
      const verified = await verifyPhoneSignup(phoneValue, phoneOtp);
      if (verified) { setPhoneOtpRequested(false); setPhoneSignup(false); setPhoneOtp(''); setNotice('تم تأكيد رقم الموبايل وإنشاء الحساب. أكمل إنشاء العمارة أو طلب الانضمام.'); }
      return;
    }
    if (phonePassword.length < (phoneSignup ? 8 : 6)) { setError(phoneSignup ? 'كلمة المرور يجب ألا تقل عن 8 أحرف.' : 'كلمة المرور يجب ألا تقل عن 6 أحرف.'); return; }
    if (phoneSignup && !phoneFullName.trim()) { setError('اكتب الاسم بالكامل.'); return; }
    if (phoneSignup) {
      if (await signUpWithPhone(phoneValue, phonePassword, phoneFullName)) setPhoneOtpRequested(true);
    } else await signInWithPhone(phoneValue, phonePassword);
  };

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
          {!user ? (
            <div className="space-y-5 py-4 text-center">
              <div className="fotouh-login-card-icon"><ShieldCheck className="h-8 w-8"/></div>
              <h2>مرحبًا بك في العمارة</h2>
              <p className="text-sm leading-7 text-slate-500">سجّل الدخول أو أنشئ حسابك باستخدام Google للمتابعة.</p>
              {authError && <p className="fotouh-message error"><AlertCircle/>{authError}</p>}
              <button type="button" onClick={() => { clearError(); void signInWithGoogle(); }} disabled={isLoading}
                className="fotouh-google-button w-full">
                <Chrome className="h-5 w-5 text-[#4285F4]"/> {isLoading ? 'جارٍ الاتصال بحساب Google...' : 'المتابعة باستخدام Google'}
              </button>

              <div className="my-4 border-t border-slate-200 pt-4 text-right">
                <button type="button" onClick={() => { setPhoneMode(v => !v); setError(''); clearError(); }} className="w-full rounded-xl border border-teal-200 px-4 py-3 font-bold text-teal-800">
                  {phoneMode ? 'إخفاء تسجيل الموبايل' : 'الدخول أو إنشاء حساب برقم الموبايل'}
                </button>
                {phoneMode && <form onSubmit={submitPhoneAuth} className="mt-4 space-y-3">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setPhoneSignup(false); setPhoneOtpRequested(false); setError(''); }} className="flex-1 rounded-lg bg-slate-100 py-2 text-sm font-bold">تسجيل الدخول</button>
                    <button type="button" onClick={() => { setPhoneSignup(true); setPhoneOtpRequested(false); setError(''); }} className="flex-1 rounded-lg bg-slate-100 py-2 text-sm font-bold">حساب جديد</button>
                  </div>
                  {phoneSignup && !phoneOtpRequested && <input value={phoneFullName} onChange={e=>setPhoneFullName(e.target.value)} placeholder="الاسم بالكامل" className="w-full rounded-xl border border-slate-200 p-3" required />}
                  <input type="tel" inputMode="tel" dir="ltr" value={phoneValue} onChange={e=>setPhoneValue(e.target.value)} placeholder="01xxxxxxxxx" className="w-full rounded-xl border border-slate-200 p-3 text-left" required />
                  {!phoneOtpRequested && <input type="password" dir="ltr" value={phonePassword} onChange={e=>setPhonePassword(e.target.value)} placeholder="كلمة المرور" className="w-full rounded-xl border border-slate-200 p-3 text-left" required />}
                  {phoneOtpRequested && <input inputMode="numeric" dir="ltr" maxLength={6} value={phoneOtp} onChange={e=>setPhoneOtp(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="رمز التحقق المرسل للموبايل" className="w-full rounded-xl border border-slate-200 p-3 text-center tracking-widest" required />}
                  {(error || authError) && <p className="fotouh-message error"><AlertCircle/>{error || authError}</p>}
                  <button type="submit" disabled={isLoading} className="fotouh-primary-button w-full">{isLoading ? 'جارٍ التنفيذ...' : phoneOtpRequested ? 'تأكيد الرمز' : phoneSignup ? 'إنشاء الحساب وإرسال الرمز' : 'تسجيل الدخول بالموبايل'}</button>
                </form>}
              </div>
              <div className="fotouh-login-help text-right">
                <strong className="block text-slate-700">إرشادات التسجيل في العمارة</strong>
                <ul>
                  <li>سجّل الدخول أولًا بحساب Google.</li>
                  <li>لو أنت مدير العمارة، اختار «أنا مدير عمارة» وأنشئ عمارتك.</li>
                  <li>لو أنت ساكن، اختار «أنا ساكن» واكتب كود العمارة وبيانات شقتك.</li>
                  <li>طلب الساكن بيتراجع من مدير العمارة، ومش هتظهر بيانات العمارة إلا بعد الموافقة.</li>
                </ul>
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
