import type { Suggestion } from '@/lib/api/assistant';

/** The screen where a suggestion is shown with its full context. */
export function suggestionHref(s: Pick<Suggestion, 'entityType' | 'entityId' | 'leadId' | 'contactId'>): string {
  switch (s.entityType) {
    case 'lead':
      return `/leads/${s.entityId}`;
    case 'invoice':
      return `/invoices/${s.entityId}`;
    case 'itinerary':
      return `/itineraries/${s.entityId}`;
    case 'trip':
      return `/fleet/trips/${s.entityId}`;
    case 'contact':
      return `/communication/${s.entityId}`;
    default:
      if (s.leadId) return `/leads/${s.leadId}`;
      if (s.contactId) return `/communication/${s.contactId}`;
      return '/communication';
  }
}
