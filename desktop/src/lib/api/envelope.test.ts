import { describe, it, expect } from 'vitest';
import { camelizeKeys, toApiResponse, unwrapEntity, unwrapList, unwrapReport } from './envelope';

const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('unwrapList', () => {
  it('handles a bare array', () => {
    const r = unwrapList<{ id: string }>(rows);
    expect(r.data).toEqual(rows);
    expect(r.pagination).toEqual({ page: 1, limit: 3, total: 3, totalPages: 1 });
  });

  it('handles an empty bare array', () => {
    const r = unwrapList([]);
    expect(r.data).toEqual([]);
    expect(r.pagination.total).toBe(0);
    expect(r.pagination.limit).toBe(1);
  });

  it('handles { data: T[] } using the requested page and limit', () => {
    const r = unwrapList({ success: true, data: rows }, { page: 2, limit: 20 });
    expect(r.data).toEqual(rows);
    expect(r.pagination).toEqual({ page: 2, limit: 20, total: 3, totalPages: 1 });
  });

  it('handles { data: T[], pagination } (flat contract shape)', () => {
    const r = unwrapList({ success: true, data: rows, pagination: { page: 2, limit: 3, total: 9, totalPages: 3, hasMore: true } });
    expect(r.data).toEqual(rows);
    expect(r.pagination).toEqual({ page: 2, limit: 3, total: 9, totalPages: 3 });
  });

  it('handles { data: { data: T[], pagination } } (visa / travellers)', () => {
    const r = unwrapList({ data: { data: rows, pagination: { page: 1, limit: 2, total: 3, totalPages: 2 } } });
    expect(r.data).toEqual(rows);
    expect(r.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
  });

  it('handles { data: { items, total, page, limit } }', () => {
    const r = unwrapList({ data: { items: rows, total: 7, page: 2, limit: 3 } });
    expect(r.data).toEqual(rows);
    expect(r.pagination).toEqual({ page: 2, limit: 3, total: 7, totalPages: 3 });
  });

  it('handles the notifications envelope that carries items, data and pagination together', () => {
    const r = unwrapList({
      success: true,
      data: {
        items: rows,
        total: 12,
        page: 1,
        limit: 5,
        data: rows,
        pagination: { page: 1, limit: 5, total: 12, totalPages: 3 },
      },
    });
    expect(r.data).toEqual(rows);
    expect(r.pagination).toEqual({ page: 1, limit: 5, total: 12, totalPages: 3 });
  });

  it('handles a report envelope { success, data: { data, columns, meta } }', () => {
    const r = unwrapList({ success: true, data: { data: rows, columns: [{ key: 'id' }], meta: { generatedAt: 'x' } } });
    expect(r.data).toEqual(rows);
    expect(r.pagination.total).toBe(3);
  });

  it('handles a top-level { items, total, page, limit }', () => {
    const r = unwrapList({ items: rows, total: 3, page: 1, limit: 10 });
    expect(r.data).toEqual(rows);
    expect(r.pagination).toEqual({ page: 1, limit: 10, total: 3, totalPages: 1 });
  });

  it('falls back to an empty page for null, undefined and unknown shapes', () => {
    expect(unwrapList(null).data).toEqual([]);
    expect(unwrapList(undefined).data).toEqual([]);
    expect(unwrapList({ success: true }).data).toEqual([]);
    expect(unwrapList('nope').data).toEqual([]);
  });

  it('accepts numeric strings in pagination', () => {
    const r = unwrapList({ data: rows, pagination: { page: '2', limit: '3', total: '9' } });
    expect(r.pagination).toEqual({ page: 2, limit: 3, total: 9, totalPages: 3 });
  });

  it('does not slice by default, even when page and limit are given', () => {
    const r = unwrapList({ data: rows }, { page: 2, limit: 2 });
    expect(r.data).toEqual(rows);
  });

  describe('clientPaginate', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ id: String(i) }));

    it('slices an unpaginated array to the requested page', () => {
      const p1 = unwrapList<{ id: string }>({ data: many }, { page: 1, limit: 2, clientPaginate: true });
      const p3 = unwrapList<{ id: string }>({ data: many }, { page: 3, limit: 2, clientPaginate: true });
      expect(p1.data.map((r) => r.id)).toEqual(['0', '1']);
      expect(p3.data.map((r) => r.id)).toEqual(['4']);
      expect(p1.pagination).toEqual({ page: 1, limit: 2, total: 5, totalPages: 3 });
    });

    it('returns an empty slice past the last page', () => {
      const r = unwrapList({ data: many }, { page: 9, limit: 2, clientPaginate: true });
      expect(r.data).toEqual([]);
      expect(r.pagination.total).toBe(5);
    });

    it('slices a bare array too', () => {
      const r = unwrapList(many, { page: 2, limit: 3, clientPaginate: true });
      expect(r.data).toHaveLength(2);
    });

    it('filters before slicing, and works without page/limit', () => {
      const even = (r: { id: string }) => Number(r.id) % 2 === 0;
      const all = unwrapList<{ id: string }>({ data: many }, { clientPaginate: true, filter: even });
      expect(all.data.map((r) => r.id)).toEqual(['0', '2', '4']);
      expect(all.pagination).toEqual({ page: 1, limit: 3, total: 3, totalPages: 1 });
      const p2 = unwrapList<{ id: string }>({ data: many }, { page: 2, limit: 2, clientPaginate: true, filter: even });
      expect(p2.data.map((r) => r.id)).toEqual(['4']);
      expect(p2.pagination.total).toBe(3);
    });

    it('leaves server-paginated responses alone', () => {
      const r = unwrapList(
        { data: many.slice(0, 2), pagination: { page: 1, limit: 2, total: 5, totalPages: 3 } },
        { page: 1, limit: 2, clientPaginate: true },
      );
      expect(r.data).toHaveLength(2);
      expect(r.pagination.total).toBe(5);
    });
  });
});

