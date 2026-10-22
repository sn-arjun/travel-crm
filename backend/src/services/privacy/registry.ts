/**
 * R208: the list of tenant tables that can hold data about one contact, and how to find the rows.
 *
 * `where` is a SQL condition; every `?` in it is bound to the contact id. Export reads these rows and erasure
 * (erase-contact.ts) walks the same scopes. A test (gdpr.test.ts) reads the live database and fails if a table with a
 * contact_id, lead_id, traveller_id, invoice_id, call_log_id or entity_id column is missing here, so a new table cannot
 * silently escape export and erasure: add it to PRIVACY_TABLES, or to PRIVACY_NOT_PERSONAL with the reason.
 */

/** Row id sets of everything that belongs to the contact. Each has the number of `?` it needs. */
export const LEADS = `(SELECT id FROM leads WHERE contact_id = ?)`;
export const TRAVELLERS = `(SELECT id FROM travellers WHERE contact_id = ?)`;
export const INVOICES = `(SELECT id FROM invoices WHERE contact_id = ? OR lead_id IN ${LEADS})`;
export const ITINERARIES = `(SELECT id FROM itineraries WHERE lead_id IN ${LEADS})`;
export const ITINERARY_DAYS = `(SELECT id FROM itinerary_days WHERE itinerary_id IN ${ITINERARIES})`;
export const VISAS = `(SELECT id FROM visa_applications WHERE traveller_id IN ${TRAVELLERS} OR lead_id IN ${LEADS})`;
export const MESSAGES = `(SELECT id FROM message_log WHERE contact_id = ? OR lead_id IN ${LEADS})`;
export const CALLS = `(SELECT id FROM call_logs WHERE contact_id = ? OR lead_id IN ${LEADS})`;
/** Trips booked for the contact or its leads. Erasure rewrites these rows whole, so it uses this set and never the wider TRIPS. */
export const OWN_TRIPS = `(SELECT id FROM trip_assignments WHERE contact_id = ? OR lead_id IN ${LEADS})`;
/** Seat bookings of the contact (group departures, R139) and the passengers on them or recorded as the contact's travellers. */
export const SEAT_BOOKINGS = `(SELECT id FROM seat_bookings WHERE contact_id = ? OR lead_id IN ${LEADS})`;
export const SEAT_PASSENGERS = `(SELECT id FROM seat_passengers WHERE seat_booking_id IN ${SEAT_BOOKINGS} OR traveller_id IN ${TRAVELLERS})`;
/** Trips of the contact (OWN_TRIPS) and the coach trips the contact rides on as a passenger (R145). Used for export; the other passengers of such a trip are not the contact's data. */
export const TRIPS = `(SELECT id FROM trip_assignments WHERE id IN ${OWN_TRIPS} OR id IN (SELECT trip_id FROM trip_passengers WHERE contact_id = ? OR seat_passenger_id IN ${SEAT_PASSENGERS}))`;
export const VOUCHERS =`(SELECT id FROM vouchers WHERE lead_id IN ${LEADS})`;
/** The contact, its leads and its travellers: what an `entity_id` column can point at. */
export const ENTITY_IDS = `(SELECT ? UNION SELECT id FROM leads WHERE contact_id = ? UNION SELECT id FROM travellers WHERE contact_id = ?)`;

export interface PrivacyTable {
  /** Key in the export file. */
  key: string;
  table: string;
  where: string;
  /** Columns left out of the export (agency-internal pricing), not out of erasure. */
  omit?: string[];
  /** Columns holding R2 object keys (or /files/ URLs) of this tenant: listed in the export, deleted on erasure. */
  fileColumns?: string[];
}

