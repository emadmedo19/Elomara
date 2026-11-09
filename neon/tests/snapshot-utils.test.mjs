import test from 'node:test';
import assert from 'node:assert/strict';
import { assertColumns, assertMatchingSnapshot, assertTarget, fingerprint, identifier } from '../scripts/snapshot-utils.mjs';

test('row ordering and object ordering do not change the snapshot checksum', () => {
  assert.equal(fingerprint([{ id: 1, amount: 3.5 }, { id: 2, value: null }]),
    fingerprint([{ value: null, id: 2 }, { amount: 3.5, id: 1 }]));
});
test('financial value changes, missing rows, extra rows, and duplicate rows fail verification', () => {
  const expected = { payments: [{ id: 1, amount: 20 }] };
  for (const rows of [[{ id: 1, amount: 21 }], [], [{ id: 1, amount: 20 }, { id: 1, amount: 20 }]]) {
    assert.throws(() => assertMatchingSnapshot(expected, { payments: rows }), /mismatch/);
  }
  assert.throws(() => assertMatchingSnapshot(expected, { ...expected, unexpected: [] }), /table set/);
});
test('source schema drift is rejected rather than silently discarding columns', () => {
  assertColumns([{ id: 1, amount: 2 }], ['id', 'amount'], 'payments');
  assert.throws(() => assertColumns([{ id: 1, amount: 2, new_column: 3 }], ['id', 'amount'], 'payments'), /schema drift/);
  assert.throws(() => assertColumns([{ id: 1 }], ['id', 'amount'], 'payments'), /schema drift/);
});
test('SQL identifiers are constrained to the committed manifest', () => {
  assert.equal(identifier('building_polls'), '"building_polls"');
  assert.throws(() => identifier('payments;drop table profiles'), /Invalid SQL identifier/);
});
test('production imports require an exact target approval', () => {
  assertTarget('elomara_migration_check');
  assert.throws(() => assertTarget('neondb'), /gated/);
  assert.throws(() => assertTarget('neondb', 'another_database'), /gated/);
  assertTarget('neondb', 'neondb');
});
