'use client';

import { PageContainer } from '@/components/layout/page-container';
import * as React from 'react';
import { Loader2, MessageSquare, Copy, Send, Sparkles, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { aiApi, isAiUnavailableError, type AiUnavailableError, type ComposedMessage } from '@/lib/api/ai';
import { communicationsApi } from '@/lib/api/communications';
import { contactsApi } from '@/lib/api/contacts';
import type { Contact } from '@travelcrm/shared';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { RelationCombobox } from '@/components/domain/relation-combobox';
import { AiUnavailableNotice } from '@/components/domain/ai/ai-unavailable-notice';
import { PageHeader } from '@/components/ui/page-header';
import { AiGate } from '@/components/domain/ai/ai-gate';
import { AiQuotaBadge } from '@/components/domain/ai/quota-badge';
import { GeneratedContentActions } from '@/components/domain/ai/generated-content-actions';

const TONE_OPTIONS = [
  { value: 'professional', label: 'Professional' },
  { value: 'formal', label: 'Formal' },
  { value: 'casual', label: 'Casual' },
  { value: 'enthusiastic', label: 'Enthusiastic' },
] as const;

export default function ComposePage() {
  const [channel, setChannel] = React.useState<'email' | 'sms' | 'whatsapp'>('email');
  const [context, setContext] = React.useState('');
  const [tone, setTone] = React.useState<'formal' | 'casual' | 'enthusiastic' | 'professional'>('professional');
  const [language, setLanguage] = React.useState('en');
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<ComposedMessage | null>(null);
  const [aiError, setAiError] = React.useState<AiUnavailableError | null>(null);
  const [contentId, setContentId] = React.useState<string | undefined>();
  const [sendDialogOpen, setSendDialogOpen] = React.useState(false);
  const [sendType, setSendType] = React.useState<'email' | 'sms' | 'whatsapp'>('email');
  const [sendContactId, setSendContactId] = React.useState<string | null>(null);
  const [isSending, setIsSending] = React.useState(false);

  const handleGenerate = async () => {
    if (!context.trim()) {
      toast.error('Please provide the message context or purpose');
      return;
    }

    setLoading(true);
    setMessage(null);
    setContentId(undefined);
    setAiError(null);

    try {
      const response = await aiApi.composeMessage({
        channel,
        purpose: context.trim(),
        tone,
        language,
        context: { additionalContext: context.trim() },
      });
      setMessage(response.data.message);
      setContentId(response.data.contentId);
      setSendType(channel);
      toast.success('Message composed successfully');
    } catch (err) {
      if (isAiUnavailableError(err)) {
        setAiError(err);
        return;
      }
      const msg = err instanceof Error ? err.message : 'Failed to compose message';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!message) return;
    const fullText = message.subject
      ? `Subject: ${message.subject}\n\n${message.body}`
      : message.body;
    navigator.clipboard.writeText(fullText);
    toast.success('Message copied to clipboard');
  };

  const handleSend = () => {
    if (!message) return;
    setSendDialogOpen(true);
  };

  const handleSendConfirm = async () => {
    if (!message || !sendContactId) {
      toast.error('Please pick a contact to send to');
      return;
    }
    setIsSending(true);
    try {
      await communicationsApi.send({
        contact_id: sendContactId,
        channel: sendType,
        message: sendType === 'email' && message.subject ? `[Subject: ${message.subject}]\n${message.body}` : message.body,
      });
      toast.success(`Message sent via ${sendType} successfully!`);
      setSendDialogOpen(false);
      setSendContactId(null);
    } catch {
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="AI Message Composer"
        description="Generate professional messages for email, SMS, and WhatsApp with AI"
        actions={<AiQuotaBadge capKey="ai_requests" />}
      />

      <AiGate>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Compose Settings
            </CardTitle>
            <CardDescription>Describe what you want to communicate</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="channel">Channel</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as 'email' | 'sms' | 'whatsapp')}>
                <SelectTrigger id="channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="context">Context / Purpose *</Label>
              <Textarea
                id="context"
                placeholder="e.g., Follow up with a client about their Maldives trip inquiry. They asked about pricing for 2 adults in April."
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={5}
                className="resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tone">Tone</Label>
                <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}>
                  <SelectTrigger id="tone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TONE_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger id="language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="hi">Hindi</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="ar">Arabic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={loading || !context.trim()}
              className="w-full gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Composing...
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4" />
                  Compose Message
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Result */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Composed Message</CardTitle>
            <CardDescription>
              {message ? `Tone: ${message.tone || tone}` : 'Your AI-composed message will appear here'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {aiError && !loading && <AiUnavailableNotice error={aiError} onRetry={handleGenerate} />}

            {!message && !loading && !aiError && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm">No message composed yet</p>
                <p className="text-xs mt-1">Describe the purpose and click Compose</p>
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-3" />
                <p className="text-sm">Composing your message...</p>
              </div>
            )}

            {message && (
              <div className="space-y-4">
                {message.subject && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                      Subject
                    </p>
                    <p className="font-semibold">{message.subject}</p>
                  </div>
                )}

                <Separator />

                <div className="rounded-lg border bg-muted/30 p-4">
                  <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">
                    {message.body}
                  </pre>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1 gap-2" onClick={handleCopy}>
                    <Copy className="h-4 w-4" />
                    Copy
                  </Button>
                  <Button variant="outline" className="flex-1 gap-2" onClick={handleGenerate}>
                    <RotateCcw className="h-4 w-4" />
                    Regenerate
                  </Button>
                  <Button className="flex-1 gap-2" onClick={handleSend}>
                    <Send className="h-4 w-4" />
                    Send
                  </Button>
                </div>

                <GeneratedContentActions contentId={contentId} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {/* Send Dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Composed Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Send Via</Label>
              <Select value={sendType} onValueChange={(v) => setSendType(v as 'email' | 'sms' | 'whatsapp')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Contact</Label>
              <RelationCombobox<Contact>
                value={sendContactId}
                onChange={(id) => setSendContactId(id)}
                fetcher={async (query, page) => {
                  const res = await contactsApi.list({ search: query, page, limit: 20 });
                  const payload = res as unknown as { data: Contact[]; pagination?: { total: number } };
                  const items = payload.data ?? [];
                  const total = payload.pagination?.total ?? items.length;
                  return { items, total };
                }}
                getOptionId={(c) => c.id}
                getOptionLabel={(c) => c.name}
                getOptionDescription={(c) => c.email ?? c.phone ?? undefined}
                resolveSelected={async (id) => (await contactsApi.getById(id)).data}
                placeholder="Search contacts…"
                searchPlaceholder="Search by name, email, phone…"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialogOpen(false)} disabled={isSending}>Cancel</Button>
            <Button onClick={handleSendConfirm} disabled={isSending || !sendContactId} className="gap-2">
              {isSending && <Loader2 className="h-4 w-4 animate-spin" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </AiGate>
    </PageContainer>
  );
}
