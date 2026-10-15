'use client';

import * as React from 'react';
import {
  Mail, MessageCircle, Phone, Send, Loader2, ChevronRight, Eye, ArrowLeft, FileText, TriangleAlert, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';

import { cn } from '@/lib/utils';
import { communicationsApi } from '@/lib/api/communications';
import { aiApi, isAiUnavailableError } from '@/lib/api/ai';
import { templatesApi, type MessageTemplate as ApiMessageTemplate } from '@/lib/api/templates';
import { unwrapList } from '@/lib/api/envelope';
import { useAuthStore } from '@/stores/auth-store';
import { useCompanyProfile } from '@/hooks/use-company-profile';
import { toast } from 'sonner';

/* ─── Template types ─── */
interface MessageTemplate {
  id: string;
  name: string;
  channel: 'email' | 'sms' | 'whatsapp';
  category: string;
  subject?: string;
  content: string;
  variables?: string[];
  /** Hidden unless the caller supplies this variable (e.g. a share link). */
  requires?: 'share_link' | 'payment_link';
}

/** Values a caller can supply for template placeholders. Anything omitted stays as `{{name}}`. */
export type MessageVariableName =
  | 'customer_name' | 'first_name' | 'company_name' | 'company_phone' | 'company_email'
  | 'agent_name' | 'agent_email'
  | 'destination' | 'travel_date' | 'return_date' | 'pax_count' | 'amount'
  | 'share_link' | 'payment_link' | 'invoice_number';

export type MessageVariables = Partial<Record<MessageVariableName, string>>;

/* ─── Local fallback templates (used when API templates not available) ─── */
const LOCAL_TEMPLATES: MessageTemplate[] = [
  // Email
  { id: 'tpl-welcome-email', name: 'Welcome Email', channel: 'email', category: 'greeting', subject: 'Welcome to {{company_name}}!', content: 'Dear {{customer_name}},\n\nWelcome to our travel services! We\'re excited to help you plan your perfect trip.\n\nBest regards,\n{{agent_name}}', variables: ['customer_name', 'company_name', 'agent_name'] },
  { id: 'tpl-followup-email', name: 'Follow-up Email', channel: 'email', category: 'follow_up', subject: 'Following up on your travel inquiry', content: 'Hi {{customer_name}},\n\nI wanted to follow up on your recent inquiry about {{destination}}. We have some great packages available for your travel dates.\n\nWould you like to schedule a call to discuss the details?\n\nBest,\n{{agent_name}}', variables: ['customer_name', 'destination', 'agent_name'] },
  { id: 'tpl-quotation-email', name: 'Quotation Email', channel: 'email', category: 'quotation', subject: 'Your Travel Quote - {{destination}}', content: 'Dear {{customer_name}},\n\nThank you for your interest in traveling to {{destination}}. Please find below our quotation:\n\nPackage: {{destination}} Trip\nTravel Date: {{travel_date}}\nPassengers: {{pax_count}}\nTotal Amount: {{amount}}\nDay-by-day plan: {{share_link}}\n\nThis quote is valid for 7 days. Please let us know if you\'d like to proceed.\n\nRegards,\n{{agent_name}}\n{{company_name}}', variables: ['customer_name', 'destination', 'travel_date', 'pax_count', 'amount', 'agent_name', 'company_name'] },
  { id: 'tpl-itinerary-email', name: 'Itinerary Link Email', channel: 'email', category: 'quotation', subject: 'Your {{destination}} itinerary from {{company_name}}', content: 'Hi {{customer_name}},\n\nYour {{destination}} itinerary is ready. You can view the day-by-day plan here:\n{{share_link}}\n\nTotal package price: {{amount}}\n\nWarm regards,\n{{agent_name}}\n{{company_name}}', variables: ['customer_name', 'destination', 'share_link', 'amount', 'agent_name', 'company_name'], requires: 'share_link' },
  { id: 'tpl-booking-email', name: 'Booking Confirmation', channel: 'email', category: 'booking', subject: 'Booking Confirmed - {{destination}}', content: 'Dear {{customer_name}},\n\nYour booking for {{destination}} has been confirmed!\n\nTravel Date: {{travel_date}}\nReturn Date: {{return_date}}\nPassengers: {{pax_count}}\n\nWe will send you the detailed itinerary shortly.\n\nHappy travels!\n{{agent_name}}', variables: ['customer_name', 'destination', 'travel_date', 'return_date', 'pax_count', 'agent_name'] },
  { id: 'tpl-reminder-email', name: 'Payment Reminder', channel: 'email', category: 'reminder', subject: 'Payment Reminder - {{destination}} Trip', content: 'Dear {{customer_name}},\n\nThis is a friendly reminder that your payment of {{amount}} for the {{destination}} trip is due.\n\nPlease make the payment at your earliest convenience.\n\nThank you,\n{{agent_name}}', variables: ['customer_name', 'amount', 'destination', 'agent_name'] },
  { id: 'tpl-paylink-email', name: 'Invoice Payment Link', channel: 'email', category: 'reminder', subject: 'Pay invoice {{invoice_number}} online', content: 'Dear {{customer_name}},\n\nInvoice {{invoice_number}} for {{amount}} can be paid securely online here:\n{{payment_link}}\n\nThank you,\n{{agent_name}}\n{{company_name}}', variables: ['customer_name', 'invoice_number', 'amount', 'payment_link', 'agent_name', 'company_name'], requires: 'payment_link' },
  // WhatsApp
  { id: 'tpl-paylink-wa', name: 'Invoice Payment Link WA', channel: 'whatsapp', category: 'reminder', content: 'Hi {{first_name}}, you can pay invoice {{invoice_number}} ({{amount}}) securely online: {{payment_link}}', variables: ['first_name', 'invoice_number', 'amount', 'payment_link'], requires: 'payment_link' },
  { id: 'tpl-welcome-wa', name: 'Welcome WhatsApp', channel: 'whatsapp', category: 'greeting', content: 'Hi {{first_name}}! Welcome to {{company_name}}. We\'re thrilled to help you plan your dream vacation. How can we assist you today?', variables: ['first_name', 'company_name'] },
  { id: 'tpl-followup-wa', name: 'Follow-up WhatsApp', channel: 'whatsapp', category: 'follow_up', content: 'Hi {{first_name}}, just following up on your inquiry about {{destination}}. We have some amazing deals available! Would you like to know more?', variables: ['first_name', 'destination'] },
  { id: 'tpl-itinerary-wa', name: 'Itinerary Link WhatsApp', channel: 'whatsapp', category: 'quotation', content: 'Hi {{first_name}}, your {{destination}} itinerary from {{company_name}} is ready: {{share_link}}\nPackage price: {{amount}}', variables: ['first_name', 'destination', 'company_name', 'share_link', 'amount'], requires: 'share_link' },
  { id: 'tpl-booking-wa', name: 'Booking Confirmation WA', channel: 'whatsapp', category: 'booking', content: 'Hi {{first_name}}! Great news - your {{destination}} trip is confirmed for {{travel_date}}. We\'ll share the complete itinerary soon. Happy travels!', variables: ['first_name', 'destination', 'travel_date'] },
  { id: 'tpl-reminder-wa', name: 'Payment Reminder WA', channel: 'whatsapp', category: 'reminder', content: 'Hi {{first_name}}, a gentle reminder about your pending payment of {{amount}} for the {{destination}} trip. Please let us know if you have any questions.', variables: ['first_name', 'amount', 'destination'] },
  // SMS
  { id: 'tpl-welcome-sms', name: 'Welcome SMS', channel: 'sms', category: 'greeting', content: 'Welcome to {{company_name}}! We\'re excited to help plan your travel. Reply HELP for assistance.', variables: ['company_name'] },
  { id: 'tpl-reminder-sms', name: 'Payment Reminder SMS', channel: 'sms', category: 'reminder', content: 'Reminder: Payment of {{amount}} due for {{destination}} trip. Contact us for details.', variables: ['amount', 'destination'] },
  { id: 'tpl-booking-sms', name: 'Booking Confirmed SMS', channel: 'sms', category: 'booking', content: 'Booking confirmed! {{destination}} trip on {{travel_date}} for {{pax_count}} pax. Itinerary coming soon!', variables: ['destination', 'travel_date', 'pax_count'] },
];

const PLACEHOLDER_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Unique `{{name}}` placeholders that are still present in `text`. */
function findPlaceholders(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    if (m[1]) found.add(m[1]);
  }
  return [...found];
}

