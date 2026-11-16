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
      // Android reports INITIAL_SESSION=null after a transient restore failure.
      // Let the explicit getSession() attempt recovery before notifying the app.
      if (event === 'INITIAL_SESSION' && !session) return;
      void toAppSession(session).then(mapped => {
        for (const listener of listeners) listener(event as AuthChangeEvent, mapped);
      }).catch(error => {
        // An identity lookup failure is not a sign-out.
        console.warn('Neon session event could not be verified:', error instanceof Error ? error.message : 'temporary error');
      });
    });
    try { await CapacitorNeon.initialize({ authUrl: neonAuthUrl, dataApiUrl: dataUrl }); }
    catch (error) { await listener.remove(); throw error; }
  })().catch(error => { ready = undefined; throw error; });
  await ready;
}
function refreshNativeSessionOnce(): Promise<NativeSession | null> {
  readSessionRefresh ??= CapacitorNeon.refreshSession().then(result => result.session).finally(() => {
    readSessionRefresh = undefined;
  });
  return readSessionRefresh;
}
async function toAppSession(native: NativeSession | null): Promise<Session | null> {
  if (!native) return null;
  let effectiveNative = native;
  let id = mappedIds.get(native.user.id);
  if (!id) {
    // This RPC reuses the same user mapping on retry; never replay financial writes.
    const resolveIdentity = (session: NativeSession) => fetch(dataUrl + '/rpc/resolve_app_identity', {
      method: 'POST', cache: 'no-store',
      headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' }, body: '{}',
    });
    let renewed = false;
    for (let attempt = 0; attempt < 4 && !id; attempt++) {
      let response: Response;
      try {
        response = await resolveIdentity(effectiveNative);
      } catch {
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
          continue;
        }
        throw new Error('تعذر استعادة جلسة الدخول بسبب الاتصال. تأكد من الإنترنت واضغط إعادة المحاولة.');
      }
      if (response.ok) {
        const value: unknown = await response.json();
        if (typeof value !== 'string') throw new Error('تعذر ربط بيانات الحساب. حاول مرة أخرى.');
        id = value;
        mappedIds.set(native.user.id, id);
        break;
      }
      const failure = await response.json().catch(() => null) as { message?: unknown; code?: unknown } | null;
      const serverMessage = typeof failure?.message === 'string' ? failure.message : '';
      const code = typeof failure?.code === 'string' ? failure.code : '';
      const actualEmailVerification = /verify.*email|email.*verif/i.test(serverMessage);
      const invalidToken = response.status === 401 ||
        (response.status === 403 && (['PGRST301', 'PGRST303'].includes(code) ||
          /jwt|token expired|authentication required|invalid token/i.test(serverMessage)));
      if (invalidToken && !renewed && attempt < 3) {
        let restored: NativeSession | null = null;
        try {
          restored = (await CapacitorNeon.getSession()).session;
          if (!restored || restored.user.id !== native.user.id || restored.accessToken === effectiveNative.accessToken) {
            restored = await refreshNativeSessionOnce();
          }
        } catch {
          throw new Error('تعذر تجديد جلسة الدخول. تأكد من الإنترنت واضغط إعادة المحاولة.');
        }
        if (!restored || restored.user.id !== native.user.id) {
          throw new Error('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.');
        }
        effectiveNative = restored;
        renewed = true;
        continue;
      }
      if ((response.status === 408 || response.status === 429 || response.status >= 500) && attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
        continue;
      }
      if (actualEmailVerification) throw new Error('أكد بريدك الإلكتروني لإكمال الدخول واستعادة بيانات حسابك.');
      console.warn('Neon identity lookup rejected:', response.status, code || 'no-code');
      throw new Error(`تعذر استعادة جلسة الدخول (رمز ${response.status}${code ? '-' + code : ''}). اضغط إعادة المحاولة.`);
    }
    if (!id) throw new Error('تعذر استعادة جلسة الدخول. اضغط إعادة المحاولة.');
  }
  const user: User = { id, email: effectiveNative.user.email, app_metadata: {},
    user_metadata: { full_name: effectiveNative.user.name || '' }, aud: 'authenticated',
    created_at: effectiveNative.user.createdAt || '',
    email_confirmed_at: effectiveNative.user.emailVerified ? effectiveNative.user.createdAt : undefined };
  return { access_token: effectiveNative.accessToken, refresh_token: effectiveNative.refreshToken,
    token_type: 'bearer', expires_in: effectiveNative.expiresIn, expires_at: effectiveNative.expiresAt, user };
}
async function currentSession(): Promise<Session | null> {
  await nativeReady();
  const initial = (await CapacitorNeon.getSession()).session;
  if (initial) return toAppSession(initial);
  // The native plugin returns null for both "no account" and a recoverable
  // networking error. Forced refresh distinguishes these situations.
  try {
    const restored = await refreshNativeSessionOnce();
    return toAppSession(restored);
  } catch (error) {
    if (/no active session/i.test(error instanceof Error ? error.message : String(error))) return null;
    throw new Error('تعذر استعادة جلسة الدخول تلقائيًا. تأكد من الإنترنت واضغط إعادة المحاولة.');
  }
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
      refreshed = await refreshNativeSessionOnce();
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
// Use an explicit JSON request for the building update. Native Android transports
// can otherwise send an empty RPC body, which PostgREST interprets as no arguments.
export async function updateNeonBuilding(buildingId: string, details: Record<string, unknown>): Promise<void> {
  await nativeReady();
  const session = (await CapacitorNeon.getSession()).session;
  if (!session) throw new Error('سجّل الدخول أولًا.');
  const response = await fetch(dataUrl + '/rpc/update_manager_building', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ p_building_id: buildingId, p_details: details }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(typeof error.message === 'string' ? error.message : 'تعذر تحديث بيانات العمارة.');
  }
}

