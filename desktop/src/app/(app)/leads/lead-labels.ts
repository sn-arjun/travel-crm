import type { Lead } from '@travelcrm/shared';

/** A lead as the list/detail endpoints return it (adds joined contact and owner fields). */
export type LeadRow = Lead & {
  destinations?: string[];
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  assignedUser?: { name?: string | null } | null;
  assignedToName?: string | null;
  notes?: string;
};

export function leadDestination(lead: Pick<LeadRow, 'destinations' | 'destination'>): string {
  return lead.destinations?.join(', ') || lead.destination || '—';
}

/** Human-readable labels for lead enums, shared by the lead pages. */

export const LEAD_SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual entry',
  website: 'Website',
  facebook: 'Facebook',
  google: 'Google',
  referral: 'Referral',
  walkin: 'Walk-in',
  walk_in: 'Walk-in',
};

export const TRIP_TYPE_LABELS: Record<string, string> = {
  domestic: 'Domestic',
  international: 'International',
  honeymoon: 'Honeymoon',
  family: 'Family',
  group: 'Group',
  corporate: 'Corporate',
  adventure: 'Adventure',
  pilgrimage: 'Pilgrimage',
};

export const PRIORITY_LABELS: Record<string, string> = {
  hot: 'Hot',
  warm: 'Warm',
  cold: 'Cold',
};

function titleCase(value: string): string {
  const spaced = value.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function leadSourceLabel(source?: string | null): string {
  if (!source) return 'Not set';
  return LEAD_SOURCE_LABELS[source] ?? titleCase(source);
}

export function tripTypeLabel(type?: string | null): string {
  if (!type) return 'Not set';
  return TRIP_TYPE_LABELS[type] ?? titleCase(type);
}

export function priorityLabel(priority?: string | null): string {
  if (!priority) return 'Not set';
  return PRIORITY_LABELS[priority] ?? titleCase(priority);
}

/** "1 Adult", "2 Adults"; "1 Child", "3 Children"; "1 Infant", "2 Infants". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function passengerSummary(adults?: number | null, children?: number | null, infants?: number | null): string {
  const parts = [pluralize(adults ?? 0, 'Adult')];
  if ((children ?? 0) > 0) parts.push(pluralize(children ?? 0, 'Child', 'Children'));
  if ((infants ?? 0) > 0) parts.push(pluralize(infants ?? 0, 'Infant'));
  return parts.join(', ');
}
