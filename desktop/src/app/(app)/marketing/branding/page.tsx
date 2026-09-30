'use client';

import * as React from 'react';
import { z } from 'zod';
import { toast } from 'sonner';
import { EntityForm, FormRow } from '@/components/domain';
import { Input, SectionCard, Skeleton } from '@/components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileDropzone } from '@/components/ui/file-dropzone';
import { marketingApi, type CompanyBranding } from '@/lib/api/marketing';

const fontOptions = ['Inter', 'Poppins', 'Roboto', 'Open Sans', 'Lato', 'Montserrat'];

const HEX_CHARS = 'a-fA-F';
const hexColorPattern = new RegExp(`^\\u0023[0-9${HEX_CHARS}]{3}(?:[0-9${HEX_CHARS}]{3})?(?:[0-9${HEX_CHARS}]{2})?$`);

function isPickableColor(value: string): boolean {
  return hexColorPattern.test(value);
}

const schema = z.object({
  primaryColor: z.string().min(1, 'Primary color is required'),
  secondaryColor: z.string().min(1, 'Secondary color is required'),
  fontFamily: z.string().min(1, 'Font is required'),
  logoUrl: z.string().optional(),
  customCss: z.string().optional(),
});
type BrandingForm = z.infer<typeof schema>;

export default function BrandingPage() {
  const [branding, setBranding] = React.useState<CompanyBranding | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [logoUrl, setLogoUrl] = React.useState('');
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await marketingApi.branding.get();
        if (!cancelled) {
          setBranding(res.data);
          setLogoUrl(res.data.logoUrl ?? '');
        }
      } catch {
        if (!cancelled) toast.error('Failed to load branding settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function handleLogoUpload(files: File[]) {
    const file = files[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await marketingApi.images.uploadLogo(file);
      setLogoUrl(res.data.url);
      toast.success('Logo uploaded');
    } catch {
      toast.error('Failed to upload logo');
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-ds-4 p-ds-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <EntityForm<BrandingForm>
      title="Branding"
      description="Customize your company's visual identity."
      schema={schema}
      defaultValues={{
        primaryColor: branding?.primaryColor ?? '',
        secondaryColor: branding?.secondaryColor ?? '',
        fontFamily: branding?.fontFamily ?? 'Inter',
        logoUrl: branding?.logoUrl ?? '',
        customCss: branding?.customCss ?? '',
      }}
      onSubmit={async (values) => {
        try {
          await marketingApi.branding.update({
            primaryColor: values.primaryColor,
            secondaryColor: values.secondaryColor,
            fontFamily: values.fontFamily,
            logoUrl: logoUrl || undefined,
            customCss: values.customCss || undefined,
          });
          toast.success('Branding settings saved');
          setReloadKey((k) => k + 1);
        } catch {
          toast.error('Failed to save branding settings');
        }
      }}
      renderSections={(form) => {
        const data = form.watch();
        return (
          <div className="grid gap-ds-6 lg:grid-cols-5">
            <div className="flex flex-col gap-ds-4 lg:col-span-3">
              <SectionCard title="Colors" description="Choose your brand colors" required>
                <div className="grid gap-ds-4 sm:grid-cols-2">
                  <FormRow name="primaryColor" label="Primary color" required>
                    <div className="flex items-center gap-ds-2">
                      {isPickableColor(data.primaryColor) && (
                        <input
                          type="color"
                          value={data.primaryColor}
                          onChange={(e) => form.setValue('primaryColor', e.target.value, { shouldDirty: true })}
                          aria-label="Pick primary color"
                          className="size-9 shrink-0 cursor-pointer rounded-ds-md border border-ds-border bg-transparent p-0"
                        />
                      )}
                      <Input
                        {...form.register('primaryColor')}
                        id="primaryColor"
                        className="font-mono text-sm"
                        placeholder="e.g. your brand hex"
                      />
                    </div>
                  </FormRow>
                  <FormRow name="secondaryColor" label="Secondary color" required>
                    <div className="flex items-center gap-ds-2">
                      {isPickableColor(data.secondaryColor) && (
                        <input
                          type="color"
                          value={data.secondaryColor}
                          onChange={(e) => form.setValue('secondaryColor', e.target.value, { shouldDirty: true })}
                          aria-label="Pick secondary color"
                          className="size-9 shrink-0 cursor-pointer rounded-ds-md border border-ds-border bg-transparent p-0"
                        />
                      )}
                      <Input
                        {...form.register('secondaryColor')}
                        id="secondaryColor"
                        className="font-mono text-sm"
                        placeholder="e.g. your brand hex"
                      />
                    </div>
                  </FormRow>
                </div>
              </SectionCard>

              <SectionCard title="Logo" description="Upload your company logo">
                <div className="flex flex-col gap-ds-4">
                  {logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="Logo" className="h-16 object-contain" />
                  )}
                  <FileDropzone
                    onFiles={(files) => void handleLogoUpload(files)}
                    accept="image/png,image/jpeg,image/svg+xml"
                    maxSize={5 * 1024 * 1024}
                    disabled={uploading}
                    label={uploading ? 'Uploading…' : 'Drag and drop or click to upload'}
                    hint="PNG, JPG, SVG up to 5MB"
                  />
                  <FormRow name="logoUrl" label="Logo URL (alternative)" hint="Paste a URL instead of uploading">
                    <Input
                      id="logoUrl"
                      placeholder="https://example.com/logo.png"
                      value={logoUrl}
                      onChange={(e) => {
                        setLogoUrl(e.target.value);
                        form.setValue('logoUrl', e.target.value, { shouldDirty: true });
                      }}
                    />
                  </FormRow>
                </div>
              </SectionCard>

              <SectionCard title="Typography">
                <FormRow name="fontFamily" label="Font family" required>
                  <Select
                    value={data.fontFamily}
                    onValueChange={(v) => form.setValue('fontFamily', v, { shouldDirty: true })}
                  >
                    <SelectTrigger id="fontFamily">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fontOptions.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormRow>
              </SectionCard>
            </div>

            <div className="lg:col-span-2">
              <SectionCard title="Preview">
                <div className="overflow-hidden rounded-ds-lg border border-ds-border">
                  <div
                    className="flex items-center gap-ds-3 p-ds-4"
                    style={{ backgroundColor: data.primaryColor, fontFamily: data.fontFamily }}
                  >
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoUrl} alt="Logo" className="size-8 rounded bg-white object-contain p-0.5" />
                    ) : (
                      <div className="flex size-8 items-center justify-center rounded bg-white/20 text-xs font-bold text-white">
                        TC
                      </div>
                    )}
                    <p className="text-sm font-bold text-white">TravelCRM Pro</p>
                  </div>
                  <div className="space-y-ds-3 p-ds-4" style={{ fontFamily: data.fontFamily }}>
                    <p className="text-sm font-medium text-ds-foreground">Sample email preview</p>
                    <p className="text-xs text-ds-foreground-muted">
                      This is how your emails and documents will look with the current branding settings.
                    </p>
                    <button
                      type="button"
                      className="rounded-ds-md px-ds-3 py-ds-2 text-xs text-white"
                      style={{ backgroundColor: data.secondaryColor }}
                    >
                      Call to action
                    </button>
                  </div>
                </div>
              </SectionCard>
            </div>
          </div>
        );
      }}
    />
  );
}
