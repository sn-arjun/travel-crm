'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Loader2, Eye, EyeOff, Mail, Globe, Phone, Building2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { PageContainer } from '@/components/layout/page-container';
import { color } from '@/design-system/tokens';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { usersApi } from '@/lib/api/users';

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

const DATA_COMMENT_RE = /^<!--travelcrm-signature-data:([\s\S]*?)-->/;

function parseStoredSignature(stored: string): SignatureData {
  const match = stored.match(DATA_COMMENT_RE);
  if (match?.[1]) {
    try {
      return { ...defaultSignature, ...JSON.parse(match[1]) };
    } catch {
      // fall through to default
    }
  }
  return { ...defaultSignature };
}

function serializeSignature(data: SignatureData): string {
  return `<!--travelcrm-signature-data:${JSON.stringify(data)}-->${generatePreviewHtml(data)}`;
}

// Email clients cannot read CSS variables, so the stored signature carries inline
// styles resolved from the design-system tokens (light theme: mail canvases are light).
const SIG_INK = color('foreground', 'light');
const SIG_MUTED = color('foreground-muted', 'light');
const SIG_SUBTLE = color('foreground-subtle', 'light');
const SIG_ACCENT = color('primary', 'light');
const SIG_RULE = color('border', 'light');

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
    lines.push(`<strong style="font-size:0.875rem;color:${SIG_INK};">${esc(data.name)}</strong>`);
  }
  if (data.title) {
    lines.push(`<span style="font-size:0.75rem;color:${SIG_MUTED};">${esc(data.title)}</span>`);
  }
  if (data.company) {
    lines.push(`<span style="font-size:0.75rem;color:${SIG_ACCENT};font-weight:600;">${esc(data.company)}</span>`);
  }

  if (lines.length > 0) {
    parts.push(`<div style="margin-top:0.5rem;">${lines.join('<br/>')}</div>`);
  }

  // Contact details
  const contactLines: string[] = [];
  if (data.phone) {
    contactLines.push(`<span style="font-size:0.75rem;color:${SIG_MUTED};">Phone: ${esc(data.phone)}</span>`);
  }
  if (data.website) {
    const href = data.website.startsWith('http') ? data.website : `https://${data.website}`;
    contactLines.push(`<span style="font-size:0.75rem;"><a href="${esc(href)}" style="color:${SIG_ACCENT};text-decoration:none;">${esc(data.website)}</a></span>`);
  }
  if (contactLines.length > 0) {
    parts.push(`<div style="margin-top:0.25rem;">${contactLines.join(' | ')}</div>`);
  }

  // Logo
  if (data.logoUrl) {
    parts.push(`<div style="margin-top:0.5rem;"><img src="${esc(data.logoUrl)}" alt="Logo" style="max-height:2.5rem;max-width:10rem;" /></div>`);
  }

  if (parts.length === 0) {
    return `<p style="color:${SIG_SUBTLE};font-style:italic;">No signature configured yet. Fill in the fields to preview.</p>`;
  }

  return `<div style="font-family:'Segoe UI',Arial,sans-serif;border-top:0.125rem solid ${SIG_RULE};padding-top:0.75rem;margin-top:1rem;">${parts.join('')}</div>`;
}

export default function EmailSignaturePage() {
  const router = useRouter();
  const [data, setData] = React.useState<SignatureData>(defaultSignature);
  const [showPreview, setShowPreview] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  React.useEffect(() => {
    let cancelled = false;
    usersApi
      .getSignature()
      .then((res) => {
        if (cancelled) return;
        const stored = (res as { data?: { signature?: string } })?.data?.signature;
        if (stored) setData(parseStoredSignature(stored));
      })
      .catch(() => {
        toast.error('Failed to load email signature');
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setField = (field: keyof SignatureData, value: string) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await usersApi.updateSignature(serializeSignature(data));
      toast.success('Email signature saved successfully');
    } catch {
      toast.error('Failed to save email signature');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    const ok = await confirm({
      title: 'Reset email signature?',
      description: 'This clears your saved signature. Outgoing emails will no longer include it.',
      confirmLabel: 'Reset',
      tone: 'destructive',
    });
    if (!ok) return;
    setData({ ...defaultSignature });
    try {
      await usersApi.updateSignature('');
      toast.success('Email signature reset');
    } catch {
      toast.error('Failed to reset email signature');
    }
  };

  const actions = (
    <>
      <Button variant="outline" size="sm" onClick={handleReset} disabled={!loaded}>
        Reset
      </Button>
      <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
        {showPreview ? <EyeOff className="h-4 w-4 mr-1.5" /> : <Eye className="h-4 w-4 mr-1.5" />}
        {showPreview ? 'Hide Preview' : 'Show Preview'}
      </Button>
      <Button onClick={handleSave} disabled={isSaving || !loaded}>
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
        Save Signature
      </Button>
    </>
  );

  const header = (
    <PageHeader
      title="Email signature"
      description="Configure your email signature for outbound communications"
      back={
        <Button variant="ghost" size="icon-sm" onClick={() => router.back()} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
      }
      actions={actions}
    />
  );

  if (!loaded) {
    return (
      <PageContainer>
        {header}
        <Skeleton className="h-96 w-full" />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {header}
      {confirmDialog}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-ds-6">
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
                  minHeight="6rem"
                />
              </CardContent>
            </Card>
          </div>

          {/* Right: Preview */}
          {showPreview && (
            <div className="space-y-4">
              <Card className="lg:sticky lg:top-ds-4">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Signature Preview
                  </CardTitle>
                  <CardDescription>This is how your signature will appear in emails</CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    data-testid="signature-preview"
                    className="rounded-lg border border-ds-border p-ds-5"
                    style={{ backgroundColor: color('surface', 'light'), color: SIG_MUTED }}
                  >
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
    </PageContainer>
  );
}
