'use client';

import { Mail, Phone, ShieldCheck, User } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { formatLocaleDateTime } from '@/lib/format';
import type { ChatbotConversation } from '@/lib/api/chatbot';

/** True when staff can turn the conversation into a lead: the visitor left something to identify them by, or it is linked to a contact. */
export function hasVisitorDetails(c: Pick<ChatbotConversation, 'visitorName' | 'visitorEmail' | 'visitorPhone' | 'contactId'>): boolean {
  return !!(c.visitorName || c.visitorEmail || c.visitorPhone || c.contactId);
}

/** The visitor's name, email and phone from the chat form, plus the consent they gave. Rows only appear for what exists. */
export function VisitorContactDetails({ conversation }: { conversation: ChatbotConversation }) {
  const t = useT();
  const { visitorName, visitorEmail, visitorPhone, contactConsentAt, marketingOptIn } = conversation;
  const icon = 'size-3.5 text-ds-foreground-muted';

  return (
    <div className="flex flex-col gap-ds-3 text-sm" data-testid="visitor-contact-details">
      {visitorName && (
        <div className="flex items-center gap-ds-2">
          <User className={icon} aria-hidden="true" />
          <span>{visitorName}</span>
        </div>
      )}
      {visitorEmail && (
        <div className="flex items-center gap-ds-2">
          <Mail className={icon} aria-hidden="true" />
          <span>{visitorEmail}</span>
        </div>
      )}
      {visitorPhone && (
        <div className="flex items-center gap-ds-2">
          <Phone className={icon} aria-hidden="true" />
          <span dir="ltr">{visitorPhone}</span>
        </div>
      )}
      {!hasVisitorDetails(conversation) && (
        <p className="text-xs text-ds-foreground-muted">{t('chatbot.visitor.empty')}</p>
      )}
      {contactConsentAt && (
        <div className="flex items-start gap-ds-2 text-xs text-ds-foreground-muted">
          <ShieldCheck className={`${icon} mt-0.5`} aria-hidden="true" />
          <span>
            {t('chatbot.visitor.consentGiven', { date: formatLocaleDateTime(contactConsentAt, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) })}
            {' '}
            {marketingOptIn ? t('chatbot.visitor.marketingYes') : t('chatbot.visitor.marketingNo')}
          </span>
        </div>
      )}
    </div>
  );
}
