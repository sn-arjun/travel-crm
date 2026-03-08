'use client';

import * as React from 'react';
import {
  Mail, MessageCircle, Phone, Send, Loader2, ChevronRight, Eye, ArrowLeft, FileText,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';

import { cn } from '@/lib/utils';
import { communicationsApi } from '@/lib/api/communications';
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
}

/* ─── Local fallback templates (used when API templates not available) ─── */
const LOCAL_TEMPLATES: MessageTemplate[] = [
  // Email
  { id: 'tpl-welcome-email', name: 'Welcome Email', channel: 'email', category: 'greeting', subject: 'Welcome to {{company_name}}!', content: 'Dear {{customer_name}},\n\nWelcome to our travel services! We\'re excited to help you plan your perfect trip.\n\nBest regards,\n{{agent_name}}', variables: ['customer_name', 'company_name', 'agent_name'] },
  { id: 'tpl-followup-email', name: 'Follow-up Email', channel: 'email', category: 'follow_up', subject: 'Following up on your travel inquiry', content: 'Hi {{customer_name}},\n\nI wanted to follow up on your recent inquiry about {{destination}}. We have some great packages available for your travel dates.\n\nWould you like to schedule a call to discuss the details?\n\nBest,\n{{agent_name}}', variables: ['customer_name', 'destination', 'agent_name'] },
  { id: 'tpl-quotation-email', name: 'Quotation Email', channel: 'email', category: 'quotation', subject: 'Your Travel Quote - {{destination}}', content: 'Dear {{customer_name}},\n\nThank you for your interest in traveling to {{destination}}. Please find below our quotation:\n\nPackage: {{destination}} Trip\nTravel Date: {{travel_date}}\nPassengers: {{pax_count}}\nTotal Amount: {{amount}}\n\nThis quote is valid for 7 days. Please let us know if you\'d like to proceed.\n\nRegards,\n{{agent_name}}', variables: ['customer_name', 'destination', 'travel_date', 'pax_count', 'amount', 'agent_name'] },
  { id: 'tpl-booking-email', name: 'Booking Confirmation', channel: 'email', category: 'booking', subject: 'Booking Confirmed - {{destination}}', content: 'Dear {{customer_name}},\n\nYour booking for {{destination}} has been confirmed!\n\nTravel Date: {{travel_date}}\nReturn Date: {{return_date}}\nPassengers: {{pax_count}}\n\nWe will send you the detailed itinerary shortly.\n\nHappy travels!\n{{agent_name}}', variables: ['customer_name', 'destination', 'travel_date', 'return_date', 'pax_count', 'agent_name'] },
  { id: 'tpl-reminder-email', name: 'Payment Reminder', channel: 'email', category: 'reminder', subject: 'Payment Reminder - {{destination}} Trip', content: 'Dear {{customer_name}},\n\nThis is a friendly reminder that your payment of {{amount}} for the {{destination}} trip is due.\n\nPlease make the payment at your earliest convenience.\n\nThank you,\n{{agent_name}}', variables: ['customer_name', 'amount', 'destination', 'agent_name'] },
  // WhatsApp
  { id: 'tpl-welcome-wa', name: 'Welcome WhatsApp', channel: 'whatsapp', category: 'greeting', content: 'Hi {{first_name}}! Welcome to {{company_name}}. We\'re thrilled to help you plan your dream vacation. How can we assist you today?', variables: ['first_name', 'company_name'] },
  { id: 'tpl-followup-wa', name: 'Follow-up WhatsApp', channel: 'whatsapp', category: 'follow_up', content: 'Hi {{first_name}}, just following up on your inquiry about {{destination}}. We have some amazing deals available! Would you like to know more?', variables: ['first_name', 'destination'] },
  { id: 'tpl-booking-wa', name: 'Booking Confirmation WA', channel: 'whatsapp', category: 'booking', content: 'Hi {{first_name}}! Great news - your {{destination}} trip is confirmed for {{travel_date}}. We\'ll share the complete itinerary soon. Happy travels!', variables: ['first_name', 'destination', 'travel_date'] },
  { id: 'tpl-reminder-wa', name: 'Payment Reminder WA', channel: 'whatsapp', category: 'reminder', content: 'Hi {{first_name}}, a gentle reminder about your pending payment of {{amount}} for the {{destination}} trip. Please let us know if you have any questions.', variables: ['first_name', 'amount', 'destination'] },
  // SMS
  { id: 'tpl-welcome-sms', name: 'Welcome SMS', channel: 'sms', category: 'greeting', content: 'Welcome to {{company_name}}! We\'re excited to help plan your travel. Reply HELP for assistance.', variables: ['company_name'] },
  { id: 'tpl-reminder-sms', name: 'Payment Reminder SMS', channel: 'sms', category: 'reminder', content: 'Reminder: Payment of {{amount}} due for {{destination}} trip. Contact us for details.', variables: ['amount', 'destination'] },
  { id: 'tpl-booking-sms', name: 'Booking Confirmed SMS', channel: 'sms', category: 'booking', content: 'Booking confirmed! {{destination}} trip on {{travel_date}} for {{pax_count}} pax. Itinerary coming soon!', variables: ['destination', 'travel_date', 'pax_count'] },
];

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
}

