'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Globe,
  Upload,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { settingsApi } from '@/lib/api/settings';

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

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(false);

  const [form, setForm] = React.useState({
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
  });

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function handleSave() {
    setIsLoading(true);
    try {
      await settingsApi.company.update(form);
      toast.success('Settings saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleNext() {
    if (currentStep < STEPS.length - 2) {
      await handleSave();
      setCurrentStep((s) => s + 1);
    } else if (currentStep === STEPS.length - 2) {
      await handleSave();
      setCurrentStep((s) => s + 1);
    }
  }

  function handleBack() {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  }

  function handleFinish() {
    router.push('/');
  }

  const stepId = STEPS[currentStep]!.id;

  return (
    <div className="mx-auto max-w-2xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome to TravelCRM Pro</h1>
        <p className="text-muted-foreground mt-1">Let&apos;s set up your workspace in a few quick steps.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((step, i) => {
          const StepIcon = step.icon;
          const isActive = i === currentStep;
          const isDone = i < currentStep;
          return (
            <React.Fragment key={step.id}>
              {i > 0 && <div className={`flex-1 h-0.5 ${isDone ? 'bg-primary' : 'bg-muted'}`} />}
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground'
                    : isDone
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-muted bg-muted/50 text-muted-foreground'
                }`}
              >
                {isDone ? <CheckCircle2 className="h-5 w-5" /> : <StepIcon className="h-5 w-5" />}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Step 1: Company Details */}
      {stepId === 'company' && (
        <Card>
          <CardHeader>
            <CardTitle>Company Details</CardTitle>
            <CardDescription>Tell us about your travel agency</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label>Company Name</Label>
                <Input value={form.company_name} onChange={(e) => update('company_name', e.target.value)} placeholder="Acme Travel Agency" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.company_email} onChange={(e) => update('company_email', e.target.value)} placeholder="info@company.com" />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={form.company_phone} onChange={(e) => update('company_phone', e.target.value)} placeholder="+91 98765 43210" />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Website</Label>
                <Input value={form.company_website} onChange={(e) => update('company_website', e.target.value)} placeholder="https://company.com" />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Address</Label>
                <Input value={form.company_address} onChange={(e) => update('company_address', e.target.value)} placeholder="123 Travel Lane" />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={form.company_city} onChange={(e) => update('company_city', e.target.value)} placeholder="Mumbai" />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input value={form.company_state} onChange={(e) => update('company_state', e.target.value)} placeholder="Maharashtra" />
              </div>
              <div className="space-y-2">
                <Label>Country</Label>
                <Input value={form.company_country} onChange={(e) => update('company_country', e.target.value)} placeholder="India" />
              </div>
              <div className="space-y-2">
                <Label>Postal Code</Label>
                <Input value={form.company_postal_code} onChange={(e) => update('company_postal_code', e.target.value)} placeholder="400001" />
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
            <CardDescription>Configure timezone, currency, and language</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={form.timezone} onValueChange={(v) => update('timezone', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v) => update('currency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Language</Label>
              <Select value={form.language} onValueChange={(v) => update('language', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="hi">Hindi</SelectItem>
                </SelectContent>
              </Select>
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
          <CardContent>
            <div className="border-2 border-dashed rounded-lg p-12 text-center">
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">
                Drag and drop your logo here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PNG, JPG, or SVG up to 2MB. Recommended: 256x256px
              </p>
              <Button variant="outline" className="mt-4" onClick={() => toast.info('Logo upload coming soon')}>
                Choose File
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Done */}
      {stepId === 'done' && (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-ds-success-subtle">
              <CheckCircle2 className="h-8 w-8 text-ds-success" />
            </div>
            <h2 className="text-2xl font-bold">You&apos;re all set!</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Your workspace is configured. You can always update these settings later from Settings &gt; Company.
            </p>
            <Button size="lg" onClick={handleFinish} className="gap-2">
              Go to Dashboard
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      {stepId !== 'done' && (
        <div className="flex justify-between">
          <Button variant="outline" onClick={handleBack} disabled={currentStep === 0} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <Button onClick={handleNext} disabled={isLoading} className="gap-2">
            {isLoading && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {currentStep === STEPS.length - 2 ? 'Finish Setup' : 'Next'}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
