import { createHash } from 'node:crypto';

export function identifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('Invalid SQL identifier');
  return `"${value}"`;
}
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function fingerprint(rows) {
  return createHash('sha256').update(rows.map(canonical).sort().join('\n')).digest('hex');
}
export function assertMatchingSnapshot(expected, actual) {
  for (const [name, rows] of Object.entries(expected)) {
    if (!Array.isArray(actual[name]) || fingerprint(rows) !== fingerprint(actual[name])) {
      throw new Error(`Snapshot mismatch for ${name}; refusing migration commit`);
    }
  }
  if (Object.keys(expected).length !== Object.keys(actual).length) throw new Error('Snapshot table set changed');
}
export function assertColumns(rows, columns, table) {
  const allowed = new Set(columns);
  for (const row of rows) {
    if (Object.keys(row).length !== allowed.size || Object.keys(row).some(k => !allowed.has(k))) {
      throw new Error(`Source schema drift in ${table}; refresh the migration schema before importing`);
    }
  }
}
export function assertTarget(databaseName, approvedName) {
  if (!databaseName) throw new Error('Target database name is required');
  if (databaseName !== 'elomara_migration_check' && databaseName !== approvedName) {
    throw new Error('Production import is gated: explicit reviewed approval must name the target database');
  }
}
