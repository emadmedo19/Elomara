import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: 'building_admin' | 'owner' | 'tenant' | 'pending';
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
  isLoading: boolean;
  authError: string | null;
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
  return message || 'حصل خطأ غير متوقع. حاول مرة أخرى.';
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserProfile['role'] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const profileLoadVersion = useRef(0);
  const oauthCallbackInProgress = useRef(false);

  const loadProfile = async (currentUser: User | null) => {
    const loadVersion = ++profileLoadVersion.current;
    setUser(currentUser);
    if (!currentUser) {
      setUserProfile(null); setRole(null); setIsAdmin(false); setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from('profiles')
        .select('id, full_name, phone, role, building_id, apartment_id, approved, disabled_at')
        .eq('id', currentUser.id).maybeSingle();
      if (error) throw error;
      if (loadVersion !== profileLoadVersion.current) return;
      const profile: UserProfile | null = data ? {
        uid: data.id, email: currentUser.email ?? null,
        displayName: data.full_name || currentUser.user_metadata?.full_name || currentUser.email || null,
        role: data.role as UserProfile['role'],
        buildingId: data.building_id || undefined, apartmentId: data.apartment_id || undefined,
        phone: data.phone || undefined,
        status: data.disabled_at ? 'suspended' : data.approved ? 'active' : 'pending',
      } : null;
      setUserProfile(profile); setRole(profile?.role ?? null);
      const admin = profile?.role === 'building_admin';
      setIsAdmin(Boolean(admin && profile?.status === 'active'));
    } catch (error) {
      if (loadVersion === profileLoadVersion.current) {
        console.error('Supabase profile loading failed:', error);
        setUserProfile(null); setRole(null); setIsAdmin(false);
        setAuthError('تم تسجيل الدخول لكن تعذر تحميل صلاحيات الحساب. راجع إعدادات Supabase.');
      }
    } finally {
      if (loadVersion === profileLoadVersion.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    let authEventSeen = false;
    const processedOAuthCallbacks = new Set<string>();

    const completeOAuthCallback = async (callbackUrl: string) => {
      if (processedOAuthCallbacks.has(callbackUrl)) return;
      processedOAuthCallbacks.add(callbackUrl);
      try {
        const callback = new URL(callbackUrl);
        if (callback.protocol !== 'app.bunyan.residential:' || callback.hostname !== 'login-callback') return;

        oauthCallbackInProgress.current = true;
        setIsLoading(true);
        // Android closes the Custom Tab when it dispatches the app deep link.
        // Avoid closing it again while the Activity is being resumed.
        const oauthError = callback.searchParams.get('error_description') || callback.searchParams.get('error');
        if (oauthError) throw new Error(oauthError);

        const code = callback.searchParams.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {

          const hash = new URLSearchParams(callback.hash.replace(/^#/, ''));
          const accessToken = hash.get('access_token');
          const refreshToken = hash.get('refresh_token');
          if (!accessToken || !refreshToken) {
            throw new Error('لم يصل رمز تسجيل الدخول من Google. حاول تسجيل الدخول مرة أخرى.');
          }
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        }

        // Do not expose the login screen between token exchange and profile hydration.
        // The auth event may race with this callback, so hydrate from the confirmed session too.
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session?.user) throw new Error('تم تأكيد Google لكن لم يتم حفظ جلسة الدخول. حاول مرة أخرى.');
        await loadProfile(session.user);
      } catch (error) {
        if (active) setAuthError(friendlyError(error));
      } finally {
        oauthCallbackInProgress.current = false;
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

    // Subscribe before reading the stored session. Supabase emits INITIAL_SESSION
    // through this listener; a late getSession() result must not overwrite a newer
    // Google OAuth callback with a stale null session (which sent the app back to login).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventSeen = true;
      // Ignore a stale null event while the OAuth callback is exchanging its code.
      if (!session && oauthCallbackInProgress.current) return;
      if (active) window.setTimeout(() => {
        if (active && !(oauthCallbackInProgress.current && !session)) void loadProfile(session?.user ?? null);
      }, 0);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active && !authEventSeen) void loadProfile(session?.user ?? null);
    }).catch(error => {
      if (active) { setAuthError(friendlyError(error)); setIsLoading(false); }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
      if (appUrlListener) void appUrlListener.then(listener => listener.remove());
    };
  }, []);

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
    setUser(null); setUserProfile(null); setRole(null); setIsAdmin(false);
  };
  return <AuthContext.Provider value={{ user, userProfile, role, isAdmin, isLoading, authError,
    signInWithGoogle, signOut, clearError: () => setAuthError(null) }}>
    {children}
  </AuthContext.Provider>;
};
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
