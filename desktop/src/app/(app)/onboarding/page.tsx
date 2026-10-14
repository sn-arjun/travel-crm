'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Globe, Upload, CheckCircle2, Loader2, ArrowRight, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { FileDropzone } from '@/components/ui/file-dropzone';
import { Skeleton } from '@/components/ui/skeleton';
import { PageContainer } from '@/components/layout/page-container';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { onboardingApi } from '@/lib/api/onboarding';
import { useAuthStore } from '@/stores/auth-store';

const STEPS = [
  { id: 'company', label: 'Company Details', icon: Building2 },
  { id: 'regional', label: 'Regional Settings', icon: Globe },
  { id: 'branding', label: 'Branding', icon: Upload },
  { id: 'done', label: 'All Set', icon: CheckCircle2 },
] as const;

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'THB', 'AUD'];
const TIMEZONES = [
  'Asia/Kolkata',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Dubai',
  'Asia/Singapore',
  'Australia/Sydney',
];
const TAX_SYSTEMS = [
  { value: 'gst', label: 'GST (India)' },
  { value: 'vat', label: 'VAT' },
  { value: 'sales_tax', label: 'Sales tax' },
  { value: 'none', label: 'No tax' },
];

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

interface FormState {
  company_name: string;
  company_email: string;
  company_phone: string;
  company_website: string;
  company_address: string;
  company_city: string;
  company_state: string;
  company_country: string;
  company_postal_code: string;
  timezone: string;
  currency: string;
  language: string;
  tax_system: string;
}

const EMPTY: FormState = {
  company_name: '',
  company_email: '',
  company_phone: '',
  company_website: '',
  company_address: '',
  company_city: '',
  company_state: '',
  company_country: '',
  company_postal_code: '',
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  language: 'en',
  tax_system: 'gst',
};

const COMPANY_FIELDS: Array<keyof FormState> = [
  'company_name',
  'company_email',
  'company_phone',
  'company_website',
  'company_address',
  'company_city',
  'company_state',
  'company_country',
  'company_postal_code',
];
const REGIONAL_FIELDS: Array<keyof FormState> = ['timezone', 'currency', 'language', 'tax_system'];

