'use client';

import * as React from 'react';
import { z } from 'zod';
import type { UseFormReturn } from 'react-hook-form';

import { FormRow } from '@/components/domain';
import { AddressAutocomplete } from '@/components/ui/address-autocomplete';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { SectionCard } from '@/components/ui/section-card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tag } from '@/components/ui/tag';
import { Textarea } from '@/components/ui/textarea';
import {
  contactsApi,
  type ContactRecord,
  type CreateContactRequest,
  type CustomFieldDef,
} from '@/lib/api/contacts';
import { parseLocalDate, toLocalDateString } from '@/lib/dates';

import { joinPhone, splitPhone } from './contact-utils';

export const CONTACT_TYPES = [
  { value: 'customer', label: 'Customer' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'agent', label: 'Agent' },
  { value: 'partner', label: 'Partner' },
] as const;

/** Values the API accepts for `source`. */
const SOURCES = [
  { value: 'manual', label: 'Manual' },
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'ad', label: 'Ad' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'google', label: 'Google' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'social_media', label: 'Social media' },
  { value: 'phone_inquiry', label: 'Phone enquiry' },
  { value: 'email_inquiry', label: 'Email enquiry' },
  { value: 'trade_show', label: 'Trade show' },
  { value: 'partner', label: 'Partner' },
  { value: 'other', label: 'Other' },
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'mr', label: 'Marathi' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'bn', label: 'Bengali' },
  { value: 'ar', label: 'Arabic' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'es', label: 'Spanish' },
];

const SUGGESTED_TAGS = ['vip', 'frequent', 'honeymoon', 'family', 'business', 'adventure', 'luxury', 'budget', 'group', 'corporate'];

export const contactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  email: z.string().email('Enter a valid email address').optional().or(z.literal('')),
  countryCode: z.string(),
  phone: z.string().max(20, 'Phone number is too long').optional(),
  company: z.string().optional(),
  type: z.enum(['customer', 'supplier', 'agent', 'partner']),
  source: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  taxId: z.string().max(50, 'Tax ID is too long').optional(),
  isBusiness: z.boolean(),
  birthday: z.date().optional(),
  anniversary: z.date().optional(),
  preferredLanguage: z.string(),
  tags: z.array(z.string()),
  notes: z.string().optional(),
  customFields: z.record(z.string(), z.string()),
});

export type ContactFormValues = z.infer<typeof contactSchema>;

export const EMPTY_CONTACT: ContactFormValues = {
  name: '',
  email: '',
  countryCode: '+91',
  phone: '',
  company: '',
  type: 'customer',
  source: '',
  address: '',
  city: '',
  state: '',
  country: '',
  postalCode: '',
  taxId: '',
  isBusiness: false,
  birthday: undefined,
  anniversary: undefined,
  preferredLanguage: 'en',
  tags: [],
  notes: '',
  customFields: {},
};

/** Every stored value of an existing contact, shaped for the form. */
export function contactToFormValues(c: ContactRecord): ContactFormValues {
  const { countryCode, national } = splitPhone(c.phone);
  return {
    name: c.name ?? '',
    email: c.email ?? '',
    countryCode,
    phone: national,
    company: c.company ?? '',
    type: c.type as ContactFormValues['type'],
    source: c.source ?? '',
    address: c.address ?? '',
    city: c.city ?? '',
    state: c.state ?? '',
    country: c.country ?? '',
    postalCode: c.postalCode ?? '',
    taxId: c.taxId ?? '',
    isBusiness: c.isBusiness === true || c.isBusiness === 1,
    birthday: c.birthday ? parseLocalDate(c.birthday) : undefined,
    anniversary: c.anniversary ? parseLocalDate(c.anniversary) : undefined,
    preferredLanguage: c.preferredLanguage || 'en',
    tags: c.tags ?? [],
    notes: c.notes ?? '',
    customFields: c.customFields ?? {},
  };
}

const orNull = (v: string | undefined): string | null => (v && v.trim() ? v.trim() : null);

/** Full-record payload. On edit every field is sent so cleared inputs are cleared server-side. */
export function formValuesToPayload(v: ContactFormValues): CreateContactRequest & {
  email: string | null;
  phone: string | null;
} {
  const customFields = Object.fromEntries(Object.entries(v.customFields).filter(([, val]) => val !== ''));
  return {
    name: v.name.trim(),
    email: orNull(v.email),
    phone: joinPhone(v.countryCode, v.phone ?? ''),
    company: orNull(v.company) ?? undefined,
    type: v.type,
    source: orNull(v.source) ?? undefined,
    address: orNull(v.address) ?? undefined,
    city: orNull(v.city) ?? undefined,
    state: orNull(v.state) ?? undefined,
    country: orNull(v.country) ?? undefined,
    postalCode: orNull(v.postalCode) ?? undefined,
    taxId: orNull(v.taxId) ?? undefined,
    isBusiness: v.isBusiness,
    birthday: v.birthday ? toLocalDateString(v.birthday) : undefined,
    anniversary: v.anniversary ? toLocalDateString(v.anniversary) : undefined,
    preferredLanguage: v.preferredLanguage,
    tags: v.tags,
    notes: orNull(v.notes) ?? undefined,
    customFields,
  };
}

