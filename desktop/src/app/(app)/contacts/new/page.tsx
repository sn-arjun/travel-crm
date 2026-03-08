'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Save, User, MapPin, Tag, AlertCircle, Calendar, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useApiMutation } from '@/hooks/use-api';
import { contactsApi, type CreateContactRequest } from '@/lib/api/contacts';
import { PhoneInput } from '@/components/ui/phone-input';
import { AddressAutocomplete, type AddressParts } from '@/components/ui/address-autocomplete';

const CONTACT_TYPE_OPTIONS = [
  { value: 'customer', label: 'Customer' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'agent', label: 'Agent' },
  { value: 'partner', label: 'Partner' },
];

const SUGGESTED_TAGS = ['vip', 'frequent', 'honeymoon', 'family', 'business', 'adventure', 'luxury', 'budget', 'group', 'corporate'];

const SOURCE_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'ad', label: 'Ad' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'google', label: 'Google' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'trade_fair', label: 'Trade Fair' },
  { value: 'other', label: 'Other' },
];

const LANGUAGE_OPTIONS = [
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

export default function NewContactPage() {
  const router = useRouter();
  const [tagInput, setTagInput] = React.useState('');
  const [validationErrors, setValidationErrors] = React.useState<Record<string, string>>({});

  const [countryCode, setCountryCode] = React.useState('+91');
  const [form, setForm] = React.useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    type: 'customer',
    address: '',
    city: '',
    state: '',
    country: '',
    postalCode: '',
    notes: '',
    tags: [] as string[],
    source: '',
    birthday: '',
    anniversary: '',
    preferredLanguage: 'en',
  });
  const [duplicateWarning, setDuplicateWarning] = React.useState('');

  const { mutate: createContact, loading: isSubmitting, error } = useApiMutation<CreateContactRequest, any>(
    (data) => contactsApi.create(data),
  );

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setValidationErrors((prev) => ({ ...prev, [field]: '' }));
  }

  function addTag(tag: string) {
    const normalized = tag.toLowerCase().trim();
    if (normalized && !form.tags.includes(normalized)) {
      setForm((prev) => ({ ...prev, tags: [...prev.tags, normalized] }));
    }
    setTagInput('');
  }

  function removeTag(tag: string) {
    setForm((prev) => ({ ...prev, tags: prev.tags.filter((t: any) => t !== tag) }));
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
    }
  }

  async function checkDuplicate(email?: string, phone?: string) {
    if (!email && !phone) { setDuplicateWarning(''); return; }
    try {
      const res = await contactsApi.checkDuplicate({ email: email || undefined, phone: phone || undefined });
      const matches = res?.data;
      if (matches && ((matches as any).hasDuplicates || (Array.isArray(matches) && matches.length > 0))) {
        setDuplicateWarning('A contact with this email or phone already exists.');
      } else {
        setDuplicateWarning('');
      }
    } catch { /* non-critical */ }
  }

  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Name is required';
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;

    const createData: CreateContactRequest = {
      name: form.name,
      email: form.email || undefined,
      phone: form.phone ? `${countryCode}${form.phone.replace(/^0+/, '')}` : undefined,
      company: form.company || undefined,
      type: form.type as 'customer' | 'supplier' | 'agent' | 'partner',
      address: form.address || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      country: form.country || undefined,
      postalCode: form.postalCode || undefined,
      tags: form.tags.length > 0 ? form.tags : undefined,
      notes: form.notes || undefined,
      source: form.source || undefined,
      birthday: form.birthday || undefined,
      anniversary: form.anniversary || undefined,
      preferredLanguage: form.preferredLanguage || undefined,
    };

    const result = await createContact(createData);
    if (result) {
      toast.success('Contact created successfully');
      router.push('/contacts');
    } else {
      toast.error(error?.message || 'Failed to create contact');
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>New Contact</h1>
            <p className="text-sm text-muted-foreground">Add a new contact to your CRM</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save Contact
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-6 py-3 bg-destructive/10 border-b border-destructive/20">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">{error.message}</p>
        </div>
      )}
      {duplicateWarning && (
        <div className="flex items-center gap-3 px-6 py-3 bg-amber-50 border-b border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0" />
          <p className="text-sm text-amber-600 dark:text-amber-500">{duplicateWarning}</p>
        </div>
      )}

      <div className="flex-1 overflow-auto p-6">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" />Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name <span className="text-destructive">*</span></Label>
                  <Input id="name" placeholder="e.g., Rahul Sharma" value={form.name} onChange={(e) => updateField('name', e.target.value)} className={validationErrors.name ? 'border-destructive' : ''} />
                  {validationErrors.name && <p className="text-xs text-destructive">{validationErrors.name}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Company</Label>
                  <Input id="company" placeholder="e.g., Acme Corp" value={form.company} onChange={(e) => updateField('company', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="email@example.com" value={form.email} onChange={(e) => updateField('email', e.target.value)} onBlur={() => checkDuplicate(form.email, form.phone)} />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <PhoneInput
                    value={form.phone}
                    onChange={(v) => updateField('phone', v)}
                    countryCode={countryCode}
                    onCountryCodeChange={setCountryCode}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contact Type <span className="text-destructive">*</span></Label>
                  <Select value={form.type} onValueChange={(v) => updateField('type', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONTACT_TYPE_OPTIONS.map((opt: any) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Source</Label>
                  <Select value={form.source || 'none'} onValueChange={(v) => updateField('source', v === 'none' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No source</SelectItem>
                      {SOURCE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" />Location</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Search Address</Label>
                <AddressAutocomplete
                  value={form.address}
                  onChange={(v) => updateField('address', v)}
                  onAddressSelect={(parts: AddressParts) => {
                    setForm((prev) => ({
                      ...prev,
                      city: parts.city || prev.city,
                      state: parts.state || prev.state,
                      country: parts.country || prev.country,
                      postalCode: parts.postalCode || prev.postalCode,
                    }));
                  }}
                  placeholder="Start typing to search address..."
                />

              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" placeholder="e.g., Mumbai" value={form.city} onChange={(e) => updateField('city', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input id="state" placeholder="e.g., Maharashtra" value={form.state} onChange={(e) => updateField('state', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input id="country" placeholder="e.g., India" value={form.country} onChange={(e) => updateField('country', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postalCode">Postal Code</Label>
                  <Input id="postalCode" placeholder="e.g., 400001" value={form.postalCode} onChange={(e) => updateField('postalCode', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4" />Preferences & Occasions</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="birthday">Birthday</Label>
                  <Input id="birthday" type="date" value={form.birthday} onChange={(e) => updateField('birthday', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="anniversary">Anniversary</Label>
                  <Input id="anniversary" type="date" value={form.anniversary} onChange={(e) => updateField('anniversary', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Preferred Language</Label>
                  <Select value={form.preferredLanguage} onValueChange={(v) => updateField('preferredLanguage', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LANGUAGE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Tag className="h-4 w-4" />Tags</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {form.tags.map((tag: any) => (
                  <Badge key={tag} variant="secondary" className="text-xs cursor-pointer hover:bg-destructive/10 hover:text-destructive" onClick={() => removeTag(tag)}>{tag} x</Badge>
                ))}
              </div>
              <div className="space-y-2">
                <Input placeholder="Type a tag and press Enter..." value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={handleTagKeyDown} />
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-xs text-muted-foreground mr-1">Suggestions:</span>
                  {SUGGESTED_TAGS.filter((t: any) => !form.tags.includes(t)).map((tag: any) => (
                    <Badge key={tag} variant="outline" className="text-[10px] cursor-pointer hover:bg-accent" onClick={() => addTag(tag)}>+ {tag}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
            <CardContent>
              <Textarea placeholder="Any additional notes about this contact..." value={form.notes} onChange={(e) => updateField('notes', e.target.value)} rows={3} />
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}
