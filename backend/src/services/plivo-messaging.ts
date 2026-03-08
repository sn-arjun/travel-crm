/**
 * PlivoMessagingProvider — Implements MessagingProvider for Plivo.
 *
 * Plivo Message API: https://www.plivo.com/docs/sms/api/
 */

import type { Env } from '../types';
import type { MessagingProvider, MessageResult } from './voip-provider';

export class PlivoMessagingProvider implements MessagingProvider {
  readonly providerName = 'plivo' as const;

  private authId: string;
  private authToken: string;
  private baseUrl: string;

  constructor(private env: Env) {
    this.authId = env.PLIVO_AUTH_ID || '';
    this.authToken = env.PLIVO_AUTH_TOKEN || '';
    this.baseUrl = `https://api.plivo.com/v1/Account/${this.authId}`;
  }

  private get authHeader(): string {
    return 'Basic ' + btoa(`${this.authId}:${this.authToken}`);
  }

  async sendSms(to: string, message: string): Promise<MessageResult> {
    const body = {
      src: this.env.PLIVO_SMS_FROM_NUMBER || this.env.TWILIO_SMS_FROM_NUMBER,
      dst: to.replace(/^\+/, ''),
      text: message,
    };

    try {
      const res = await fetch(`${this.baseUrl}/Message/`, {
        method: 'POST',
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await res.json() as any;

      if (!res.ok) {
        return { providerMessageId: '', status: 'failed', to, channel: 'sms' };
      }

      return {
        providerMessageId: data.message_uuid?.[0] || '',
        status: 'sent',
        to,
        channel: 'sms',
      };
    } catch {
      return { providerMessageId: '', status: 'failed', to, channel: 'sms' };
    }
  }

  async sendWhatsApp(to: string, message: string, mediaUrl?: string): Promise<MessageResult> {
    // Plivo WhatsApp uses the same Message API with type=whatsapp
    const body: Record<string, any> = {
      src: this.env.PLIVO_WHATSAPP_FROM_NUMBER || this.env.TWILIO_WHATSAPP_FROM_NUMBER,
      dst: to.replace(/^\+/, ''),
      text: message,
      type: 'whatsapp',
    };

    if (mediaUrl) {
      body.media_urls = [mediaUrl];
    }

    try {
      const res = await fetch(`${this.baseUrl}/Message/`, {
        method: 'POST',
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await res.json() as any;

      if (!res.ok) {
        return { providerMessageId: '', status: 'failed', to, channel: 'whatsapp' };
      }

      return {
        providerMessageId: data.message_uuid?.[0] || '',
        status: 'sent',
        to,
        channel: 'whatsapp',
      };
    } catch {
      return { providerMessageId: '', status: 'failed', to, channel: 'whatsapp' };
    }
  }

  async sendWhatsAppTemplate(to: string, templateId: string, variables: Record<string, string>): Promise<MessageResult> {
    const body: Record<string, any> = {
      src: this.env.PLIVO_WHATSAPP_FROM_NUMBER || this.env.TWILIO_WHATSAPP_FROM_NUMBER,
      dst: to.replace(/^\+/, ''),
      type: 'whatsapp',
      template: {
        name: templateId,
        language: 'en',
        components: [
          {
            type: 'body',
            parameters: Object.values(variables).map((v) => ({ type: 'text', text: v })),
          },
        ],
      },
    };

    try {
      const res = await fetch(`${this.baseUrl}/Message/`, {
        method: 'POST',
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await res.json() as any;

      if (!res.ok) {
        return { providerMessageId: '', status: 'failed', to, channel: 'whatsapp' };
      }

      return {
        providerMessageId: data.message_uuid?.[0] || '',
        status: 'sent',
        to,
        channel: 'whatsapp',
      };
    } catch {
      return { providerMessageId: '', status: 'failed', to, channel: 'whatsapp' };
    }
  }
}
