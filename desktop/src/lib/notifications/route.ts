/**
 * Where a notification should take the user.
 *
 * The notifications table stores what the notification is about as
 * reference_type / reference_id. The API may return either camelCase or
 * snake_case until the backend normalises it, so both are read.
 */

export interface NotificationLike {
  actionUrl?: string | null;
  action_url?: string | null;
  referenceType?: string | null;
  reference_type?: string | null;
  referenceId?: string | null;
  reference_id?: string | null;
}

const NOTIFICATIONS_ROUTE = '/notifications';

const DETAIL_ROUTES: Record<string, (id: string) => string> = {
  lead: (id) => `/leads/${id}`,
  contact: (id) => `/contacts/${id}`,
  invoice: (id) => `/invoices/${id}`,
  payment: (id) => `/payments/${id}`,
  task: (id) => `/tasks/${id}`,
  itinerary: (id) => `/itineraries/${id}`,
  trip: (id) => `/fleet/trips/${id}`,
};

/** Maps a reference (type + id) to an app route; unknown references fall back to the notifications page. */
export function routeForReference(
  type: string | null | undefined,
  id: string | null | undefined,
): string {
  const key = (type ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (key === 'follow_up' || key === 'followup') return '/follow-ups';
  const build = DETAIL_ROUTES[key];
  if (build && id) return build(encodeURIComponent(id));
  return NOTIFICATIONS_ROUTE;
}

/** The route a click on this notification should open. */
export function routeForNotification(n: NotificationLike): string {
  const actionUrl = n.actionUrl ?? n.action_url;
  if (actionUrl) return actionUrl;
  return routeForReference(n.referenceType ?? n.reference_type, n.referenceId ?? n.reference_id);
}
