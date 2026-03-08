'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Save, Eye, Mail, MessageSquare, Phone, Loader2, Variable, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { templatesApi } from '@/lib/api/templates';

type TemplateChannel = 'email' | 'sms' | 'whatsapp';

const templateCategories: { value: string; label: string }[] = [
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
  { key: '{destination}', label: 'Destination' },
  { key: '{travel_date}', label: 'Travel Date' },
  { key: '{amount}', label: 'Amount' },
  { key: '{booking_ref}', label: 'Booking Ref' },
  { key: '{agent_name}', label: 'Agent Name' },
  { key: '{invoice_number}', label: 'Invoice Number' },
  { key: '{company_email}', label: 'Company Email' },
];

export default function EditTemplatePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [name, setName] = React.useState('');
  const [channel, setChannel] = React.useState<TemplateChannel>('email');
  const [category, setCategory] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');
  const [language, setLanguage] = React.useState('en');
  const [showPreview, setShowPreview] = React.useState(false);
  const [initialized, setInitialized] = React.useState(false);

  const bodyRef = React.useRef<HTMLTextAreaElement>(null);

  const { data: response, loading: loadingTemplate } = useApiQuery(
    () => templatesApi.getById(id),
    [id],
  );

  const template = response?.data;

  React.useEffect(() => {
    if (template && !initialized) {
      setName(template.name);
      setChannel(template.channel as TemplateChannel);
      setCategory(template.category ?? '');
      setSubject(template.subject ?? '');
      setBody(template.content);
      setLanguage(template.language ?? 'en');
      setInitialized(true);
    }
  }, [template, initialized]);

  const { mutate: updateTemplate, loading: isSaving } = useApiMutation(
    (data: Parameters<typeof templatesApi.update>[1]) => templatesApi.update(id, data),
  );

  const { mutate: deleteTemplate, loading: isDeleting } = useApiMutation(
    () => templatesApi.delete(id),
  );

  const insertVariable = (variable: string) => {
    const textarea = bodyRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newBody = body.substring(0, start) + variable + body.substring(end);
      setBody(newBody);
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
      .replace(/\{customer_name\}/g, 'John Doe')
      .replace(/\{first_name\}/g, 'John')
      .replace(/\{email\}/g, 'john@example.com')
      .replace(/\{phone\}/g, '+91 98765 43210')
      .replace(/\{destination\}/g, 'Maldives')
      .replace(/\{travel_date\}/g, '2026-04-15')
      .replace(/\{amount\}/g, 'INR 1,50,000')
      .replace(/\{booking_ref\}/g, 'TCM-2026-0042')
      .replace(/\{agent_name\}/g, 'Sarah')
      .replace(/\{invoice_number\}/g, 'INV-2026-0042')
      .replace(/\{company_email\}/g, 'support@travelcrm.io');
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Please enter a template name'); return; }
    if (!body.trim()) { toast.error('Please enter template content'); return; }
    if (channel === 'email' && !subject.trim()) { toast.error('Please enter an email subject'); return; }

    const result = await updateTemplate({
      name,
      channel,
      category: category || undefined,
      subject: channel === 'email' ? subject : undefined,
      content: body,
      language,
    });

    if (result) {
      toast.success('Template updated successfully!');
      router.push('/communication/templates');
    } else {
      toast.error('Failed to update template');
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) return;
    const result = await deleteTemplate(undefined as never);
    if (result) {
      toast.success('Template deleted');
      router.push('/communication/templates');
    } else {
      toast.error('Failed to delete template');
    }
  };

  if (loadingTemplate && !initialized) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="flex-1 p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

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
              Edit Template
            </h1>
            <p className="text-sm text-muted-foreground">{name || 'Loading...'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Delete
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
            <Eye className="h-4 w-4 mr-1.5" />
            Preview
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving || isDeleting}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-3 gap-6">
            {/* Left: Form */}
            <div className="col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Template Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-sm mb-1.5 block">
                      Template Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Welcome Email - Standard"
                      className="h-9"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm mb-1.5 block">
                        Channel <span className="text-destructive">*</span>
                      </Label>
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
                      <Label className="text-sm mb-1.5 block">Category</Label>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {templateCategories.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm mb-1.5 block">Language</Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger className="h-9 w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="hi">Hindi</SelectItem>
                        <SelectItem value="ta">Tamil</SelectItem>
                        <SelectItem value="te">Telugu</SelectItem>
                        <SelectItem value="mr">Marathi</SelectItem>
                        <SelectItem value="gu">Gujarati</SelectItem>
                        <SelectItem value="ar">Arabic</SelectItem>
                        <SelectItem value="fr">French</SelectItem>
                        <SelectItem value="de">German</SelectItem>
                        <SelectItem value="es">Spanish</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {channel === 'email' && (
                    <div>
                      <Label className="text-sm mb-1.5 block">
                        Subject <span className="text-destructive">*</span>
                      </Label>
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
                        <span className="text-muted-foreground text-xs">{v.label}</span>
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
                    <li>Use <code className="text-primary">{'{customer_name}'}</code> style variables</li>
                    <li>Keep SMS under 160 chars for single segment</li>
                    <li>WhatsApp templates may need Twilio approval</li>
                    <li>Preview before saving to verify formatting</li>
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
                <p className="text-sm font-medium">
                  {subject
                    .replace(/\{customer_name\}/g, 'John Doe')
                    .replace(/\{first_name\}/g, 'John')
                    .replace(/\{destination\}/g, 'Maldives')}
                </p>
              </div>
            )}

            <Separator />

            <div className="rounded-lg border p-4 bg-muted/30 min-h-[200px]">
              <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
                {getPreviewBody() || 'No content yet'}
              </pre>
            </div>

            <p className="text-xs text-muted-foreground">
              Variables shown with sample data. Actual values filled at send time.
            </p>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
