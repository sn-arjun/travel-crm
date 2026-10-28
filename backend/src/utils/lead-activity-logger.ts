import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { leadActivities } from '../db/tenant-schema';
import { generateId } from './uuid';

export interface LeadActivityParams {
  leadId: string;
  type: string;          // note | call | email | whatsapp | sms | status_change | assignment | follow_up | etc.
  content?: string;
  metadata?: Record<string, unknown>;
  /** null for entries written by a public channel or an automation. */
  userId: string | null;
}

/**
 * Logs an activity to the lead_activities table.
 * Never throws — errors are silently logged to console.
 */
export async function logLeadActivity(
  db: DrizzleD1Database,
  params: LeadActivityParams
): Promise<void> {
  try {
    await db.insert(leadActivities).values({
      id: generateId(),
      leadId: params.leadId,
      type: params.type,
      content: params.content ?? null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      createdBy: params.userId,
    });
  } catch (err) {
    console.error('Failed to log lead activity:', err);
  }
}
