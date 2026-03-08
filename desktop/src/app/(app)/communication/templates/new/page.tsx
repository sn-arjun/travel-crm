'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Save, Eye, Mail, MessageSquare, Phone, Loader2, Variable,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { templatesApi } from '@/lib/api/templates';
import { useApiMutation } from '@/hooks/use-api';

type TemplateChannel = 'email' | 'sms' | 'whatsapp';

const categories: { value: string; label: string }[] = [
  { value: 'greeting', label: 'Greeting / Welcome' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'quotation', label: 'Quotation / Proposal' },
  { value: 'booking', label: 'Booking Confirmation' },
  { value: 'reminder', label: 'Payment Reminder' },
  { value: 'wish', label: 'Thank You / Wish' },
  { value: 'offer', label: 'Promotional / Offer' },
  { value: 'visa', label: 'Visa / Travel Docs' },
];

const availableVariables = [
  { key: '{customer_name}', label: 'Contact Name' },
  { key: '{first_name}', label: 'First Name' },
  { key: '{email}', label: 'Email' },
  { key: '{phone}', label: 'Phone' },
  { key: '{company}', label: 'Company' },
  { key: '{destination}', label: 'Destination' },
  { key: '{travel_date}', label: 'Travel Date' },
  { key: '{amount}', label: 'Amount' },
  { key: '{booking_ref}', label: 'Booking Ref' },
  { key: '{agent_name}', label: 'Agent Name' },
];

export default function NewTemplatePage() {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [channel, setChannel] = React.useState<TemplateChannel>('email');
  const [category, setCategory] = React.useState('');
  const [language, setLanguage] = React.useState('en');
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');
  const [showPreview, setShowPreview] = React.useState(false);

  const { mutate: createTemplate, loading: isSaving } = useApiMutation(
    (data: Parameters<typeof templatesApi.create>[0]) => templatesApi.create(data),
  );

  const bodyRef = React.useRef<HTMLTextAreaElement>(null);

  const insertVariable = (variable: string) => {
    const textarea = bodyRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newBody = body.substring(0, start) + variable + body.substring(end);
      setBody(newBody);
      // Set cursor position after the inserted variable
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
    } else {
      setBody((prev) => prev + variable);
    }
  };

  const getPreviewBody = () => {
    return body
      .replace(/\{\{name\}\}/g, 'John Doe')
      .replace(/\{\{firstName\}\}/g, 'John')
      .replace(/\{\{email\}\}/g, 'john@example.com')
      .replace(/\{\{phone\}\}/g, '+91 98765 43210')
      .replace(/\{\{company\}\}/g, 'Acme Corp')
      .replace(/\{\{destination\}\}/g, 'Maldives')
      .replace(/\{\{travelDate\}\}/g, '2026-04-15')
      .replace(/\{\{amount\}\}/g, 'INR 1,50,000')
      .replace(/\{\{bookingRef\}\}/g, 'TCM-2026-0042')
      .replace(/\{\{agentName\}\}/g, 'Sarah');
  };

  const getPreviewSubject = () => {
    return subject
      .replace(/\{\{name\}\}/g, 'John Doe')
      .replace(/\{\{firstName\}\}/g, 'John')
      .replace(/\{\{destination\}\}/g, 'Maldives')
      .replace(/\{\{bookingRef\}\}/g, 'TCM-2026-0042');
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Please enter a template name');
      return;
    }
    if (!category) {
      toast.error('Please select a category');
      return;
    }
    if (!body.trim()) {
      toast.error('Please enter template content');
      return;
    }
    if (channel === 'email' && !subject.trim()) {
      toast.error('Please enter an email subject');
      return;
    }

    const result = await createTemplate({
      name,
      channel,
      category,
      language,
      subject: channel === 'email' ? subject : undefined,
      content: body,
    });
    if (result) {
      toast.success('Template saved successfully!');
      router.push('/communication/templates');
    } else {
      toast.error('Failed to save template');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Create Template
            </h1>
            <p className="text-sm text-muted-foreground">Create a new message template</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
            <Eye className="h-4 w-4 mr-1.5" />
            Preview
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            Save Template
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-3 gap-6">
            {/* Left: Form */}
            <div className="col-span-2 space-y-6">
              {/* Basic Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Template Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-sm mb-1.5 block">Template Name *</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Welcome Email - Standard"
                      className="h-9"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-sm mb-1.5 block">Channel *</Label>
                      <Select value={channel} onValueChange={(v) => setChannel(v as TemplateChannel)}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">
                            <span className="flex items-center gap-2">
                              <Mail className="h-3.5 w-3.5" /> Email
                            </span>
                          </SelectItem>
                          <SelectItem value="sms">
                            <span className="flex items-center gap-2">
                              <Phone className="h-3.5 w-3.5" /> SMS
                            </span>
                          </SelectItem>
                          <SelectItem value="whatsapp">
                            <span className="flex items-center gap-2">
                              <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-sm mb-1.5 block">Category *</Label>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-sm mb-1.5 block">Language</Label>
                      <Select value={language} onValueChange={setLanguage}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="hi">Hindi</SelectItem>
                          <SelectItem value="ar">Arabic</SelectItem>
                          <SelectItem value="fr">French</SelectItem>
                          <SelectItem value="de">German</SelectItem>
                          <SelectItem value="es">Spanish</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {channel === 'email' && (
                    <div>
                      <Label className="text-sm mb-1.5 block">Subject *</Label>
                      <Input
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Email subject line (variables allowed)"
                        className="h-9"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Body */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Template Content</CardTitle>
                </CardHeader>
                <CardContent>
                  <textarea
                    ref={bodyRef}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder={`Write your ${channel} template here...\n\nUse variables like {customer_name}, {destination} for personalization.`}
                    className="w-full min-h-[280px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono leading-relaxed resize-none"
                  />
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-muted-foreground">
                      {body.length} characters
                      {channel === 'sms' && body.length > 160 && (
                        <span className="text-amber-600 ml-2">
                          ({Math.ceil(body.length / 160)} SMS segments)
                        </span>
                      )}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right: Variables */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Variable className="h-4 w-4" />
                    Insert Variables
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {availableVariables.map((v) => (
                      <button
                        key={v.key}
                        onClick={() => insertVariable(v.key)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-md text-left text-sm hover:bg-muted transition-colors"
                      >
                        <span className="text-muted-foreground">{v.label}</span>
                        <code className="text-xs font-mono text-primary">{v.key}</code>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Tips</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-xs text-muted-foreground space-y-2">
                    <li>Use variables like <code className="text-primary">{'{customer_name}'}</code> for personalization</li>
                    <li>Keep SMS under 160 chars for single segment</li>
                    <li>WhatsApp templates may need approval</li>
                    <li>Preview before saving to check formatting</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {channel === 'email' && <Mail className="h-3 w-3 mr-1" />}
                {channel === 'sms' && <Phone className="h-3 w-3 mr-1" />}
                {channel === 'whatsapp' && <MessageSquare className="h-3 w-3 mr-1" />}
                {channel.toUpperCase()}
              </Badge>
              {category && <Badge variant="secondary">{category}</Badge>}
            </div>

            {channel === 'email' && subject && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Subject</p>
                <p className="text-sm font-medium">{getPreviewSubject()}</p>
              </div>
            )}

            <Separator />

            <div className="rounded-lg border p-4 bg-muted/30 min-h-[200px]">
              <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
                {getPreviewBody() || 'No content yet'}
              </pre>
            </div>

            <p className="text-xs text-muted-foreground">
              Variables are shown with sample data. Actual values will be filled at send time.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
