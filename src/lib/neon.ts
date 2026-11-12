import { Capacitor } from '@capacitor/core';
import { CapacitorNeon, type Session as NativeSession } from '@capgo/capacitor-neon';
import { PostgrestClient } from '@supabase/postgrest-js';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';

export const isNeonBackend = import.meta.env.VITE_BACKEND_PROVIDER === 'neon';
export const isNeonCandidate = isNeonBackend && import.meta.env.VITE_NEON_CANDIDATE === 'true';
export const neonAuthUrl = 'https://ep-divine-water-bealxblt.neonauth.c-9.us-east-2.aws.neon.tech/neondb/auth';
const dataUrl = 'https://ep-divine-water-bealxblt.apirest.c-9.us-east-2.aws.neon.tech/neondb/rest/v1';
const functionsUrl = (import.meta.env.VITE_NEON_FUNCTIONS_URL || '').replace(/\/+$/, '');
let ready: Promise<void> | undefined;
let readSessionRefresh: Promise<NativeSession | null> | undefined;
const listeners = new Set<(event: AuthChangeEvent, session: Session | null) => void>();
const mappedIds = new Map<string, string>();

async function nativeReady() {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('CapacitorNeon')) {
    throw new Error('ثبّت نسخة تطبيق العمارة الجديدة لإكمال تسجيل الدخول.');
  }
  ready ??= (async () => {
    const listener = await CapacitorNeon.addListener('authStateChange', ({ event, session }) => {
      void toAppSession(session).then(mapped => {
        for (const listener of listeners) listener(event as AuthChangeEvent, mapped);
      }).catch(() => {});
    });
    try { await CapacitorNeon.initialize({ authUrl: neonAuthUrl, dataApiUrl: dataUrl }); }
    catch (error) { await listener.remove(); throw error; }
  })().catch(error => { ready = undefined; throw error; });
  await ready;
}
async function toAppSession(native: NativeSession | null): Promise<Session | null> {
  if (!native) return null;
  let id = mappedIds.get(native.user.id);
  if (!id) {
    const response = await fetch(dataUrl + '/rpc/resolve_app_identity', { method: 'POST',
      headers: { Authorization: `Bearer ${native.accessToken}`, 'Content-Type': 'application/json' }, body: '{}' });
    if (!response.ok) throw new Error('أكد بريدك الإلكتروني لإكمال الدخول واستعادة بيانات حسابك.');
    const value: unknown = await response.json();
    if (typeof value !== 'string') throw new Error('تعذر ربط بيانات الحساب. حاول مرة أخرى.');
    id = value;
    mappedIds.set(native.user.id, id);
  }
  const user: User = { id, email: native.user.email, app_metadata: {},
    user_metadata: { full_name: native.user.name || '' }, aud: 'authenticated',
    created_at: native.user.createdAt || '', email_confirmed_at: native.user.emailVerified ? native.user.createdAt : undefined };
  return { access_token: native.accessToken, refresh_token: native.refreshToken, token_type: 'bearer',
    expires_in: native.expiresIn, expires_at: native.expiresAt, user };
}
async function currentSession(): Promise<Session | null> {
  await nativeReady();
  return toAppSession((await CapacitorNeon.getSession()).session);
}
const data = new PostgrestClient(dataUrl, { fetch: async (input, init) => {
  await nativeReady();
  const session = (await CapacitorNeon.getSession()).session;
  if (!session) throw new Error('سجّل الدخول أولًا.');
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${session.accessToken}`);
  // PostgREST RPC parameter matching requires JSON Content-Type on Android.
  // Some native transports drop the implicit header even when a JSON body exists.
  if ((init?.method || 'GET').toUpperCase() === 'POST' && typeof init?.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  // Keep headers enumerable for Android/native fetch transports. A Headers
  // instance can lose Content-Type there, making JSON RPCs appear parameterless.
  const response = await fetch(input, { ...init, cache: 'no-store', headers: Object.fromEntries(headers) });
  // A cached native JWT can be rejected after resume. Retry one read with a
  // refreshed session; never replay mutations or RPCs, which may have side effects.
  if (response.status !== 401 || (init?.method || 'GET').toUpperCase() !== 'GET' || init?.signal?.aborted) return response;
  try {
    let refreshed = (await CapacitorNeon.getSession()).session;
    if (!refreshed || refreshed.accessToken === session.accessToken) {
      const refresh = readSessionRefresh ??= CapacitorNeon.refreshSession().then(result => result.session).finally(() => { readSessionRefresh = undefined; });
      refreshed = await refresh;
    }
    if (!refreshed || refreshed.user.id !== session.user.id) return response;
    const refreshedHeaders = new Headers(headers);
    refreshedHeaders.set('Authorization', `Bearer ${refreshed.accessToken}`);
    return fetch(input, { ...init, cache: 'no-store', headers: Object.fromEntries(refreshedHeaders) });
  } catch { return response; }
} });
function message(error: unknown): Error { return error instanceof Error ? error : new Error(String(error)); }
async function authOperation(operation: () => Promise<unknown>) {
  try { await nativeReady(); await operation(); return { data: { session: await currentSession() }, error: null }; }
  catch (error) { return { data: { session: null }, error: message(error) }; }
}
export async function startNeonGoogleSignIn() {
  if (!functionsUrl.startsWith('https://')) throw new Error('خدمة تسجيل الدخول غير جاهزة. حاول لاحقًا.');
  await nativeReady();
  await CapacitorNeon.signInWithOAuth({ provider: 'google', redirectTo: functionsUrl + '/auth/callback' });
  await currentSession();
}
export async function neonEmailRequest(path: string, body: Record<string, string>) {
  const response = await fetch(neonAuthUrl + path, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(typeof result.message === 'string' ? result.message : 'تعذر إكمال الطلب. راجع البيانات وحاول مرة أخرى.');
  }
}

class RefreshChannel {
  private timer?: ReturnType<typeof setInterval>;
  private watch?: { table: string; filter: string; callback: () => void };
  private previous?: string;
  private loading = false;
  private active = false;
  on(_event: string, config: { table: string; filter: string }, callback: () => void) {
    this.watch = { ...config, callback }; return this;
  }
  subscribe() {
    this.active = true;
    const refresh = async () => {
      if (!this.watch || this.loading || document.visibilityState === 'hidden') return;
      this.loading = true;
      try {
        const { table, filter, callback } = this.watch;
        if (!['profiles', 'app_notifications'].includes(table)) return;
        const match = filter.match(/^(id|recipient_id)=eq\.(.+)$/);
        if (!match) return;
        const columns = table === 'profiles' ? 'id,updated_at' : 'id,read_at';
        const result = await data.from(table).select(columns).eq(match[1], match[2]).order('id');
        if (result.error) return;
        const next = JSON.stringify(result.data);
        if (this.active && this.previous !== undefined && this.previous !== next) callback();
        this.previous = next;
      } finally { this.loading = false; }
    };
    this.timer = setInterval(() => { void refresh().catch(() => {}); }, 5000);
    void refresh().catch(() => {});
    return this;
  }
  unsubscribe() { this.active = false; clearInterval(this.timer); }
}

// The existing app keeps its centralized client and all current query builders.
// Auth uses native storage; no browser cookie or session token is persisted here.
export const neonClient = {
  from: data.from.bind(data), rpc: data.rpc.bind(data),
  channel: (_name: string) => new RefreshChannel(),
  async removeChannel(channel: RefreshChannel) { channel.unsubscribe(); return 'ok'; },
  auth: {
    refreshSession: () => authOperation(async () => {
      const result = await CapacitorNeon.refreshSession();
      if (result.session) mappedIds.delete(result.session.user.id);
    }),
    async getSession() { return { data: { session: await currentSession() }, error: null }; },
    async getUser() { return { data: { user: (await currentSession())?.user || null }, error: null }; },
    signInWithPassword: (args: { email: string; password: string }) => authOperation(() => CapacitorNeon.signInWithPassword(args)),
    signUp: (args: { email: string; password: string; options?: { data?: { full_name?: string } } }) =>
      authOperation(() => CapacitorNeon.signUp({ email: args.email, password: args.password, name: args.options?.data?.full_name })),
    verifyOtp: (args: { email: string; token: string; type?: 'signup' | 'email' }) => authOperation(() => CapacitorNeon.verifyOtp(args)),
    async resend(args: { email: string }) {
      try { await neonEmailRequest('/email-otp/send-verification-otp', { email: args.email.trim(), type: 'email-verification' }); return { data: {}, error: null }; }
      catch (error) { return { data: null, error: message(error) }; }
    },
    async signOut() { await nativeReady(); await CapacitorNeon.signOut(); mappedIds.clear(); return { error: null }; },
    onAuthStateChange(listener: (event: AuthChangeEvent, session: Session | null) => void) {
      listeners.add(listener);
      return { data: { subscription: { unsubscribe() { listeners.delete(listener); } } } };
    },
  },
  functions: { async invoke(name: string, options?: { body?: unknown }) {
    try {
      
      const session = await currentSession();
      if (!session || !functionsUrl.startsWith('https://')) throw new Error('خدمة التطبيق غير متاحة. سجّل الدخول وحاول مرة أخرى.');
      const response = await fetch(`${functionsUrl}/functions/v1/${encodeURIComponent(name)}`, {
        method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(options?.body || {}),
      });
      const result = await response.clone().json();
      if (!response.ok) return { data: null, error: { message: result.error || 'تعذر إكمال الطلب.', context: response.clone() } };
      return { data: result, error: null };
    } catch (error) { return { data: null, error: message(error) }; }
  } },
};
