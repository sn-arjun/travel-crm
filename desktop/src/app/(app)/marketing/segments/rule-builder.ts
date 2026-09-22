export interface Rule {
  id: string;
  field: string;
  operator: string;
  value: string;
}

export interface RuleGroup {
  id: string;
  logic: 'AND' | 'OR';
  rules: Rule[];
}

export const fieldOptions = [
  { value: 'city', label: 'City' },
  { value: 'state', label: 'State' },
  { value: 'country', label: 'Country' },
  { value: 'source', label: 'Lead Source' },
  { value: 'status', label: 'Lead Status' },
  { value: 'tag', label: 'Tag' },
  { value: 'total_spent', label: 'Total Spent' },
  { value: 'last_trip_date', label: 'Last Trip Date' },
  { value: 'trip_count', label: 'Trip Count' },
  { value: 'created_at', label: 'Created Date' },
];

export const operatorOptions: Record<'text' | 'number' | 'date', { value: string; label: string }[]> = {
  text: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'starts_with', label: 'Starts With' },
  ],
  number: [
    { value: 'equals', label: 'Equals' },
    { value: 'gt', label: 'Greater Than' },
    { value: 'lt', label: 'Less Than' },
    { value: 'gte', label: 'Greater or Equal' },
    { value: 'lte', label: 'Less or Equal' },
  ],
  date: [
    { value: 'before', label: 'Before' },
    { value: 'after', label: 'After' },
    { value: 'between', label: 'Between' },
    { value: 'last_n_days', label: 'In Last N Days' },
  ],
};

export function getFieldType(field: string): 'text' | 'number' | 'date' {
  if (['total_spent', 'trip_count'].includes(field)) return 'number';
  if (['last_trip_date', 'created_at'].includes(field)) return 'date';
  return 'text';
}

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

export function makeRule(): Rule {
  return { id: newId(), field: 'city', operator: 'equals', value: '' };
}

export function makeGroup(): RuleGroup {
  return { id: newId(), logic: 'AND', rules: [makeRule()] };
}

export function groupsToCriteria(groups: RuleGroup[]): Record<string, unknown> {
  return {
    groups: groups.map((g) => ({
      logic: g.logic,
      rules: g.rules
        .filter((r) => r.field && r.value)
        .map((r) => ({ field: r.field, operator: r.operator, value: r.value })),
    })),
  };
}

export function criteriaToGroups(criteria: Record<string, unknown> | null | undefined): RuleGroup[] {
  const rawGroups = (criteria as { groups?: unknown[] } | null)?.groups;
  if (Array.isArray(rawGroups) && rawGroups.length > 0) {
    const groups = rawGroups.map((g) => {
      const group = g as { logic?: string; rules?: unknown[] };
      const rules = Array.isArray(group.rules)
        ? group.rules.map((r) => {
            const rule = r as { field?: string; operator?: string; value?: unknown };
            return {
              id: newId(),
              field: rule.field ?? 'city',
              operator: rule.operator ?? 'equals',
              value: rule.value != null ? String(rule.value) : '',
            };
          })
        : [];
      return {
        id: newId(),
        logic: group.logic === 'OR' ? 'OR' as const : 'AND' as const,
        rules: rules.length > 0 ? rules : [makeRule()],
      };
    });
    return groups.length > 0 ? groups : [makeGroup()];
  }

  // Legacy flat criteria: { field: value, ... }
  if (criteria && Object.keys(criteria).length > 0) {
    const rules = Object.entries(criteria).map(([field, value]) => ({
      id: newId(),
      field,
      operator: 'equals',
      value: String(value ?? ''),
    }));
    return [{ id: newId(), logic: 'AND' as const, rules }];
  }

  return [makeGroup()];
}
