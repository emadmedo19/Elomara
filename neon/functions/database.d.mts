import type { Pool } from 'pg';
export const pool: Pool;
export function authenticatedUser(authorization: string): Promise<{ id: string; email: string }>;
// Column projections differ in each preserved handler, as with the untyped
// source database client. Keep dynamic SQL row values confined to this boundary.
type Result = { data: any; error: { message: string; code?: string } | null };
interface Query extends PromiseLike<Result> {
  select(columns?: string): Query;
  eq(column: string, value: unknown): Query;
  gte(column: string, value: unknown): Query;
  lte(column: string, value: unknown): Query;
  is(column: string, value: null): Query;
  not(column: string, operator: 'is', value: null): Query;
  in(column: string, values: unknown[]): Query;
  limit(value: number): Query;
  insert(value: Record<string, unknown>): Query;
  update(value: Record<string, unknown>): Query;
  delete(): Query;
  maybeSingle(): Promise<Result>;
  single(): Promise<Result>;
}
export function createBackendClient(authorization?: string): {
  auth: { getUser(): Promise<{ data: { user: { id: string; email: string } | null }; error: { message: string } | null }> };
  from(table: string): Query;
  rpc(name: string, args?: Record<string, unknown>): Promise<Result>;
};