describe('unwrapReport', () => {
  it('exposes data, columns and meta from { success, data: { data, columns, meta } }', () => {
    const r = unwrapReport({ success: true, data: { data: rows, columns: [{ key: 'id' }], meta: { total: 3 } } });
    expect(r.data).toEqual(rows);
    expect(r.columns).toEqual([{ key: 'id' }]);
    expect(r.meta).toEqual({ total: 3 });
  });

  it('accepts an already flat { data, columns, meta }', () => {
    const r = unwrapReport({ data: rows, columns: ['id'], meta: { a: 1 } });
    expect(r.data).toEqual(rows);
    expect(r.columns).toEqual(['id']);
    expect(r.meta).toEqual({ a: 1 });
  });

  it('accepts { data: T[] } and a bare array', () => {
    expect(unwrapReport({ data: rows }).data).toEqual(rows);
    expect(unwrapReport({ data: rows }).columns).toEqual([]);
    expect(unwrapReport(rows).data).toEqual(rows);
  });

  it('never throws on junk', () => {
    expect(unwrapReport(null)).toEqual({ data: [], columns: [], meta: undefined });
    expect(unwrapReport({ success: true })).toEqual({ data: [], columns: [], meta: undefined });
  });
});

describe('unwrapEntity', () => {
  const entity = { id: 'x', name: 'Asha' };

  it('unwraps { data: T }', () => {
    expect(unwrapEntity(toApiResponse(entity))).toEqual(entity);
    expect(unwrapEntity({ success: true, data: entity })).toEqual(entity);
  });

  it('unwraps { data: { data: T } }', () => {
    expect(unwrapEntity({ data: { data: entity } })).toEqual(entity);
    expect(unwrapEntity({ data: { success: true, data: entity } })).toEqual(entity);
  });

  it('passes a bare entity through', () => {
    expect(unwrapEntity(entity)).toEqual(entity);
  });

  it('does not mistake an entity that owns a "data" field for an envelope', () => {
    const withData = { id: 'x', data: { k: 1 } };
    expect(unwrapEntity({ data: withData })).toEqual(withData);
  });

  it('keeps arrays and null intact', () => {
    expect(unwrapEntity({ data: rows })).toEqual(rows);
    expect(unwrapEntity(null)).toBeNull();
  });
});

describe('toApiResponse', () => {
  it('wraps an entity, with an optional message', () => {
    expect(toApiResponse(1)).toEqual({ data: 1 });
    expect(toApiResponse(1, 'ok')).toEqual({ data: 1, message: 'ok' });
  });
});

describe('camelizeKeys', () => {
  it('converts snake_case keys, deeply and inside arrays', () => {
    expect(
      camelizeKeys({ first_name: 'A', nested_obj: { due_date: 'x', list_items: [{ some_key: 1 }] } }),
    ).toEqual({ firstName: 'A', nestedObj: { dueDate: 'x', listItems: [{ someKey: 1 }] } });
  });

  it('keeps existing camelCase keys and drops their snake twin', () => {
    expect(camelizeKeys({ dueDate: 'camel', due_date: 'snake' })).toEqual({ dueDate: 'camel' });
    expect(camelizeKeys({ due_date: 'snake', dueDate: 'camel' })).toEqual({ dueDate: 'camel' });
  });

  it('leaves values untouched, including ISO strings and Dates', () => {
    const d = new Date('2026-01-02T03:04:05Z');
    const out = camelizeKeys<{ createdAt: string; when: Date; snake_value: string }>({
      created_at: '2026-01-02T03:04:05Z',
      when: d,
      snake_value_str: 'a_b_c',
    }) as unknown as Record<string, unknown>;
    expect(out.createdAt).toBe('2026-01-02T03:04:05Z');
    expect(out.when).toBe(d);
    expect(out.snakeValueStr).toBe('a_b_c');
  });

  it('does not touch keys without underscores or with a leading underscore', () => {
    expect(camelizeKeys({ id: 1, _internal: 2, Already: 3 })).toEqual({ id: 1, _internal: 2, Already: 3 });
  });

  it('keeps user-defined JSON (customFields / metadata) verbatim', () => {
    expect(
      camelizeKeys({ custom_fields: { my_field: 1 }, metadata: { some_key: 2 } }),
    ).toEqual({ customFields: { my_field: 1 }, metadata: { some_key: 2 } });
  });

  it('passes primitives and null through', () => {
    expect(camelizeKeys(null)).toBeNull();
    expect(camelizeKeys(undefined)).toBeUndefined();
    expect(camelizeKeys('a_b')).toBe('a_b');
    expect(camelizeKeys(5)).toBe(5);
  });

  it('does not mutate its input', () => {
    const input = { a_b: { c_d: 1 } };
    camelizeKeys(input);
    expect(input).toEqual({ a_b: { c_d: 1 } });
  });
});
