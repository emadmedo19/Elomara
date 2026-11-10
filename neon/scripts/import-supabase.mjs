import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { assertColumns, assertMatchingSnapshot, assertTarget, fingerprint, identifier } from './snapshot-utils.mjs';

// This copies into an EMPTY target only. It never changes, freezes, deletes, or
// disables anything on Supabase, and it does not switch any application client.
const manifest = JSON.parse(await readFile(new URL('../table-manifest.json', import.meta.url), 'utf8'));
const target = process.env.TARGET_DATABASE_URL;
if (!target) throw new Error('TARGET_DATABASE_URL is required (server-side only)');
if (new URL(target).hostname.includes('-pooler.')) throw new Error('Use a direct connection for migrations');
const sourceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!sourceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
const headers = { apikey: sourceKey, Authorization: `Bearer ${sourceKey}` };
const sourceUrl = 'https://yvoylicirtdarroqcxoq.supabase.co';
const userColumns = ['id', 'email', 'email_confirmed_at', 'phone', 'phone_confirmed_at', 'banned_until', 'raw_user_meta_data'];
async function sourceRequest(path) {
  const response = await fetch(sourceUrl + path, { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Supabase source read failed (HTTP ${response.status}); response omitted`);
  return response.json();
}
async function readSource() {
  const snapshot = {};
  for (const table of manifest) {
    const rows = [];
    const order = table.primaryKey.length ? `&order=${table.primaryKey.map(k => `${k}.asc`).join(',')}` : '';
    for (let offset = 0; ; offset += 500) {
      const page = await sourceRequest(`/rest/v1/${table.name}?select=*&limit=500&offset=${offset}${order}`);
      if (!Array.isArray(page)) throw new Error('Unexpected source table response');
      rows.push(...page);
      if (page.length < 500) break;
    }
    assertColumns(rows, table.columns, table.name);
    snapshot[table.name] = rows;
  }
  const users = [];
  for (let page = 1; ; page++) {
    const result = await sourceRequest(`/auth/v1/admin/users?page=${page}&per_page=500`);
    if (!Array.isArray(result.users)) throw new Error('Unexpected source users response');
    // Explicit allowlist excludes passwords, password hashes, OAuth tokens,
    // recovery tokens and old sessions. Existing passwords are reset on Neon.
    users.push(...result.users.map(user => Object.fromEntries(userColumns.map(column => [column,
      column === 'raw_user_meta_data' ? (user.user_metadata || {}) : (user[column] || null)]))));
    if (result.users.length < 500) break;
  }
  snapshot['auth.users'] = users;
  return snapshot;
}
const client = new pg.Client({ connectionString: target });
client.on('error', () => {});
await client.connect();
try {
  const { rows: [database] } = await client.query('select current_database() as name');
  assertTarget(database.name, process.env.NEON_IMPORT_APPROVED_DATABASE);
  const { rows: existing } = await client.query("select tablename from pg_tables where schemaname='public'");
  if (existing.length) throw new Error('Target already contains application tables; refusing to overwrite or re-import');
  const snapshot = await readSource();
  await client.query('BEGIN');
  await client.query(await readFile(new URL('../migrations/001_application_schema.sql', import.meta.url), 'utf8'));
  async function insert(schema, table, rows) {
    if (!rows.length) return;
    const relation = `${identifier(schema)}.${identifier(table)}`;
    await client.query(`INSERT INTO ${relation} SELECT * FROM jsonb_populate_recordset(NULL::${relation},$1::jsonb)`, [JSON.stringify(rows)]);
  }
  await insert('app_auth', 'users', snapshot['auth.users']);
  for (const table of manifest) await insert('public', table.name, snapshot[table.name]);
  const restored = {};
  for (const table of [...manifest.map(t => ['public', t.name]), ['app_auth', 'users']]) {
    const [schema, name] = table;
    const { rows: [row] } = await client.query(`select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) as rows from ${identifier(schema)}.${identifier(name)} t`);
    restored[schema === 'public' ? name : 'auth.users'] = row.rows;
  }
  assertMatchingSnapshot(snapshot, restored);
  // Abort if a source write happened while reading/importing. No automatic
  // overwrite/retry: a reviewed cutover must use an explicitly stable snapshot.
  assertMatchingSnapshot(snapshot, await readSource());
  await client.query(await readFile(new URL('../migrations/002_application_triggers.sql', import.meta.url), 'utf8'));
  await client.query(await readFile(new URL('../migrations/003_verified_identity_link.sql', import.meta.url), 'utf8'));
  await client.query(await readFile(new URL('../migrations/004_account_and_building_deletion.sql', import.meta.url), 'utf8'));
  await client.query(await readFile(new URL('../migrations/005_building_member_roles.sql', import.meta.url), 'utf8'));
  await client.query(await readFile(new URL('../migrations/006_exceptional_receivables.sql', import.meta.url), 'utf8'));
  await client.query('COMMIT');
  console.log(`PASS: ${manifest.length} application tables and ${snapshot['auth.users'].length} user references copied and verified`);
  for (const table of manifest) console.log(`${table.name}: ${snapshot[table.name].length} rows; sha256=${fingerprint(snapshot[table.name])}`);
  console.log('Application/auth cutover has NOT been performed. Supabase remains active.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  // Database errors can contain SQL fragments and private row values. Fail
  // closed, but never include the driver error/detail or credentials in CI logs.
  console.error(error?.constructor?.name === 'DatabaseError'
    ? `Database import rejected (SQLSTATE ${error.code || 'unknown'}); target transaction rolled back`
    : `Import stopped: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