function pick(form: FormState, keys: Array<keyof FormState>): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, form[k]]));
}

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [invoicePrefix, setInvoicePrefix] = React.useState('INV');
  const [logo, setLogo] = React.useState<File | null>(null);
  const [logoPreview, setLogoPreview] = React.useState<string | null>(null);
  const [nameError, setNameError] = React.useState('');

  const update = (key: keyof FormState, value: string) => setForm((f) => ({ ...f, [key]: value }));

  // Start from what the agency already has (the provisioner stored name, email, country, currency, timezone and tax system).
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [raw, prefix] = await Promise.all([onboardingApi.getRaw(), onboardingApi.getInvoicePrefix().catch(() => 'INV')]);
        if (cancelled) return;
        setForm((f) => {
          const next = { ...f };
          for (const key of Object.keys(EMPTY) as Array<keyof FormState>) {
            const stored = raw[key];
            if (typeof stored === 'string' && stored !== '') next[key] = stored;
          }
          return next;
        });
        setInvoicePrefix(prefix || 'INV');
      } catch {
        // Empty form: the wizard still works and saves what the user types.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!logo) {
      setLogoPreview(null);
      return;
    }
    const url = URL.createObjectURL(logo);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);

  async function finishAndLeave(markDone: boolean) {
    if (markDone) await onboardingApi.complete();
    const store = useAuthStore.getState();
    store.setOnboardingPending(false);
    if (store.tenant && form.company_name.trim()) store.setTenant({ ...store.tenant, name: form.company_name.trim() });
  }

  async function saveStep(stepId: (typeof STEPS)[number]['id']) {
    if (stepId === 'company') {
      await onboardingApi.save(pick(form, COMPANY_FIELDS));
    } else if (stepId === 'regional') {
      await onboardingApi.save(pick(form, REGIONAL_FIELDS));
      await onboardingApi.setInvoicePrefix(invoicePrefix.trim() || 'INV');
    } else if (stepId === 'branding') {
      if (logo) {
        const logoValue = await onboardingApi.uploadLogo(logo);
        await onboardingApi.save({ company_logo: logoValue });
      }
      await finishAndLeave(true);
    }
  }

  async function handleNext() {
    const stepId = STEPS[currentStep]!.id;
    if (stepId === 'company' && !form.company_name.trim()) {
      setNameError('Company name is required');
      return;
    }
    setNameError('');
    setIsLoading(true);
    try {
      await saveStep(stepId);
      setCurrentStep((s) => s + 1);
    } catch (err) {
      toast.error((err as { message?: string } | null)?.message || 'Failed to save settings');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSkip() {
    setIsLoading(true);
    try {
      await finishAndLeave(true);
      router.push('/dashboard');
    } catch {
      toast.error('Could not skip setup. Try again.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleBack() {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  }

  const stepId = STEPS[currentStep]!.id;
  const timezones = TIMEZONES.includes(form.timezone) ? TIMEZONES : [form.timezone, ...TIMEZONES];
  const currencies = CURRENCIES.includes(form.currency) ? CURRENCIES : [form.currency, ...CURRENCIES];

  return (
    <PageContainer width="narrow" className="gap-ds-6">
      <div className="flex items-start justify-between gap-ds-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome to TravelCRM Pro</h1>
          <p className="mt-1 text-ds-foreground-muted">Let&apos;s set up your workspace in a few quick steps.</p>
        </div>
        {stepId !== 'done' && (
          <Button variant="ghost" onClick={() => void handleSkip()} disabled={isLoading} data-testid="onboarding-skip">
            Skip for now
          </Button>
        )}
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-ds-2">
        {STEPS.map((step, i) => {
          const StepIcon = step.icon;
          const isActive = i === currentStep;
          const isDone = i < currentStep;
          return (
            <React.Fragment key={step.id}>
              {i > 0 && <div className={`h-0.5 flex-1 ${isDone ? 'bg-ds-primary' : 'bg-ds-border'}`} />}
              <div
                aria-label={step.label}
                aria-current={isActive ? 'step' : undefined}
                className={`flex size-10 items-center justify-center rounded-full border-2 transition-colors ${
                  isActive
                    ? 'border-ds-primary bg-ds-primary text-ds-primary-foreground'
                    : isDone
                      ? 'border-ds-primary bg-ds-primary-subtle text-ds-primary'
                      : 'border-ds-border bg-ds-surface-sunken text-ds-foreground-muted'
                }`}
              >
                {isDone ? <CheckCircle2 className="size-5" /> : <StepIcon className="size-5" />}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {!loaded && stepId !== 'done' ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <>
          {/* Step 1: Company Details */}
          {stepId === 'company' && (
            <Card>
              <CardHeader>
                <CardTitle>Company Details</CardTitle>
                <CardDescription>Tell us about your travel agency</CardDescription>
              </CardHeader>
              <CardContent className="space-y-ds-4">
                <div className="grid grid-cols-2 gap-ds-4">
                  <div className="col-span-2 space-y-ds-2">
                    <Label htmlFor="company_name">Company Name</Label>
                    <Input id="company_name" value={form.company_name} onChange={(e) => update('company_name', e.target.value)} placeholder="Acme Travel Agency" aria-invalid={!!nameError} />
                    {nameError && <p role="alert" className="text-xs text-ds-danger">{nameError}</p>}
                  </div>
                  <div className="space-y-ds-2">
                    <Label htmlFor="company_email">Email</Label>
                    <Input id="company_email" type="email" value={form.company_email} onChange={(e) => update('company_email', e.target.value)} placeholder="info@company.com" />
                  </div>
                  <div className="space-y-ds-2">
                    <Label>Phone</Label>
                    <PhoneInput value={form.company_phone} onChange={(value) => update('company_phone', value)} />
                  </div>
                  <div className="col-span-2 space-y-ds-2">
                    <Label htmlFor="company_website">Website</Label>
                    <Input id="company_website" value={form.company_website} onChange={(e) => update('company_website', e.target.value)} placeholder="https://company.com" />
                  </div>
                  <div className="col-span-2 space-y-ds-2">
                    <Label htmlFor="company_address">Address</Label>
                    <Input id="company_address" value={form.company_address} onChange={(e) => update('company_address', e.target.value)} placeholder="123 Travel Lane" />
                  </div>
                  <div className="space-y-ds-2">
                    <Label htmlFor="company_city">City</Label>
                    <Input id="company_city" value={form.company_city} onChange={(e) => update('company_city', e.target.value)} placeholder="Mumbai" />
                  </div>
                  <div className="space-y-ds-2">
                    <Label htmlFor="company_state">State</Label>
                    <Input id="company_state" value={form.company_state} onChange={(e) => update('company_state', e.target.value)} placeholder="Maharashtra" />
                  </div>
                  <div className="space-y-ds-2">
                    <Label htmlFor="company_country">Country</Label>
                    <Input id="company_country" value={form.company_country} onChange={(e) => update('company_country', e.target.value)} placeholder="India" />
                  </div>
                  <div className="space-y-ds-2">
                    <Label htmlFor="company_postal_code">Postal Code</Label>
                    <Input id="company_postal_code" value={form.company_postal_code} onChange={(e) => update('company_postal_code', e.target.value)} placeholder="400001" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Regional Settings */}
          {stepId === 'regional' && (
            <Card>
              <CardHeader>
                <CardTitle>Regional Settings</CardTitle>
                <CardDescription>Timezone, currency, language, tax and how your invoices are numbered</CardDescription>
              </CardHeader>
              <CardContent className="space-y-ds-4">
                <div className="space-y-ds-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select value={form.timezone} onValueChange={(v) => update('timezone', v)}>
                    <SelectTrigger id="timezone"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {timezones.map((tz) => (
                        <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-ds-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select value={form.currency} onValueChange={(v) => update('currency', v)}>
                    <SelectTrigger id="currency"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {currencies.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-ds-2">
                  <Label htmlFor="language">Language</Label>
                  <Select value={form.language} onValueChange={(v) => update('language', v)}>
                    <SelectTrigger id="language"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="hi">Hindi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-ds-2">
                  <Label htmlFor="tax_system">Tax system</Label>
                  <Select value={form.tax_system} onValueChange={(v) => update('tax_system', v)}>
                    <SelectTrigger id="tax_system"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TAX_SYSTEMS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-ds-2">
                  <Label htmlFor="invoice_prefix">Invoice number prefix</Label>
                  <Input id="invoice_prefix" value={invoicePrefix} maxLength={10} onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())} placeholder="INV" />
                  <p className="text-xs text-ds-foreground-muted">Other document prefixes can be changed later in Settings &gt; Document Numbering.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Branding */}
          {stepId === 'branding' && (
            <Card>
              <CardHeader>
                <CardTitle>Branding</CardTitle>
                <CardDescription>Upload your company logo (optional)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-ds-4">
                {logoPreview && (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not a remote asset
                  <img src={logoPreview} alt="Logo preview" className="size-24 rounded-ds-md border border-ds-border object-contain" />
                )}
                <FileDropzone
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  maxSize={MAX_LOGO_BYTES}
                  label="Drop your logo here, or browse"
                  hint="PNG, JPG, SVG or WebP up to 2MB. Recommended: 256x256px"
                  files={logo ? [logo] : []}
                  onFiles={(files) => setLogo(files[0] ?? null)}
                  onRemove={() => setLogo(null)}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Step 4: Done */}
      {stepId === 'done' && (
        <Card>
          <CardContent className="space-y-ds-4 py-12 text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-ds-success-subtle">
              <CheckCircle2 className="size-8 text-ds-success" />
            </div>
            <h2 className="text-2xl font-bold">You&apos;re all set!</h2>
            <p className="mx-auto max-w-md text-ds-foreground-muted">
              Your workspace is configured. You can always update these settings later from Settings &gt; Company.
            </p>
            <Button size="lg" onClick={() => router.push('/dashboard')} className="gap-ds-2">
              Go to Dashboard
              <ArrowRight className="size-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      {stepId !== 'done' && (
        <div className="flex justify-between">
          <Button variant="outline" onClick={handleBack} disabled={currentStep === 0 || isLoading} className="gap-ds-2">
            <ArrowLeft className="size-4" /> Back
          </Button>
          <Button onClick={() => void handleNext()} disabled={isLoading || !loaded} className="gap-ds-2">
            {isLoading && <Loader2 className="mr-1 size-4 animate-spin" />}
            {currentStep === STEPS.length - 2 ? 'Finish Setup' : 'Next'}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      )}
    </PageContainer>
  );
}
