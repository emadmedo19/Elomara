import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import express from 'express';
import { createClient } from '@supabase/supabase-js';

async function load(file) {
  const { code } = await transform(await readFile(file, 'utf8'), { loader: 'ts', format: 'esm' });
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
const { aiSecurity, createQuota } = await load('server/aiSecurity.ts');
const { resolveSupabaseConfig } = await load('server/supabaseConfig.ts');

test('configuration fails closed for missing, malformed, and privileged keys', () => {
  for (const [url, key] of [[undefined, undefined], ['bad', 'sb_publishable_test'], ['https://test.invalid', 'sb_secret_test'],
    ['https://test.invalid', 'x.' + btoa(JSON.stringify({ role: 'service_role' })) + '.x']]) {
    assert.throws(() => resolveSupabaseConfig(url, key));
  }
  assert.equal(resolveSupabaseConfig('https://test.invalid', 'sb_publishable_test').url, 'https://test.invalid');
});

test('quotas enforce limits, expire, and bound unique keys', () => {
  let now = 0;
  const take = createQuota(2, 100, 1, () => now);
  assert.equal(take('a'), true); assert.equal(take('a'), true);
  assert.equal(take('a'), false); assert.equal(take('b'), false);
  now = 100;
  assert.equal(take('b'), true);
});

test('all Gemini routes require a verified active account and enforce CORS and quotas', async () => {
  const auth = express();
  auth.get('/auth/v1/user', (req, res) => {
    if (req.get('Authorization') === 'Bearer invalid') return res.status(401).json({ message: 'invalid' });
    res.json({ id: req.get('Authorization').slice(7) });
  });
  auth.get('/rest/v1/profiles', (req, res) => {
    const token = req.get('Authorization')?.slice(7);
    // Prove profile access uses the user's bearer token, never the public key.
    assert.equal(req.query.id, `eq.${token}`);
    res.json({ approved: token !== 'pending', disabled_at: token === 'disabled' ? '2026-01-01' : null,
      building_id: token === 'unassigned' ? null : 'building', role: token === 'admin' ? 'building_admin' : 'tenant' });
  });
  const authServer = auth.listen(0, '127.0.0.1');
  await new Promise(resolve => authServer.once('listening', resolve));
  const client = createClient(`http://127.0.0.1:${authServer.address().port}`, 'sb_publishable_test',
    { auth: { persistSession: false, autoRefreshToken: false } });
  const app = express(); let invoked = 0;
  app.use('/api/gemini', ...aiSecurity(client, ['https://localhost', 'https://app.test']));
  app.post('/api/gemini/:action', (_req, res) => { invoked++; res.json({ ok: true }); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/gemini/`;
  const request = (action, token, origin) => fetch(base + action, { method: 'POST', headers: {
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(origin ? { Origin: origin } : {}),
  } });
  try {
    for (const action of ['chat', 'generate-image', 'edit-image', 'analyze-receipt']) {
      assert.equal((await request(action)).status, 401);
    }
    assert.equal((await request('chat', 'invalid')).status, 401);
    for (const token of ['pending', 'disabled', 'unassigned']) assert.equal((await request('chat', token)).status, 403);
    assert.equal((await request('chat', 'tenant', 'https://evil.test')).status, 403);
    assert.equal(invoked, 0);
    const native = await request('analyze-receipt', 'tenant', 'https://localhost');
    assert.equal(native.status, 200); assert.equal(native.headers.get('access-control-allow-origin'), 'https://localhost');
    assert.equal((await request('chat', 'admin', 'https://app.test')).status, 200);
    for (let i = 1; i < 20; i++) assert.equal((await request('chat', 'tenant')).status, 200);
    const blocked = await request('chat', 'tenant');
    assert.equal(blocked.status, 429); assert.equal(blocked.headers.get('retry-after'), '60');
    const preflight = await fetch(base + 'chat', { method: 'OPTIONS', headers: { Origin: 'https://localhost' } });
    assert.equal(preflight.status, 204);
  } finally { await Promise.all([new Promise(r => server.close(r)), new Promise(r => authServer.close(r))]); }
});
