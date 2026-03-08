'use client';

import * as React from 'react';
import {
  Mail, MessageCircle, MessageSquare, Paperclip, Send, Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ComposedMessage {
  channel: 'email' | 'whatsapp' | 'sms';
  to: string;
  subject?: string;
  body: string;
  template?: string;
}

const templates = {
  email: [
    { id: 'welcome', name: 'Welcome Email' },
    { id: 'followup', name: 'Follow-up Email' },
    { id: 'proposal', name: 'Proposal Email' },
    { id: 'reminder', name: 'Payment Reminder' },
  ],
  whatsapp: [
    { id: 'greeting', name: 'Greeting Message' },
    { id: 'inquiry', name: 'Inquiry Response' },
    { id: 'confirmation', name: 'Booking Confirmation' },
  ],
  sms: [
    { id: 'reminder', name: 'Appointment Reminder' },
    { id: 'offer', name: 'Special Offer' },
    { id: 'confirmation', name: 'Confirmation' },
  ],
};

export function ComposeModal({ isOpen, onClose }: ComposeModalProps) {
  const [channel, setChannel] = React.useState<'email' | 'whatsapp' | 'sms'>('email');
  const [message, setMessage] = React.useState<ComposedMessage>({
    channel: 'email',
    to: '',
    subject: '',
    body: '',
    template: '',
  });
  const [isSending, setIsSending] = React.useState(false);

  const handleUpdateMessage = (field: keyof ComposedMessage, value: string) => {
    setMessage((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleChannelChange = (newChannel: 'email' | 'whatsapp' | 'sms') => {
    setChannel(newChannel);
    setMessage((prev) => ({
      ...prev,
      channel: newChannel,
      subject: newChannel === 'email' ? prev.subject : undefined,
    }));
  };

  const handleSelectTemplate = (templateId: string) => {
    handleUpdateMessage('template', templateId);
    // In a real app, this would populate the body with template content
    const templateMap: Record<string, string> = {
      welcome: 'Welcome to our travel services! We\'re excited to help you plan your next adventure.',
      followup: 'Hi {{name}}, following up on your inquiry. Do you have any questions?',
      proposal: 'Please find attached our customized travel proposal for your review.',
      reminder: 'Reminder: Payment is due for your booking. Please process to confirm your reservation.',
      greeting: 'Hi {{name}}! 👋 How can we help you today?',
      inquiry: 'Thanks for your interest! {{agent}} will get back to you shortly.',
      confirmation: 'Your booking is confirmed! ✅ Details: {{details}}',
      offer: 'Special offer! 30% off select destinations. Reply YES to learn more.',
    };
    setMessage((prev) => ({
      ...prev,
      body: templateMap[templateId] ?? prev.body,
    }));
  };

  const handleSend = () => {
    if (!message.to || !message.body) {
      alert('Please fill in required fields');
      return;
    }
    setIsSending(true);
    setTimeout(() => {
      alert(`Message sent via ${channel}!`);
      setIsSending(false);
      onClose();
      setMessage({ channel: 'email', to: '', subject: '', body: '', template: '' });
    }, 1000);
  };

  const handleSaveDraft = () => {
    alert('Draft saved!');
  };

  const charCount = message.body.length;
  const smsCharLimit = 160;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compose Message</DialogTitle>
        </DialogHeader>

        <Tabs value={channel} onValueChange={(v) => handleChannelChange(v as typeof channel)} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="email" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </TabsTrigger>
            <TabsTrigger value="sms" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              SMS
            </TabsTrigger>
          </TabsList>

          {/* Email Tab */}
          <TabsContent value="email" className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">To *</label>
              <Input
                placeholder="recipient@example.com"
                value={message.to}
                onChange={(e) => handleUpdateMessage('to', e.target.value)}
                type="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Subject *</label>
              <Input
                placeholder="Email subject"
                value={message.subject ?? ''}
                onChange={(e) => handleUpdateMessage('subject', e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Template (Optional)</label>
              <Select value={message.template ?? ''} onValueChange={handleSelectTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Select template..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {templates.email.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Message *</label>
              <textarea
                placeholder="Write your message here... Use {{name}}, {{email}} for variables"
                value={message.body}
                onChange={(e) => handleUpdateMessage('body', e.target.value)}
                className="w-full h-32 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm">
                <Paperclip className="h-4 w-4 mr-2" />
                Attach File
              </Button>
              <span className="text-xs text-muted-foreground">{message.body.length} characters</span>
            </div>
          </TabsContent>

          {/* WhatsApp Tab */}
          <TabsContent value="whatsapp" className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Phone Number *</label>
              <Input
                placeholder="+91 98765 43210"
                value={message.to}
                onChange={(e) => handleUpdateMessage('to', e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Template (Optional)</label>
              <Select value={message.template ?? ''} onValueChange={handleSelectTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Select template..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {templates.whatsapp.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Message *</label>
              <textarea
                placeholder="Write your message... Use {{name}}, {{phone}} for variables"
                value={message.body}
                onChange={(e) => handleUpdateMessage('body', e.target.value)}
                className="w-full h-32 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-muted-foreground mt-2">{message.body.length} characters</p>
            </div>

            <p className="text-xs bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded px-3 py-2 text-blue-700 dark:text-blue-400">
              {'💡 Use variables like {{name}}, {{phone}}, {{bookingId}} to personalize messages'}
            </p>
          </TabsContent>

          {/* SMS Tab */}
          <TabsContent value="sms" className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Phone Number *</label>
              <Input
                placeholder="+91 98765 43210"
                value={message.to}
                onChange={(e) => handleUpdateMessage('to', e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Template (Optional)</label>
              <Select value={message.template ?? ''} onValueChange={handleSelectTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Select template..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {templates.sms.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Message *</label>
              <textarea
                placeholder="Write your message (max 160 characters)..."
                value={message.body}
                onChange={(e) => {
                  if (e.target.value.length <= smsCharLimit) {
                    handleUpdateMessage('body', e.target.value);
                  }
                }}
                maxLength={smsCharLimit}
                className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-muted-foreground">
                  {charCount} / {smsCharLimit} characters
                </span>
                {charCount > smsCharLimit * 0.9 && (
                  <Badge variant="destructive" className="text-xs">Over limit</Badge>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
          >
            <Save className="h-4 w-4 mr-2" />
            Save Draft
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={isSending || !message.to || !message.body}
            >
              <Send className="h-4 w-4 mr-2" />
              {isSending ? 'Sending...' : 'Send'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