/** Preview body with unresolved `{{name}}` placeholders highlighted. */
function HighlightedBody({ text }: { text: string }) {
  const parts = text.split(/(\{\{\s*[a-z_]+\s*\}\})/g);
  return (
    <div className="text-sm whitespace-pre-wrap leading-relaxed">
      {parts.map((part, i) =>
        /^\{\{/.test(part) ? (
          <mark key={i} className="rounded-sm bg-ds-warning-subtle px-ds-1 text-ds-warning-on-subtle">{part}</mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </div>
  );
}

function PlaceholderWarning({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div
      role="status"
      data-testid="placeholder-warning"
      className="flex items-center gap-ds-2 rounded-md bg-ds-warning-subtle px-ds-3 py-ds-2 text-xs text-ds-warning-on-subtle"
    >
      <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
      <span>{count} {count === 1 ? 'placeholder needs a value' : 'placeholders need values'}</span>
    </div>
  );
}

/* ─── Props ─── */
export interface SendMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  };
  /** Pre-select a channel */
  defaultChannel?: 'email' | 'whatsapp' | 'sms';
  /**
   * Values for template placeholders (destination, dates, amount, share link ...).
   * `customer_name` / `first_name` default to the contact, `company_name` to the tenant
   * and `agent_name` to the signed-in user. Unresolved placeholders stay as `{{name}}`.
   */
  variables?: MessageVariables;
  /** Called after a message was sent, so the host page can refresh its activity. */
  onSent?: () => void;
  /**
   * Open straight on the compose step with this text (e.g. a reply drafted by the assistant).
   * The person still reviews, edits and previews it before anything is sent.
   */
  initialBody?: string;
  initialSubject?: string;
  /** Log the message against this lead. */
  leadId?: string | null;
}

type Step = 'channel' | 'template' | 'compose' | 'preview';

export function SendMessageDialog({ open, onOpenChange, contact, defaultChannel, variables, onSent, initialBody, initialSubject, leadId }: SendMessageDialogProps) {
  const [step, setStep] = React.useState<Step>(defaultChannel ? 'template' : 'channel');
  const [channel, setChannel] = React.useState<'email' | 'whatsapp' | 'sms'>(defaultChannel ?? 'email');
  const [selectedTemplate, setSelectedTemplate] = React.useState<MessageTemplate | null>(null);
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  // "Draft with AI": one line about what to say, the assistant writes the message into the editor.
  const [aiBrief, setAiBrief] = React.useState('');
  const [isDrafting, setIsDrafting] = React.useState(false);

  const tenant = useAuthStore((s) => s.tenant);
  const user = useAuthStore((s) => s.user);
  const company = useCompanyProfile(open);
  const tenantName = company?.name || tenant?.name || (tenant as { companyName?: string } | null)?.companyName;

  // Reset when dialog opens/closes
  React.useEffect(() => {
    if (open) {
      setStep(initialBody ? 'compose' : defaultChannel ? 'template' : 'channel');
      setChannel(defaultChannel ?? 'email');
      setSelectedTemplate(null);
      setSubject(initialSubject ?? '');
      setBody(initialBody ?? '');
      setAiBrief('');
      setTemplateSearch('');
    }
  }, [open, defaultChannel, initialBody, initialSubject]);

  const values = React.useMemo<MessageVariables>(() => {
    const merged: MessageVariables = {
      customer_name: contact.name,
      first_name: contact.name.split(' ')[0] ?? contact.name,
      company_name: tenantName,
      company_phone: company?.phone,
      company_email: company?.email,
      agent_name: user?.name,
      agent_email: user?.email,
      ...variables,
    };
    // Drop blanks so they stay as visible placeholders instead of empty text
    for (const key of Object.keys(merged) as MessageVariableName[]) {
      if (!merged[key]?.trim()) delete merged[key];
    }
    return merged;
  }, [contact.name, tenantName, company?.phone, company?.email, user?.name, user?.email, variables]);

  // The tenant's own templates (Communication > Templates) come first, built-in starters after
  const [tenantTemplates, setTenantTemplates] = React.useState<MessageTemplate[]>([]);
  const [templateSearch, setTemplateSearch] = React.useState('');
  React.useEffect(() => {
    if (!open || step !== 'template') return;
    let cancelled = false;
    templatesApi
      .list({ channel, limit: 100 })
      .then((res) => {
        if (cancelled) return;
        const rows = unwrapList<ApiMessageTemplate>(res).data;
        setTenantTemplates(
          rows
            .filter((t) => t.channel === channel && t.isActive !== 0 && t.content)
            .map((t) => ({
              id: `tenant-${t.id}`,
              name: t.name,
              channel: t.channel,
              category: t.category || 'custom',
              subject: t.subject || undefined,
              content: t.content,
            })),
        );
      })
      .catch(() => {
        if (!cancelled) setTenantTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, step, channel]);

  const needle = templateSearch.trim().toLowerCase();
  const matchesSearch = (t: MessageTemplate) =>
    !needle || `${t.name} ${t.category} ${t.content}`.toLowerCase().includes(needle);
  const ownTemplates = tenantTemplates.filter(matchesSearch);
  const starterTemplates = LOCAL_TEMPLATES.filter(
    (t) => t.channel === channel && (!t.requires || !!values[t.requires]) && matchesSearch(t),
  );
  const channelTemplates = [...ownTemplates, ...starterTemplates];

  function substituteVariables(text: string): string {
    // A line that exists to carry a link (share link, payment link) is dropped when there is no link
    const missing = (['share_link', 'payment_link'] as const).filter((name) => !values[name]);
    const lines = missing.length === 0
      ? text
      : text.split('\n').filter((line) => !missing.some((name) => line.includes(`{{${name}}}`))).join('\n');
    return lines.replace(PLACEHOLDER_RE, (whole, name: string) => values[name as MessageVariableName] ?? whole);
  }

  const unresolvedCount = findPlaceholders(`${channel === 'email' ? subject : ''}\n${body}`).length;

  function selectChannel(ch: 'email' | 'whatsapp' | 'sms') {
    setChannel(ch);
    setStep('template');
  }

  function selectTemplate(tpl: MessageTemplate | null) {
    setSelectedTemplate(tpl);
    if (tpl) {
      setBody(substituteVariables(tpl.content));
      setSubject(tpl.subject ? substituteVariables(tpl.subject) : '');
    } else {
      setBody('');
      setSubject('');
    }
    setStep('compose');
  }

  /** The draft only fills the editor; the person still edits, previews and sends it. */
  async function draftWithAi() {
    const brief = aiBrief.trim();
    if (!brief) {
      toast.error('Say in a few words what the message should cover');
      return;
    }
    setIsDrafting(true);
    try {
      const res = await aiApi.composeMessage({
        channel,
        purpose: brief,
        context: {
          customerName: contact.name,
          destination: variables?.destination,
          additionalContext: body.trim() ? `Current draft to improve:\n${body.trim()}` : undefined,
        },
      });
      const drafted = res.data?.message;
      if (!drafted?.body) throw new Error('The assistant returned an empty draft');
      setBody(drafted.body);
      if (channel === 'email' && drafted.subject) setSubject(drafted.subject);
      toast.success('Draft ready. Read it before you send.');
    } catch (err) {
      toast.error(
        isAiUnavailableError(err)
          ? 'AI drafting is not available right now. Write the message or pick a template.'
          : (err as { message?: string })?.message || 'Could not draft the message',
      );
    } finally {
      setIsDrafting(false);
    }
  }

  function goToPreview() {
    if (channel === 'email' && !subject.trim()) {
      toast.error('Subject is required for email');
      return;
    }
    if (!body.trim()) {
      toast.error('Message body is required');
      return;
    }
    setStep('preview');
  }

  async function handleSend() {
    setIsSending(true);
    try {
      if (channel === 'email' && !contact.email) {
        toast.error('Contact has no email address');
        return;
      }
      if (channel !== 'email' && !contact.phone) {
        toast.error(`Contact has no phone number for ${channel}`);
        return;
      }
      await communicationsApi.send({
        contact_id: contact.id,
        ...(leadId ? { lead_id: leadId } : {}),
        channel,
        message: channel === 'email' && subject ? `[Subject: ${subject}]\n${body}` : body,
      });
      toast.success(`${channel === 'email' ? 'Email' : channel === 'whatsapp' ? 'WhatsApp message' : 'SMS'} sent via Communication Hub`);
      onOpenChange(false);
      onSent?.();
    } catch (err) {
      // The API client throws plain `{ status, message }` objects, not Error instances
      const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '';
      toast.error(message || `Failed to send ${channel}`);
    } finally {
      setIsSending(false);
    }
  }

  const canSendEmail = !!contact.email;
  const canSendPhone = !!contact.phone;

  const channelIcon = {
    email: <Mail className="h-4 w-4" />,
    whatsapp: <MessageCircle className="h-4 w-4" />,
    sms: <Phone className="h-4 w-4" />,
  };

  const channelLabel = {
    email: 'Email',
    whatsapp: 'WhatsApp',
    sms: 'SMS',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-3">
          {step !== 'channel' && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Back"
              onClick={() => {
                if (step === 'template') setStep('channel');
                else if (step === 'compose') setStep('template');
                else if (step === 'preview') setStep('compose');
              }}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="min-w-0">
            <DialogTitle className="text-base">
              {step === 'channel' && 'Send Message'}
              {step === 'template' && `Choose Template`}
              {step === 'compose' && `Compose ${channelLabel[channel]}`}
              {step === 'preview' && `Preview & Send`}
            </DialogTitle>
            <DialogDescription className="text-xs truncate">
              To: {contact.name} {channel !== 'email' && contact.phone ? `(${contact.phone})` : ''} {channel === 'email' && contact.email ? `(${contact.email})` : ''}
            </DialogDescription>
          </div>
        </div>

        <Separator />

        {/* Step: Channel Selection */}
        {step === 'channel' && (
          <div className="px-6 py-4 space-y-3">
            <p className="text-sm text-muted-foreground">Choose how to reach {contact.name.split(' ')[0]}</p>
            <div className="space-y-2">
              <button
                onClick={() => canSendEmail && selectChannel('email')}
                disabled={!canSendEmail}
                className={cn(
                  'w-full flex items-center gap-4 p-4 rounded-lg border text-left transition-colors',
                  canSendEmail ? 'hover:bg-accent cursor-pointer' : 'opacity-50 cursor-not-allowed',
                )}
              >
                <div className="h-10 w-10 rounded-full bg-ds-info-subtle text-ds-info-on-subtle flex items-center justify-center shrink-0">
                  <Mail className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Email</p>
                  <p className="text-xs text-muted-foreground truncate">{contact.email || 'No email on file'}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>

              <button
                onClick={() => canSendPhone && selectChannel('whatsapp')}
                disabled={!canSendPhone}
                className={cn(
                  'w-full flex items-center gap-4 p-4 rounded-lg border text-left transition-colors',
                  canSendPhone ? 'hover:bg-accent cursor-pointer' : 'opacity-50 cursor-not-allowed',
                )}
              >
                <div className="h-10 w-10 rounded-full bg-ds-success-subtle text-ds-success-on-subtle flex items-center justify-center shrink-0">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">WhatsApp</p>
                  <p className="text-xs text-muted-foreground truncate">{contact.phone || 'No phone on file'}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>

              <button
                onClick={() => canSendPhone && selectChannel('sms')}
                disabled={!canSendPhone}
                className={cn(
                  'w-full flex items-center gap-4 p-4 rounded-lg border text-left transition-colors',
                  canSendPhone ? 'hover:bg-accent cursor-pointer' : 'opacity-50 cursor-not-allowed',
                )}
              >
                <div className="h-10 w-10 rounded-full bg-ds-primary-subtle text-ds-primary-on-subtle flex items-center justify-center shrink-0">
                  <Phone className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">SMS</p>
                  <p className="text-xs text-muted-foreground truncate">{contact.phone || 'No phone on file'}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            </div>
          </div>
        )}

        {/* Step: Template Selection */}
        {step === 'template' && (
          <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
            <div className="px-6 py-3 shrink-0">
              <div className="flex items-center gap-2">
                {channelIcon[channel]}
                <Badge variant="outline" className="text-xs">{channelLabel[channel]}</Badge>
              </div>
              {tenantTemplates.length > 0 && (
                <Input
                  className="mt-2"
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  placeholder="Search templates..."
                  aria-label="Search templates"
                />
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4">
              <div className="space-y-2">
                {/* Write Custom option */}
                <Card
                  className="cursor-pointer hover:shadow-sm transition-shadow border-dashed"
                  onClick={() => selectTemplate(null)}
                >
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Write custom message</p>
                      <p className="text-xs text-muted-foreground">Compose a message from scratch</p>
                    </div>
                  </CardContent>
                </Card>

                {channelTemplates.length > 0 && (
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2 pb-1">Templates</p>
                )}
                {channelTemplates.length === 0 && needle && (
                  <p className="text-sm text-muted-foreground text-center py-4">No templates match your search</p>
                )}

                {channelTemplates.map((tpl) => (
                  <Card
                    key={tpl.id}
                    className="cursor-pointer hover:shadow-sm transition-shadow"
                    onClick={() => selectTemplate(tpl)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{tpl.name}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{substituteVariables(tpl.content).replace(/\s+/g, ' ').slice(0, 120)}...</p>
                        </div>
                        <Badge variant="secondary" className="text-xs shrink-0 capitalize">{tpl.category.replace('_', ' ')}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step: Compose */}
        {step === 'compose' && (
          <div className="px-6 py-4 space-y-4 flex-1 min-h-0 overflow-y-auto">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {channelIcon[channel]}
              <span>{channelLabel[channel]}</span>
              {selectedTemplate && (
                <>
                  <span className="mx-1">-</span>
                  <Badge variant="secondary" className="text-xs">{selectedTemplate.name}</Badge>
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="msg-ai-brief">Draft with AI</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="msg-ai-brief"
                  value={aiBrief}
                  onChange={(e) => setAiBrief(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void draftWithAi();
                    }
                  }}
                  placeholder="What should it say? e.g. ask for passport copies by Friday"
                  disabled={isDrafting}
                />
                <Button type="button" variant="outline" onClick={() => void draftWithAi()} disabled={isDrafting} className="shrink-0">
                  {isDrafting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
                  Draft
                </Button>
              </div>
            </div>

            {channel === 'email' && (
              <div className="space-y-2">
                <Label htmlFor="msg-subject">Subject</Label>
                <Input
                  id="msg-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject..."
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="msg-body">Message</Label>
              <Textarea
                id="msg-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={`Type your ${channelLabel[channel].toLowerCase()} message...`}
                rows={channel === 'email' ? 8 : 5}
                className="resize-none"
              />
              {channel === 'sms' && (
                <p className="text-xs text-muted-foreground">
                  {body.length}/160 characters ({Math.ceil(body.length / 160) || 1} segment{Math.ceil(body.length / 160) > 1 ? 's' : ''})
                </p>
              )}
            </div>

            <PlaceholderWarning count={unresolvedCount} />

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setStep('template')}>Back</Button>
              <Button onClick={goToPreview}>
                <Eye className="h-4 w-4 mr-1.5" /> Preview
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step: Preview & Send */}
        {step === 'preview' && (
          <div className="px-6 py-4 space-y-4 flex-1 min-h-0 overflow-y-auto">
            <div className="flex items-center gap-2 mb-1">
              {channelIcon[channel]}
              <span className="text-sm font-medium">{channelLabel[channel]} to {contact.name}</span>
            </div>

            {/* Preview Card */}
            <Card className="bg-muted/30">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">To</span>
                  <span className="text-sm font-medium">
                    {channel === 'email' ? contact.email : contact.phone}
                  </span>
                </div>
                {channel === 'email' && subject && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">Subject</span>
                    <span className="text-sm font-medium text-right">{subject}</span>
                  </div>
                )}
                <Separator />
                <HighlightedBody text={body} />
              </CardContent>
            </Card>

            <PlaceholderWarning count={unresolvedCount} />

            <p className="text-xs text-muted-foreground">
              This message will be sent via the Communication Hub and logged in the contact&apos;s activity timeline.
            </p>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setStep('compose')}>Edit</Button>
              <Button onClick={handleSend} disabled={isSending}>
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <Send className="h-4 w-4 mr-1.5" />
                )}
                Send {channelLabel[channel]}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
