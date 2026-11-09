import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
const source = await readFile('supabase/functions/gemini-chat/index.ts', 'utf8');
const { code } = await transform(source.replace(/^import .*;\n/, ''), { loader: 'ts', format: 'esm' });

test('deployed chat checks user tokens, account access and per-user quotas before Gemini', async () => {
  let handler; let calls = 0;
  const context = { Request, Response, Map, Date, JSON, console, encodeURIComponent,
    Deno: { env: { get: key => ({ SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'public', GEMINI_API_KEY: 'fake' })[key] }, serve: fn => handler = fn },
    fetch: async (url, options) => {
      const token = options.headers.Authorization?.slice(7);
      if (url.includes('/auth/v1/user')) return token === 'invalid' ? Response.json({}, { status: 401 }) : Response.json({ id: token });
      if (url.includes('/rest/v1/profiles')) {
        assert.ok(url.includes('id=eq.' + token));
        return Response.json([{ approved: token !== 'pending', disabled_at: token === 'disabled' ? 'date' : null,
          building_id: token === 'unassigned' ? null : 'building', role: token === 'admin' ? 'building_admin' : 'tenant' }]);
      }
      calls++;
      return Response.json({ candidates: [{ content: { parts: [{ text: 'answer' }] } }] });
    },
  };
  vm.runInNewContext(code, context);
  const request = (token, body = { messages: [{ role: 'user', text: 'test' }] }) => handler(new Request('https://test/chat', {
    method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body),
  }));
  assert.equal((await request()).status, 401);
  assert.equal((await request('invalid')).status, 401);
  for (const token of ['pending', 'disabled', 'unassigned']) assert.equal((await request(token)).status, 403);
  assert.equal(calls, 0);
  assert.equal((await request('admin')).status, 200);
  for (let i = 0; i < 20; i++) assert.equal((await request('tenant')).status, 200);
  assert.equal((await request('tenant')).status, 429);
  assert.equal(calls, 21);
});
