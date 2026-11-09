import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

const id = 'a'.repeat(40);
const manifest = { bundleId: id, url: `https://yvoylicirtdarroqcxoq.supabase.co/storage/v1/object/public/bunyan-ota/bundles/${id}.zip`, checksum: 'c'.repeat(64) };
const compiled = await build({
  entryPoints: ['src/services/otaUpdates.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  define: { 'import.meta.env.VITE_BUILD_ID': JSON.stringify('b'.repeat(40)) },
  plugins: [{ name: 'native-test-double', setup(b) {
    b.onResolve({ filter: /^@capacitor\/|^@capawesome\// }, args => ({ path: args.path, namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const Capacitor=globalThis.mock.Capacitor; export const App=globalThis.mock.App; export const LiveUpdate=globalThis.mock.LiveUpdate;' }));
  } }],
});

function setup(options = {}) {
  const calls = [];
  const mock = {
    Capacitor: { isNativePlatform: () => options.native !== false },
    App: { addListener: async (_, cb) => { mock.resume = cb; return { remove: async () => {} }; } },
    LiveUpdate: {
      ready: async () => { calls.push('ready'); if (options.readyFails) throw Error('ready'); },
      getCurrentBundle: async () => ({ bundleId: options.current ?? null }),
      getNextBundle: async () => ({ bundleId: options.next ?? null }),
      downloadBundle: async args => { calls.push(['download', args]); if (options.downloadFails) throw Error('offline'); await options.downloadWait; },
      setNextBundle: async args => { calls.push(['stage', args]); },
      reload: async () => { calls.push('reload'); if (options.reloadFails) throw Error('reload'); },
    },
  };
  const context = {
    mock, module: { exports: {} }, console: { info() {}, warn() {} }, AbortSignal,
    fetch: async () => { calls.push('fetch'); if (options.offline) throw Error('offline'); return { ok: true, json: async () => options.manifest ?? manifest }; },
  };
  vm.runInNewContext(compiled.outputFiles[0].text, context);
  return { api: context.module.exports, calls, mock };
}

test('startup offers update without downloading, staging or reloading; ready runs first', async () => {
  const { api, calls } = setup();
  await api.checkForOtaUpdate();
  assert.equal(api.getOtaSnapshot().manifest.bundleId, id);
  assert.deepEqual(calls, ['ready', 'fetch']);
});

test('later keeps the app running, suppresses resume prompts, and asks on a fresh launch', async () => {
  const { api, calls } = setup();
  await api.checkForOtaUpdate(); api.deferOtaUpdate(); await api.checkForOtaUpdate();
  assert.equal(api.getOtaSnapshot().manifest, null);
  assert.equal(calls.includes('reload'), false);
  assert.equal(calls.some(c => Array.isArray(c)), false);
  const fresh = setup(); await fresh.api.checkForOtaUpdate();
  assert.equal(fresh.api.getOtaSnapshot().manifest.bundleId, id);
});

test('update now sends the validated checksum, then stages and reloads', async () => {
  const { api, calls } = setup(); await api.checkForOtaUpdate(); await api.applyOtaUpdate();
  assert.equal(JSON.stringify(calls.slice(2)), JSON.stringify([['download', manifest], ['stage', { bundleId: id }], 'reload']));
});

test('already staged update still requires consent and is not downloaded again', async () => {
  const { api, calls } = setup({ next: id }); await api.checkForOtaUpdate();
  assert.equal(calls.includes('reload'), false);
  await api.applyOtaUpdate();
  assert.equal(JSON.stringify(calls.slice(2)), JSON.stringify([['stage', { bundleId: id }], 'reload']));
});

test('failed download never stages or reloads and permits retry/later', async () => {
  const { api, calls } = setup({ downloadFails: true }); await api.checkForOtaUpdate(); await api.applyOtaUpdate();
  assert.equal(api.getOtaSnapshot().phase, 'error');
  assert.equal(calls.some(c => c === 'reload' || c[0] === 'stage'), false);
  await api.applyOtaUpdate(); assert.equal(calls.filter(c => c[0] === 'download').length, 2);
  api.deferOtaUpdate(); assert.equal(api.getOtaSnapshot().manifest, null);
});

test('double click and refresh while downloading cannot run a second apply', async () => {
  let release; const downloadWait = new Promise(r => { release = r; });
  const { api, calls } = setup({ downloadWait }); await api.checkForOtaUpdate();
  const first = api.applyOtaUpdate(); await api.applyOtaUpdate(); await api.checkForOtaUpdate();
  release(); await first;
  assert.equal(calls.filter(c => c[0] === 'download').length, 1);
  assert.equal(calls.filter(c => c === 'reload').length, 1);
});

test('current native bundle or matching embedded build does not show an update', async () => {
  for (const opts of [{ current: id }, { manifest: { ...manifest, bundleId: 'b'.repeat(40), url: manifest.url.replaceAll(id, 'b'.repeat(40)) } }]) {
    const { api } = setup(opts); await api.checkForOtaUpdate(); assert.equal(api.getOtaSnapshot().manifest, null);
  }
});

test('malformed manifests, untrusted URLs and offline checks remain non-blocking', async () => {
  for (const opts of [{ offline: true }, { manifest: {} }, { manifest: { ...manifest, url: 'https://example.com/update.zip' } }, { manifest: { ...manifest, checksum: 'bad' } }]) {
    const { api, calls } = setup(opts); await api.checkForOtaUpdate();
    assert.equal(api.getOtaSnapshot().manifest, null); assert.equal(calls.some(c => Array.isArray(c)), false);
  }
});

test('web and failed ready check never fetch or offer updates', async () => {
  for (const opts of [{ native: false }, { readyFails: true }]) {
    const { api, calls } = setup(opts); await api.checkForOtaUpdate();
    assert.equal(calls.includes('fetch'), false); assert.equal(api.getOtaSnapshot().manifest, null);
  }
});

test('startup/resume checks share one initialization and do not stack listeners', async () => {
  const { api, calls, mock } = setup(); api.initializeLiveUpdates(); api.initializeLiveUpdates();
  await api.checkForOtaUpdate(); mock.resume({ isActive: true }); await api.checkForOtaUpdate();
  assert.equal(calls.filter(c => c === 'ready').length, 1);
  assert.equal(calls.includes('reload'), false);
});
