import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import type { AppContext } from '../types';
import { messageLog } from '../db/tenant-schema';
import { applyEmailEvent, providerMessageIds, type ProviderEvent } from '../services/mail/delivery-events';
import { applyPlatformEmailEvent } from '../services/mail/platform-log';
import { error, success } from '../utils/response';
import { candidateTenantDbs } from '../services/tenant-db';
import { formParams, publicRequestUrl, unsignedAllowed, verifySendgrid, verifyTwilio } from '../middleware/provider-signature';

const webhookRoutes = new Hono<AppContext>();

// ============================================================
// POST /twilio/status — Twilio Message Status Callback
// ============================================================

webhookRoutes.post('/twilio/status', async (c) => {
  // Public endpoint: Twilio sends status updates here, so it must be genuinely signed (platform token;
  // messages are sent from the platform account). Test mode accepts a callback with no signature only.
  const signature = c.req.header('X-Twilio-Signature');
  if (!unsignedAllowed(c.env, signature)) {
    const params = await formParams(c);
    const token = c.env.TWILIO_AUTH_TOKEN;
    if (!signature || !token || !(await verifyTwilio(publicRequestUrl(c), params, token, signature))) {
      return error(c, 'Invalid webhook signature', 403);
    }
  }

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
  // Public endpoint: SendGrid's Signed Event Webhook (ECDSA over timestamp + raw body). Without
  // SENDGRID_WEBHOOK_PUBLIC_KEY nothing is accepted, except in test mode.
  const rawBody = await c.req.text();
  const signature = c.req.header('X-Twilio-Email-Event-Webhook-Signature');
  const timestamp = c.req.header('X-Twilio-Email-Event-Webhook-Timestamp');
  const publicKey = c.env.SENDGRID_WEBHOOK_PUBLIC_KEY;
  if (!publicKey) {
    if (!unsignedAllowed(c.env, signature)) return error(c, 'SendGrid webhook is not configured', 403);
    console.warn('[SENDGRID WEBHOOK] SENDGRID_WEBHOOK_PUBLIC_KEY is not set; accepting an unsigned event in test mode');
  } else if (!(unsignedAllowed(c.env, signature) || (await verifySendgrid(publicKey, signature, timestamp, rawBody)))) {
    return error(c, 'Invalid webhook signature', 403);
  }

  try {
    let body: unknown;
    try { body = JSON.parse(rawBody); } catch { return error(c, 'Expected array of events', 400); }

    if (!Array.isArray(body)) {
      return error(c, 'Expected array of events', 400);
    }

    const tenantDbs = await candidateTenantDbs(c.env, c.req.query('tenant'));
    let processedCount = 0;

    for (const event of body as ProviderEvent[]) {
      try {
        const ids = providerMessageIds(event);
        if (ids.length === 0 || !event.email) continue;

        // The workspace that sent the message is the one whose rows hold its provider message id (R128).
        let matched = false;
        for (const tenantDb of tenantDbs) {
          if (await applyEmailEvent(tenantDb, event, ids)) {
            processedCount++;
            matched = true;
            break;
          }
        }
        // R132: not an agency's message -> it may be the platform's own mail (platform_email_log, matched by message id).
        if (!matched && (await applyPlatformEmailEvent(c.env, event, ids))) processedCount++;
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
