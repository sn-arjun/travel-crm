/**
 * Response-envelope normalisation.
 *
 * The backend answers with several different envelopes (see BUG-062). API clients
 * run every response through these helpers so pages only ever see the contract
 * shapes: `PaginatedResponse<T>` for lists and `ApiResponse<T>` for entities,
 * with camelCase keys.
 *
 * This module is intentionally free of runtime imports (types only) so it can be
 * used from any client and tested in isolation.
 */
import type { ApiResponse, PaginatedResponse } from './client';

type Json = Record<string, unknown>;

export interface UnwrapListOptions<T = unknown> {
  /** Page the caller asked for. Used to fill in pagination when the backend sent none. */
  page?: number;
  /** Page size the caller asked for. */
  limit?: number;
  /**
   * Set for endpoints that ignore paging and return every row: the rows are sliced
   * to `page`/`limit` here (only when the backend sent no pagination of its own).
   */
  clientPaginate?: boolean;
  /** Row predicate (search, role, ...) applied before slicing. Only used together with `clientPaginate`. */
  filter?: (row: T) => boolean;
}

export interface ReportEnvelope<T = unknown, C = unknown, M = unknown> {
  data: T[];
  columns: C[];
  meta: M | undefined;
  /** Full previous-period rows, present when the request asked for `compare=true`. */
  previousRows?: T[];
  /** Figures a report adds beside its rows (totals, notices), when it has any. */
  summary?: Record<string, unknown>;
}

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function pageCount(total: number, limit: number): number {
  return limit > 0 ? Math.ceil(total / limit) : 0;
}

function buildPagination(
  source: Json | undefined,
  rowCount: number,
  opts: Pick<UnwrapListOptions, 'page' | 'limit'>,
): PaginatedResponse<unknown>['pagination'] {
  const p = isObject(source?.pagination) ? (source.pagination as Json) : undefined;
  const page = num(p?.page) ?? num(source?.page) ?? opts.page ?? 1;
  const limit = num(p?.limit) ?? num(source?.limit) ?? opts.limit ?? Math.max(rowCount, 1);
  const total = num(p?.total) ?? num(p?.totalCount) ?? num(source?.total) ?? rowCount;
  const totalPages = num(p?.totalPages) ?? pageCount(total, limit);
  return { page, limit, total, totalPages };
}

/**
 * Finds the row array and the object that carries pagination info for any of the
 * list envelopes the backend produces:
 *
 *   T[]
 *   { data: T[] }
 *   { data: T[], pagination }
 *   { data: { data: T[], pagination } }
 *   { data: { items: T[], total, page, limit } }
 *   { success, data: { data: T[], columns, meta } }
 *   { items: T[], total, page, limit }
 */
function locateRows(res: unknown): { rows: unknown[]; source: Json | undefined } {
  if (Array.isArray(res)) return { rows: res, source: undefined };
  if (!isObject(res)) return { rows: [], source: undefined };

  const inner = res.data;
  if (Array.isArray(inner)) return { rows: inner, source: res };

  if (isObject(inner)) {
    if (Array.isArray(inner.data)) return { rows: inner.data, source: mergePagination(res, inner) };
    if (Array.isArray(inner.items)) return { rows: inner.items, source: mergePagination(res, inner) };
    if (Array.isArray(inner.results)) return { rows: inner.results, source: mergePagination(res, inner) };
  }
  if (Array.isArray(res.items)) return { rows: res.items, source: res };
  return { rows: [], source: res };
}

/** Inner pagination wins over the outer envelope's, which is only ever a sibling. */
function mergePagination(outer: Json, inner: Json): Json {
  return { ...outer, ...inner, pagination: inner.pagination ?? outer.pagination };
}

/**
 * Normalises any list envelope to `PaginatedResponse<T>`.
 *
 * With `clientPaginate`, an endpoint that ignores paging and returns every row is
 * sliced client-side, so infinite scroll terminates instead of re-fetching the same
 * rows for every page. Without it, rows are passed through as received.
 */
