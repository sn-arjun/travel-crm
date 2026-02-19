import type { Env } from '../types';

/**
 * Send OTP via Twilio Verify API.
 */
export async function sendVerifyOtp(
  env: Env,
  phone: string
): Promise<{ success: boolean; error?: string }> {
  const url = `https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/Verifications`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
    },
    body: new URLSearchParams({ To: phone, Channel: 'sms' }),
  });

  if (!response.ok) {
    const body = await response.json() as { message?: string };
    return { success: false, error: body.message || 'Failed to send OTP' };
  }

  return { success: true };
}

/**
 * Check OTP via Twilio Verify API.
 */
export async function checkVerifyOtp(
  env: Env,
  phone: string,
  code: string
): Promise<{ valid: boolean; error?: string }> {
  const url = `https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
    },
    body: new URLSearchParams({ To: phone, Code: code }),
  });

  const body = await response.json() as { status?: string; message?: string };

  if (!response.ok) {
    return { valid: false, error: body.message || 'Verification failed' };
  }

  return { valid: body.status === 'approved' };
}
