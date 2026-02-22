import type { Env } from '../types';

export interface EmailAttachment {
  filename: string;
  content: string; // base64
  type: string;
}

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: EmailAttachment[];
}

export interface SendWithTemplateParams {
  to: string | string[];
  templateId: string;
  dynamicData: Record<string, string | number | boolean | string[]>;
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: EmailAttachment[];
}

export interface SendBulkMessage {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  cc?: string;
  bcc?: string;
}

export interface SendEmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Normalize email addresses to array format.
 */
function normalizeEmailArray(email: string | string[]): string[] {
  if (Array.isArray(email)) {
    return email;
  }
  return [email];
}

/**
 * Normalize email addresses with names to SendGrid format.
 */
function formatEmailAddress(email: string | string[]) {
  const emails = normalizeEmailArray(email);
  return emails.map((e) => {
    if (e.includes('<') && e.includes('>')) {
      // Already in format "Name <email@example.com>"
      const match = e.match(/^(.+?)\s*<(.+?)>$/);
      if (match) {
        return { email: match[2], name: match[1] };
      }
    }
    return { email: e };
  });
}

/**
 * Send email via SendGrid API with full support for attachments, CC, BCC.
 */
export async function sendEmail(
  env: Env,
  params: SendEmailParams
): Promise<SendEmailResponse> {
  try {
    const personalizations = [
      {
        to: formatEmailAddress(params.to),
        ...(params.cc && { cc: formatEmailAddress(params.cc) }),
        ...(params.bcc && { bcc: formatEmailAddress(params.bcc) }),
      },
    ];

    const content = [];
    if (params.html) {
      content.push({ type: 'text/html', value: params.html });
    }
    if (params.text) {
      content.push({ type: 'text/plain', value: params.text });
    }

    const requestBody: Record<string, any> = {
      personalizations,
      from: {
        email: params.from || 'noreply@travelcrm.pro',
        name: 'TravelCRM Pro',
      },
      subject: params.subject,
      content: content.length > 0 ? content : [{ type: 'text/plain', value: '' }],
    };

    if (params.replyTo) {
      requestBody.reply_to = { email: params.replyTo };
    }

    if (params.attachments && params.attachments.length > 0) {
      requestBody.attachments = params.attachments.map((att) => ({
        content: att.content,
        filename: att.filename,
        type: att.type,
        disposition: 'attachment',
      }));
    }

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SENDGRID] Error response:', errorText);
      return {
        success: false,
        error: `SendGrid API error: ${response.status} - ${errorText}`,
      };
    }

    // Extract message ID from response headers
    const messageId = response.headers.get('x-message-id');

    return {
      success: true,
      messageId: messageId || undefined,
    };
  } catch (err: any) {
    console.error('[SENDGRID] Exception:', err.message);
    return {
      success: false,
      error: err.message || 'Unknown error',
    };
  }
}

/**
 * Send email using SendGrid Dynamic Template.
 */
export async function sendWithTemplate(
  env: Env,
  params: SendWithTemplateParams
): Promise<SendEmailResponse> {
  try {
    const personalizations = [
      {
        to: formatEmailAddress(params.to),
        dynamic_template_data: params.dynamicData,
        ...(params.cc && { cc: formatEmailAddress(params.cc) }),
        ...(params.bcc && { bcc: formatEmailAddress(params.bcc) }),
      },
    ];

    const requestBody: Record<string, any> = {
      personalizations,
      from: {
        email: params.from || 'noreply@travelcrm.pro',
        name: 'TravelCRM Pro',
      },
      template_id: params.templateId,
    };

    if (params.replyTo) {
      requestBody.reply_to = { email: params.replyTo };
    }

    if (params.attachments && params.attachments.length > 0) {
      requestBody.attachments = params.attachments.map((att) => ({
        content: att.content,
        filename: att.filename,
        type: att.type,
        disposition: 'attachment',
      }));
    }

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SENDGRID TEMPLATE] Error response:', errorText);
      return {
        success: false,
        error: `SendGrid API error: ${response.status} - ${errorText}`,
      };
    }

    const messageId = response.headers.get('x-message-id');

    return {
      success: true,
      messageId: messageId || undefined,
    };
  } catch (err: any) {
    console.error('[SENDGRID TEMPLATE] Exception:', err.message);
    return {
      success: false,
      error: err.message || 'Unknown error',
    };
  }
}

/**
 * Send bulk emails (up to 1000 per batch).
 * Each message in the array is sent to a unique recipient with their own subject/content.
 */
export async function sendBulk(
  env: Env,
  messages: SendBulkMessage[]
): Promise<SendEmailResponse> {
  try {
    if (messages.length === 0) {
      return { success: true };
    }

    // SendGrid supports up to 1000 recipients per request
    if (messages.length > 1000) {
      return {
        success: false,
        error: 'Maximum 1000 messages per batch',
      };
    }

    const personalizations = messages.map((msg) => ({
      to: [{ email: msg.to }],
      subject: msg.subject,
      ...(msg.cc && { cc: [{ email: msg.cc }] }),
      ...(msg.bcc && { bcc: [{ email: msg.bcc }] }),
    }));

    const content = [];
    if (messages[0]?.html) {
      content.push({ type: 'text/html', value: messages[0].html });
    }
    if (messages[0]?.text) {
      content.push({ type: 'text/plain', value: messages[0].text });
    }

    const requestBody = {
      personalizations,
      from: {
        email: 'noreply@travelcrm.pro',
        name: 'TravelCRM Pro',
      },
      content: content.length > 0 ? content : [{ type: 'text/plain', value: '' }],
    };

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SENDGRID BULK] Error response:', errorText);
      return {
        success: false,
        error: `SendGrid API error: ${response.status} - ${errorText}`,
      };
    }

    const messageId = response.headers.get('x-message-id');

    return {
      success: true,
      messageId: messageId || undefined,
    };
  } catch (err: any) {
    console.error('[SENDGRID BULK] Exception:', err.message);
    return {
      success: false,
      error: err.message || 'Unknown error',
    };
  }
}
