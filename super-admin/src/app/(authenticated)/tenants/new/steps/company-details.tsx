'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface CompanyData {
  name: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  country: string;
  timezone: string;
}

interface Props {
  data: CompanyData;
  onNext: (data: CompanyData) => void;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

export function CompanyDetailsStep({ data, onNext }: Props) {
  const [form, setForm] = useState<CompanyData>({
    name: data.name || '',
    slug: data.slug || '',
    ownerName: data.ownerName || '',
    ownerEmail: data.ownerEmail || '',
    ownerPhone: data.ownerPhone || '',
    country: data.country || 'India',
    timezone: data.timezone || 'Asia/Kolkata',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CompanyData, string>>>({});

  const handleNameChange = (name: string) => {
    setForm({ ...form, name, slug: form.slug === slugify(form.name) ? slugify(name) : form.slug });
  };

  const validate = (): boolean => {
    const errs: Partial<Record<keyof CompanyData, string>> = {};
    if (!form.name.trim()) errs.name = 'Company name is required';
    if (!form.slug.trim()) errs.slug = 'Subdomain is required';
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(form.slug)) errs.slug = 'Must be lowercase letters, numbers, and hyphens';
    if (!form.ownerName.trim()) errs.ownerName = 'Owner name is required';
    if (!form.ownerEmail.trim()) errs.ownerEmail = 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail)) errs.ownerEmail = 'Invalid email format';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (validate()) onNext(form);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Company Name" error={errors.name}>
          <Input value={form.name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Acme Travel Co." />
        </Field>
        <Field label="Subdomain" error={errors.slug}>
          <div className="flex items-center gap-2">
            <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} placeholder="acme-travel" />
            <span className="text-sm text-muted-foreground whitespace-nowrap">.travelcrmpro.com</span>
          </div>
        </Field>
        <Field label="Owner Name" error={errors.ownerName}>
          <Input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} placeholder="John Doe" />
        </Field>
        <Field label="Owner Email" error={errors.ownerEmail}>
          <Input type="email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} placeholder="john@acmetravel.com" />
        </Field>
        <Field label="Owner Phone">
          <Input value={form.ownerPhone} onChange={(e) => setForm({ ...form, ownerPhone: e.target.value })} placeholder="+91 98765 43210" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Country">
            <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </Field>
          <Field label="Timezone">
            <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
          </Field>
        </div>
        <div className="flex justify-end pt-4">
          <Button onClick={handleNext}>Next: Select Plan</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
