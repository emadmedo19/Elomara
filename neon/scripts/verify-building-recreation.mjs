import pg from 'pg';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const db = new pg.Client({ connectionString: process.env.TARGET_DATABASE_URL });
const sql = path => readFile(new URL(path, import.meta.url), 'utf8');
await db.connect();
try {
  assert.equal((await db.query('select current_database() as name')).rows[0].name, 'elomara_migration_check_v2');
  await db.query('BEGIN');
  await db.query(await sql('../migrations/004_account_and_building_deletion.sql'));
  await db.query(await sql('../migrations/008_create_manager_building.sql'));
  await db.query(await sql('../migrations/009_generate_building_apartments.sql'));
  await db.query(await sql('../tests/sql/building-recreation.sql'));
  await db.query(await sql('../tests/sql/generated-apartments.sql'));
  console.log('PASS: delete/recreate lifecycle, all form fields, manager link, generated apartment counts and defaults, rejection/rollback and role boundaries; all fixtures rolled back');
} finally { await db.query('ROLLBACK').catch(() => {}); await db.end(); }
