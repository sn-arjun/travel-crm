import { describe, it, expect } from 'vitest';
import { buildSegmentQuery, type FilterGroup, type FilterRule } from '../../src/services/segmentation-engine';

describe('buildSegmentQuery', () => {
  // ─── Empty / Missing ──────────────────────────────────────────

  it('should return empty clause for empty rules array', () => {
    const filters: FilterGroup = { logic: 'AND', rules: [] };
    const result = buildSegmentQuery(filters);

    expect(result.whereClause).toBe('');
    expect(result.bindings).toEqual([]);
  });

  // ─── Single Rules ─────────────────────────────────────────────

  it('should build equals clause', () => {
    const filters: FilterGroup = {
      logic: 'AND',
      rules: [{ field: 'city', operator: 'equals', value: 'Mumbai' }],
    };
    const result = buildSegmentQuery(filters);

    expect(result.whereClause).toBe('AND (city = ?)');
    expect(result.bindings).toEqual(['Mumbai']);
  });

  it('should build not_equals clause', () => {
    const filters: FilterGroup = {
      logic: 'AND',
      rules: [{ field: 'city', operator: 'not_equals', value: 'Delhi' }],
    };
    const result = buildSegmentQuery(filters);

    expect(result.whereClause).toBe('AND (city != ?)');
    expect(result.bindings).toEqual(['Delhi']);
  });

  it('should build contains clause (LIKE)', () => {
    const filters: FilterGroup = {
      logic: 'AND',
      rules: [{ field: 'tags', operator: 'contains', value: 'VIP' }],
    };
    const result = buildSegmentQuery(filters);

    expect(result.whereClause).toBe('AND (tags LIKE ?)');
    expect(result.bindings).toEqual(['%VIP%']);
  });

  it('should build not_contains clause', () => {
    const filters: FilterGroup = {
      logic: 'AND',
      rules: [{ field: 'tags', operator: 'not_contains', value: 'spam' }],
    };
    const result = buildSegmentQuery(filters);

    expect(result.whereClause).toBe('AND (tags NOT LIKE ?)');
    expect(result.bindings).toEqual(['%spam%']);
  });

  it('should build starts_with clause', () => {
    const filters: FilterGroup = {
      logic: 'AND',
      rules: [{ field: 'name', operator: 'starts_with', value: 'John' }],
    };
    const result = buildSegmentQuery(filters);

    expect(result.whereClause).toBe('AND (name LIKE ?)');
    expect(result.bindings).toEqual(['John%']);
  });

  it('should build ends_with clause', () => {
    const filters: FilterGroup = {
      logic: 'AND',
      rules: [{ field: 'email', operator: 'ends_with', value: '@gmail.com' }],
    };
    const result = buildSegmentQuery(filters);

    expect(result.whereClause).toBe('AND (email LIKE ?)');
    expect(result.bindings).toEqual(['%@gmail.com']);
  });

  it('should build gt (greater than) clause', () => {
    const filters: FilterGroup = {
      logic: 'AND',
      rules: [{ field: 'total_bookings', operator: 'gt', value: 5 }],
    };
    const result = buildSegmentQuery(filters);

    expect(result.whereClause).toBe('AND (total_bookings > ?)');
    expect(result.bindings).toEqual([5]);
  });

  it('should build gte (greater than or equal) clause', () => {
    const filters: FilterGroup = {
      logic: 'AND',
      rules: [{ field: 'total_spent', operator: 'gte', value: 10000 }],
    };
    const result = buildSegmentQuery(filters);

    expect(result.whereClause).toBe('AND (total_spent >= ?)');
    expect(result.bindings).toEqual([10000]);
  });

  it('should build lt (less than) clause', () => {
    const filters: FilterGroup = {
      logic: 'AND',
      rules: [{ field: 'total_bookings', operator: 'lt', value: 3 }],
    };
    const result = buildSegmentQuery(filters);

    expect(result.whereClause).toBe('AND (total_bookings < ?)');
    expect(result.bindings).toEqual([3]);
  });

  it('should build lte (less than or equal) clause', () => {
    const filters: FilterGroup = {
      logic: 'AND',
      rules: [{ field: 'total_spent', operator: 'lte', value: 5000 }],
    };
    const result = buildSegmentQuery(filters);

    expect(result.whereClause).toBe('AND (total_spent <= ?)');
    expect(result.bindings).toEqual([5000]);
  });

  it('should build between clause', () => {
    const filters: FilterGroup = {
      logic: 'AND',
      rules: [{ field: 'total_spent', operator: 'between', value: [1000, 5000] }],
    };
    const result = buildSegmentQuery(filters);

    expect(result.whereClause).toBe('AND (total_spent BETWEEN ? AND ?)');
    expect(result.bindings).toEqual([1000, 5000]);
  });

  it('should build in clause', () => {
    const filters: FilterGroup = {
      logic: 'AND',
      rules: [{ field: 'city', operator: 'in', value: ['Mumbai', 'Delhi', 'Bangalore'] }],
    };
    const result = buildSegmentQuery(filters);

    expect(result.whereClause).toBe('AND (city IN (?, ?, ?))');
    expect(result.bindings).toEqual(['Mumbai', 'Delhi', 'Bangalore']);
  });

  it('should build is_empty clause', () => {
    const filters: FilterGroup = {
      logic: 'AND',
      rules: [{ field: 'email', operator: 'is_empty', value: null }],
    };
    const result = buildSegmentQuery(filters);

    expect(result.whereClause).toBe("AND ((email IS NULL OR email = ''))");
    expect(result.bindings).toEqual([]);
  });

  it('should build is_not_empty clause', () => {
    const filters: FilterGroup = {
      logic: 'AND',
      rules: [{ field: 'phone', operator: 'is_not_empty', value: null }],
    };
    const result = buildSegmentQuery(filters);

    expect(result.whereClause).toBe("AND ((phone IS NOT NULL AND phone != ''))");
    expect(result.bindings).toEqual([]);
  });

  it('should build is_true clause', () => {
    const filters: FilterGroup = {
      logic: 'AND',
      rules: [{ field: 'opted_out', operator: 'is_true', value: null }],
    };
    const result = buildSegmentQuery(filters);

    expect(result.whereClause).toBe('AND (opted_out = 1)');
    expect(result.bindings).toEqual([]);
  });

  it('should build is_false clause', () => {
    const filters: FilterGroup = {
      logic: 'AND',
      rules: [{ field: 'opted_out', operator: 'is_false', value: null }],
    };
    const result = buildSegmentQuery(filters);

    expect(result.whereClause).toBe('AND ((opted_out = 0 OR opted_out IS NULL))');
    expect(result.bindings).toEqual([]);
  });

  // ─── AND / OR Logic ───────────────────────────────────────────

  it('should join rules with AND', () => {
    const filters: FilterGroup = {
      logic: 'AND',
      rules: [
        { field: 'city', operator: 'equals', value: 'Mumbai' },
        { field: 'total_bookings', operator: 'gt', value: 5 },
      ],
    };
    const result = buildSegmentQuery(filters);

    expect(result.whereClause).toBe('AND (city = ? AND total_bookings > ?)');
    expect(result.bindings).toEqual(['Mumbai', 5]);
  });

  it('should join rules with OR', () => {
    const filters: FilterGroup = {
      logic: 'OR',
      rules: [
        { field: 'city', operator: 'equals', value: 'Mumbai' },
        { field: 'city', operator: 'equals', value: 'Delhi' },
      ],
    };
    const result = buildSegmentQuery(filters);

    expect(result.whereClause).toBe('AND (city = ? OR city = ?)');
    expect(result.bindings).toEqual(['Mumbai', 'Delhi']);
  });

  // ─── Nested Groups ────────────────────────────────────────────

  it('should handle nested filter groups', () => {
    const filters: FilterGroup = {
      logic: 'AND',
      rules: [
        { field: 'city', operator: 'equals', value: 'Mumbai' },
        {
          logic: 'OR',
          rules: [
            { field: 'tags', operator: 'contains', value: 'VIP' },
            { field: 'total_bookings', operator: 'gt', value: 10 },
          ],
        },
      ],
    };
    const result = buildSegmentQuery(filters);

    expect(result.whereClause).toBe('AND (city = ? AND (tags LIKE ? OR total_bookings > ?))');
    expect(result.bindings).toEqual(['Mumbai', '%VIP%', 10]);
  });

  // ─── Unknown Fields ───────────────────────────────────────────

  it('should produce 1=1 for unknown field names', () => {
    const filters: FilterGroup = {
      logic: 'AND',
      rules: [{ field: 'nonexistent_field', operator: 'equals', value: 'test' }],
    };
    const result = buildSegmentQuery(filters);

    expect(result.whereClause).toBe('AND (1=1)');
    expect(result.bindings).toEqual([]);
  });

  // ─── Unknown Operator ─────────────────────────────────────────

  it('should produce 1=1 for unknown operators', () => {
    const filters: FilterGroup = {
      logic: 'AND',
      rules: [{ field: 'city', operator: 'magic_operator', value: 'test' }],
    };
    const result = buildSegmentQuery(filters);

    expect(result.whereClause).toBe('AND (1=1)');
    expect(result.bindings).toEqual([]);
  });

  // ─── Computed Fields ──────────────────────────────────────────

  it('should handle birthday_month computed field', () => {
    const filters: FilterGroup = {
      logic: 'AND',
      rules: [{ field: 'birthday_month', operator: 'equals', value: 3 }],
    };
    const result = buildSegmentQuery(filters);

    expect(result.whereClause).toBe("AND (CAST(strftime('%m', birthday) AS INTEGER) = ?)");
    expect(result.bindings).toEqual([3]);
  });

  // ─── Complex Real-World Query ─────────────────────────────────

  it('should handle complex multi-rule query', () => {
    const filters: FilterGroup = {
      logic: 'AND',
      rules: [
        { field: 'type', operator: 'equals', value: 'individual' },
        { field: 'city', operator: 'in', value: ['Mumbai', 'Pune'] },
        { field: 'total_spent', operator: 'gte', value: 50000 },
        { field: 'opted_out', operator: 'is_false', value: null },
        {
          logic: 'OR',
          rules: [
            { field: 'tags', operator: 'contains', value: 'premium' },
            { field: 'total_bookings', operator: 'gt', value: 5 },
          ],
        },
      ],
    };
    const result = buildSegmentQuery(filters);

    expect(result.whereClause).toContain('type = ?');
    expect(result.whereClause).toContain('city IN (?, ?)');
    expect(result.whereClause).toContain('total_spent >= ?');
    expect(result.whereClause).toContain('opted_out = 0 OR opted_out IS NULL');
    expect(result.whereClause).toContain('tags LIKE ? OR total_bookings > ?');
    expect(result.bindings).toEqual(['individual', 'Mumbai', 'Pune', 50000, '%premium%', 5]);
  });
});
