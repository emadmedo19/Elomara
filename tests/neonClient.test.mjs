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
  const mock = { initializeCount: 0, removals: 0, initializationFails: false,
    Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true },
    Native: {
      async initialize() { mock.initializeCount++; if (mock.initializationFails) throw Error('initialization unavailable'); },
      async addListener(_name, callback) { mock.listener = callback; return { remove: async () => { mock.removals++; } }; },
      async getSession() { return { session }; },
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
      if (url.endsWith('/rpc/resolve_app_identity')) return Response.json(appId);
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
  assert.equal(new Headers(requests.at(-1).options.headers).get('authorization'), 'Bearer jwt-two');
  const reply = await api.neonClient.functions.invoke('gemini-chat', { body: { messages: [] } });
  assert.equal(reply.data.text, 'fixture reply');
  assert.equal(mock.initializeCount, 1);
});
test('candidate blocks financial writes and notification sends before a network request', async () => {
  const { api, requests } = setup();
  const write = await api.neonClient.from('payments').insert({ amount: 1 });
  assert.ok(write.error);
  assert.equal(requests.length, 0);
  const push = await api.neonClient.functions.invoke('send-announcement-push');
  assert.ok(push.error);
  assert.equal(requests.length, 0);
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
