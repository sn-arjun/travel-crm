import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';
import { contacts, leads } from '../db/tenant-schema';

/**
 * Substitute variables in a template string.
 * Replaces {variable_name} with corresponding values from data.
 * Missing variables are replaced with empty strings.
 */
export function substituteVariables(template: string, data: Record<string, string | null | undefined>): string {
  return template.replace(/{(\w+)}/g, (match, variable) => {
    return data[variable] ?? '';
  });
}

/**
 * Resolve all variables for a contact and optional lead.
 * Returns an object with all available variables for templating.
 */
export async function resolveVariables(
  db: D1Database,
  contactId: string,
  leadId?: string,
  tenantSettings?: Record<string, string>,
  /** Self-service addresses of a booking (R150): the staff screen supplies them, the templates use {details_link} and {extras_link}. */
  selfService?: { details_link?: string | null; extras_link?: string | null },
): Promise<Record<string, string | null>> {
  const drizzleDb = drizzle(db);

  const variables: Record<string, string | null> = {
    customer_name: null,
    first_name: null,
    destination: null,
    travel_date: null,
    return_date: null,
    pax_count: null,
    amount: null,
    invoice_number: null,
    agent_name: null,
    company_name: null,
    company_phone: null,
    details_link: selfService?.details_link ?? null,
    extras_link: selfService?.extras_link ?? null,
  };

  try {
    // Fetch contact details
    const contact = await drizzleDb
      .select()
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1)
      .then(rows => rows[0]);

    if (contact) {
      variables.customer_name = contact.name;
      // Try to extract first name (first word)
      variables.first_name = contact.name.split(' ')[0];
      variables.company_phone = contact.phone;
    }

    // Fetch lead details if provided
    if (leadId) {
      const lead = await drizzleDb
        .select()
        .from(leads)
        .where(eq(leads.id, leadId))
        .limit(1)
        .then(rows => rows[0]);

      if (lead) {
        variables.destination = lead.destination;
        variables.travel_date = lead.travelDate;
        variables.return_date = lead.returnDate;
        const totalPax = (lead.paxAdults || 0) + (lead.paxChildren || 0) + (lead.paxInfants || 0);
        variables.pax_count = totalPax > 0 ? totalPax.toString() : null;
        variables.amount = lead.budget ? lead.budget.toString() : null;
      }
    }

    // Tenant settings (company name, etc.)
    if (tenantSettings) {
      variables.company_name = tenantSettings.company_name || null;
      variables.agent_name = tenantSettings.agent_name || null;
    }
  } catch (err) {
    console.error('Error resolving variables:', err);
    // Continue with null values for any failed lookups
  }

  return variables;
}
