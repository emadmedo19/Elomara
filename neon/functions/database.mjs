import pg from 'pg';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { attachDatabasePool } from '@neon/functions';
import { identifier } from '../scripts/snapshot-utils.mjs';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
attachDatabasePool(pool);
let jwks;
export async function authenticatedUser(authorization) {
  if (!/^Bearer \S+$/i.test(authorization || '')) throw new Error('Authentication required');
  jwks ??= createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL));
  const { payload } = await jwtVerify(authorization.slice(7), jwks, {
    issuer: new URL(process.env.NEON_AUTH_BASE_URL).origin, algorithms: ['EdDSA'],
  });
  if (!payload.sub) throw new Error('Invalid identity');
  const { rows: [user] } = await pool.query(`select m.app_user_id as id,u.email from private.auth_identity_map m
    join app_auth.users u on u.id=m.app_user_id join neon_auth."user" n on n.id::text=m.neon_user_id
    where m.neon_user_id=$1 and n."emailVerified"=true and coalesce(n.banned,false)=false
      and (u.banned_until is null or u.banned_until<now())`, [payload.sub]);
  if (!user) throw new Error('Application identity is not linked');
  return user;
}

// Server-only compatibility layer for the existing reviewed push handlers.
// Identifiers are validated, every value is parameterized, and no SQL builder
// is reachable from an HTTP request. User clients cannot use the admin builder.
class Query {
  constructor(table) { this.table = identifier(table); this.operation = 'select'; this.columns = '*'; this.filters = []; this.parameters = []; }
  bind(value) { this.parameters.push(value); return `$${this.parameters.length}`; }
  select(columns = '*') { this.columns = columns === '*' ? '*' : columns.split(',').map(c => identifier(c.trim())).join(','); return this; }
  eq(column, value) { this.filters.push(`${identifier(column)}=${this.bind(value)}`); return this; }
  gte(column, value) { this.filters.push(`${identifier(column)}>=${this.bind(value)}`); return this; }
  lte(column, value) { this.filters.push(`${identifier(column)}<=${this.bind(value)}`); return this; }
  is(column, value) { if (value !== null) throw new Error('Only NULL comparisons are supported'); this.filters.push(`${identifier(column)} IS NULL`); return this; }
  not(column, operator, value) { if (operator !== 'is' || value !== null) throw new Error('Unsupported comparison'); this.filters.push(`${identifier(column)} IS NOT NULL`); return this; }
  in(column, values) { this.filters.push(values.length ? `${identifier(column)} IN (${values.map(v => this.bind(v)).join(',')})` : 'false'); return this; }
  limit(value) { if (!Number.isSafeInteger(value) || value < 0 || value > 10000) throw new Error('Invalid limit'); this.rowLimit = value; return this; }
  insert(values) { this.operation = 'insert'; this.values = values; return this; }
  update(values) { this.operation = 'update'; this.values = values; return this; }
  delete() { this.operation = 'delete'; return this; }
  maybeSingle() { this.singleMode = 'optional'; return this.execute(); }
  single() { this.singleMode = 'required'; return this.execute(); }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
  async execute() {
    try {
      const relation = `public.${this.table}`;
      const where = this.filters.length ? ` WHERE ${this.filters.join(' AND ')}` : '';
      let sql;
      if (this.operation === 'select') sql = `SELECT ${this.columns} FROM ${relation}${where}${this.rowLimit !== undefined ? ` LIMIT ${this.rowLimit}` : ''}`;
      else if (this.operation === 'delete') { if (!where) throw new Error('Unfiltered delete refused'); sql = `DELETE FROM ${relation}${where} RETURNING ${this.columns}`; }
      else if (this.operation === 'update') {
        if (!where) throw new Error('Unfiltered update refused');
        const set = Object.entries(this.values).map(([key, value]) => `${identifier(key)}=${this.bind(value)}`).join(',');
        sql = `UPDATE ${relation} SET ${set}${where} RETURNING ${this.columns}`;
      } else {
        const entries = Object.entries(this.values);
        sql = `INSERT INTO ${relation}(${entries.map(([key]) => identifier(key)).join(',')}) VALUES(${entries.map(([, value]) => this.bind(value)).join(',')}) RETURNING ${this.columns}`;
      }
      const { rows } = await pool.query(sql, this.parameters);
      if (this.singleMode && (rows.length > 1 || (this.singleMode === 'required' && !rows.length))) throw new Error('Unexpected row count');
      return { data: this.singleMode ? rows[0] || null : rows, error: null };
    } catch (error) { return { data: null, error: { message: 'Database operation failed', code: typeof error?.code === 'string' ? error.code : undefined } }; }
  }
}
export function createBackendClient(authorization) {
  const assertAdmin = () => { if (authorization !== undefined) throw new Error('Use the authenticated Data API for user queries'); };
  return {
    auth: { async getUser() { try { return { data: { user: await authenticatedUser(authorization) }, error: null }; }
      catch { return { data: { user: null }, error: { message: 'Invalid session' } }; } } },
    from(table) { assertAdmin(); return new Query(table); },
    async rpc(name, args = {}) {
      assertAdmin();
      if (!['claim_mobile_notifications', 'schedule_daily_engagement'].includes(name)) throw new Error('Unsupported internal RPC');
      try {
        const entries = Object.entries(args);
        const { rows } = await pool.query(`SELECT * FROM public.${identifier(name)}(${entries.map(([key], i) => `${identifier(key)} => $${i + 1}`).join(',')})`, entries.map(([, v]) => v));
        return { data: rows, error: null };
      } catch { return { data: null, error: { message: 'Internal RPC failed' } }; }
    },
  };
}