/** Same as the payload but with explicit nulls, so an edit can clear a value. */
export function formValuesToUpdate(v: ContactFormValues) {
  const p = formValuesToPayload(v);
  return {
    ...p,
    company: p.company ?? null,
    source: p.source ?? null,
    address: p.address ?? null,
    city: p.city ?? null,
    state: p.state ?? null,
    country: p.country ?? null,
    postalCode: p.postalCode ?? null,
    taxId: p.taxId ?? null,
    birthday: p.birthday ?? null,
    anniversary: p.anniversary ?? null,
    notes: p.notes ?? null,
  };
}

interface ContactFormFieldsProps {
  form: UseFormReturn<ContactFormValues>;
  /** Contact being edited, so a duplicate check never flags the contact itself. */
  currentId?: string;
}

export function ContactFormFields({ form, currentId }: ContactFormFieldsProps) {
  const [tagInput, setTagInput] = React.useState('');
  const [duplicateWarning, setDuplicateWarning] = React.useState('');
  const [fieldDefs, setFieldDefs] = React.useState<CustomFieldDef[]>([]);
  const thisYear = new Date().getFullYear();

  React.useEffect(() => {
    let cancelled = false;
    contactsApi
      .getCustomFields()
      .then((res) => {
        if (!cancelled && Array.isArray(res?.data)) setFieldDefs(res.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const tags = form.watch('tags');
  const customValues = form.watch('customFields');
  const phoneValue = form.watch('phone') ?? '';
  const countryCode = form.watch('countryCode');

  async function checkDuplicate() {
    const email = form.getValues('email');
    const phone = joinPhone(form.getValues('countryCode'), form.getValues('phone') ?? '');
    if (!email && !phone) {
      setDuplicateWarning('');
      return;
    }
    try {
      const res = await contactsApi.checkDuplicate({ email: email || undefined, phone: phone || undefined });
      const raw = res?.data as unknown;
      const matches = Array.isArray(raw)
        ? (raw as { id?: string }[])
        : ((raw as { duplicates?: { id?: string }[] } | null)?.duplicates ?? []);
      const others = matches.filter((m) => !currentId || m.id !== currentId);
      const flagged = others.length > 0 || (!Array.isArray(raw) && (raw as { hasDuplicates?: boolean } | null)?.hasDuplicates === true && !currentId);
      setDuplicateWarning(flagged ? 'A contact with this email or phone already exists.' : '');
    } catch {
      setDuplicateWarning('');
    }
  }

  function addTag(raw: string) {
    const tag = raw.toLowerCase().trim();
    if (tag && !tags.includes(tag)) form.setValue('tags', [...tags, tag]);
    setTagInput('');
  }

  const emailField = form.register('email');

  return (
    <>
      <SectionCard title="Contact information" required>
        <div className="grid gap-ds-4 sm:grid-cols-2">
          <FormRow name="name" label="Full name" required>
            <Input {...form.register('name')} id="name" placeholder="e.g., Rahul Sharma" />
          </FormRow>
          <FormRow name="company" label="Company">
            <Input {...form.register('company')} id="company" placeholder="e.g., Acme Corp" />
          </FormRow>
          <FormRow name="email" label="Email">
            <Input
              {...emailField}
              id="email"
              type="email"
              placeholder="email@example.com"
              onBlur={(e) => {
                void emailField.onBlur(e);
                void checkDuplicate();
              }}
            />
          </FormRow>
          <FormRow name="phone" label="Phone">
            <PhoneInput
              value={phoneValue}
              onChange={(v) => form.setValue('phone', v)}
              countryCode={countryCode}
              onCountryCodeChange={(code) => form.setValue('countryCode', code)}
            />
          </FormRow>
          <FormRow name="type" label="Contact type" required>
            <Select value={form.watch('type')} onValueChange={(v) => form.setValue('type', v as ContactFormValues['type'])}>
              <SelectTrigger id="type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONTACT_TYPES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>
          <FormRow name="source" label="Source">
            <Select
              value={form.watch('source') || 'none'}
              onValueChange={(v) => form.setValue('source', v === 'none' ? '' : v)}
            >
              <SelectTrigger id="source"><SelectValue placeholder="Select source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No source</SelectItem>
                {SOURCES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>
          {duplicateWarning && (
            <p role="status" className="text-sm text-ds-warning-on-subtle sm:col-span-2">{duplicateWarning}</p>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Location">
        <div className="grid gap-ds-4 sm:grid-cols-2">
          <FormRow name="address" label="Address" wide>
            <AddressAutocomplete
              value={form.watch('address') ?? ''}
              onChange={(v) => form.setValue('address', v)}
              onAddressSelect={(parts) => {
                if (parts.city) form.setValue('city', parts.city);
                if (parts.state) form.setValue('state', parts.state);
                if (parts.country) form.setValue('country', parts.country);
                if (parts.postalCode) form.setValue('postalCode', parts.postalCode);
              }}
              placeholder="Start typing to search address..."
            />
          </FormRow>
          <FormRow name="city" label="City">
            <Input {...form.register('city')} id="city" placeholder="e.g., Mumbai" />
          </FormRow>
          <FormRow name="state" label="State">
            <Input {...form.register('state')} id="state" placeholder="e.g., Maharashtra" />
          </FormRow>
          <FormRow name="country" label="Country">
            <Input {...form.register('country')} id="country" placeholder="e.g., India" />
          </FormRow>
          <FormRow name="postalCode" label="Postal code">
            <Input {...form.register('postalCode')} id="postalCode" placeholder="e.g., 400001" />
          </FormRow>
          <FormRow name="taxId" label="Tax ID" hint="GSTIN or VAT number of a business customer. Printed on invoices.">
            <Input {...form.register('taxId')} id="taxId" placeholder="e.g., 27AAPFU0939F1ZV or DE123456789" />
          </FormRow>
          <FormRow name="isBusiness" label="Business customer" hint="Lets a VAT invoice to another country use reverse charge.">
            <Checkbox
              id="isBusiness"
              checked={form.watch('isBusiness')}
              onCheckedChange={(v) => form.setValue('isBusiness', v === true, { shouldDirty: true })}
            />
          </FormRow>
        </div>
      </SectionCard>

      <SectionCard title="Preferences and occasions">
        <div className="grid gap-ds-4 sm:grid-cols-3">
          <FormRow name="birthday" label="Birthday">
            <DatePicker
              id="birthday"
              value={form.watch('birthday')}
              onChange={(d) => form.setValue('birthday', d)}
              maxDate={new Date()}
              fromYear={1920}
              toYear={thisYear}
            />
          </FormRow>
          <FormRow name="anniversary" label="Anniversary">
            <DatePicker
              id="anniversary"
              value={form.watch('anniversary')}
              onChange={(d) => form.setValue('anniversary', d)}
              maxDate={new Date()}
              fromYear={1940}
              toYear={thisYear}
            />
          </FormRow>
          <FormRow name="preferredLanguage" label="Preferred language">
            <Select value={form.watch('preferredLanguage')} onValueChange={(v) => form.setValue('preferredLanguage', v)}>
              <SelectTrigger id="preferredLanguage"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>
        </div>
      </SectionCard>

      <SectionCard title="Tags">
        <div className="flex flex-col gap-ds-3">
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-ds-2">
              {tags.map((tag) => (
                <Tag key={tag} tone="primary" onRemove={() => form.setValue('tags', tags.filter((t) => t !== tag))}>
                  {tag}
                </Tag>
              ))}
            </div>
          )}
          <Input
            aria-label="Add tag"
            placeholder="Type a tag and press Enter..."
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag(tagInput);
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-ds-2">
            <span className="text-xs text-ds-foreground-muted">Suggestions:</span>
            {SUGGESTED_TAGS.filter((t) => !tags.includes(t)).map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => addTag(tag)}
                className="rounded-ds-sm border border-ds-border px-2 py-0.5 text-xs text-ds-foreground-muted hover:bg-ds-surface-sunken"
              >
                + {tag}
              </button>
            ))}
          </div>
        </div>
      </SectionCard>

      {fieldDefs.length > 0 && (
        <SectionCard title="Custom fields">
          <div className="grid gap-ds-4 sm:grid-cols-2">
            {fieldDefs.map((def) => {
              const fieldId = `customFields.${def.name}`;
              const value = customValues[def.name] ?? '';
              const set = (v: string) => form.setValue('customFields', { ...form.getValues('customFields'), [def.name]: v });
              return (
                <FormRow key={def.id} name={fieldId} label={def.label} required={def.isRequired}>
                  {def.fieldType === 'select' && def.options?.length ? (
                    <Select value={value || 'none'} onValueChange={(v) => set(v === 'none' ? '' : v)}>
                      <SelectTrigger id={fieldId}><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not set</SelectItem>
                        {def.options.map((o) => (
                          <SelectItem key={o} value={o}>{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={fieldId}
                      type={def.fieldType === 'number' ? 'number' : 'text'}
                      value={value}
                      onChange={(e) => set(e.target.value)}
                    />
                  )}
                </FormRow>
              );
            })}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Notes">
        <FormRow name="notes" label="Notes">
          <Textarea {...form.register('notes')} id="notes" rows={3} placeholder="Anything worth remembering about this contact..." />
        </FormRow>
      </SectionCard>
    </>
  );
}
