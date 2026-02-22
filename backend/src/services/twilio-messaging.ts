import type { Env } from '../types';

interface TwilioSendResult {
  success: boolean;
  sid?: string;
  error?: string;
}

/**
 * Send WhatsApp message via Twilio API.
 */
export async function sendWhatsApp(
  env: Env,
  to: string,
  message: string,
  mediaUrl?: string
): Promise<TwilioSendResult> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;

  const params = new URLSearchParams({
    To: `whatsapp:${to}`,
    From: `whatsapp:${env.TWILIO_WHATSAPP_FROM_NUMBER}`,
    Body: message,
  });

  if (mediaUrl) {
    params.append('MediaUrl', mediaUrl);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
    },
    body: params,
  });

  if (!response.ok) {
    const body = await response.json() as { message?: string };
    return { success: false, error: body.message || 'Failed to send WhatsApp message' };
  }

  const body = await response.json() as { sid?: string };
  return { success: true, sid: body.sid };
}

/**
 * Send WhatsApp template message via Twilio API.
 */
export async function sendWhatsAppTemplate(
  env: Env,
  to: string,
  templateSid: string,
  variables: Record<string, string>
): Promise<TwilioSendResult> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;

  const params = new URLSearchParams({
    To: `whatsapp:${to}`,
    From: `whatsapp:${env.TWILIO_WHATSAPP_FROM_NUMBER}`,
    ContentSid: templateSid,
  });

  // Add template variables (ContentVariables in Twilio API)
  Object.entries(variables).forEach(([key, value]) => {
    params.append(`ContentVariables.${key}`, value);
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
    },
    body: params,
  });

  if (!response.ok) {
    const body = await response.json() as { message?: string };
    return { success: false, error: body.message || 'Failed to send WhatsApp template' };
  }

  const body = await response.json() as { sid?: string };
  return { success: true, sid: body.sid };
}

/**
 * Send SMS via Twilio API.
 */
export async function sendSms(
  env: Env,
  to: string,
  message: string
): Promise<TwilioSendResult> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;

  const params = new URLSearchParams({
    To: to,
    From: env.TWILIO_SMS_FROM_NUMBER,
    Body: message,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
    },
    body: params,
  });

  if (!response.ok) {
    const body = await response.json() as { message?: string };
    return { success: false, error: body.message || 'Failed to send SMS' };
  }

  const body = await response.json() as { sid?: string };
  return { success: true, sid: body.sid };
}

/**
 * Send media message (image, document, etc.) via Twilio.
 */
export async function sendMediaMessage(
  env: Env,
  to: string,
  channel: 'whatsapp' | 'sms',
  mediaUrl: string,
  caption?: string
): Promise<TwilioSendResult> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;

  const toNumber = channel === 'whatsapp' ? `whatsapp:${to}` : to;
  const fromNumber = channel === 'whatsapp'
    ? `whatsapp:${env.TWILIO_WHATSAPP_FROM_NUMBER}`
    : env.TWILIO_SMS_FROM_NUMBER;

  const params = new URLSearchParams({
    To: toNumber,
    From: fromNumber,
    MediaUrl: mediaUrl,
  });

  if (caption) {
    params.append('Body', caption);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
    },
    body: params,
  });

  if (!response.ok) {
    const body = await response.json() as { message?: string };
    return { success: false, error: body.message || 'Failed to send media message' };
  }

  const body = await response.json() as { sid?: string };
  return { success: true, sid: body.sid };
}
