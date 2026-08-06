'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Loader2, Eye, EyeOff, Mail, Globe, Phone, Building2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { toast } from 'sonner';

const STORAGE_KEY = 'travelcrm_email_signature';

interface SignatureData {
  name: string;
  title: string;
  company: string;
  phone: string;
  website: string;
  logoUrl: string;
  customHtml: string;
}

const defaultSignature: SignatureData = {
  name: '',
  title: '',
  company: '',
  phone: '',
  website: '',
  logoUrl: '',
  customHtml: '',
};

function loadSignature(): SignatureData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...defaultSignature, ...JSON.parse(stored) };
  } catch {
    // ignore
  }
  return { ...defaultSignature };
}

function generatePreviewHtml(data: SignatureData): string {
  const parts: string[] = [];

  // Custom HTML content (from rich text editor)
  if (data.customHtml && data.customHtml !== '<p></p>') {
    parts.push(data.customHtml);
  }

  // Structured signature
  const lines: string[] = [];

  if (data.name) {
    lines.push(`<strong style="font-size:14px;color:#1f2937;">${data.name}</strong>`);
  }
  if (data.title) {
    lines.push(`<span style="font-size:12px;color:#6b7280;">${data.title}</span>`);
  }
  if (data.company) {
    lines.push(`<span style="font-size:12px;color:#4f46e5;font-weight:600;">${data.company}</span>`);
  }

  if (lines.length > 0) {
    parts.push(`<div style="margin-top:8px;">${lines.join('<br/>')}</div>`);
  }

  // Contact details
  const contactLines: string[] = [];
  if (data.phone) {
    contactLines.push(`<span style="font-size:12px;color:#6b7280;">Phone: ${data.phone}</span>`);
  }
  if (data.website) {
    contactLines.push(`<span style="font-size:12px;"><a href="${data.website.startsWith('http') ? data.website : `https://${data.website}`}" style="color:#4f46e5;text-decoration:none;">${data.website}</a></span>`);
  }
  if (contactLines.length > 0) {
    parts.push(`<div style="margin-top:4px;">${contactLines.join(' | ')}</div>`);
  }

  // Logo
  if (data.logoUrl) {
    parts.push(`<div style="margin-top:8px;"><img src="${data.logoUrl}" alt="Logo" style="max-height:40px;max-width:150px;" /></div>`);
  }

  if (parts.length === 0) {
    return '<p style="color:#9ca3af;font-style:italic;">No signature configured yet. Fill in the fields to preview.</p>';
  }

  return `<div style="font-family:'Segoe UI',Arial,sans-serif;border-top:2px solid #e5e7eb;padding-top:12px;margin-top:16px;">${parts.join('')}</div>`;
}

export default function EmailSignaturePage() {
  const router = useRouter();
  const [data, setData] = React.useState<SignatureData>(defaultSignature);
  const [showPreview, setShowPreview] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  // Load from localStorage on mount
  React.useEffect(() => {
    setData(loadSignature());
    setLoaded(true);
  }, []);

  const setField = (field: keyof SignatureData, value: string) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      toast.success('Email signature saved successfully');
    } catch {
      toast.error('Failed to save email signature');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (!confirm('Are you sure you want to reset the email signature?')) return;
    setData({ ...defaultSignature });
    localStorage.removeItem(STORAGE_KEY);
    toast.success('Email signature reset');
  };

  if (!loaded) return null;

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
              Email Signature
            </h1>
            <p className="text-sm text-muted-foreground">Configure your email signature for outbound communications</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReset}>
            Reset
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? <EyeOff className="h-4 w-4 mr-1.5" /> : <Eye className="h-4 w-4 mr-1.5" />}
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save Signature
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Form */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contact Information</CardTitle>
                <CardDescription>These fields will be auto-formatted into your signature</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sig-name" className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    Full Name
                  </Label>
                  <Input
                    id="sig-name"
                    value={data.name}
                    onChange={(e) => setField('name', e.target.value)}
                    placeholder="e.g., Rajesh Kumar"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sig-title" className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    Title / Role
                  </Label>
                  <Input
                    id="sig-title"
                    value={data.title}
                    onChange={(e) => setField('title', e.target.value)}
                    placeholder="e.g., Senior Travel Consultant"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sig-company" className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    Company Name
                  </Label>
                  <Input
                    id="sig-company"
                    value={data.company}
                    onChange={(e) => setField('company', e.target.value)}
                    placeholder="e.g., TravelCRM Pro"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sig-phone" className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      Phone
                    </Label>
                    <Input
                      id="sig-phone"
                      value={data.phone}
                      onChange={(e) => setField('phone', e.target.value)}
                      placeholder="+91 98765 43210"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sig-website" className="flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                      Website
                    </Label>
                    <Input
                      id="sig-website"
                      value={data.website}
                      onChange={(e) => setField('website', e.target.value)}
                      placeholder="www.example.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sig-logo">Logo URL</Label>
                  <Input
                    id="sig-logo"
                    value={data.logoUrl}
                    onChange={(e) => setField('logoUrl', e.target.value)}
                    placeholder="https://example.com/logo.png"
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste a direct URL to your company logo image (recommended: 150px wide max)
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Custom Content</CardTitle>
                <CardDescription>Add additional text, taglines, or formatted content above the signature block</CardDescription>
              </CardHeader>
              <CardContent>
                <RichTextEditor
                  value={data.customHtml}
                  onChange={(html) => setField('customHtml', html)}
                  placeholder="Add custom content... e.g., a tagline or promotional message"
                  minHeight="100px"
                />
              </CardContent>
            </Card>
          </div>

          {/* Right: Preview */}
          {showPreview && (
            <div className="space-y-4">
              <Card className="sticky top-0">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Signature Preview
                  </CardTitle>
                  <CardDescription>This is how your signature will appear in emails</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-white dark:bg-zinc-900 rounded-lg border p-6">
                    {/* Simulated email body */}
                    <div className="space-y-3 text-sm">
                      <p className="text-muted-foreground">Dear Client,</p>
                      <p className="text-muted-foreground">Thank you for reaching out. Please find the details below.</p>
                      <p className="text-muted-foreground">Best regards,</p>
                    </div>

                    {/* Signature */}
                    <div
                      className="mt-4"
                      dangerouslySetInnerHTML={{ __html: generatePreviewHtml(data) }}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">HTML Source</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-48 whitespace-pre-wrap break-all">
                    {generatePreviewHtml(data)}
                  </pre>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
