'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Save, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { contactsApi, type UpdateContactRequest } from '@/lib/api/contacts';
import { PhoneInput } from '@/components/ui/phone-input';
import { AddressAutocomplete, type AddressParts } from '@/components/ui/address-autocomplete';
import { toast } from 'sonner';

export default function EditContactPage() {
  const router = useRouter();
  const params = useParams();
  const contactId = params.id as string;

  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [tagInput, setTagInput] = React.useState('');
  const [countryCode, setCountryCode] = React.useState('+91');

  const { data: contactResponse, loading: contactLoading, error: contactError } = useApiQuery(
    () => contactsApi.getById(contactId),
    [contactId],
  );

  const { mutate: updateContact, loading: isSubmitting } = useApiMutation(
    (data: UpdateContactRequest) => contactsApi.update(contactId, data),
  );

  const contact = contactResponse?.data;

  const [form, setForm] = React.useState({
    name: '',
    email: '',
    phone: '',
    whatsapp: '',
    company: '',
    designation: '',
    address: '',
    city: '',
    state: '',
    country: '',
    pincode: '',
    source: '',
    type: 'customer' as 'customer' | 'supplier' | 'agent' | 'partner',
    language: '',
    dateOfBirth: '',
    anniversary: '',
    tags: [] as string[],
    notes: '',
  });

  // Sync form with loaded contact data
  React.useEffect(() => {
    if (contact) {
      setForm({
        name: (contact as any).name || '',
        email: contact.email || '',
        phone: contact.phone || '',
        whatsapp: (contact as any).whatsapp || '',
        company: (contact as any).company || '',
        designation: (contact as any).designation || '',
        address: (contact as any).address || '',
        city: (contact as any).city || '',
        state: (contact as any).state || '',
        country: (contact as any).country || '',
        pincode: (contact as any).pincode || '',
        source: (contact as any).source || '',
        type: ((contact.type as string) || 'customer') as 'customer' | 'supplier' | 'agent' | 'partner',
        language: (contact as any).language || '',
        dateOfBirth: (contact as any).dateOfBirth || '',
        anniversary: (contact as any).anniversary || '',
        tags: contact.tags || [],
        notes: (contact as any).notes || '',
      });
    }
  }, [contact]);

  function updateField(field: string, value: string | number | string[]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  }

  function handleAddTag() {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      updateField('tags', [...form.tags, tag]);
    }
    setTagInput('');
  }

  function handleRemoveTag(tag: string) {
    updateField('tags', form.tags.filter((t) => t !== tag));
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    if (!form.name.trim()) {
      setErrors({ name: 'Name is required' });
      return;
    }

    const payload: UpdateContactRequest = {
      name: form.name,
      email: form.email || undefined,
      phone: form.phone || undefined,
      company: form.company || undefined,
      type: form.type,
      tags: form.tags.length > 0 ? form.tags : undefined,
      notes: form.notes || undefined,
    };

    // Include extended fields in customFields
    const customFields: Record<string, unknown> = {};
    if (form.whatsapp) customFields.whatsapp = form.whatsapp;
    if (form.company) customFields.company = form.company;
    if (form.designation) customFields.designation = form.designation;
    if (form.address) customFields.address = form.address;
    if (form.city) customFields.city = form.city;
    if (form.state) customFields.state = form.state;
    if (form.country) customFields.country = form.country;
    if (form.pincode) customFields.pincode = form.pincode;
    if (form.source) customFields.source = form.source;
    if (form.language) customFields.language = form.language;
    if (form.dateOfBirth) customFields.dateOfBirth = form.dateOfBirth;
    if (form.anniversary) customFields.anniversary = form.anniversary;

    if (Object.keys(customFields).length > 0) {
      payload.customFields = customFields;
    }

    const result = await updateContact(payload);

    if (result) {
      toast.success('Contact updated successfully');
      router.push(`/contacts/${contactId}`);
    } else {
      toast.error('Failed to update contact');
    }
  }

  if (contactLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Loading contact...</p>
      </div>
    );
  }

  if (contactError || !contact) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-destructive">Failed to load contact</p>
        <Button variant="outline" onClick={() => router.push('/contacts')}>Back to Contacts</Button>
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
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Edit Contact</h1>
            <p className="text-sm text-muted-foreground">{contact.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-auto p-6">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
          {/* Personal Info */}
          <Card>
            <CardHeader><CardTitle className="text-base">Personal Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name <span className="text-destructive">*</span></Label>
                <Input
                  id="name"
                  placeholder="Full name"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className={errors.name ? 'border-destructive' : ''}
                  required
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v: string) => updateField('type', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer">Customer</SelectItem>
                      <SelectItem value="supplier">Supplier</SelectItem>
                      <SelectItem value="agent">Agent</SelectItem>
                      <SelectItem value="partner">Partner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="language">Language</Label>
                  <Input
                    id="language"
                    placeholder="e.g., English, Hindi"
                    value={form.language}
                    onChange={(e) => updateField('language', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company">Company</Label>
                  <Input
                    id="company"
                    placeholder="Company name"
                    value={form.company}
                    onChange={(e) => updateField('company', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="designation">Designation</Label>
                  <Input
                    id="designation"
                    placeholder="Job title / designation"
                    value={form.designation}
                    onChange={(e) => updateField('designation', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">Date of Birth</Label>
                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={form.dateOfBirth}
                    onChange={(e) => updateField('dateOfBirth', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="anniversary">Anniversary</Label>
                  <Input
                    id="anniversary"
                    type="date"
                    value={form.anniversary}
                    onChange={(e) => updateField('anniversary', e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contact Details */}
          <Card>
            <CardHeader><CardTitle className="text-base">Contact Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@example.com"
                    value={form.email}
                    onChange={(e) => updateField('email', e.target.value)}
                  />
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
                  <Label htmlFor="whatsapp">WhatsApp</Label>
                  <Input
                    id="whatsapp"
                    placeholder="+91 XXXXX XXXXX"
                    value={form.whatsapp}
                    onChange={(e) => updateField('whatsapp', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="source">Source</Label>
                  <Select value={form.source} onValueChange={(v) => updateField('source', v)}>
                    <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="website">Website</SelectItem>
                      <SelectItem value="referral">Referral</SelectItem>
                      <SelectItem value="walk_in">Walk-in</SelectItem>
                      <SelectItem value="social_media">Social Media</SelectItem>
                      <SelectItem value="google_ads">Google Ads</SelectItem>
                      <SelectItem value="facebook_ads">Facebook Ads</SelectItem>
                      <SelectItem value="phone_inquiry">Phone Inquiry</SelectItem>
                      <SelectItem value="email_inquiry">Email Inquiry</SelectItem>
                      <SelectItem value="trade_show">Trade Show</SelectItem>
                      <SelectItem value="partner">Partner</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Address */}
          <Card>
            <CardHeader><CardTitle className="text-base">Address</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Street Address</Label>
                <AddressAutocomplete
                  value={form.address}
                  onChange={(v) => updateField('address', v)}
                  onAddressSelect={(parts: AddressParts) => {
                    setForm((prev) => ({
                      ...prev,
                      city: parts.city || prev.city,
                      state: parts.state || prev.state,
                      country: parts.country || prev.country,
                      pincode: parts.postalCode || prev.pincode,
                    }));
                  }}
                  placeholder="Start typing to search address..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    placeholder="City"
                    value={form.city}
                    onChange={(e) => updateField('city', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    placeholder="State"
                    value={form.state}
                    onChange={(e) => updateField('state', e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    placeholder="Country"
                    value={form.country}
                    onChange={(e) => updateField('country', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pincode">PIN Code</Label>
                  <Input
                    id="pincode"
                    placeholder="PIN code"
                    value={form.pincode}
                    onChange={(e) => updateField('pincode', e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Additional Info */}
          <Card>
            <CardHeader><CardTitle className="text-base">Additional Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {/* Tags */}
              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {form.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs cursor-pointer hover:bg-destructive/20" onClick={() => handleRemoveTag(tag)}>
                      {tag} &times;
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a tag and press Enter"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    className="flex-1"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={handleAddTag}>
                    Add
                  </Button>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Any notes about this contact..."
                  value={form.notes}
                  onChange={(e) => updateField('notes', e.target.value)}
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}
