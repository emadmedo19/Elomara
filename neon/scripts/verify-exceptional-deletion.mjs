import pg from 'pg';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const db = new pg.Client({ connectionString: process.env.TARGET_DATABASE_URL });
const sql = path => readFile(new URL(path, import.meta.url), 'utf8');
await db.connect();
try {
  assert.equal((await db.query('select current_database() as name')).rows[0].name, 'elomara_migration_check_v2');
  await db.query('BEGIN');
  await db.query(await sql('../migrations/006_exceptional_receivables.sql'));
  await db.query(await sql('../tests/sql/exceptional-deletion-seed.sql'));
  const migration = await sql('../migrations/007_delete_exceptional_collection.sql');
  await db.query(migration);
  await db.query(await sql('../tests/sql/exceptional-deletion.sql'));
  await db.query(await sql('../tests/sql/exceptional-receivables.sql'));
  await db.query(migration);
  console.log('PASS: deletion cancels debt, preserves receipts/cash, refuses new receipts, supports receipt corrections and enforces manager scope; all fixtures rolled back');
} finally { await db.query('ROLLBACK').catch(() => {}); await db.end(); }
