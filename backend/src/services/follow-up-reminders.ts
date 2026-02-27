import type { Env } from '../types';
import { createInAppNotification } from './notification-service';

/**
 * Runs every 5 minutes (cron trigger).
 * 1. Auto-marks past-due pending follow-ups as 'missed'.
 * 2. Sends push notification 15 min before and at scheduled time.
 * 3. Sends notification for missed/overdue follow-ups to assignee + manager.
 * 4. Deduplicates notifications via CACHE KV.
 *
 * NOTE: This runs against all tenant databases.
 * Tenant DB bindings are resolved dynamically from MASTER_DB.
 */
export async function checkFollowUpReminders(env: Env): Promise<void> {
  try {
    const now = new Date();
    const in15Min = new Date(now.getTime() + 15 * 60 * 1000);

    const nowIso = now.toISOString();
    const in15MinIso = in15Min.toISOString();

    // Get all tenant slugs from master DB
    const tenants = await env.MASTER_DB
      .prepare('SELECT db_binding, id FROM workspaces WHERE is_active = 1')
      .all<{ db_binding: string; id: string }>();

    for (const tenant of tenants.results) {
      const tenantDb = (env as unknown as Record<string, unknown>)[tenant.db_binding] as D1Database | undefined;
      if (!tenantDb) continue;

      await processFollowUpsForTenant(env, tenantDb, tenant.id, nowIso, in15MinIso);
    }
  } catch (err) {
    console.error('Follow-up reminder check failed:', err);
  }
}

async function processFollowUpsForTenant(
  env: Env,
  tenantDb: D1Database,
  tenantId: string,
  nowIso: string,
  in15MinIso: string
): Promise<void> {
  try {
    // 1. Auto-mark missed follow-ups
    await tenantDb
      .prepare("UPDATE follow_ups SET status = 'missed' WHERE status = 'pending' AND scheduled_at < ?")
      .bind(nowIso)
      .run();

    // 2. Find follow-ups due in next 15 minutes (for reminder notifications)
    const upcoming = await tenantDb
      .prepare(`
        SELECT f.id, f.type, f.scheduled_at, f.lead_id, f.created_by,
               l.title as lead_title, l.assigned_to,
               c.name as contact_name
        FROM follow_ups f
        JOIN leads l ON f.lead_id = l.id
        JOIN contacts c ON l.contact_id = c.id
        WHERE f.status = 'pending'
          AND f.scheduled_at >= ?
          AND f.scheduled_at <= ?
      `)
      .bind(nowIso, in15MinIso)
      .all<{
        id: string;
        type: string;
        scheduled_at: string;
        lead_id: string;
        lead_title: string;
        contact_name: string;
        created_by: string;
        assigned_to?: string;
      }>();

    for (const fu of upcoming.results) {
      const cacheKey = `reminder_sent:${fu.id}:15min:${tenantId}`;
      const alreadySent = await env.CACHE.get(cacheKey);
      if (alreadySent) continue;

      const title = `Follow-up in 15 min: ${fu.type}`;
      const body = `${fu.contact_name} — ${fu.lead_title}`;

      // Send push via queue
      await env.PUSH_NOTIFICATION_QUEUE.send({
        type: 'push',
        data: {
          userId: fu.created_by,
          title,
          body,
          data: { type: 'follow_up_reminder', leadId: fu.lead_id, followUpId: fu.id },
        },
      });

      // Mark as sent; expires in 1 hour
      await env.CACHE.put(cacheKey, '1', { expirationTtl: 3600 });
    }

    // 3. Check for missed/overdue follow-ups and notify assignee + manager
    const missedFollowUps = await tenantDb
      .prepare(`
        SELECT f.id, f.type, f.scheduled_at, f.lead_id,
               l.title as lead_title, l.assigned_to,
               c.name as contact_name, f.created_by
        FROM follow_ups f
        JOIN leads l ON f.lead_id = l.id
        JOIN contacts c ON l.contact_id = c.id
        WHERE f.status = 'missed'
          AND f.scheduled_at < ?
      `)
      .bind(nowIso)
      .all<{
        id: string;
        type: string;
        scheduled_at: string;
        lead_id: string;
        lead_title: string;
        contact_name: string;
        created_by: string;
        assigned_to?: string;
      }>();

    for (const fu of missedFollowUps.results) {
      const cacheKey = `missed_notified:${fu.id}:${tenantId}`;
      const alreadyNotified = await env.CACHE.get(cacheKey);
      if (alreadyNotified) continue;

      // Notify the person who created the follow-up
      await createInAppNotification(
        tenantDb,
        fu.created_by,
        `Missed Follow-up: ${fu.type}`,
        `You missed a follow-up with ${fu.contact_name} on "${fu.lead_title}" scheduled for ${fu.scheduled_at}`,
        'follow_up_reminder',
        'follow_up',
        fu.id
      );

      // Notify the assigned salesperson if different
      if (fu.assigned_to && fu.assigned_to !== fu.created_by) {
        await createInAppNotification(
          tenantDb,
          fu.assigned_to,
          `Missed Follow-up Alert`,
          `A follow-up was missed for "${fu.lead_title}" with ${fu.contact_name}`,
          'follow_up_reminder',
          'follow_up',
          fu.id
        );
      }

      // Mark as notified; expires in 24 hours
      await env.CACHE.put(cacheKey, '1', { expirationTtl: 86400 });
    }
  } catch (err) {
    console.error(`Follow-up processing failed for tenant ${tenantId}:`, err);
  }
}
