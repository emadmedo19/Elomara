import test from 'node:test';
import assert from 'node:assert/strict';
import { pool, createBackendClient, authenticatedUser } from '../functions/database.mjs';
import { mobileCallback } from '../functions/mobile-callback.mjs';

test('backend query values remain parameters and writes require a filter', async () => {
  const original = pool.query;
  const calls = [];
  pool.query = async (sql, values) => { calls.push({ sql, values }); return { rows: [{ id: 'receipt' }] }; };
  try {
    const injection = "x'; DROP TABLE payments;--";
    const result = await createBackendClient().from('payments').update({ notes: injection }).eq('id', 'receipt');
    assert.equal(result.error, null);
    assert.equal(calls.length, 1);
    assert.ok(!calls[0].sql.includes(injection));
    assert.deepEqual(calls[0].values, ['receipt', injection]);
    assert.ok((await createBackendClient().from('payments').delete()).error);
    assert.ok((await createBackendClient().from('payments').update({ amount: 0 })).error);
    assert.equal(calls.length, 1);
    assert.throws(() => createBackendClient('Bearer user-token').from('profiles'), /authenticated Data API/);
    await assert.rejects(authenticatedUser(''), /Authentication required/);
    assert.equal(calls.length, 1);
  } finally { pool.query = original; await pool.end(); }
});
test('mobile callback forwards only the Neon verifier to the fixed app scheme', async () => {
  assert.equal(mobileCallback(new Request('https://callback.invalid/auth/callback')).status, 400);
  const response = mobileCallback(new Request('https://callback.invalid/auth/callback?neon_auth_session_verifier=abc123&redirect_to=https://attacker.invalid'));
  const html = await response.text();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(html, /app\.bunyan\.residential:\/\/login-callback/);
  assert.ok(!html.includes('attacker.invalid'));
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});
