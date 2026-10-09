import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import type { AppContext } from '../types';
import { messageLog, emailMessageLog, contacts } from '../db/tenant-schema';
import { error, success } from '../utils/response';
import { candidateTenantDbs } from '../services/tenant-db';

const webhookRoutes = new Hono<AppContext>();

// ============================================================
// POST /twilio/status — Twilio Message Status Callback
// ============================================================

webhookRoutes.post('/twilio/status', async (c) => {
  // This endpoint is public (no auth required)
  // Twilio sends status updates here

  try {
    // Get form data from Twilio
    const body = await c.req.parseBody();
    const messageSid = body.MessageSid as string;
    const messageStatus = body.MessageStatus as string;
    const errorCode = body.ErrorCode as string | undefined;

    if (!messageSid || !messageStatus) {
      return error(c, 'Missing required parameters', 400);
    }

    // Try to update message log
    // Note: We need the tenantDb context, but this is a public webhook
    // In a real implementation, you'd store tenant ID in Redis or lookup via SID
    // For now, we'll attempt to find and update across the request

    // A public callback has no session: the receipt names the message, so the workspace is found from it
    // (or from ?tenant=<id> when the status callback URL carries one).
    for (const tenantDb of await candidateTenantDbs(c.env, c.req.query('tenant'))) {
      const db = drizzle(tenantDb);

      // Find message by external_id (Twilio SID)
      const message = await db
        .select()
        .from(messageLog)
        .where(eq(messageLog.externalId, messageSid))
        .limit(1)
        .then(rows => rows[0]);

      if (message) {
        // Map Twilio status to our status
        const mappedStatus = mapTwilioStatus(messageStatus);
        const now = new Date().toISOString();

        const updateData: Record<string, any> = {
          status: mappedStatus,
        };

        // Update timestamps based on status
        if (mappedStatus === 'sent') {
          updateData.sentAt = now;
        } else if (mappedStatus === 'delivered') {
          updateData.deliveredAt = now;
        } else if (mappedStatus === 'read') {
          updateData.readAt = now;
        } else if (mappedStatus === 'failed') {
          updateData.errorMessage = errorCode || 'Unknown error';
        }

        await db
          .update(messageLog)
          .set(updateData)
          .where(eq(messageLog.id, message.id));
        break;
      }
    }

    // Always return 200 to Twilio to confirm receipt
    return success(c, { acknowledged: true });
  } catch (err) {
    console.error('Error processing Twilio webhook:', err);
    // Still return 200 to Twilio to prevent retries
    return success(c, { acknowledged: true });
  }
});

// ============================================================
// POST /sendgrid/events — SendGrid Event Webhook
// ============================================================

webhookRoutes.post('/sendgrid/events', async (c) => {
  // This endpoint is public (no auth required)
  // SendGrid sends event notifications here

  try {
    const body = await c.req.json();

    if (!Array.isArray(body)) {
      return error(c, 'Expected array of events', 400);
    }

    const tenantDbs = await candidateTenantDbs(c.env, c.req.query('tenant'));
    let processedCount = 0;

    for (const event of body) {
      try {
        const eventType = event.event as string;
        const messageId = event.message_id as string;
        const email = event.email as string;

        if (!messageId || !email) {
          continue;
        }

        // Find the email message log by message ID, in whichever workspace sent it
        let db: ReturnType<typeof drizzle> | null = null;
        let message: typeof emailMessageLog.$inferSelect | undefined;
        for (const tenantDb of tenantDbs) {
          const candidate = drizzle(tenantDb);
          message = await candidate
            .select()
            .from(emailMessageLog)
            .where(eq(emailMessageLog.messageId, messageId))
            .get();
          if (message) {
            db = candidate;
            break;
          }
        }

        if (!message || !db) {
          continue;
        }

        const now = new Date().toISOString();
        const updateData: Record<string, any> = {};

        switch (eventType) {
          case 'processed':
            updateData.status = 'sent';
            break;

          case 'delivered':
            updateData.status = 'delivered';
            break;

          case 'open':
            updateData.status = 'opened';
            updateData.openedAt = now;
            break;

          case 'click':
            updateData.status = 'clicked';
            updateData.clickedAt = now;
            break;

          case 'bounce':
            updateData.status = 'bounced';
            updateData.bounceReason = event.reason || 'Unknown';
            // Mark contact email as invalid for hard bounces
            if (event.type === 'permanent') {
              await db
                .update(contacts)
                .set({ email: null, updatedAt: now })
                .where(eq(contacts.id, message.contactId))
                .run();
            }
            break;

          case 'dropped':
            updateData.status = 'dropped';
            updateData.failureReason = event.reason || 'Unknown';
            break;

          case 'spam_report':
            updateData.status = 'spam_report';
            break;

          case 'unsubscribe':
            updateData.status = 'unsubscribed';
            break;

          default:
            continue;
        }

        if (Object.keys(updateData).length > 0) {
          updateData.updatedAt = now;
          await db
            .update(emailMessageLog)
            .set(updateData)
            .where(eq(emailMessageLog.id, message.id))
            .run();

          processedCount++;
        }
      } catch (eventErr: any) {
        console.error('[SENDGRID WEBHOOK] Error processing event:', eventErr.message);
        // Continue processing other events
        continue;
      }
    }

    console.log(`[SENDGRID WEBHOOK] Processed ${processedCount} events`);
    return success(c, { acknowledged: true, processed: processedCount });
  } catch (err: any) {
    console.error('[SENDGRID WEBHOOK] Error:', err.message);
    // Always return 200 to SendGrid to prevent retries
    return success(c, { acknowledged: true });
  }
});

// ============================================================
// Helper: Map Twilio status to our status
// ============================================================

function mapTwilioStatus(twilioStatus: string): string {
  const statusMap: Record<string, string> = {
    queued: 'queued',
    sending: 'sent',
    sent: 'sent',
    received: 'delivered',
    delivered: 'delivered',
    read: 'read',
    failed: 'failed',
    undelivered: 'failed',
    cancelled: 'failed',
  };

  return statusMap[twilioStatus.toLowerCase()] || 'queued';
}

export default webhookRoutes;
