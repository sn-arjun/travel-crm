import type { Env } from '../../../types';
import { sendEmail, sendWithTemplate } from '../../sendgrid';
import type { EmailProvider, EmailSendResult, OutgoingEmail } from '../provider';

/** SendGrid: the existing sender in services/sendgrid.ts, behind the provider interface. */
export const sendgridProvider: EmailProvider = {
  name: 'sendgrid',
  async send(env: Env, message: OutgoingEmail): Promise<EmailSendResult> {
    if (message.templateId) {
      const tpl = await sendWithTemplate(env, {
        to: message.to,
        templateId: message.templateId,
        dynamicData: message.templateData ?? {},
        from: message.from,
        replyTo: message.replyTo,
        cc: message.cc,
        bcc: message.bcc,
        attachments: message.attachments,
        unsubscribeUrl: message.unsubscribeUrl,
      });
      return { success: tpl.success, provider: 'sendgrid', messageId: tpl.messageId, error: tpl.error };
    }
    const res = await sendEmail(env, {
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      from: message.from,
      replyTo: message.replyTo,
      cc: message.cc,
      bcc: message.bcc,
      attachments: message.attachments,
      unsubscribeUrl: message.unsubscribeUrl,
      headers: message.headers,
      category: message.category,
    });
    return { success: res.success, provider: 'sendgrid', messageId: res.messageId, error: res.error };
  },
};
