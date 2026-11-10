import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isNeonBackend, neonEmailRequest, startNeonGoogleSignIn } from '../lib/neon';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: 'building_admin' | 'owner' | 'tenant' | 'pending';
  apartmentId?: string;
  buildingId?: string;
  phone?: string;
  residentLabel?: string;
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
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (fullName: string, email: string, password: string) => Promise<boolean>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string, token?: string) => Promise<void>;
  needsEmailVerification: boolean;
  verifyEmail: (email: string, token: string, password: string) => Promise<void>;
  cancelEmailVerification: () => void;
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
  signOut: () => Promise<void>;
  clearError: () => void;
  refreshProfile: () => Promise<void>;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
const getAuthRedirectUrl = (path: 'login-callback' | 'reset-password' = 'login-callback') => Capacitor.isNativePlatform()
  ? 'app.bunyan.residential://' + path
  : path === 'reset-password' ? window.location.origin + '/reset-password' : window.location.origin;

const friendlyError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return message || 'حصل خطأ غير متوقع. حاول مرة أخرى.';
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const currentUserId = useRef(user?.id); currentUserId.current = user?.id;
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const currentProfileId = useRef(userProfile?.uid); currentProfileId.current = userProfile?.uid;
  const [role, setRole] = useState<UserProfile['role'] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const recoveryEmail = useRef('');
  const profileLoadVersion = useRef(0);
  const profileReadUser = useRef<string | undefined>(undefined);
  const oauthCallbackInProgress = useRef(false);

  const loadProfile = async (currentUser: User | null, quiet = false) => {
    const loadVersion = ++profileLoadVersion.current;
    setUser(currentUser);
    if (!currentUser) {
      profileReadUser.current = undefined;
      setUserProfile(null); setRole(null); setIsAdmin(false); setIsLoading(false);
      return;
    }
    profileReadUser.current = currentUser.id;
    if (!quiet) setIsLoading(true);
    try {
      const { data, error } = await supabase.from('profiles')
        .select('id, full_name, phone, role, building_id, apartment_id, approved, disabled_at, resident_label')
        .eq('id', currentUser.id).maybeSingle();
      if (error) throw error;
      if (loadVersion !== profileLoadVersion.current) return;
      const profile: UserProfile | null = data ? {
        uid: data.id, email: currentUser.email ?? null,
        displayName: data.full_name || currentUser.user_metadata?.full_name || currentUser.email || null,
        role: data.role as UserProfile['role'],
        buildingId: data.building_id || undefined, apartmentId: data.apartment_id || undefined,
        phone: data.phone || undefined, residentLabel: data.resident_label || undefined,
        status: data.disabled_at ? 'suspended' : data.approved ? 'active' : 'pending',
      } : null;
      setUserProfile(profile); setRole(profile?.role ?? null);
      const admin = profile?.role === 'building_admin';
      setIsAdmin(Boolean(admin && profile?.status === 'active'));
    } catch (error) {
      if (loadVersion === profileLoadVersion.current && !quiet) {
        console.error('Account profile loading failed:', error);
        setUserProfile(null); setRole(null); setIsAdmin(false);
        setAuthError('تم تسجيل الدخول لكن تعذر تحميل بيانات الحساب. حاول مرة أخرى.');
      }
    } finally {
      if (loadVersion === profileLoadVersion.current) { profileReadUser.current = undefined; setIsLoading(false); }
    }
  };

  useEffect(() => {
    let active = true;
    let authEventSeen = false;
    const processedOAuthCallbacks = new Set<string>();

    const completeOAuthCallback = async (callbackUrl: string) => {
      if (isNeonBackend) return; // The native Neon plugin owns verifier exchange.
      if (processedOAuthCallbacks.has(callbackUrl)) return;
      processedOAuthCallbacks.add(callbackUrl);
      try {
        const callback = new URL(callbackUrl);
        if (callback.protocol !== 'app.bunyan.residential:' || !['login-callback', 'reset-password'].includes(callback.hostname)) return;
        const isRecoveryCallback = callback.hostname === 'reset-password' ||
          callback.searchParams.get('type') === 'recovery' ||
          new URLSearchParams(callback.hash.replace(/^#/, '')).get('type') === 'recovery';
        if (isRecoveryCallback) setIsPasswordRecovery(true);

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
        if (active) {
          setAuthError(friendlyError(error));
          setIsLoading(false);
        }
      } finally {
        oauthCallbackInProgress.current = false;
      }
    };

    let appUrlListener: ReturnType<typeof CapacitorApp.addListener> | null = null;
    if (Capacitor.isNativePlatform()) {
      appUrlListener = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
        void completeOAuthCallback(url);
      });
      // A reset link may open an already-running Android activity or cold-start it.
      // Handle both, including the resume after returning from the email browser.
      const readLaunchUrl = () => {
        void CapacitorApp.getLaunchUrl().then((launch) => {
          if (launch?.url) void completeOAuthCallback(launch.url);
        }).catch((error) => {
          if (active) setAuthError(friendlyError(error));
        });
      };
      readLaunchUrl();
    } else if (window.location.pathname === '/reset-password') {
      // Web recovery links must also show the password form over any existing session.
      setIsPasswordRecovery(true);
    }

    // Subscribe before reading the stored session. Supabase emits INITIAL_SESSION
    // through this listener; a late getSession() result must not overwrite a newer
    // Google OAuth callback with a stale null session (which sent the app back to login).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
      authEventSeen = true;
      // The current profile read already uses the renewed token. Starting
      // another one here can feed back into repeated 401/session refreshes.
      if (event === 'TOKEN_REFRESHED' && session && session.user.id === profileReadUser.current) return;
      // Ignore a stale null event while the OAuth callback is exchanging its code.
      if (!session && oauthCallbackInProgress.current) return;
      if (active) window.setTimeout(() => {
        if (!active || (oauthCallbackInProgress.current && !session)) return;
        // Neon may emit a transient null while Android restores its persisted session.
        // Confirm a missing session before showing login, rather than flashing the
        // login page and requiring the user to restart the app.
        if (isNeonBackend && !session) {
          void supabase.auth.getSession().then(({ data: { session: restored } }) => {
            if (active) void loadProfile(restored?.user ?? null);
          }).catch(error => {
            if (active) { setAuthError(friendlyError(error)); setIsLoading(false); }
          });
          return;
        }
        // Renewing a known user's token is a background profile check. A
        // temporary data failure must not discard the already verified profile.
        const quietRefresh = event === 'TOKEN_REFRESHED' && Boolean(session && session.user.id === currentUserId.current && session.user.id === currentProfileId.current);
        void loadProfile(session?.user ?? null, quietRefresh);
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

  // Membership removal must be reflected without requiring a logout. The DB
  // policies already reject old access tokens once the profile is detached.
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const refreshMembership = () => {
      if (document.visibilityState === 'hidden') return;
      void supabase.auth.getSession().then(({ data: { session } }) => {
        if (active && session?.user.id === user.id) void loadProfile(session.user, true);
      }).catch(() => {});
    };
    const channel = supabase.channel(`own-membership-${user.id}`).on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}`,
    }, refreshMembership).subscribe();
    const interval = window.setInterval(refreshMembership, 60000);
    window.addEventListener('focus', refreshMembership);
    document.addEventListener('visibilitychange', refreshMembership);
    return () => {
      active = false; window.clearInterval(interval);
      window.removeEventListener('focus', refreshMembership);
      document.removeEventListener('visibilitychange', refreshMembership);
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const signInWithGoogle = async () => {
    setAuthError(null);
    setIsLoading(true);
    try {
      if (isNeonBackend) {
        await startNeonGoogleSignIn();
        setIsLoading(false);
        return;
      }
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

  const signInWithEmail = async (email: string, password: string) => {
    setAuthError(null); setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    } catch (error) {
      if (isNeonBackend && /email.*verif|verif.*email/i.test(friendlyError(error))) setNeedsEmailVerification(true);
      setAuthError(friendlyError(error)); setIsLoading(false);
    }
  };

  const signUpWithEmail = async (fullName: string, email: string, password: string) => {
    setAuthError(null); setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { data: { full_name: fullName.trim() }, emailRedirectTo: getAuthRedirectUrl() },
      });
      if (error) throw error;
      if (!data.session) { setNeedsEmailVerification(isNeonBackend); setIsLoading(false); return false; }
      return true;
    } catch (error) { setAuthError(friendlyError(error)); setIsLoading(false); return false; }
  };

  const sendPasswordReset = async (email: string) => {
    setAuthError(null); setIsLoading(true);
    try {
      if (isNeonBackend) {
        await neonEmailRequest('/email-otp/send-verification-otp', { email: email.trim(), type: 'forget-password' });
        recoveryEmail.current = email.trim();
        setIsPasswordRecovery(true);
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: getAuthRedirectUrl('reset-password') });
      if (error) throw error;
    } catch (error) { setAuthError(friendlyError(error)); throw error; }
    finally { setIsLoading(false); }
  };

  const updatePassword = async (password: string, token?: string) => {
    setAuthError(null); setIsLoading(true);
    try {
      if (isNeonBackend) {
        if (!token?.trim() || !recoveryEmail.current) throw new Error('اكتب رمز التأكيد المرسل لبريدك الإلكتروني.');
        await neonEmailRequest('/email-otp/reset-password', { email: recoveryEmail.current, otp: token.trim(), password });
        recoveryEmail.current = '';
        setIsPasswordRecovery(false);
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setIsPasswordRecovery(false);
    } catch (error) { setAuthError(friendlyError(error)); throw error; }
    finally { setIsLoading(false); }
  };

  const verifyEmail = async (email: string, token: string, password: string) => {
    setAuthError(null); setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'signup' });
      if (error) throw error;
      if (!data.session) {
        const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (result.error) throw result.error;
      }
      setNeedsEmailVerification(false);
    } catch (error) { setAuthError(friendlyError(error)); throw error; }
    finally { setIsLoading(false); }
  };

  const signOut = async () => {
    setAuthError(null);
    const { error } = await supabase.auth.signOut();
    if (error) setAuthError(friendlyError(error));
    setUser(null); setUserProfile(null); setRole(null); setIsAdmin(false);
  };
  return <AuthContext.Provider value={{ user, userProfile, role, isAdmin, isLoading, authError,
    signInWithGoogle, signInWithEmail, signUpWithEmail, sendPasswordReset, updatePassword,
    isPasswordRecovery, clearPasswordRecovery: () => setIsPasswordRecovery(false),
    needsEmailVerification, verifyEmail,
    cancelEmailVerification: () => { setNeedsEmailVerification(false); setAuthError(null); },
    signOut, clearError: () => setAuthError(null),
    refreshProfile: async () => { if (user && currentUserId.current === user.id) await loadProfile(user, true); } }}>
    {children}
  </AuthContext.Provider>;
};
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
