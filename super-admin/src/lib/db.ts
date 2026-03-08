/**
 * D1 Database helper for Super Admin portal.
 * In Cloudflare Pages, the D1 binding is available via the platform env.
 */

export type D1Database = {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
};

export type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
};

export type D1Result<T = unknown> = {
  results: T[];
  success: boolean;
  meta: {
    duration: number;
    changes: number;
    last_row_id: number;
  };
};

export type D1ExecResult = {
  count: number;
  duration: number;
};

/**
 * Get D1 database from Cloudflare Pages context.
 * In API routes, access via: getRequestContext().env.MASTER_DB
 */
export function getDb(env: { MASTER_DB: D1Database }): D1Database {
  return env.MASTER_DB;
}
