import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('generated grants name complete reviewed roles, never PostgreSQL array characters', async () => {
  const sql = await readFile(new URL('../migrations/001_application_schema.sql', import.meta.url), 'utf8');
  const allowed = new Set(['PUBLIC', 'anon', 'authenticated', 'service_role']);
  const grants = [...sql.matchAll(/^GRANT [^;]*? TO ([^;]+);$/gm)];
  assert.ok(grants.length > 0);
  for (const [, names] of grants) {
    for (const role of names.split(',').map(s => s.trim().replaceAll('"', ''))) {
      assert.ok(allowed.has(role), `Unexpected grant target: ${role}`);
    }
  }
  assert.equal([...sql.matchAll(/^CREATE POLICY /gm)].length, 61);
  assert.equal([...sql.matchAll(/^ALTER TABLE public\."[a-z_]+" ENABLE ROW LEVEL SECURITY;/gm)].length, 25);
});
