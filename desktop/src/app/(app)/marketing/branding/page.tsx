'use client';

import * as React from 'react';
import {
  Palette, Upload, Save, Loader2, RotateCcw, Type, FileText, Image,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { marketingApi, type CompanyBranding, type UpdateBrandingRequest } from '@/lib/api/marketing';

const presetColors = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Slate', value: '#475569' },
];

const fontOptions = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Poppins', label: 'Poppins' },
  { value: 'Roboto', label: 'Roboto' },
  { value: 'Open Sans', label: 'Open Sans' },
  { value: 'Lato', label: 'Lato' },
  { value: 'Montserrat', label: 'Montserrat' },
];

export default function BrandingPage() {
  const [primaryColor, setPrimaryColor] = React.useState('#3b82f6');
  const [secondaryColor, setSecondaryColor] = React.useState('#6366f1');
  const [fontFamily, setFontFamily] = React.useState('Inter');
  const [logoUrl, setLogoUrl] = React.useState('');
  const [tagline, setTagline] = React.useState('');
  const [emailFooter, setEmailFooter] = React.useState('');
  const [customCss, setCustomCss] = React.useState('');

  const { data: brandingResponse, loading: loadingBranding } = useApiQuery<any>(
    () => marketingApi.branding.get(),
    [],
  );

  const { mutate: updateBranding, loading: saving } = useApiMutation(
    (data: UpdateBrandingRequest) => marketingApi.branding.update(data),
  );

  // Populate form from API response
  React.useEffect(() => {
    const branding: CompanyBranding | undefined = brandingResponse?.data;
    if (branding) {
      if (branding.primaryColor) setPrimaryColor(branding.primaryColor);
      if (branding.secondaryColor) setSecondaryColor(branding.secondaryColor);
      if (branding.fontFamily) setFontFamily(branding.fontFamily);
      if (branding.logoUrl) setLogoUrl(branding.logoUrl);
      if (branding.customCss) setCustomCss(branding.customCss);
    }
  }, [brandingResponse]);

  async function handleSave() {
    const result = await updateBranding({
      primaryColor,
      secondaryColor,
      fontFamily,
      logoUrl: logoUrl || undefined,
      customCss: customCss || undefined,
    });

    if (result) {
      toast.success('Branding settings saved');
    } else {
      toast.error('Failed to save branding settings');
    }
  }

  function handleReset() {
    setPrimaryColor('#3b82f6');
    setSecondaryColor('#6366f1');
    setFontFamily('Inter');
    setTagline('');
    setEmailFooter('');
    setCustomCss('');
    toast.info('Reset to defaults');
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Branding
          </h1>
          <p className="text-sm text-muted-foreground">Customize your company's visual identity</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-1.5" /> Reset
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save Changes
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto grid grid-cols-5 gap-6">
          {/* Left: Settings */}
          <div className="col-span-3 space-y-6">
            {/* Colors */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Palette className="h-4 w-4" /> Colors
                </CardTitle>
                <CardDescription>Choose your brand colors</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label>Primary Color</Label>
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-lg border-2 cursor-pointer"
                      style={{ backgroundColor: primaryColor }}
                    />
                    <Input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-28 font-mono text-sm"
                    />
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-8 w-8 cursor-pointer"
                    />
                  </div>
                  <div className="flex gap-2">
                    {presetColors.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => setPrimaryColor(c.value)}
                        className={cn(
                          'h-7 w-7 rounded-md border-2 transition-all',
                          primaryColor === c.value ? 'border-foreground scale-110' : 'border-transparent',
                        )}
                        style={{ backgroundColor: c.value }}
                        title={c.name}
                      />
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <Label>Secondary Color</Label>
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-lg border-2 cursor-pointer"
                      style={{ backgroundColor: secondaryColor }}
                    />
                    <Input
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="w-28 font-mono text-sm"
                    />
                    <input
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="h-8 w-8 cursor-pointer"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Logo */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Image className="h-4 w-4" /> Logo
                </CardTitle>
                <CardDescription>Upload your company logo</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  {logoUrl ? (
                    <div className="space-y-3">
                      <img src={logoUrl} alt="Logo" className="h-16 mx-auto object-contain" />
                      <Button variant="outline" size="sm" onClick={() => setLogoUrl('')}>
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Drag and drop or click to upload
                      </p>
                      <p className="text-xs text-muted-foreground">PNG, JPG, SVG up to 5MB</p>
                      <Button variant="outline" size="sm">
                        <Upload className="h-4 w-4 mr-1.5" /> Upload Logo
                      </Button>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Logo URL (alternative)</Label>
                  <Input
                    placeholder="https://example.com/logo.png"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Typography */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Type className="h-4 w-4" /> Typography
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Font Family</Label>
                  <Select value={fontFamily} onValueChange={setFontFamily}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fontOptions.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Tagline & Footer */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Content
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Company Tagline</Label>
                  <Input
                    placeholder="Your trusted travel partner"
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email Footer Text</Label>
                  <Textarea
                    placeholder="Footer text for marketing emails..."
                    value={emailFooter}
                    onChange={(e) => setEmailFooter(e.target.value)}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right: Preview */}
          <div className="col-span-2 space-y-6">
            <Card className="sticky top-0">
              <CardHeader>
                <CardTitle className="text-base">Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-hidden">
                  {/* Simulated Header */}
                  <div
                    className="p-4 text-white"
                    style={{ backgroundColor: primaryColor, fontFamily }}
                  >
                    <div className="flex items-center gap-3">
                      {logoUrl ? (
                        <img src={logoUrl} alt="Logo" className="h-8 w-8 object-contain bg-white rounded p-0.5" />
                      ) : (
                        <div className="h-8 w-8 rounded bg-white/20 flex items-center justify-center text-xs font-bold">
                          TC
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-sm">TravelCRM Pro</p>
                        {tagline && <p className="text-xs opacity-80">{tagline}</p>}
                      </div>
                    </div>
                  </div>
                  {/* Simulated Body */}
                  <div className="p-4 space-y-3" style={{ fontFamily }}>
                    <p className="text-sm font-medium">Sample Email Preview</p>
                    <p className="text-xs text-muted-foreground">
                      This is how your emails and documents will look with the current branding settings.
                    </p>
                    <button
                      className="text-xs px-3 py-1.5 rounded text-white"
                      style={{ backgroundColor: secondaryColor }}
                    >
                      Call to Action
                    </button>
                  </div>
                  {/* Simulated Footer */}
                  <div className="border-t p-3 bg-muted/50" style={{ fontFamily }}>
                    <p className="text-[10px] text-muted-foreground text-center">
                      {emailFooter || 'Your company footer text will appear here'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
