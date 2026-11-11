import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

const nativeId = '11111111-1111-4111-8111-111111111111';
const appId = '22222222-2222-4222-8222-222222222222';
const compiled = await build({ entryPoints: ['src/lib/neon.ts'], bundle: true, write: false, format: 'cjs', platform: 'node',
  define: { 'import.meta.env.VITE_BACKEND_PROVIDER': '"neon"', 'import.meta.env.VITE_NEON_CANDIDATE': '"true"',
    'import.meta.env.VITE_NEON_FUNCTIONS_URL': '"https://backend.invalid"' },
  plugins: [{ name: 'native-auth-double', setup(builder) {
    builder.onResolve({ filter: /^@capacitor\/core$|^@capgo\/capacitor-neon$/ }, args => ({ path: args.path, namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const Capacitor=globalThis.mock.Capacitor;export const CapacitorNeon=globalThis.mock.Native;' }));
  } }],
});
function setup() {
  const requests = [];
  let session = { user: { id: nativeId, email: 'fixture@example.invalid', name: 'Fixture', emailVerified: true },
    accessToken: 'jwt-one', refreshToken: 'native-session-secret', tokenType: 'bearer', expiresIn: 900 };
  const mock = { initializeCount: 0, removals: 0, initializationFails: false, refreshCount: 0, unauthorizedReads: 0, unauthorizedWrites: false, nativeHeaderSerialization: false, resolvedId: appId,
    Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true },
    Native: {
      async initialize() { mock.initializeCount++; if (mock.initializationFails) throw Error('initialization unavailable'); },
      async addListener(_name, callback) { mock.listener = callback; return { remove: async () => { mock.removals++; } }; },
      async getSession() { return { session: session && structuredClone(session) }; },
      async refreshSession() { mock.refreshCount++; session.accessToken = 'jwt-refreshed'; return { session: structuredClone(session) }; },
      async signOut() { session = null; mock.listener?.({ event: 'SIGNED_OUT', session: null }); },
      async signInWithOAuth(options) { mock.oauthOptions = options; },
    },
  };
  const context = { mock, module: { exports: {} }, Headers, Request, Response, URL, URLSearchParams,
    AbortController, AbortSignal, TextEncoder, console, setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: { setItem() { throw Error('Session must not be saved in browser storage'); } },
    fetch: async (input, options) => {
      const url = String(input);
      requests.push({ url, options });
      if (url.endsWith('/rpc/resolve_app_identity')) return Response.json(mock.resolvedId);
      if (url.endsWith('/rpc/create_manager_building')) {
        // Native transports enumerate header fields; Headers instances expose no own fields.
        const wireHeaders = mock.nativeHeaderSerialization
          ? new Headers(Object.fromEntries(Object.entries(options?.headers || {})))
          : new Headers(options?.headers);
        if (wireHeaders.get('content-type') !== 'application/json') {
          return Response.json({ code: 'PGRST202', message: 'Could not find public.create_manager_building without parameters in the schema cache' }, { status: 404 });
        }
        const body = JSON.parse(options.body);
        if (!body.p_details) return Response.json({ message: 'Missing p_details' }, { status: 400 });
        return Response.json({ id: 'new-building', name: body.p_details.name });
      }
      if ((options?.method || 'GET') === 'GET' && mock.unauthorizedReads > 0) {
        mock.unauthorizedReads--; return Response.json({ message: 'JWT expired', code: 'PGRST301' }, { status: 401 });
      }
      if (options?.method === 'POST' && mock.unauthorizedWrites) return Response.json({ message: 'JWT expired' }, { status: 401 });
      if (url.includes('/functions/v1/generate-announcement-image')) return Response.json({error:'حصة الصور غير متاحة',code:'RESOURCE_EXHAUSTED'},{status:429});
      if (url.includes('/functions/v1/gemini-chat')) return Response.json({ text: 'fixture reply' });
      return Response.json([{ id: appId }]);
    },
  };
  vm.runInNewContext(compiled.outputFiles[0].text, context);
  return { api: context.module.exports, mock, requests, rotate: () => { session.accessToken = 'jwt-two'; } };
}
test('native session keeps the old application UUID and queries with the refreshed JWT', async () => {
  const { api, mock, requests, rotate } = setup();
  const result = await api.neonClient.auth.getSession();
  assert.equal(result.data.session.user.id, appId);
  assert.equal(result.data.session.access_token, 'jwt-one');
  assert.equal(mock.initializeCount, 1);
  rotate();
  const profile = await api.neonClient.from('profiles').select('id').eq('id', appId);
  assert.equal(profile.data[0].id, appId);
  assert.equal(requests.at(-1).options.cache, 'no-store');
  assert.equal(new Headers(requests.at(-1).options.headers).get('authorization'), 'Bearer jwt-two');
  const reply = await api.neonClient.functions.invoke('gemini-chat', { body: { messages: [] } });
  assert.equal(reply.data.text, 'fixture reply');
  assert.equal(mock.initializeCount, 1);
});
test('Neon allows authenticated building creation and application writes', async () => {
  const { api, requests } = setup();
  const create = await api.neonClient.rpc('create_building_with_opening_balance', {
    building_name: 'Test building', building_address: 'Test address',
    units_count: 2, floors_count: 1, opening_balance: 0,
  });
  assert.equal(create.error, null);
  assert.ok(requests.some(request => request.url.endsWith('/rpc/create_building_with_opening_balance')));
  const write = await api.neonClient.from('payments').insert({ amount: 1 });
  assert.equal(write.error, null);
  assert.ok(requests.some(request => request.url.endsWith('/payments')));
  const push = await api.neonClient.functions.invoke('send-announcement-push');
  assert.equal(push.error, null);
  assert.ok(requests.some(request => request.url.includes('/functions/v1/send-announcement-push')));
});
test('Google opens the deployed HTTPS callback and failed initialization removes its listener', async () => {
  const { api, mock } = setup();
  mock.initializationFails = true;
  await assert.rejects(api.neonClient.auth.getSession(), /initialization unavailable/);
  assert.equal(mock.removals, 1);
  mock.initializationFails = false;
  await api.startNeonGoogleSignIn();
  assert.equal(mock.oauthOptions.provider, 'google');
  assert.equal(mock.oauthOptions.redirectTo, 'https://backend.invalid/auth/callback');
  assert.equal(mock.initializeCount, 2);
});

test('a rejected read refreshes the native session once and replays only that read', async () => {
  const {api,mock,requests}=setup();
  mock.unauthorizedReads=1;
  const result=await api.neonClient.from('buildings').select('id');
  assert.equal(result.error,null);
  assert.equal(mock.refreshCount,1);
  const reads=requests.filter(r=>r.url.includes('/buildings'));
  assert.equal(reads.length,2);
  assert.equal(new Headers(reads[0].options.headers).get('authorization'),'Bearer jwt-one');
  assert.equal(new Headers(reads[1].options.headers).get('authorization'),'Bearer jwt-refreshed');
});
test('a persistent read rejection is bounded and no write is replayed', async () => {
  const {api,mock,requests}=setup();
  mock.unauthorizedReads=2;
  const rejected=await api.neonClient.from('buildings').select('id');
  assert.ok(rejected.error);
  assert.equal(mock.refreshCount,1);
  assert.equal(requests.filter(r=>r.url.includes('/buildings')).length,2);
  mock.unauthorizedWrites=true;
  const write=await api.neonClient.from('payments').insert({amount:100});
  assert.ok(write.error);
  assert.equal(requests.filter(r=>r.url.includes('/payments')).length,1);
  assert.equal(mock.refreshCount,1);
});

test('a read is not replayed under a different identity after refresh', async () => {
  const {api,mock,requests}=setup();
  mock.unauthorizedReads=1;
  mock.Native.refreshSession=async()=>({session:{user:{id:'another-native-user'},accessToken:'another-jwt'}});
  const result=await api.neonClient.from('buildings').select('id');
  assert.ok(result.error);
  assert.equal(requests.filter(r=>r.url.includes('/buildings')).length,1);
});
test('a failed native refresh returns the original rejection without replaying the read', async () => {
  const {api,mock,requests}=setup();
  mock.unauthorizedReads=1;
  mock.Native.refreshSession=async()=>{throw Error('Temporary auth outage')};
  const result=await api.neonClient.from('buildings').select('id');
  assert.ok(result.error);
  assert.equal(requests.filter(r=>r.url.includes('/buildings')).length,1);
});
test('explicit startup refresh restores the native session and original application identity', async () => {
  const {api,mock}=setup();
  const result=await api.neonClient.auth.refreshSession();
  assert.equal(result.error,null);
  assert.equal(result.data.session.user.id,appId);
  assert.equal(result.data.session.access_token,'jwt-refreshed');
  assert.equal(mock.refreshCount,1);
});

test('native RPC transport preserves JSON content type, authorization and nested building parameters', async () => {
  const { api, mock, requests } = setup();
  mock.nativeHeaderSerialization = true;
  const details = { name: 'برج الاختبار', address: 'عنوان', totalFloors: 4, totalUnits: 14,
    monthlyTarget: 28000, reserveFund: 500, managerName: 'مدير', managerPhone: '01012345678' };
  const result = await api.neonClient.rpc('create_manager_building', { p_details: details });
  assert.equal(result.error, null);
  assert.equal(result.data.id, 'new-building');
  const request = requests.find(r => r.url.endsWith('/rpc/create_manager_building'));
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers instanceof Headers, false);
  const headers = new Headers(Object.fromEntries(Object.entries(request.options.headers)));
  assert.equal(headers.get('content-type'), 'application/json');
  assert.equal(headers.get('authorization'), 'Bearer jwt-one');
  assert.deepEqual(JSON.parse(request.options.body), { p_details: details });
  assert.equal(requests.filter(r => r.url.endsWith('/rpc/create_manager_building')).length, 1);
});

test('retried native reads also keep their authorization headers enumerable', async () => {
  const { api, mock, requests } = setup();
  mock.unauthorizedReads = 1;
  const result = await api.neonClient.from('buildings').select('id');
  assert.equal(result.error, null);
  const reads = requests.filter(r => r.url.includes('/buildings'));
  assert.equal(reads.length, 2);
  for (const request of reads) {
    assert.equal(request.options.headers instanceof Headers, false);
    assert.ok(Object.entries(request.options.headers).some(([key]) => key.toLowerCase() === 'authorization'));
  }
});

test('forced native renewal revalidates the server mapping instead of keeping a stale application UUID', async () => {
  const { api, mock } = setup();
  assert.equal((await api.neonClient.auth.getSession()).data.session.user.id, appId);
  mock.resolvedId = '33333333-3333-4333-8333-333333333333';
  const renewed = await api.neonClient.auth.refreshSession();
  assert.equal(renewed.error, null);
  assert.equal(renewed.data.session.user.id, mock.resolvedId);
});

test('function failures preserve a readable provider response and its Arabic message', async()=>{
 const {api}=setup();
 const result=await api.neonClient.functions.invoke('generate-announcement-image',{body:{prompt:'fixture'}});
 assert.equal(result.data,null);
 assert.equal(result.error.message,'حصة الصور غير متاحة');
 assert.equal((await result.error.context.json()).code,'RESOURCE_EXHAUSTED');
});
