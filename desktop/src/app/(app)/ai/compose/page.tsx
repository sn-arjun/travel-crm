'use client';

import * as React from 'react';
import { Loader2, MessageSquare, Copy, Send, Sparkles, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { aiApi, type ComposedMessage } from '@/lib/api/ai';
import { communicationsApi } from '@/lib/api/communications';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function ComposePage() {
  const [context, setContext] = React.useState('');
  const [tone, setTone] = React.useState('professional');
  const [language, setLanguage] = React.useState('english');
  const [maxLength, setMaxLength] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<ComposedMessage | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = React.useState(false);
  const [sendTo, setSendTo] = React.useState('');
  const [sendContactId, setSendContactId] = React.useState('');
  const [sendType, setSendType] = React.useState<'email' | 'sms' | 'whatsapp'>('email');
  const [isSending, setIsSending] = React.useState(false);

  const handleGenerate = async () => {
    if (!context.trim()) {
      toast.error('Please provide the message context or purpose');
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await aiApi.composeMessage({
        context: context.trim(),
        tone,
        language,
        maxLength: maxLength ? parseInt(maxLength, 10) : undefined,
      });
      setMessage(response.data);
      toast.success('Message composed successfully');
    } catch (err) {
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
    if (!message || (!sendContactId.trim() && !sendTo.trim())) {
      toast.error('Please enter a Contact ID or recipient');
      return;
    }
    setIsSending(true);
    try {
      await communicationsApi.send({
        contact_id: sendContactId.trim() || sendTo.trim(),
        channel: sendType,
        message: message.body,
        subject: sendType === 'email' ? message.subject : undefined,
      });
      toast.success(`Message sent via ${sendType} successfully!`);
      setSendDialogOpen(false);
      setSendTo('');
      setSendContactId('');
    } catch {
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Message Composer</h1>
        <p className="text-muted-foreground mt-1">
          Generate professional messages for email, SMS, and WhatsApp with AI
        </p>
      </div>

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
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger id="tone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="formal">Formal</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
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
                    <SelectItem value="english">English</SelectItem>
                    <SelectItem value="hindi">Hindi</SelectItem>
                    <SelectItem value="spanish">Spanish</SelectItem>
                    <SelectItem value="french">French</SelectItem>
                    <SelectItem value="arabic">Arabic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxLength">Max Length (characters, optional)</Label>
              <Input
                id="maxLength"
                type="number"
                placeholder="e.g., 500"
                value={maxLength}
                onChange={(e) => setMaxLength(e.target.value)}
              />
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
            {!message && !loading && (
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
              <Label>Contact ID</Label>
              <Input
                value={sendContactId}
                onChange={(e) => setSendContactId(e.target.value)}
                placeholder="Enter contact ID (from Contacts page)"
              />
              <p className="text-xs text-muted-foreground">
                The contact must exist in CRM. Find their ID on the Contacts page.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialogOpen(false)} disabled={isSending}>Cancel</Button>
            <Button onClick={handleSendConfirm} disabled={isSending} className="gap-2">
              {isSending && <Loader2 className="h-4 w-4 animate-spin" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
