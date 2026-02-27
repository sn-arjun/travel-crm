/**
 * Segmentation Engine — converts filter rules into SQL WHERE clause.
 *
 * Filter format (JSON stored in contact_segments.filters_json):
 * {
 *   logic: 'AND' | 'OR',
 *   rules: [
 *     { field: 'city', operator: 'equals', value: 'Mumbai' },
 *     { field: 'tags', operator: 'contains', value: 'VIP' },
 *     { field: 'total_bookings', operator: 'gt', value: 5 },
 *     ...
 *   ]
 * }
 *
 * Nested groups are supported:
 * {
 *   logic: 'AND',
 *   rules: [
 *     { field: 'city', operator: 'equals', value: 'Mumbai' },
 *     {
 *       logic: 'OR',
 *       rules: [
 *         { field: 'tags', operator: 'contains', value: 'VIP' },
 *         { field: 'total_bookings', operator: 'gt', value: 10 },
 *       ]
 *     }
 *   ]
 * }
 */

export interface FilterRule {
  field: string;
  operator: string;
  value: any;
}

export interface FilterGroup {
  logic: 'AND' | 'OR';
  rules: (FilterRule | FilterGroup)[];
}

function isFilterGroup(rule: FilterRule | FilterGroup): rule is FilterGroup {
  return 'logic' in rule && 'rules' in rule;
}

// Map of supported fields to their SQL column names
const FIELD_MAP: Record<string, string> = {
  name: 'name',
  email: 'email',
  phone: 'phone',
  company: 'company',
  type: 'type',
  city: 'city',
  state: 'state',
  country: 'country',
  tags: 'tags',
  lead_source: 'lead_source',
  birthday: 'birthday',
  birthday_month: "CAST(strftime('%m', birthday) AS INTEGER)",
  last_travel_date: 'last_travel_date',
  total_bookings: 'total_bookings',
  total_spent: 'total_spent',
  has_email: 'email',
  has_phone: 'phone',
  opted_out: 'opted_out',
  created_at: 'created_at',
};

function buildRuleClause(rule: FilterRule): { clause: string; bindings: any[] } {
  const column = FIELD_MAP[rule.field];
  if (!column) {
    return { clause: '1=1', bindings: [] };
  }

  switch (rule.operator) {
    case 'equals':
      return { clause: `${column} = ?`, bindings: [rule.value] };

    case 'not_equals':
      return { clause: `${column} != ?`, bindings: [rule.value] };

    case 'contains':
      return { clause: `${column} LIKE ?`, bindings: [`%${rule.value}%`] };

    case 'not_contains':
      return { clause: `${column} NOT LIKE ?`, bindings: [`%${rule.value}%`] };

    case 'starts_with':
      return { clause: `${column} LIKE ?`, bindings: [`${rule.value}%`] };

    case 'ends_with':
      return { clause: `${column} LIKE ?`, bindings: [`%${rule.value}`] };

    case 'gt':
      return { clause: `${column} > ?`, bindings: [rule.value] };

    case 'gte':
      return { clause: `${column} >= ?`, bindings: [rule.value] };

    case 'lt':
      return { clause: `${column} < ?`, bindings: [rule.value] };

    case 'lte':
      return { clause: `${column} <= ?`, bindings: [rule.value] };

    case 'between': {
      const [min, max] = Array.isArray(rule.value) ? rule.value : [rule.value, rule.value];
      return { clause: `${column} BETWEEN ? AND ?`, bindings: [min, max] };
    }

    case 'in': {
      const values = Array.isArray(rule.value) ? rule.value : [rule.value];
      const placeholders = values.map(() => '?').join(', ');
      return { clause: `${column} IN (${placeholders})`, bindings: values };
    }

    case 'is_empty':
      return { clause: `(${column} IS NULL OR ${column} = '')`, bindings: [] };

    case 'is_not_empty':
      return { clause: `(${column} IS NOT NULL AND ${column} != '')`, bindings: [] };

    case 'is_true':
      return { clause: `${column} = 1`, bindings: [] };

    case 'is_false':
      return { clause: `(${column} = 0 OR ${column} IS NULL)`, bindings: [] };

    default:
      return { clause: '1=1', bindings: [] };
  }
}

function buildGroupClause(group: FilterGroup): { clause: string; bindings: any[] } {
  if (!group.rules || group.rules.length === 0) {
    return { clause: '', bindings: [] };
  }

  const parts: string[] = [];
  const allBindings: any[] = [];

  for (const rule of group.rules) {
    if (isFilterGroup(rule)) {
      const nested = buildGroupClause(rule);
      if (nested.clause) {
        parts.push(`(${nested.clause})`);
        allBindings.push(...nested.bindings);
      }
    } else {
      const { clause, bindings } = buildRuleClause(rule);
      parts.push(clause);
      allBindings.push(...bindings);
    }
  }

  const joiner = group.logic === 'OR' ? ' OR ' : ' AND ';
  return {
    clause: parts.join(joiner),
    bindings: allBindings,
  };
}

/**
 * Build a SQL WHERE clause from segment filter rules.
 * Returns the clause prefixed with AND (to append to existing WHERE).
 */
export function buildSegmentQuery(filters: FilterGroup): {
  whereClause: string;
  bindings: any[];
} {
  const { clause, bindings } = buildGroupClause(filters);

  if (!clause) {
    return { whereClause: '', bindings: [] };
  }

  return {
    whereClause: `AND (${clause})`,
    bindings,
  };
}
