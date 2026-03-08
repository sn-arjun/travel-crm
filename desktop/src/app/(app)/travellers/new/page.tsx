'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, Save, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApiMutation } from '@/hooks/use-api';
import { travellersApi, type CreateTravellerRequest } from '@/lib/api/visa';
import { Combobox } from '@/components/ui/combobox';
import { toast } from 'sonner';

// Common countries list for nationality combobox
const COUNTRIES = [
  'Afghan', 'Albanian', 'Algerian', 'American', 'Andorran', 'Angolan', 'Argentine', 'Armenian',
  'Australian', 'Austrian', 'Azerbaijani', 'Bahamian', 'Bahraini', 'Bangladeshi', 'Belgian',
  'Belizean', 'Beninese', 'Bhutanese', 'Bolivian', 'Bosnian', 'Brazilian', 'British', 'Bruneian',
  'Bulgarian', 'Burkinabe', 'Burmese', 'Burundian', 'Cambodian', 'Cameroonian', 'Canadian',
  'Chilean', 'Chinese', 'Colombian', 'Congolese', 'Costa Rican', 'Croatian', 'Cuban', 'Cypriot',
  'Czech', 'Danish', 'Djiboutian', 'Dominican', 'Dutch', 'Ecuadorian', 'Egyptian', 'Emirati',
  'Eritrean', 'Estonian', 'Ethiopian', 'Fijian', 'Filipino', 'Finnish', 'French', 'Gabonese',
  'Gambian', 'Georgian', 'German', 'Ghanaian', 'Greek', 'Guatemalan', 'Guinean', 'Haitian',
  'Honduran', 'Hungarian', 'Icelandic', 'Indian', 'Indonesian', 'Iranian', 'Iraqi', 'Irish',
  'Israeli', 'Italian', 'Ivorian', 'Jamaican', 'Japanese', 'Jordanian', 'Kazakhstani', 'Kenyan',
  'Korean', 'Kuwaiti', 'Kyrgyz', 'Laotian', 'Latvian', 'Lebanese', 'Liberian', 'Libyan',
  'Lithuanian', 'Luxembourgish', 'Macedonian', 'Malagasy', 'Malawian', 'Malaysian', 'Maldivian',
  'Malian', 'Maltese', 'Mauritanian', 'Mauritian', 'Mexican', 'Moldovan', 'Mongolian', 'Montenegrin',
  'Moroccan', 'Mozambican', 'Namibian', 'Nepalese', 'New Zealander', 'Nicaraguan', 'Nigerian',
  'Norwegian', 'Omani', 'Pakistani', 'Palestinian', 'Panamanian', 'Paraguayan', 'Peruvian', 'Polish',
  'Portuguese', 'Qatari', 'Romanian', 'Russian', 'Rwandan', 'Saudi Arabian', 'Senegalese', 'Serbian',
  'Singaporean', 'Slovakian', 'Slovenian', 'Somali', 'South African', 'South Sudanese', 'Spanish',
  'Sri Lankan', 'Sudanese', 'Surinamese', 'Swedish', 'Swiss', 'Syrian', 'Taiwanese', 'Tajikistani',
  'Tanzanian', 'Thai', 'Togolese', 'Tunisian', 'Turkish', 'Turkmen', 'Ugandan', 'Ukrainian',
  'Uruguayan', 'Uzbekistani', 'Venezuelan', 'Vietnamese', 'Yemeni', 'Zambian', 'Zimbabwean',
].map((n) => ({ value: n, label: n }));

export default function NewTravellerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Auto-populate from URL params (when navigating from contact detail)
  const prefillContactId = searchParams.get('contactId') ?? undefined;
  const prefillContactName = searchParams.get('contactName') ?? undefined;

  const [form, setForm] = React.useState<CreateTravellerRequest>({
    firstName: '',
    lastName: '',
    passportNumber: '',
    dateOfBirth: '',
    nationality: '',
    email: '',
    phone: '',
    contactId: prefillContactId,
  });

  const [nationalitySearch, setNationalitySearch] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const filteredNationalities = React.useMemo(() => {
    if (!nationalitySearch) return COUNTRIES;
    const q = nationalitySearch.toLowerCase();
    return COUNTRIES.filter((c) => c.label.toLowerCase().includes(q));
  }, [nationalitySearch]);

  const { mutate: createTraveller, loading: isSaving } = useApiMutation<CreateTravellerRequest, any>(
    (data) => travellersApi.create(data),
  );

  function updateField(field: keyof CreateTravellerRequest, value: any) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!form.firstName.trim()) errs.firstName = 'First name is required';
    if (!form.passportNumber.trim()) errs.passportNumber = 'Passport number is required';
    if (form.dateOfBirth && new Date(form.dateOfBirth) >= new Date()) {
      errs.dateOfBirth = 'Date of birth must be in the past';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;

    const result = await createTraveller(form);
    if (result) {
      toast.success('Traveller created successfully');
      const data = (result as any)?.data;
      if (data?.id) {
        router.push(`/travellers/${data.id}`);
      } else {
        router.push('/travellers');
      }
    } else {
      toast.error('Failed to create traveller');
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
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              New Traveller
            </h1>
            {prefillContactName && (
              <p className="text-sm text-muted-foreground">Linked to: {prefillContactName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save Traveller
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Personal Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="firstName"
                    value={form.firstName}
                    onChange={(e) => updateField('firstName', e.target.value)}
                    placeholder="First name"
                    className={errors.firstName ? 'border-destructive' : ''}
                  />
                  {errors.firstName && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.firstName}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={form.lastName ?? ''}
                    onChange={(e) => updateField('lastName', e.target.value)}
                    placeholder="Last name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dateOfBirth">Date of Birth</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={form.dateOfBirth ?? ''}
                  onChange={(e) => updateField('dateOfBirth', e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className={errors.dateOfBirth ? 'border-destructive' : ''}
                />
                {errors.dateOfBirth && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.dateOfBirth}</p>}
              </div>

              <div className="space-y-2">
                <Label>Nationality</Label>
                <Combobox
                  options={filteredNationalities}
                  value={form.nationality ?? ''}
                  onValueChange={(val) => updateField('nationality', val)}
                  onSearch={setNationalitySearch}
                  placeholder="Select nationality..."
                  searchPlaceholder="Search nationality..."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Passport Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="passportNumber">Passport Number <span className="text-destructive">*</span></Label>
                <Input
                  id="passportNumber"
                  value={form.passportNumber}
                  onChange={(e) => updateField('passportNumber', e.target.value.toUpperCase())}
                  placeholder="e.g., A12345678"
                  className={`font-mono ${errors.passportNumber ? 'border-destructive' : ''}`}
                />
                {errors.passportNumber && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.passportNumber}</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Contact Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email ?? ''}
                    onChange={(e) => updateField('email', e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={form.phone ?? ''}
                    onChange={(e) => updateField('phone', e.target.value)}
                    placeholder="+91 98765 43210"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