// Building mutations use a literal JSON request, matching the established native
// update path. Do not pass these through an SDK request builder or replay writes.
async function buildingJsonRpc(name: string, params: object, completedId?:string): Promise<Record<string,unknown>&{id:string}> {
  await nativeReady();
  const session=(await CapacitorNeon.getSession()).session;
  if(!session)throw new Error('سجّل الدخول أولًا.');
  let response:Response;
  try {
    response=await fetch(dataUrl+'/rpc/'+name,{method:'POST',cache:'no-store',headers:{Authorization:`Bearer ${session.accessToken}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(params)});
  }catch {throw new Error('تعذر الاتصال بخادم العمارة. لم يتم تأكيد الحفظ؛ أعد المحاولة.');}
  const payload:unknown=await response.json().catch(()=>null);
  const result=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload as Record<string,unknown>:null;
  if(response.status===401)throw new Error('انتهت جلسة الدخول. أعد تسجيل الدخول ثم حاول الحفظ.');
  if(!response.ok){
    if(result?.code==='PGRST202')throw new Error('تعذر بدء حفظ بيانات العمارة على الخادم. أعد فتح التطبيق بعد التحديث وحاول مرة أخرى.');
    throw Object.assign(new Error(typeof result?.message==='string'?result.message:'تعذر تأكيد حفظ بيانات العمارة.'),{httpStatus:response.status});
  }
  if(payload===null&&completedId)return {id:completedId};
  if(!result||typeof result.id!=='string')throw new Error('لم تصل نتيجة مؤكدة لحفظ بيانات العمارة. أعد تحميل الأرصدة قبل المحاولة مجددًا.');
  return {...result,id:result.id};
}
export function saveNeonBuildingManagement(buildingId:string,details:object,finance:object|null) {
  return buildingJsonRpc('save_building_management',{p_building_id:buildingId,p_details:details,p_finance:finance});
}
export function createNeonBuildingWithFinances(details:object,finance:object|null) {
  return buildingJsonRpc('create_manager_building_with_finances',{p_details:details,p_finance:finance});
}

export function saveNeonHistoricalMonthlyAllocations(buildingId:string,allocations:object[]) {
  return buildingJsonRpc('save_historical_monthly_allocations',{p_building_id:buildingId,p_allocations:allocations},buildingId);
}

export function completeNeonBuildingSetup(requestId:string,details:object,history:object,buildingId:string|null){
 return buildingJsonRpc('complete_guided_building_setup',{p_request_id:requestId,p_details:details,p_history:history,p_building_id:buildingId});
}
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