export const PRIVACY_TABLES: PrivacyTable[] = [
  { key: 'contact', table: 'contacts', where: 'id = ?' },
  { key: 'consents', table: 'contact_consents', where: 'contact_id = ?' },
  { key: 'customFieldValues', table: 'contact_custom_field_values', where: 'contact_id = ?' },
  { key: 'sharedWith', table: 'shared_contacts', where: 'contact_id = ?' },
  { key: 'leads', table: 'leads', where: 'contact_id = ?' },
  { key: 'leadActivities', table: 'lead_activities', where: `lead_id IN ${LEADS}` },
  { key: 'followUps', table: 'follow_ups', where: `lead_id IN ${LEADS}` },
  { key: 'aiLeadScores', table: 'ai_lead_scores', where: `lead_id IN ${LEADS}` },
  { key: 'tasks', table: 'tasks', where: `related_lead_id IN ${LEADS}` },
  { key: 'calendarEvents', table: 'events', where: `related_lead_id IN ${LEADS}` },
  { key: 'itineraries', table: 'itineraries', where: `lead_id IN ${LEADS}`, omit: ['total_cost', 'markup_type', 'markup_value'] },
  { key: 'itineraryDays', table: 'itinerary_days', where: `itinerary_id IN ${ITINERARIES}` },
  {
    key: 'itineraryItems',
    table: 'itinerary_items',
    where: `day_id IN ${ITINERARY_DAYS}`,
    omit: ['cost_price', 'markup_type', 'markup_value', 'internal_notes'],
  },
  { key: 'vouchers', table: 'vouchers', where: `lead_id IN ${LEADS}`, fileColumns: ['pdf_r2_key'] },
  { key: 'invoices', table: 'invoices', where: `contact_id = ? OR lead_id IN ${LEADS}` },
  { key: 'invoiceItems', table: 'invoice_items', where: `invoice_id IN ${INVOICES}` },
  { key: 'payments', table: 'payments', where: `contact_id = ? OR invoice_id IN ${INVOICES}`, fileColumns: ['receipt_url'] },
  { key: 'travellers', table: 'travellers', where: 'contact_id = ?', fileColumns: ['profile_photo_url'] },
  { key: 'travellerDocuments', table: 'traveller_documents', where: `traveller_id IN ${TRAVELLERS}`, fileColumns: ['file_url'] },
  { key: 'visaApplications', table: 'visa_applications', where: `id IN ${VISAS}` },
  { key: 'visaChecklistItems', table: 'visa_checklist_items', where: `visa_application_id IN ${VISAS}`, fileColumns: ['document_url'] },
  { key: 'visaDocuments', table: 'visa_documents', where: `visa_application_id IN ${VISAS}`, fileColumns: ['file_url'] },
  { key: 'visaNotes', table: 'visa_notes', where: `visa_application_id IN ${VISAS}` },
  { key: 'messages', table: 'message_log', where: `id IN ${MESSAGES}`, fileColumns: ['media_url'] },
  { key: 'messageAnalysis', table: 'assistant_message_analysis', where: `message_id IN ${MESSAGES}` },
  { key: 'emailLog', table: 'email_message_log', where: 'contact_id = ?' },
  { key: 'unsubscribes', table: 'unsubscribes', where: 'contact_id = ?' },
  { key: 'campaignRecipients', table: 'campaign_recipients', where: 'contact_id = ?' },
  { key: 'whatsappCampaignRecipients', table: 'whatsapp_campaign_recipients', where: 'contact_id = ?' },
  { key: 'chatbotConversations', table: 'chatbot_conversations', where: `contact_id = ? OR lead_id IN ${LEADS}` },
  { key: 'aiFollowUpSuggestions', table: 'ai_followup_suggestions', where: `contact_id = ? OR lead_id IN ${LEADS}` },
  { key: 'aiCustomerSegments', table: 'ai_customer_segments', where: 'contact_id = ?' },
  { key: 'assistantSuggestions', table: 'assistant_suggestions', where: `contact_id = ? OR lead_id IN ${LEADS}` },
  { key: 'callLogs', table: 'call_logs', where: `id IN ${CALLS}`, fileColumns: ['recording_r2_key', 'recording_url'] },
  { key: 'callTranscripts', table: 'call_transcripts', where: `call_log_id IN ${CALLS}` },
  { key: 'aiCallExtractions', table: 'ai_call_extractions', where: `call_log_id IN ${CALLS} OR created_contact_id = ?` },
  { key: 'seatBookings', table: 'seat_bookings', where: `contact_id = ? OR lead_id IN ${LEADS}` },
  { key: 'seatPassengers', table: 'seat_passengers', where: `seat_booking_id IN ${SEAT_BOOKINGS} OR traveller_id IN ${TRAVELLERS}` },
  { key: 'passengerExtras', table: 'passenger_extras', where: `seat_passenger_id IN ${SEAT_PASSENGERS}` },
  { key: 'departureMessageSends', table: 'departure_message_sends', where: 'contact_id = ?' },
  { key: 'tripPassengers', table: 'trip_passengers', where: `contact_id = ? OR trip_id IN ${OWN_TRIPS} OR seat_passenger_id IN ${SEAT_PASSENGERS}` },
  { key: 'tripAssignments', table: 'trip_assignments', where: `id IN ${TRIPS}` },
  { key: 'tripTimeline', table: 'trip_timeline', where: `trip_id IN ${TRIPS}` },
  { key: 'tripCosts', table: 'trip_costs', where: `trip_id IN ${TRIPS}`, fileColumns: ['receipt_url'] },
  { key: 'driverRatings', table: 'driver_ratings', where: `trip_id IN ${TRIPS}` },
  {
    key: 'documents',
    table: 'documents',
    where: `(related_to IN ('contact', 'customer') AND related_id = ?) OR (related_to = 'lead' AND related_id IN ${LEADS}) OR (related_to = 'traveller' AND related_id IN ${TRAVELLERS}) OR (related_to = 'itinerary' AND related_id IN ${ITINERARIES})`,
    fileColumns: ['file_url'],
  },
  { key: 'activityLog', table: 'activity_logs', where: `entity_id IN ${ENTITY_IDS}` },
  { key: 'notifications', table: 'notifications', where: `reference_id IN ${ENTITY_IDS}` },
  { key: 'aiGeneratedContent', table: 'ai_generated_content', where: `entity_id IN ${ENTITY_IDS}` },
  { key: 'aiInsights', table: 'ai_insights', where: `entity_id IN ${ENTITY_IDS}` },
  { key: 'aiRecommendations', table: 'ai_recommendations', where: `entity_id IN ${ENTITY_IDS}` },
  { key: 'aiDocumentScans', table: 'ai_document_scans', where: `entity_id IN ${ENTITY_IDS}`, fileColumns: ['image_url'] },
  { key: 'aiConversations', table: 'ai_conversations', where: `entity_id IN ${ENTITY_IDS}` },
  { key: 'domainEvents', table: 'domain_events', where: `entity_id IN ${ENTITY_IDS}` },
  { key: 'automationRuns', table: 'automation_runs', where: `entity_id IN ${ENTITY_IDS}` },
  { key: 'reminderLog', table: 'reminder_log', where: `entity_id IN ${ENTITY_IDS}` },
  { key: 'expiryAlerts', table: 'expiry_alerts_log', where: `entity_id IN ${ENTITY_IDS}` },
  { key: 'bookmarks', table: 'bookmarks', where: `entity_id IN ${ENTITY_IDS}` },
];

