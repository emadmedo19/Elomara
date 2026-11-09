import pg from 'pg';
import assert from 'node:assert/strict';

// Deliberately restricted to the disposable migration-check database. Fixtures
// are rolled back; no user, financial row, or notification is created outside it.
const client = new pg.Client({ connectionString: process.env.TARGET_DATABASE_URL });
await client.connect();
try {
  const { rows: [db] } = await client.query('select current_database() as name');
  assert.equal(db.name, 'elomara_migration_check_v2', 'RLS fixtures must never run against production');
  const { rows: actors } = await client.query('select id,role,approved,building_id,disabled_at from public.profiles');
  assert.ok(actors.some(a => a.role === 'building_admin' && a.approved));
  assert.ok(actors.some(a => ['owner', 'tenant'].includes(a.role) && a.approved));
  for (const actor of actors) {
    await client.query('BEGIN');
    try {
      const sub = `migration-test:${actor.id}`;
      await client.query('insert into private.auth_identity_map(neon_user_id,app_user_id) values($1,$2) on conflict(app_user_id) do update set neon_user_id=excluded.neon_user_id', [sub, actor.id]);
      await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub })]);
      await client.query('SET LOCAL ROLE authenticated');
      for (const table of ['buildings', 'apartments', 'profiles', 'app_notifications', 'building_join_requests']) {
        const column = table === 'buildings' ? 'id' : 'building_id';
        const { rows: [result] } = await client.query(`select count(*)::int as total, count(*) filter(where ${column} is distinct from $1::uuid)::int as foreign_rows from public.${table}`, [actor.building_id]);
        // Own pending profile is deliberately visible before building approval.
        if (table !== 'profiles') assert.equal(result.foreign_rows, 0, `${actor.role} leaked foreign ${table}`);
        if (table === 'buildings' && (!actor.approved || actor.disabled_at)) assert.equal(result.total, 0);
      }
      if (actor.approved && !actor.disabled_at && actor.building_id) {
        await client.query('select public.get_building_financial_summary($1)', [actor.building_id]);
      }
    } finally { await client.query('ROLLBACK'); }
  }
  // Reuse an approved account only inside a rollback transaction to prove that
  // suspension removes access without deleting membership or financial data.
  const actor = actors.find(a => a.role === 'building_admin' && a.approved);
  await client.query('BEGIN');
  try {
    await client.query('update public.profiles set disabled_at=now() where id=$1', [actor.id]);
    await client.query('insert into private.auth_identity_map(neon_user_id,app_user_id) values($1,$2) on conflict(app_user_id) do update set neon_user_id=excluded.neon_user_id', [`suspended-test:${actor.id}`, actor.id]);
    await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: `suspended-test:${actor.id}` })]);
    await client.query('SET LOCAL ROLE authenticated');
    const { rows: [result] } = await client.query('select count(*)::int as total from public.buildings');
    assert.equal(result.total, 0, 'Suspended administrator retained building access');
  } finally { await client.query('ROLLBACK'); }
  console.log(`PASS: ${actors.length} existing identities isolated by building; pending and suspended access denied; financial-summary RPCs execute`);
} finally { await client.end(); }
