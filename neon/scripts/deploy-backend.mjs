import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { storageClient } from './storage-client.mjs';

const project = 'misty-glitter-45861249';
const branch = 'br-ancient-thunder-be36ds8e';
const cli = 'neon/node_modules/.bin/neon';
function run(args, json = false) {
  const result = spawnSync(cli, [...args, '--project-id', project, '--branch', branch, ...(json ? ['--output', 'json'] : [])],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, env: process.env });
  if (result.status !== 0) {
    // CLI failure output might include invocation arguments/secret values.
    console.error('Neon deployment command failed; sensitive CLI output omitted');
    process.exit(1);
  }
  return json ? JSON.parse(result.stdout) : undefined;
}
const env = ['GEMINI_API_KEY', 'FIREBASE_SERVICE_ACCOUNT_JSON'].flatMap(name => {
  if (!process.env[name]?.trim()) throw new Error(`Missing secret: ${name}`);
  return ['--env', `${name}=${process.env[name]}`];
});
run(['functions', 'deploy', 'elomara', '--src', 'neon/functions/index.ts', ...env]);
const data = run(['functions', 'get', 'elomara'], true);
const fn = data.function || data;
const base = fn.invocation_url;
if (typeof base !== 'string' || !base.startsWith('https://')) throw new Error('Neon did not return a function invocation URL');
const origin = new URL(base).origin;
const domains = run(['neon-auth', 'domain', 'list'], true);
if (!JSON.stringify(domains).includes(JSON.stringify(origin))) run(['neon-auth', 'domain', 'add', origin]);
const health = await fetch(origin + '/health', { signal: AbortSignal.timeout(30000) });
if (!health.ok || !(await health.json()).ok) throw new Error('Backend health check failed');
for (const name of ['gemini-chat', 'send-announcement-push', 'send-poll-push', 'send-exceptional-collection-push']) {
  const response = await fetch(`${origin}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (response.status !== 401) throw new Error(`Unauthenticated ${name} must return 401`);
}
for (const path of ['/cron/mobile', '/cron/overdue', '/cron/engagement']) {
  const response = await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-neon-trigger-invocation-id': 'forged-test' }, body: '{}' });
  if (response.status !== 401) throw new Error('Forged public cron request must return 401');
}
const probe = await fetch(origin + '/cron/probe', { method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-neon-trigger-invocation-id': 'forged-test' },
  body: JSON.stringify({ version: 1, invocation_id: 'forged-test', trigger: { type: 'schedule',
    id: 'trigger-forged', name: 'elomara-probe' }, data: { scheduled_at: new Date().toISOString() } }),
});
if (probe.status !== 401) throw new Error('Platform did not reject a well-formed forged trigger (probe has no side effects)');
const { client: storageConnection, endpoint: storageEndpoint } = await storageClient();
storageConnection.destroy();
await writeFile('neon-runtime.json', JSON.stringify({ functionsUrl: origin, oauthRedirectUrl: origin + '/auth/callback', otaBaseUrl: `${storageEndpoint}/bunyan-ota` }, null, 2));
console.log(`PASS: backend deployed at ${origin}; user routes and schedules reject unauthenticated requests`);
console.log('Scheduled jobs remain disabled until the app cutover is verified.');
