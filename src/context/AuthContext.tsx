import React, { createContext, useContext, useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export const PRIMARY_ADMIN_EMAIL = '';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: 'super_admin' | 'assistant_admin' | 'building_admin' | 'owner' | 'tenant' | 'pending';
  apartmentId?: string;
  buildingId?: string;
  phone?: string;
  status: 'active' | 'suspended' | 'pending';
}
interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  role: UserProfile['role'] | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isLoading: boolean;
  authError: string | null;
  signUpWithEmail: (email: string, pass: string, fullName: string) => Promise<boolean>;
  resendSignupConfirmation: (email: string) => Promise<boolean>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithPhone: (phone: string, pass: string, fullName: string) => Promise<boolean>;
  verifyPhoneSignup: (phone: string, token: string) => Promise<boolean>;
  signInWithPhone: (phone: string, pass: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
const getAuthRedirectUrl = () => Capacitor.isNativePlatform()
  ? 'app.bunyan.residential://login-callback'
  : window.location.origin;

const friendlyError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Invalid login credentials')) return 'بيانات الدخول غير صحيحة.';
  if (message.includes('Email not confirmed')) return 'أكد بريدك الإلكتروني من رسالة التفعيل أولاً.';
  if (message.includes('User already registered')) return 'البريد الإلكتروني مسجل بالفعل. جرّب تسجيل الدخول.';
  if (message.toLowerCase().includes('password should be at least')) return 'كلمة المرور يجب ألا تقل عن 6 أحرف.';
  return message || 'حصل خطأ غير متوقع. حاول مرة أخرى.';
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserProfile['role'] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const loadProfile = async (currentUser: User | null) => {
    setUser(currentUser);
    if (!currentUser) {
      setUserProfile(null); setRole(null); setIsAdmin(false); setIsSuperAdmin(false); setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      if (currentUser.email_confirmed_at) {
        const { error: bootstrapError } = await supabase.rpc('bootstrap_first_super_admin');
        if (bootstrapError) console.warn('First-admin bootstrap unavailable:', bootstrapError.message);
      }
      const { data, error } = await supabase.from('profiles')
        .select('id, full_name, phone, role, building_id, apartment_id, approved, disabled_at')
        .eq('id', currentUser.id).maybeSingle();
      if (error) throw error;
      const profile: UserProfile | null = data ? {
        uid: data.id, email: currentUser.email ?? null,
        displayName: data.full_name || currentUser.user_metadata?.full_name || currentUser.email || null,
        role: data.role as UserProfile['role'],
        buildingId: data.building_id || undefined, apartmentId: data.apartment_id || undefined,
        phone: data.phone || undefined,
        status: data.disabled_at ? 'suspended' : (data.approved || data.role === 'super_admin' || data.role === 'assistant_admin') ? 'active' : 'pending',
      } : null;
      setUserProfile(profile); setRole(profile?.role ?? null);
      const admin = profile?.role === 'super_admin' || profile?.role === 'assistant_admin' || profile?.role === 'building_admin';
      setIsAdmin(Boolean(admin && profile?.status === 'active'));
      setIsSuperAdmin(profile?.role === 'super_admin');
    } catch (error) {
      console.error('Supabase profile loading failed:', error);
      setUserProfile(null); setRole(null); setIsAdmin(false); setIsSuperAdmin(false);
      setAuthError('تم تسجيل الدخول لكن تعذر تحميل صلاحيات الحساب. راجع إعدادات Supabase.');
    } finally { setIsLoading(false); }
  };

  useEffect(() => {
    let active = true;
    const processedOAuthCallbacks = new Set<string>();

    const completeOAuthCallback = async (callbackUrl: string) => {
      if (processedOAuthCallbacks.has(callbackUrl)) return;
      processedOAuthCallbacks.add(callbackUrl);
      try {
        const callback = new URL(callbackUrl);
        if (callback.protocol !== 'app.bunyan.residential:' || callback.hostname !== 'login-callback') return;

        setIsLoading(true);
        await Browser.close().catch(() => undefined);
        const oauthError = callback.searchParams.get('error_description') || callback.searchParams.get('error');
        if (oauthError) throw new Error(oauthError);

        const code = callback.searchParams.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          return;
        }

        const hash = new URLSearchParams(callback.hash.replace(/^#/, ''));
        const accessToken = hash.get('access_token');
        const refreshToken = hash.get('refresh_token');
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          return;
        }

        throw new Error('لم يصل رمز تسجيل الدخول من Google. حاول تسجيل الدخول مرة أخرى.');
      } catch (error) {
        if (active) setAuthError(friendlyError(error));
      } finally {
        if (active) setIsLoading(false);
      }
    };

    let appUrlListener: ReturnType<typeof CapacitorApp.addListener> | null = null;
    if (Capacitor.isNativePlatform()) {
      appUrlListener = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
        void completeOAuthCallback(url);
      });
      void CapacitorApp.getLaunchUrl().then((launch) => {
        if (launch?.url) void completeOAuthCallback(launch.url);
      }).catch((error) => {
        if (active) setAuthError(friendlyError(error));
      });
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) window.setTimeout(() => { if (active) void loadProfile(session?.user ?? null); }, 0);
    }).catch(error => { if (active) { setAuthError(friendlyError(error)); setIsLoading(false); } });
    // Keep Supabase's auth callback synchronous. Calling Supabase APIs
    // (profile queries / RPCs) directly while the auth lock is held can
    // deadlock during native OAuth deep-link completion.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const nextUser = session?.user ?? null;
      window.setTimeout(() => {
        if (active) void loadProfile(nextUser);
      }, 0);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
      if (appUrlListener) void appUrlListener.then(listener => listener.remove());
    };
  }, []);

  const signUpWithEmail = async (email: string, password: string, fullName: string): Promise<boolean> => {
    setAuthError(null); setIsLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: getAuthRedirectUrl(),
      },
    });
    if (error) { setAuthError(friendlyError(error)); setIsLoading(false); return false; }
    setIsLoading(false);
    return true;
  };

  const resendSignupConfirmation = async (email: string): Promise<boolean> => {
    setAuthError(null); setIsLoading(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: getAuthRedirectUrl() },
    });
    if (error) {
      setAuthError(friendlyError(error));
      setIsLoading(false);
      return false;
    }
    setIsLoading(false);
    return true;
  };

  const signInWithEmail = async (email: string, password: string) => {
    setAuthError(null); setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setAuthError(friendlyError(error)); setIsLoading(false); }
  };

  const normalizePhoneForAuth = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (/^01[0125]\d{8}$/.test(digits)) return '+2' + digits;
    if (/^201[0125]\d{8}$/.test(digits)) return '+' + digits;
    if (/^00201[0125]\d{8}$/.test(digits)) return '+' + digits.slice(2);
    throw new Error('أدخل رقم موبايل مصري صحيح.');
  };

  const signUpWithPhone = async (phone: string, password: string, fullName: string): Promise<boolean> => {
    setAuthError(null); setIsLoading(true);
    try {
      const normalizedPhone = normalizePhoneForAuth(phone);
      const { error } = await supabase.auth.signUp({
        phone: normalizedPhone,
        password,
        options: { data: { full_name: fullName.trim() } },
      });
      if (error) throw error;
      setIsLoading(false);
      return true;
    } catch (error) {
      setAuthError(friendlyError(error)); setIsLoading(false); return false;
    }
  };

  const verifyPhoneSignup = async (phone: string, token: string): Promise<boolean> => {
    setAuthError(null); setIsLoading(true);
    try {
      const normalizedPhone = normalizePhoneForAuth(phone);
      const { error } = await supabase.auth.verifyOtp({
        phone: normalizedPhone,
        token: token.trim(),
        type: 'sms',
      });
      if (error) throw error;
      setIsLoading(false);
      return true;
    } catch (error) {
      setAuthError(friendlyError(error)); setIsLoading(false); return false;
    }
  };

  const signInWithPhone = async (phone: string, password: string) => {
    setAuthError(null); setIsLoading(true);
    try {
      const normalizedPhone = normalizePhoneForAuth(phone);
      const { error } = await supabase.auth.signInWithPassword({ phone: normalizedPhone, password });
      if (error) throw error;
    } catch (error) { setAuthError(friendlyError(error)); setIsLoading(false); }
  };

  const signInWithGoogle = async () => {
    setAuthError(null);
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getAuthRedirectUrl(),
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (!data.url) throw new Error('تعذر الحصول على رابط تسجيل الدخول من Google.');
      await Browser.open({ url: data.url });
      setIsLoading(false);
    } catch (error) {
      setAuthError(friendlyError(error));
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    setAuthError(null);
    const { error } = await supabase.auth.signOut();
    if (error) setAuthError(friendlyError(error));
    setUser(null); setUserProfile(null); setRole(null); setIsAdmin(false); setIsSuperAdmin(false);
  };
  return <AuthContext.Provider value={{ user, userProfile, role, isAdmin, isSuperAdmin, isLoading, authError,
    signUpWithEmail, resendSignupConfirmation, signInWithEmail, signUpWithPhone, verifyPhoneSignup, signInWithPhone, signInWithGoogle, signOut, clearError: () => setAuthError(null) }}>
    {children}
  </AuthContext.Provider>;
};
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
