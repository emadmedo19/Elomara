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
  const mock = { initializeCount: 0, removals: 0, initializationFails: false, refreshCount: 0, unauthorizedReads: 0, unauthorizedWrites: false, nativeHeaderSerialization: false, resolvedId: appId, identityUnauthorized: 0, identityForbiddenOnce: 0, identityUnavailable: 0, identityFailure: null,
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
      if (url.endsWith('/rpc/resolve_app_identity')) {
        if (mock.identityUnauthorized > 0) {
          mock.identityUnauthorized--;
          return Response.json({ message: 'JWT expired' }, { status: 401 });
        }
        if (mock.identityForbiddenOnce > 0) { mock.identityForbiddenOnce--; return Response.json({message:'Authentication required',code:'42501'},{status:403}); }
        if (mock.identityUnavailable > 0) { mock.identityUnavailable--; return Response.json({message:'Service temporarily unavailable'},{status:503}); }
        if (mock.identityFailure) return Response.json({ message: mock.identityFailure }, { status: 403 });
        return Response.json(mock.resolvedId);
      }
      if(url.endsWith('/rpc/complete_guided_building_setup')){const args=JSON.parse(options.body);assert.ok(args.p_request_id);assert.ok(args.p_history);assert.equal(options.headers['Content-Type'],'application/json');return Response.json({id:'guided-building'});}
      if(url.endsWith('/rpc/save_historical_monthly_allocations')){
        const args=JSON.parse(options.body);assert.ok(Array.isArray(args.p_allocations));
        assert.equal(options.headers['Content-Type'],'application/json');return new Response(null,{status:204});
      }
      if(url.endsWith('/rpc/save_building_management')||url.endsWith('/rpc/create_manager_building_with_finances')){
        if(mock.buildingRpcUnauthorized)return Response.json({message:'JWT expired'},{status:401});
        if(mock.buildingRpcSchemaError)return Response.json({code:'PGRST202',message:'Could not find function without parameters'},{status:404});
        const wireHeaders=new Headers(Object.fromEntries(Object.entries(options?.headers||{})));
        if(wireHeaders.get('content-type')!=='application/json'||!Object.hasOwn(options,'body'))return Response.json({code:'PGRST202',message:'Missing JSON parameters'},{status:404});
        const args=JSON.parse(options.body);
        if(!args.p_details)return Response.json({message:'Missing details'},{status:400});
        return Response.json({id:args.p_building_id||'new-building',name:args.p_details.name,balance:13000});
      }
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

test('identity mapping after idle renews an expired native token without logging the user out', async () => {
  const { api, mock, requests } = setup();
  mock.identityUnauthorized = 1;
  const result = await api.neonClient.auth.getSession();
  assert.equal(result.data.session.user.id, appId);
  assert.equal(result.data.session.access_token, 'jwt-refreshed');
  assert.equal(mock.refreshCount, 1);
  const identityRequests = requests.filter(r => r.url.endsWith('/rpc/resolve_app_identity'));
  assert.equal(identityRequests.length, 2);
  assert.equal(new Headers(identityRequests[0].options.headers).get('authorization'), 'Bearer jwt-one');
  assert.equal(new Headers(identityRequests[1].options.headers).get('authorization'), 'Bearer jwt-refreshed');
});
test('only a real email-verification rejection asks to confirm email', async () => {
  const { api, mock } = setup();
  mock.identityFailure = 'Verify your email before accessing the application';
  await assert.rejects(api.neonClient.auth.getSession(), /أكد بريدك الإلكتروني/);
  assert.equal(mock.refreshCount, 0);
});
test('other identity mapping errors do not falsely ask users to reconfirm their email', async () => {
  const { api, mock } = setup();
  mock.identityFailure = 'Database unavailable';
  await assert.rejects(api.neonClient.auth.getSession(), /تعذر استعادة جلسة الدخول.*403/);
  assert.equal(mock.refreshCount, 0);
});

test('native INITIAL_SESSION null does not override a recoverable persisted session', async () => {
  const {api,mock}=setup();
  const events=[];
  const subscription=api.neonClient.auth.onAuthStateChange((event,session)=>events.push([event,session?.user?.id || null]));
  await api.neonClient.auth.getSession();
  mock.listener({event:'INITIAL_SESSION',session:null});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(events,[]);
  mock.listener({event:'SIGNED_OUT',session:null});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(events,[['SIGNED_OUT',null]]);
  subscription.data.subscription.unsubscribe();
});

test('a transient null native getSession is recovered using the still-stored native session', async () => {
  const {api,mock}=setup();
  mock.Native.getSession=async()=>({session:null});
  const result=await api.neonClient.auth.getSession();
  assert.equal(result.data.session.user.id,appId);
  assert.equal(result.data.session.access_token,'jwt-refreshed');
  assert.equal(mock.refreshCount,1);
});

test('a genuinely signed-out native device remains signed out', async () => {
  const {api,mock}=setup();
  mock.Native.getSession=async()=>({session:null});
  mock.Native.refreshSession=async()=>{throw Error('Session refresh failed: no active session')};
  const result=await api.neonClient.auth.getSession();
  assert.equal(result.data.session,null);
});

test('a temporary native auth outage does not masquerade as a sign-out', async () => {
  const {api,mock}=setup();
  mock.Native.getSession=async()=>({session:null});
  mock.Native.refreshSession=async()=>{throw Error('Network timed out')};
  await assert.rejects(api.neonClient.auth.getSession(),/تعذر استعادة جلسة الدخول تلقائيًا/);
});

test('identity mapping renews a native token on authentication-required 403', async () => {
  const {api,mock,requests}=setup();
  mock.identityForbiddenOnce=1;
  const result=await api.neonClient.auth.getSession();
  assert.equal(result.data.session.user.id,appId);
  assert.equal(result.data.session.access_token,'jwt-refreshed');
  assert.equal(mock.refreshCount,1);
  assert.equal(requests.filter(x=>x.url.endsWith('/rpc/resolve_app_identity')).length,2);
});

test('idempotent identity mapping retries a temporary upstream 503', async () => {
  const {api,mock,requests}=setup();
  mock.identityUnavailable=1;
  const result=await api.neonClient.auth.getSession();
  assert.equal(result.data.session.user.id,appId);
  assert.equal(mock.refreshCount,0);
  assert.equal(requests.filter(x=>x.url.endsWith('/rpc/resolve_app_identity')).length,2);
});


test('unified building save sends explicit native JSON with the reported balances and no replay',async()=>{
 const {api,mock,requests}=setup();mock.nativeHeaderSerialization=true;
 const details={name:'برج الفتوح',address:'شارع 1 من شارع 15',totalUnits:15,totalFloors:14,monthlyTarget:3000,reserveFund:0};
 const finance={baseOpening:10000,reserve:0,expenses:5000,exceptional:8000,startMonth:'2025-01',expected:{balance:0,openingBalance:0,reserveFund:0,historicalAdjustment:0,historicalMonthly:0,expenses:0,exceptional:0,startMonth:'2026-11'},openingAlreadyIncluded:null};
 const result=await api.saveNeonBuildingManagement('existing-building',details,finance);
 assert.equal(result.id,'existing-building');
 const sent=requests.filter(r=>r.url.endsWith('/rpc/save_building_management'));assert.equal(sent.length,1);
 assert.equal(sent[0].options.method,'POST');assert.equal(sent[0].options.headers instanceof Headers,false);
 assert.equal(new Headers(sent[0].options.headers).get('authorization'),'Bearer jwt-one');
 assert.equal(new Headers(sent[0].options.headers).get('content-type'),'application/json');
 assert.deepEqual(JSON.parse(sent[0].options.body),{p_building_id:'existing-building',p_details:details,p_finance:finance});
});
test('native building creation preserves explicit null finance and returns its confirmed row',async()=>{
 const {api,requests}=setup();const details={name:'عمارة جديدة',totalUnits:2};
 assert.equal((await api.createNeonBuildingWithFinances(details,null)).id,'new-building');
 const request=requests.find(r=>r.url.endsWith('/rpc/create_manager_building_with_finances'));
 assert.deepEqual(JSON.parse(request.options.body),{p_details:details,p_finance:null});
});
test('native building failures remain visible in Arabic and never retry a mutation',async()=>{
 const {api,mock,requests}=setup();mock.buildingRpcSchemaError=true;
 await assert.rejects(api.saveNeonBuildingManagement('b',{name:'اختبار'},null),/تعذر بدء حفظ/);
 assert.equal(requests.filter(r=>r.url.endsWith('/rpc/save_building_management')).length,1);
 mock.buildingRpcSchemaError=false;mock.buildingRpcUnauthorized=true;
 await assert.rejects(api.saveNeonBuildingManagement('b',{name:'اختبار'},null),/انتهت جلسة/);
 assert.equal(mock.refreshCount,0);
 assert.equal(requests.filter(r=>r.url.endsWith('/rpc/save_building_management')).length,2);
});

test('historical allocation sends explicit native JSON and accepts confirmed void response',async()=>{
 const {api,requests}=setup();
 const allocations=[{apartmentId:'apt',month:'2025-01-01',amount:200}];
 await api.saveNeonHistoricalMonthlyAllocations('building',allocations);
 const writes=requests.filter(r=>r.url.endsWith('/rpc/save_historical_monthly_allocations'));
 assert.equal(writes.length,1);assert.deepEqual(JSON.parse(writes[0].options.body),{p_building_id:'building',p_allocations:allocations});
});

test('guided setup sends all accounting inputs and a stable idempotency key in native JSON',async()=>{
 const {api,requests}=setup();const details={name:'عمارة',monthlyTarget:100,totalUnits:14};const history={mode:'transfer',cash:3000,exceptionalPerUnit:6000,units:[]};
 await api.completeNeonBuildingSetup('request',details,history,null);
 const r=requests.find(r=>r.url.endsWith('/rpc/complete_guided_building_setup'));
 assert.deepEqual(JSON.parse(r.options.body),{p_request_id:'request',p_details:details,p_history:history,p_building_id:null});
});
