import type { Env } from '../types';

export interface CampaignJob {
  campaignId: string;
  tenantId: string;
  campaignType: 'whatsapp' | 'sms' | 'email';
}

/**
 * Process marketing campaign queue messages.
 * Fetches pending recipients and sends messages via appropriate channel.
 */
export async function handleCampaignQueue(
  batch: MessageBatch<{ type: string; data: CampaignJob }>,
  env: Env
): Promise<void> {
  for (const msg of batch.messages) {
    try {
      const { data } = msg.body;
      await processCampaignBatch(data, env);
      msg.ack();
    } catch (err) {
      console.error('Campaign queue job failed:', err);
      msg.retry();
    }
  }
}

async function processCampaignBatch(job: CampaignJob, env: Env): Promise<void> {
  const { campaignId, tenantId, campaignType } = job;

  // Get tenant DB
  const dbBinding = env[`TENANT_DB_${tenantId}` as keyof Env] as D1Database | undefined;
  if (!dbBinding) {
    console.error(`No DB binding for tenant: ${tenantId}`);
    return;
  }

  // Get campaign details
  const campaign = await dbBinding
    .prepare('SELECT * FROM marketing_campaigns WHERE id = ?')
    .bind(campaignId)
    .first();

  if (!campaign || (campaign as any).status === 'cancelled') {
    return;
  }

  // Get pending recipients in batches
  const batchSize = 50;
  const pendingRecipients = await dbBinding
    .prepare(
      `SELECT * FROM campaign_recipients WHERE campaign_id = ? AND status = 'pending' LIMIT ?`
    )
    .bind(campaignId, batchSize)
    .all();

  const recipients = pendingRecipients.results || [];

  if (recipients.length === 0) {
    // All recipients processed — mark campaign as sent
    await dbBinding
      .prepare('UPDATE marketing_campaigns SET status = ?, updated_at = ? WHERE id = ?')
      .bind('sent', new Date().toISOString(), campaignId)
      .run();
    return;
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of recipients) {
    const recipientId = (recipient as any).id;
    const now = new Date().toISOString();

    try {
      // Mark as queued
      await dbBinding
        .prepare('UPDATE campaign_recipients SET status = ? WHERE id = ?')
        .bind('queued', recipientId)
        .run();

      // Send based on campaign type
      switch (campaignType) {
        case 'whatsapp': {
          const phone = (recipient as any).phone;
          if (!phone) throw new Error('No phone number');
          await sendWhatsApp(env, phone, (campaign as any).message_body || '');
          break;
        }
        case 'sms': {
          const phone = (recipient as any).phone;
          if (!phone) throw new Error('No phone number');
          await sendSms(env, phone, (campaign as any).message_body || '');
          break;
        }
        case 'email': {
          const email = (recipient as any).email;
          if (!email) throw new Error('No email');
          await sendEmail(
            env,
            email,
            (campaign as any).email_subject || 'Campaign',
            (campaign as any).message_body || ''
          );
          break;
        }
      }

      // Mark as sent
      await dbBinding
        .prepare('UPDATE campaign_recipients SET status = ?, sent_at = ? WHERE id = ?')
        .bind('sent', now, recipientId)
        .run();
      sentCount++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      await dbBinding
        .prepare('UPDATE campaign_recipients SET status = ?, error_message = ? WHERE id = ?')
        .bind('failed', errMsg, recipientId)
        .run();
      failedCount++;
    }
  }

  // Update campaign counters
  await dbBinding
    .prepare(
      `UPDATE marketing_campaigns SET
        sent_count = sent_count + ?,
        failed_count = failed_count + ?,
        updated_at = ?
      WHERE id = ?`
    )
    .bind(sentCount, failedCount, new Date().toISOString(), campaignId)
    .run();

  // If there are more pending recipients, re-enqueue
  const remaining = await dbBinding
    .prepare(
      `SELECT COUNT(*) as count FROM campaign_recipients WHERE campaign_id = ? AND status = 'pending'`
    )
    .bind(campaignId)
    .first();

  if (Number((remaining as any)?.count || 0) > 0) {
    await env.CAMPAIGN_QUEUE.send({
      type: `${campaignType}_campaign`,
      data: job,
    });
  } else {
    // All done — mark campaign as sent
    await dbBinding
      .prepare('UPDATE marketing_campaigns SET status = ?, updated_at = ? WHERE id = ?')
      .bind('sent', new Date().toISOString(), campaignId)
      .run();
  }
}

// ============================================================
// Channel send helpers
// ============================================================

async function sendWhatsApp(env: Env, to: string, body: string): Promise<void> {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const from = env.TWILIO_WHATSAPP_FROM_NUMBER;

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      },
      body: new URLSearchParams({
        From: `whatsapp:${from}`,
        To: `whatsapp:${to}`,
        Body: body,
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`WhatsApp send failed: ${errText}`);
  }
}

async function sendSms(env: Env, to: string, body: string): Promise<void> {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const from = env.TWILIO_SMS_FROM_NUMBER;

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      },
      body: new URLSearchParams({
        From: from,
        To: to,
        Body: body,
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`SMS send failed: ${errText}`);
  }
}

async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  htmlBody: string
): Promise<void> {
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: 'noreply@travelcrm.pro' },
      subject,
      content: [{ type: 'text/html', value: htmlBody }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Email send failed: ${errText}`);
  }
}