type Step = 'channel' | 'template' | 'compose' | 'preview';

export function SendMessageDialog({ open, onOpenChange, contact, defaultChannel }: SendMessageDialogProps) {
  const [step, setStep] = React.useState<Step>(defaultChannel ? 'template' : 'channel');
  const [channel, setChannel] = React.useState<'email' | 'whatsapp' | 'sms'>(defaultChannel ?? 'email');
  const [selectedTemplate, setSelectedTemplate] = React.useState<MessageTemplate | null>(null);
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);

  // Reset when dialog opens/closes
  React.useEffect(() => {
    if (open) {
      setStep(defaultChannel ? 'template' : 'channel');
      setChannel(defaultChannel ?? 'email');
      setSelectedTemplate(null);
      setSubject('');
      setBody('');
    }
  }, [open, defaultChannel]);

  const channelTemplates = LOCAL_TEMPLATES.filter((t) => t.channel === channel);

  function substituteVariables(text: string): string {
    const firstName = contact.name.split(' ')[0] ?? contact.name;
    return text
      .replace(/\{\{customer_name\}\}/g, contact.name)
      .replace(/\{\{first_name\}\}/g, firstName)
      .replace(/\{\{company_name\}\}/g, 'TravelCRM')
      .replace(/\{\{agent_name\}\}/g, 'Your Travel Agent')
      .replace(/\{\{destination\}\}/g, '[Destination]')
      .replace(/\{\{travel_date\}\}/g, '[Travel Date]')
      .replace(/\{\{return_date\}\}/g, '[Return Date]')
      .replace(/\{\{pax_count\}\}/g, '[Pax Count]')
      .replace(/\{\{amount\}\}/g, '[Amount]')
      .replace(/\{\{[^}]+\}\}/g, '[...]');
  }

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
      if (channel === 'email') {
        if (!contact.email) {
          toast.error('Contact has no email address');
          return;
        }
        await communicationsApi.send({
          to: [contact.email],
          subject,
          body,
          type: 'email',
          template: selectedTemplate?.id,
        });
      } else {
        if (!contact.phone) {
          toast.error(`Contact has no phone number for ${channel}`);
          return;
        }
        await communicationsApi.send({
          to: [contact.phone],
          body,
          type: channel,
          template: selectedTemplate?.id,
        });
      }
      toast.success(`${channel === 'email' ? 'Email' : channel === 'whatsapp' ? 'WhatsApp message' : 'SMS'} sent via Communication Hub`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || `Failed to send ${channel}`);
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
            <Button variant="ghost" size="icon-sm" onClick={() => {
              if (step === 'template') setStep('channel');
              else if (step === 'compose') setStep('template');
              else if (step === 'preview') setStep('compose');
            }}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <DialogTitle className="text-base">
              {step === 'channel' && 'Send Message'}
              {step === 'template' && `Choose Template`}
              {step === 'compose' && `Compose ${channelLabel[channel]}`}
              {step === 'preview' && `Preview & Send`}
            </DialogTitle>
            <DialogDescription className="text-xs">
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
                <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
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
                <div className="h-10 w-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0">
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
                <div className="h-10 w-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
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
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{substituteVariables(tpl.content).slice(0, 120)}...</p>
                        </div>
                        <Badge variant="secondary" className="text-[10px] shrink-0 capitalize">{tpl.category.replace('_', ' ')}</Badge>
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
                  <Badge variant="secondary" className="text-[10px]">{selectedTemplate.name}</Badge>
                </>
              )}
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
                <p className="text-[10px] text-muted-foreground">
                  {body.length}/160 characters ({Math.ceil(body.length / 160) || 1} segment{Math.ceil(body.length / 160) > 1 ? 's' : ''})
                </p>
              )}
            </div>

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
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Subject</span>
                    <span className="text-sm font-medium">{subject}</span>
                  </div>
                )}
                <Separator />
                <div className="text-sm whitespace-pre-wrap leading-relaxed">{body}</div>
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground">
              This message will be sent via the Communication Hub and logged in the contact's activity timeline.
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