export function unwrapList<T>(res: unknown, opts: UnwrapListOptions<T> = {}): PaginatedResponse<T> {
  const { rows, source } = locateRows(res);
  const hasServerPagination = isObject(source?.pagination) || num(source?.total) !== undefined;

  if (opts.clientPaginate && !hasServerPagination) {
    const matching = opts.filter ? (rows as T[]).filter(opts.filter) : (rows as T[]);
    const limit = opts.limit !== undefined && opts.limit > 0 ? opts.limit : Math.max(matching.length, 1);
    const page = Math.max(opts.page ?? 1, 1);
    const start = (page - 1) * limit;
    return {
      data: matching.slice(start, start + limit),
      pagination: { page, limit, total: matching.length, totalPages: pageCount(matching.length, limit) },
    };
  }

  return {
    data: rows as T[],
    pagination: buildPagination(source, rows.length, opts),
  };
}

/**
 * Normalises a report envelope `{ success, data: { data: [], columns, meta } }`
 * (or the already-flattened `{ data, columns, meta }`) so pages can read
 * `.data`, `.columns` and `.meta` directly.
 */
export function unwrapReport<T = unknown, C = unknown, M = unknown>(res: unknown): ReportEnvelope<T, C, M> {
  if (Array.isArray(res)) return { data: res as T[], columns: [], meta: undefined };
  if (!isObject(res)) return { data: [], columns: [], meta: undefined };

  const inner = isObject(res.data) ? res.data : res;
  const rows = Array.isArray(inner.data) ? inner.data : Array.isArray(res.data) ? res.data : [];
  const columns = Array.isArray(inner.columns) ? inner.columns : Array.isArray(res.columns) ? res.columns : [];
  const meta = (inner.meta ?? res.meta) as M | undefined;
  const prev = inner.previous_period_rows ?? res.previous_period_rows;
  const summary = inner.summary ?? res.summary;
  return {
    data: rows as T[],
    columns: columns as C[],
    meta,
    ...(Array.isArray(prev) ? { previousRows: prev as T[] } : {}),
    ...(isObject(summary) ? { summary: summary as Record<string, unknown> } : {}),
  };
}

const WRAPPER_KEYS = new Set(['data', 'success', 'message']);

/**
 * Unwraps an entity envelope: `{ data: T }`, `{ data: { data: T } }` or a bare `T`.
 */
export function unwrapEntity<T>(res: unknown): T {
  if (!isObject(res)) return res as T;
  if (!('data' in res)) return res as T;

  const inner = res.data;
  if (
    isObject(inner)
    && 'data' in inner
    && Object.keys(inner).every((k) => WRAPPER_KEYS.has(k))
  ) {
    return inner.data as T;
  }
  return inner as T;
}

/** Wraps an entity in the contract `ApiResponse<T>` envelope. */
export function toApiResponse<T>(entity: T, message?: string): ApiResponse<T> {
  return message === undefined ? { data: entity } : { data: entity, message };
}

// ----------------------------------------------------------------------------
// Casing
// ----------------------------------------------------------------------------

/** Keys whose values are user-defined JSON; the key is renamed but its content is left alone. */
const OPAQUE_KEYS = new Set(['customFields', 'custom_fields', 'metadata', 'meta']);

function toCamel(key: string): string {
  if (!key.includes('_') || key.startsWith('_')) return key;
  return key.replace(/_+([a-zA-Z0-9])/g, (_m, c: string) => c.toUpperCase());
}

function isPlainObject(v: unknown): v is Json {
  if (typeof v !== 'object' || v === null) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep snake_case -> camelCase for object keys.
 *
 *  - an existing camelCase key always wins over its snake_case twin
 *  - `Date`s, class instances, `Blob`s and every non-key string (ISO dates, ids)
 *    are returned untouched
 *  - user-defined JSON (`customFields`, `metadata`) keeps its inner keys
 */
export function camelizeKeys<T = unknown>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => camelizeKeys(v)) as T;
  if (!isPlainObject(value)) return value as T;

  const out: Json = {};
  const keys = Object.keys(value);
  const present = new Set(keys);
  for (const key of keys) {
    const camel = toCamel(key);
    if (camel !== key && present.has(camel)) continue; // the camelCase twin is authoritative
    out[camel] = OPAQUE_KEYS.has(key) || OPAQUE_KEYS.has(camel) ? value[key] : camelizeKeys(value[key]);
  }
  return out as T;
}
