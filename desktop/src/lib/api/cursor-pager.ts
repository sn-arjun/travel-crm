import type { PaginatedResponse } from './client';

/**
 * The group departures lists page by cursor ({ pagination: { total, hasMore, nextCursor } }); ListPage and useInfiniteScroll
 * page by number. CursorPager remembers the cursor each page ended with, so page N+1 is requested with the cursor of page N.
 * Asking for page 1 starts over (a changed filter or a refresh), so one pager serves a list for its whole life.
 */
export interface CursorPage<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `{ data: T[], pagination: { total, hasMore, nextCursor } }` to a CursorPage. Anything else is an empty page. */
export function toCursorPage<T>(res: unknown): CursorPage<T> {
  const body = isObject(res) ? res : {};
  const data = Array.isArray(body.data) ? (body.data as T[]) : [];
  const p = isObject(body.pagination) ? body.pagination : {};
  const total = typeof p.total === 'number' ? p.total : data.length;
  return {
    items: data,
    total,
    hasMore: p.hasMore === true,
    nextCursor: typeof p.nextCursor === 'string' ? p.nextCursor : null,
  };
}

export type PagerParams = Record<string, string | number | boolean | undefined>;

export class CursorPager<T> {
  private cursors = new Map<number, string | undefined>();

  constructor(private load: (cursor: string | undefined, params: PagerParams) => Promise<unknown>) {}

  async fetch(page: number, limit: number, params: PagerParams = {}): Promise<PaginatedResponse<T>> {
    if (page <= 1) this.cursors.clear();
    if (page <= 1) this.cursors.set(1, undefined);
    if (!this.cursors.has(page)) throw new Error('This page cannot be loaded before the one before it.');
    const res = toCursorPage<T>(await this.load(this.cursors.get(page), { ...params, limit }));
    this.cursors.set(page + 1, res.nextCursor ?? undefined);
    // The last page (no following cursor) ends the list whatever the total says; a page with more behind it never reports less than that.
    const total = res.hasMore ? Math.max(res.total, page * limit + 1) : (page - 1) * limit + res.items.length;
    return { data: res.items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
}
