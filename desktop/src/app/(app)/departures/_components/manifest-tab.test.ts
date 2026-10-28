import { describe, expect, it } from 'vitest';

import { filterRows } from './manifest-tab';

const rows = [
  { name: 'Anna Visser', _stop: 'Utrecht', _roomType: 'double', _documents: 'checked' },
  { name: 'Bram de Vries', _stop: 'Amersfoort', _roomType: 'single', _documents: 'unknown' },
  { name: 'Cato Visser', _stop: 'Utrecht', _roomType: 'double', _documents: 'problem' },
];
const none = { q: '', stop: null, roomType: null, documents: null };

describe('manifest filters', () => {
  it('keeps every row when no filter is set', () => {
    expect(filterRows(rows, none)).toHaveLength(3);
  });

  it('filters by name without regard to case', () => {
    expect(filterRows(rows, { ...none, q: ' visser ' }).map((r) => r.name)).toEqual(['Anna Visser', 'Cato Visser']);
  });

  it('filters by pickup point, room type and documents status, and combines them', () => {
    expect(filterRows(rows, { ...none, stop: 'Amersfoort' }).map((r) => r.name)).toEqual(['Bram de Vries']);
    expect(filterRows(rows, { ...none, roomType: 'double' })).toHaveLength(2);
    expect(filterRows(rows, { ...none, documents: 'problem' }).map((r) => r.name)).toEqual(['Cato Visser']);
    expect(filterRows(rows, { ...none, stop: 'Utrecht', documents: 'checked' }).map((r) => r.name)).toEqual(['Anna Visser']);
    expect(filterRows(rows, { ...none, stop: 'Amersfoort', roomType: 'double' })).toEqual([]);
  });
});
