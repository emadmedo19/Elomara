import { createSign } from 'node:crypto';
import { appendFile } from 'node:fs/promises';

const project = 'misty-glitter-45861249';
const branch = 'br-ancient-thunder-be36ds8e';
const summary = [];
function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing GitHub Actions secret: ${name}`);
  return value;
}
async function request(label, url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${label} failed (HTTP ${response.status}); response omitted to protect credentials`);
  return response.json();
}
async function check(label, fn) {
  await fn();
  console.log(`PASS: ${label}`);
  summary.push(`- PASS: ${label}`);
}

await check('Neon project access', async () => {
  const headers = { Authorization: `Bearer ${required('NEON_API_KEY')}` };
  const data = await request('Neon project', `https://console.neon.tech/api/v2/projects/${project}`, { headers });
  if (data.project?.id !== project) throw new Error('Neon project mismatch');
  const auth = await request('Neon Auth', `https://console.neon.tech/api/v2/projects/${project}/branches/${branch}/auth`, { headers });
  if (auth.auth_provider !== 'better_auth' || auth.db_name !== 'neondb') throw new Error('Unexpected Neon Auth integration');
});
await check('Supabase source read access', async () => {
  const key = required('SUPABASE_SERVICE_ROLE_KEY');
  await request('Supabase source', 'https://yvoylicirtdarroqcxoq.supabase.co/rest/v1/buildings?select=id&limit=1', {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
});
await check('Firebase elfotoh credentials (no notification sent)', async () => {
  let service;
  try { service = JSON.parse(required('FIREBASE_SERVICE_ACCOUNT_JSON')); }
  catch { throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain the complete service-account JSON'); }
  if (service.project_id !== 'elfotoh' || !service.client_email || !service.private_key) throw new Error('Wrong Firebase service account');
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const message = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: service.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 300 })}`;
  const assertion = `${message}.${createSign('RSA-SHA256').update(message).sign(service.private_key).toString('base64url')}`;
  const token = await request('Firebase credentials', 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!token.access_token) throw new Error('Firebase did not issue an access token');
});
await check('Gemini API access (no generation requested)', async () => {
  const data = await request('Gemini models', 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', {
    headers: { 'x-goog-api-key': required('GEMINI_API_KEY') },
  });
  if (!data.models?.length) throw new Error('Gemini returned no models');
});
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
  `## Neon migration preflight\n\n${summary.join('\n')}\n\nNo production database import, app cutover, notification delivery, or file deletion was performed.\n`);