/** Tables with a link-looking column that hold nothing about one contact, and why. The completeness test accepts these. */
export const PRIVACY_NOT_PERSONAL: Record<string, string> = {
  ai_usage_log: 'token and cost counters; call_log_id only joins to a call log',
  contact_segments: 'segment definitions (filters), no contact rows',
  driver_otp_log: 'driver (staff) login codes',
  quotation_links: 'master table; erasure sets is_active = 0 for the contact itineraries (erase-contact.ts step 2)',
  public_links: 'master table (R148): a random token to a departure booking page (not personal) or to a booking or passenger self-service page; erasure sets is_active = 0 for the contact seat bookings and passengers (erase-contact.ts step 2)',
  addon_orders: 'master table (R206): an agency buying add-ons from the platform; invoice_id is the platform invoice, not a customer invoice',
  tours: 'product data: tour definitions, no people (R139)',
  tour_stops: 'product data: default stops of a tour, no people (R139)',
  tour_prices: 'product data: prices, no people (R139)',
  tour_extras: 'product data: optional extras catalogue, no people (R139)',
  departures: 'product data: dated runs of a tour; staff ids only (tour leader, creator) (R139)',
  departure_vehicles: 'product data: coaches on a departure; driver ids are staff (R139)',
  departure_stops: 'product data: stop names and times, no people (R139)',
  trip_stops: 'stop names and times of a coach trip, no people (R145)',
  departure_costs: 'agency cost lines of a departure; supplier and staff ids only (R139)',
  departure_message_rules: 'agency message rules; templates and timing, no people (R139)',
  import_errors: 'handled by the import-row scrub in erase-contact.ts (row_data text match)',
};

/** Number of `?` in a where clause = how many times the contact id is bound. */
export function bindCount(where: string): number {
  return (where.match(/\?/g) ?? []).length;
}

export function bindsFor(where: string, contactId: string): string[] {
  return Array.from({ length: bindCount(where) }, () => contactId);
}
