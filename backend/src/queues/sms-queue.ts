import type { Env } from '../types';

export interface SmsJob {
  to: string; // E.164 format: +919876543210
  body: string;
  templateId?: string;
  templateData?: Record<string, string>;
}

/**
 * Process SMS sending jobs via Twilio.
 * Stub implementation — will be completed in Milestone 8.
 */
export async function handleSmsJob(job: SmsJob, env: Env): Promise<void> {
  console.log(`[SMS QUEUE] Sending SMS to ${job.to}: ${job.body.substring(0, 50)}...`);

  // TODO (Milestone 8): Implement Twilio SMS API call
  // const response = await fetch(
  //   `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
  //   {
  //     method: 'POST',
  //     headers: {
  //       'Authorization': `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
  //       'Content-Type': 'application/x-www-form-urlencoded',
  //     },
  //     body: new URLSearchParams({
  //       To: job.to,
  //       From: '+1XXXXXXXXXX',
  //       Body: job.body,
  //     }),
  //   }
  // );

  console.log(`[SMS QUEUE] SMS job processed (stub)`);
}
