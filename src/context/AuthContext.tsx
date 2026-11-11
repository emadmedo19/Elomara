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
  refreshProfile: (expectedBuildingId?: string, renewSession?: boolean) => Promise<void>;
  profileRecoveryError: string | null;
  holdMembership: () => () => void;
  membershipSyncError: { buildingId: string; message: string } | null;
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
  const verifiedProfile = useRef<UserProfile | null>(null);
  const [profileRecoveryError, setProfileRecoveryError] = useState<string | null>(null);
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
  const membershipSync = useRef<{ userId: string; buildingId: string; kind: 'write' | 'creation' | 'resume' } | null>(null);
  const membershipSyncVersion = useRef(0);
  const [isSyncingMembership, setIsSyncingMembership] = useState(false);
  const [membershipSyncError, setMembershipSyncError] = useState<{ buildingId: string; message: string } | null>(null);

  const loadProfile = async (currentUser: User | null, quiet = false, expectedBuildingId?: string, ownsTransition = false): Promise<boolean> => {
    // A confirmed creation owns the profile transition. Background reads cannot
    // restore an older pending profile while its new membership is being verified.
    if (membershipSync.current && currentUser?.id === membershipSync.current.userId && !expectedBuildingId && !ownsTransition) return false;
    if (membershipSync.current && currentUser?.id !== membershipSync.current.userId) {
      membershipSync.current = null; membershipSyncVersion.current++;
      setIsSyncingMembership(false); setMembershipSyncError(null);
    }
    const loadVersion = ++profileLoadVersion.current;
    currentUserId.current = currentUser?.id;
    setUser(currentUser);
    if (!currentUser) {
      profileReadUser.current = undefined;
      verifiedProfile.current = null; setProfileRecoveryError(null);
      setUserProfile(null); setRole(null); setIsAdmin(false); setIsLoading(false);
      return false;
    }
    profileReadUser.current = currentUser.id;
    if (!quiet) setIsLoading(true);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    try {
      const request = isNeonBackend ? supabase.rpc('get_current_membership').abortSignal(controller.signal)
        : supabase.from('profiles')
          .select('id, full_name, phone, role, building_id, apartment_id, approved, disabled_at, resident_label')
          .eq('id', currentUser.id).abortSignal(controller.signal).maybeSingle();
      const { data, error } = await Promise.race([
        Promise.resolve(request),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => {
          controller.abort(); reject(new Error('تعذر تحديث الحساب في الوقت المحدد'));
        }, 7000); }),
      ]);
      if (error) throw error;
      if (loadVersion !== profileLoadVersion.current) return false;
      if (isNeonBackend && (!data || data.id !== currentUser.id || typeof data.approved !== 'boolean'
        || !['building_admin','owner','tenant','pending'].includes(data.role))) {
        throw new Error('تعذر تأكيد بيانات الحساب الحالية');
      }
      if (expectedBuildingId && (!data || data.id !== currentUser.id || data.role !== 'building_admin'
        || data.approved !== true || data.disabled_at || data.building_id !== expectedBuildingId)) return false;
      const profile: UserProfile | null = data ? {
        uid: data.id, email: currentUser.email ?? null,
        displayName: data.full_name || currentUser.user_metadata?.full_name || currentUser.email || null,
        role: data.role as UserProfile['role'],
        buildingId: data.building_id || undefined, apartmentId: data.apartment_id || undefined,
        phone: data.phone || undefined, residentLabel: data.resident_label || undefined,
        status: data.disabled_at ? 'suspended' : data.approved ? 'active' : 'pending',
      } : null;
      verifiedProfile.current = profile; setProfileRecoveryError(null);
      setUserProfile(profile); setRole(profile?.role ?? null);
      const admin = profile?.role === 'building_admin';
      setIsAdmin(Boolean(admin && profile?.status === 'active'));
      return true;
    } catch (error) {
      if (loadVersion === profileLoadVersion.current) {
        console.error('Account profile loading failed:', error);
        // Keep only the same identity's verified profile during transient failures.
        if (verifiedProfile.current?.uid !== currentUser.id) {
          setUserProfile(null); setRole(null); setIsAdmin(false); verifiedProfile.current = null;
        }
        if (isNeonBackend && !expectedBuildingId) setProfileRecoveryError('تعذر التحقق من بيانات حسابك. أعد المحاولة لاستعادة العمارة.');
        if (!quiet) setAuthError('تعذر تحديث بيانات الحساب مؤقتًا. حاول مرة أخرى.');
      }
      return false;
    } finally {
      clearTimeout(timeout);
      if (loadVersion === profileLoadVersion.current) { profileReadUser.current = undefined; setIsLoading(false); }
    }
  };

  const holdMembership = () => {
    if (!user || currentUserId.current !== user.id) return () => {};
    const version = ++membershipSyncVersion.current;
    membershipSync.current = { userId: user.id, buildingId: '', kind: 'write' };
    ++profileLoadVersion.current;
    // Never freeze background membership checks indefinitely if a write stalls.
    const timer = setTimeout(() => {
      if (version === membershipSyncVersion.current) {
        membershipSync.current = null; membershipSyncVersion.current++;
      }
    }, 15000);
    return () => {
      clearTimeout(timer);
      if (version === membershipSyncVersion.current) {
        membershipSync.current = null; membershipSyncVersion.current++;
      }
    };
  };

  const refreshProfile = async (expectedBuildingId?: string, renewSession = false) => {
    if (!user || currentUserId.current !== user.id) return;
    if (!expectedBuildingId && !renewSession) { await loadProfile(user, true); return; }
    const version = ++membershipSyncVersion.current;
    membershipSync.current = { userId: user.id, buildingId: expectedBuildingId || '', kind: renewSession ? 'resume' : 'creation' };
    ++profileLoadVersion.current; // Invalidate reads started before the creation committed.
    setMembershipSyncError(null); setProfileRecoveryError(null);
    setIsSyncingMembership(!renewSession || verifiedProfile.current?.uid !== user.id);
    let lookupUser = user;
    if (renewSession && isNeonBackend) {
      let sessionTimeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          supabase.auth.refreshSession(),
          new Promise<never>((_, reject) => { sessionTimeout = setTimeout(() => reject(new Error('Session refresh timed out')), 7000); }),
        ]);
        if (version !== membershipSyncVersion.current || currentUserId.current !== user.id) return;
        if (result.error) throw result.error;
        const restored = result.data.session?.user;
        if (!restored || restored.id !== user.id) {
          await loadProfile(restored || null); return;
        }
        lookupUser = restored;
      } catch {
        if (version === membershipSyncVersion.current) {
          setIsSyncingMembership(false);
          setProfileRecoveryError('تعذر استعادة اتصال حسابك. تأكد من الإنترنت واضغط إعادة المحاولة.');
        }
        return;
      } finally { clearTimeout(sessionTimeout); }
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      if (version !== membershipSyncVersion.current || currentUserId.current !== user.id) return;
      if (await loadProfile(lookupUser, true, expectedBuildingId, true)) {
        if (version === membershipSyncVersion.current) {
          membershipSync.current = null; setIsSyncingMembership(false);
        }
        return;
      }
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
    }
    if (version === membershipSyncVersion.current && currentUserId.current === user.id) {
      setIsSyncingMembership(false);
      if (renewSession) { setProfileRecoveryError('تعذر التحقق من بيانات حسابك الحالية. اضغط إعادة المحاولة لاستعادة العمارة.'); return; }
      setMembershipSyncError({ buildingId: expectedBuildingId!,
        message: 'تم حفظ العمارة، لكن تعذر تحديث بيانات حسابك. اضغط إعادة المحاولة للدخول إليها.' });
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
        const quietRefresh = Boolean(session && session.user.id === currentUserId.current && session.user.id === currentProfileId.current);
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
        if (active && currentUserId.current === user.id && session?.user.id === user.id) void loadProfile(session.user, true);
      }).catch(() => {});
    };
    const channel = supabase.channel(`own-membership-${user.id}`).on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}`,
    }, refreshMembership).subscribe();
    let resuming = false; let lastResume = 0;
    const resume = () => {
      if (!active || currentUserId.current !== user.id || (membershipSync.current && membershipSync.current.kind !== 'resume') || resuming || Date.now()-lastResume<1000) return;
      lastResume=Date.now(); resuming=true;
      void refreshProfile(undefined, true).finally(() => { resuming=false; });
    };
    const visibleResume = () => { if (document.visibilityState !== 'hidden') resume(); };
    const nativeResume = CapacitorApp.addListener('appStateChange', ({ isActive }) => { if (isActive) resume(); });
    const interval = window.setInterval(refreshMembership, 60000);
    window.addEventListener('focus', visibleResume);
    document.addEventListener('visibilitychange', visibleResume);
    return () => {
      active = false; window.clearInterval(interval);
      window.removeEventListener('focus', visibleResume);
      document.removeEventListener('visibilitychange', visibleResume);
      void nativeResume.then(listener => listener.remove());
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
    membershipSync.current = null; membershipSyncVersion.current++;
    ++profileLoadVersion.current; currentUserId.current = undefined;
    verifiedProfile.current = null; setProfileRecoveryError(null);
    setIsSyncingMembership(false); setMembershipSyncError(null);
    const { error } = await supabase.auth.signOut();
    if (error) setAuthError(friendlyError(error));
    setUser(null); setUserProfile(null); setRole(null); setIsAdmin(false);
  };
  return <AuthContext.Provider value={{ user, userProfile, role, isAdmin, isLoading: isLoading || isSyncingMembership, authError,
    signInWithGoogle, signInWithEmail, signUpWithEmail, sendPasswordReset, updatePassword,
    isPasswordRecovery, clearPasswordRecovery: () => setIsPasswordRecovery(false),
    needsEmailVerification, verifyEmail,
    cancelEmailVerification: () => { setNeedsEmailVerification(false); setAuthError(null); },
    signOut, clearError: () => setAuthError(null),
    refreshProfile, holdMembership, membershipSyncError, profileRecoveryError }}>
    {children}
  </AuthContext.Provider>;
};
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
