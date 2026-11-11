import pg from 'pg';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const db = new pg.Client({ connectionString: process.env.TARGET_DATABASE_URL });
await db.connect();
try {
 assert.equal((await db.query('select current_database() as name')).rows[0].name, 'elomara_migration_check_v2');
 await db.query('BEGIN');
 await db.query(await readFile(new URL('../migrations/011_current_membership.sql',import.meta.url),'utf8'));
 await db.query(await readFile(new URL('../tests/sql/current-membership.sql',import.meta.url),'utf8'));
 console.log('PASS caller-scoped manager/resident membership, actual revocation and invoker permissions; rolled back');
} finally { await db.query('ROLLBACK').catch(()=>{});await db.end(); }
