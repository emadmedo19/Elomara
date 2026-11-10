import pg from 'pg';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const db = new pg.Client({ connectionString: process.env.TARGET_DATABASE_URL });
await db.connect();
try {
  assert.equal((await db.query('select current_database() as name')).rows[0].name,'elomara_migration_check_v2');
  await db.query('BEGIN');
  await db.query(await readFile(new URL('../migrations/005_building_member_roles.sql',import.meta.url),'utf8'));
  await db.query(await readFile(new URL('../tests/sql/member-role-safety.sql',import.meta.url),'utf8'));
  console.log('PASS: member role boundaries and restoration; all changes rolled back');
} finally { await db.query('ROLLBACK').catch(()=>{}); await db.end(); }
