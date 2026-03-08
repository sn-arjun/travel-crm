'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Save, ChevronRight, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { Combobox } from '@/components/ui/combobox';
import { vouchersApi, type UpdateVoucherRequest } from '@/lib/api/vouchers';
import { suppliersApi } from '@/lib/api/suppliers';

// ─── Same form shape as new page ─────────────────────────────────────────────
type VoucherType = 'hotel' | 'transport' | 'flight' | 'activity';
interface Passenger { name: string; pnr: string; }
interface Guest { name: string; }

interface FormState {
  voucherType: VoucherType | '';
  supplierId: string;
  supplierLabel: string;
  title: string;
  language: string;
  notes: string;
  // Hotel
  hotelName: string;
  hotelAddress: string;
  checkIn: string;
  checkOut: string;
  roomType: string;
  roomCount: string;
  mealPlan: string;
  specialRequests: string;
  confirmationNumber: string;
  emergencyContact: string;
  guests: Guest[];
  // Transport
  vehicleType: string;
  driverName: string;
  driverPhone: string;
  pickupLocation: string;
  pickupTime: string;
  pickupMapsLink: string;
  dropLocation: string;
  dropMapsLink: string;
  route: string;
  sightseeing: string[];
  terms: string;
  // Flight
  airline: string;
  flightNumber: string;
  departureAirport: string;
  departureTime: string;
  departureTerminal: string;
  arrivalAirport: string;
  arrivalTime: string;
  arrivalTerminal: string;
  pnr: string;
  baggageAllowance: string;
  seatNumbers: string;
  travelClass: string;
  mealPreference: string;
  passengers: Passenger[];
  // Activity
  activityName: string;
  dateTime: string;
  meetingPoint: string;
  meetingPointMapsLink: string;
  duration: string;
  whatToBring: string[];
  inclusions: string[];
  emergencyContactActivity: string;
  operatorContact: string;
}

const emptyForm: FormState = {
  voucherType: '',
  supplierId: '',
  supplierLabel: '',
  title: '',
  language: 'en',
  notes: '',
  hotelName: '', hotelAddress: '', checkIn: '', checkOut: '',
  roomType: 'Deluxe', roomCount: '1', mealPlan: 'EP',
  specialRequests: '', confirmationNumber: '', emergencyContact: '',
  guests: [{ name: '' }],
  vehicleType: '', driverName: '', driverPhone: '',
  pickupLocation: '', pickupTime: '', pickupMapsLink: '',
  dropLocation: '', dropMapsLink: '', route: '',
  sightseeing: [], terms: '',
  airline: '', flightNumber: '',
  departureAirport: '', departureTime: '', departureTerminal: '',
  arrivalAirport: '', arrivalTime: '', arrivalTerminal: '',
  pnr: '', baggageAllowance: '', seatNumbers: '',
  travelClass: 'economy', mealPreference: '',
  passengers: [{ name: '', pnr: '' }],
  activityName: '', dateTime: '', meetingPoint: '', meetingPointMapsLink: '',
  duration: '', whatToBring: [], inclusions: [],
  emergencyContactActivity: '', operatorContact: '',
};

// ── Chip editor (same as new page) ────────────────────────────────────────────
function ChipEditor({
  label, chips, onChange, suggestions = [], placeholder = 'Type and press Enter...',
}: {
  label: string; chips: string[]; onChange: (chips: string[]) => void;
  suggestions?: string[]; placeholder?: string;
}) {
  const [input, setInput] = React.useState('');
  const add = (val: string) => {
    const t = val.trim();
    if (t && !chips.includes(t)) onChange([...chips, t]);
    setInput('');
  };
  const remove = (chip: string) => onChange(chips.filter((c) => c !== chip));
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5 p-2 border rounded-md min-h-[40px]">
        {chips.map((chip) => (
          <Badge key={chip} variant="secondary" className="gap-1 text-xs">
            {chip}
            <button type="button" onClick={() => remove(chip)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
          </Badge>
        ))}
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(input); }
            if (e.key === 'Backspace' && !input && chips.length > 0) { const last = chips[chips.length - 1]; if (last) remove(last); }
          }}
          placeholder={placeholder}
          className="border-none shadow-none h-6 p-0 text-sm flex-1 min-w-[120px] focus-visible:ring-0"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestions.filter((s) => !chips.includes(s)).map((s) => (
            <button key={s} type="button" onClick={() => add(s)}
              className="text-xs text-muted-foreground bg-muted hover:bg-muted/80 px-2 py-0.5 rounded-full">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main edit page ─────────────────────────────────────────────────────────────
export default function EditVoucherPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [currentStep, setCurrentStep] = React.useState(1);
  const [formInitialized, setFormInitialized] = React.useState(false);

  // Supplier search
  const [supplierSearch, setSupplierSearch] = React.useState('');
  const [supplierOptions, setSupplierOptions] = React.useState<{ value: string; label: string }[]>([]);

  const { data: voucherResponse, loading: voucherLoading } = useApiQuery(
    () => vouchersApi.getById(id),
    [id],
  );

  const updateMutation = useApiMutation<UpdateVoucherRequest, any>((data) =>
    vouchersApi.update(id, data),
  );

  // Pre-fill form from loaded voucher
  React.useEffect(() => {
    if (formInitialized) return;
    const raw = (voucherResponse as any)?.data ?? (voucherResponse as any)?.data?.data;
    if (!raw) return;

    const d = raw.details ?? {};
    setForm({
      voucherType: raw.type ?? '',
      supplierId: raw.supplierId ?? '',
      supplierLabel: raw.supplierName ?? '',
      title: raw.title ?? '',
      language: raw.language ?? 'en',
      notes: raw.notes ?? '',
      // Hotel
      hotelName: d.hotelName ?? '',
      hotelAddress: d.hotelAddress ?? '',
      checkIn: d.checkIn ?? '',
      checkOut: d.checkOut ?? '',
      roomType: d.roomType ?? 'Deluxe',
      roomCount: String(d.roomCount ?? 1),
      mealPlan: d.mealPlan ?? 'EP',
      specialRequests: d.specialRequests ?? '',
      confirmationNumber: d.confirmationNumber ?? '',
      emergencyContact: d.emergencyContact ?? '',
      guests: d.guestNames?.length > 0 ? d.guestNames.map((n: string) => ({ name: n })) : [{ name: '' }],
      // Transport
      vehicleType: d.vehicleType ?? '',
      driverName: d.driverName ?? '',
      driverPhone: d.driverPhone ?? '',
      pickupLocation: d.pickupLocation ?? '',
      pickupTime: d.pickupTime ?? '',
      pickupMapsLink: d.pickupMapsLink ?? '',
      dropLocation: d.dropLocation ?? '',
      dropMapsLink: d.dropMapsLink ?? '',
      route: d.route ?? '',
      sightseeing: d.sightseeing ?? [],
      terms: d.terms ?? '',
      // Flight
      airline: d.airline ?? '',
      flightNumber: d.flightNumber ?? '',
      departureAirport: d.departureAirport ?? '',
      departureTime: d.departureTime ?? '',
      departureTerminal: d.departureTerminal ?? '',
      arrivalAirport: d.arrivalAirport ?? '',
      arrivalTime: d.arrivalTime ?? '',
      arrivalTerminal: d.arrivalTerminal ?? '',
      pnr: d.pnr ?? '',
      baggageAllowance: d.baggageAllowance ?? '',
      seatNumbers: d.seatNumbers ?? '',
      travelClass: d.travelClass ?? 'economy',
      mealPreference: d.mealPreference ?? '',
      passengers: d.passengers?.length > 0 ? d.passengers : [{ name: '', pnr: '' }],
      // Activity
      activityName: d.activityName ?? '',
      dateTime: d.dateTime ?? '',
      meetingPoint: d.meetingPoint ?? '',
      meetingPointMapsLink: d.meetingPointMapsLink ?? '',
      duration: d.duration ?? '',
      whatToBring: d.whatToBring ?? [],
      inclusions: d.inclusions ?? [],
      emergencyContactActivity: d.emergencyContact ?? '',
      operatorContact: d.operatorContact ?? '',
    });
    setFormInitialized(true);
  }, [voucherResponse, formInitialized]);

  // Load suppliers when type known
  React.useEffect(() => {
    const typeToCategory: Record<string, string> = {
      hotel: 'hotel', transport: 'transport', flight: 'airline', activity: 'activity_provider',
    };
    const category = form.voucherType ? typeToCategory[form.voucherType] : undefined;
    suppliersApi.list({ limit: 50, search: supplierSearch || undefined, category } as any).then((res) => {
      const data = (res as any)?.data;
      const items = Array.isArray(data) ? data : (data?.data ?? []);
      setSupplierOptions(items.map((s: any) => ({ value: s.id, label: s.companyName ?? s.name ?? s.id })));
    }).catch(() => {});
  }, [supplierSearch, form.voucherType]);

  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  // Guest helpers
  const addGuest = () => setField('guests', [...form.guests, { name: '' }]);
  const updateGuest = (i: number, name: string) => {
    const next = [...form.guests]; next[i] = { name }; setField('guests', next);
  };
  const removeGuest = (i: number) => setField('guests', form.guests.filter((_, idx) => idx !== i));

  // Passenger helpers
  const addPassenger = () => setField('passengers', [...form.passengers, { name: '', pnr: '' }]);
  const updatePassenger = (i: number, field: keyof Passenger, val: string) => {
    const next = [...form.passengers];
    const cur = next[i] ?? { name: '', pnr: '' };
    next[i] = { ...cur, [field]: val } as Passenger;
    setField('passengers', next);
  };
  const removePassenger = (i: number) => setField('passengers', form.passengers.filter((_, idx) => idx !== i));

  // Step validation
  const step1Valid = form.voucherType !== '';
  const step2Valid = (() => {
    switch (form.voucherType) {
      case 'hotel': return form.hotelName.trim() !== '' && !!form.checkIn && !!form.checkOut && form.guests.some((g) => g.name.trim() !== '');
      case 'transport': return form.vehicleType !== '' && form.pickupLocation.trim() !== '' && form.dropLocation.trim() !== '' && !!form.pickupTime;
      case 'flight': return form.airline.trim() !== '' && form.departureAirport.trim() !== '' && form.arrivalAirport.trim() !== '' && !!form.departureTime && !!form.arrivalTime && form.passengers.some((p) => p.name.trim() !== '');
      case 'activity': return form.activityName.trim() !== '' && form.meetingPoint.trim() !== '' && !!form.dateTime;
      default: return false;
    }
  })();
  const step3Valid = true; // optional fields
  const stepValid = [step1Valid, step2Valid, step3Valid, true];

  // Build details object (type-specific, correct field names)
  function buildDetails(): Record<string, any> {
    switch (form.voucherType) {
      case 'hotel':
        return {
          guestNames: form.guests.map((g) => g.name).filter(Boolean),
          hotelName: form.hotelName,
          hotelAddress: form.hotelAddress || undefined,
          checkIn: form.checkIn,
          checkOut: form.checkOut,
          roomType: form.roomType,
          roomCount: parseInt(form.roomCount, 10) || 1,
          mealPlan: form.mealPlan,
          specialRequests: form.specialRequests || undefined,
          confirmationNumber: form.confirmationNumber || undefined,
          emergencyContact: form.emergencyContact || undefined,
        };
      case 'transport':
        return {
          vehicleType: form.vehicleType,
          driverName: form.driverName || undefined,
          driverPhone: form.driverPhone || undefined,
          pickupLocation: form.pickupLocation,
          pickupTime: form.pickupTime,
          pickupMapsLink: form.pickupMapsLink || undefined,
          dropLocation: form.dropLocation,
          dropMapsLink: form.dropMapsLink || undefined,
          route: form.route || undefined,
          sightseeing: form.sightseeing.length > 0 ? form.sightseeing : undefined,
          terms: form.terms || undefined,
        };
      case 'flight':
        return {
          airline: form.airline,
          flightNumber: form.flightNumber,
          departureAirport: form.departureAirport,
          departureTime: form.departureTime,
          departureTerminal: form.departureTerminal || undefined,
          arrivalAirport: form.arrivalAirport,
          arrivalTime: form.arrivalTime,
          arrivalTerminal: form.arrivalTerminal || undefined,
          passengers: form.passengers.filter((p) => p.name.trim() !== ''),
          pnr: form.pnr || undefined,
          baggageAllowance: form.baggageAllowance || undefined,
          seatNumbers: form.seatNumbers || undefined,
          travelClass: form.travelClass,
          mealPreference: form.mealPreference || undefined,
        };
      case 'activity':
        return {
          activityName: form.activityName,
          dateTime: form.dateTime,
          meetingPoint: form.meetingPoint,
          meetingPointMapsLink: form.meetingPointMapsLink || undefined,
          duration: form.duration || undefined,
          whatToBring: form.whatToBring.length > 0 ? form.whatToBring : undefined,
          inclusions: form.inclusions.length > 0 ? form.inclusions : undefined,
          emergencyContact: form.emergencyContactActivity || undefined,
          operatorContact: form.operatorContact || undefined,
        };
      default: return {};
    }
  }

  async function handleSave() {
    if (!form.voucherType) {
      toast.error('Voucher type is required');
      return;
    }

    const updateData: UpdateVoucherRequest = {
      title: form.title.trim() || undefined,
      supplierId: form.supplierId || undefined,
      details: buildDetails(),
      language: form.language,
      notes: form.notes || undefined,
    };

    const result = await updateMutation.mutate(updateData);
    if (result !== undefined) {
      toast.success('Voucher updated successfully!');
      router.push(`/vouchers/${id}`);
    } else {
      toast.error(updateMutation.error?.message ?? 'Failed to update voucher');
    }
  }

  if (voucherLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Edit Voucher
            </h1>
            <p className="text-sm text-muted-foreground">Step {currentStep} of 4</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateMutation.loading}>
            {updateMutation.loading && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            <Save className="h-4 w-4 mr-1.5" /> Save Changes
          </Button>
        </div>
      </div>

      {/* Step progress */}
      <div className="px-6 py-4 border-b">
        <div className="flex items-center justify-between mb-2">
          {Array.from({ length: 4 }, (_, i) => (
            <React.Fragment key={i}>
              <button
                onClick={() => { if (i === 0 || stepValid[i - 1]) setCurrentStep(i + 1); }}
                className={cn(
                  'h-9 w-9 rounded-full flex items-center justify-center font-semibold text-sm transition-colors',
                  i < currentStep - 1 ? 'bg-primary text-primary-foreground' :
                  i === currentStep - 1 ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2' :
                  'bg-muted text-muted-foreground',
                )}
              >
                {i + 1}
              </button>
              {i < 3 && (
                <div className={cn('flex-1 h-0.5 mx-2', i < currentStep - 1 ? 'bg-primary' : 'bg-muted')} />
              )}
            </React.Fragment>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Type</span><span>Details</span><span>Options</span><span>Review</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-4">

          {/* STEP 1 — Type (read-only for edit, can't change type) */}
          {currentStep === 1 && (
            <Card>
              <CardHeader><CardTitle>Voucher Type</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[
                  { value: 'hotel', label: 'Hotel Voucher', desc: 'Hotel accommodation details' },
                  { value: 'transport', label: 'Transport Voucher', desc: 'Vehicle hire & transfers' },
                  { value: 'flight', label: 'Flight Voucher', desc: 'Flight booking details' },
                  { value: 'activity', label: 'Activity Voucher', desc: 'Tours & activities' },
                ].map((t) => (
                  <label
                    key={t.value}
                    className={cn(
                      'flex items-start gap-4 p-4 rounded-lg border',
                      form.voucherType === t.value ? 'border-primary bg-primary/5' : 'opacity-40',
                    )}
                  >
                    <input
                      type="radio" name="voucherType" value={t.value}
                      checked={form.voucherType === t.value}
                      readOnly
                      className="h-4 w-4 mt-0.5"
                    />
                    <div>
                      <p className="font-medium text-sm">{t.label}</p>
                      <p className="text-xs text-muted-foreground">{t.desc}</p>
                    </div>
                  </label>
                ))}
                <p className="text-xs text-muted-foreground italic">Voucher type cannot be changed after creation.</p>
              </CardContent>
            </Card>
          )}

          {/* STEP 2 — Type-specific details */}
          {currentStep === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {form.voucherType === 'hotel' && 'Hotel Details'}
                  {form.voucherType === 'transport' && 'Transport Details'}
                  {form.voucherType === 'flight' && 'Flight Details'}
                  {form.voucherType === 'activity' && 'Activity Details'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* HOTEL */}
                {form.voucherType === 'hotel' && (
                  <>
                    <div className="space-y-2">
                      <Label>Hotel Name <span className="text-destructive">*</span></Label>
                      <Input value={form.hotelName} onChange={(e) => setField('hotelName', e.target.value)} placeholder="e.g., Taj Hotels" />
                    </div>
                    <div className="space-y-2">
                      <Label>Address</Label>
                      <Input value={form.hotelAddress} onChange={(e) => setField('hotelAddress', e.target.value)} placeholder="Hotel address" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Check-in <span className="text-destructive">*</span></Label>
                        <Input type="date" value={form.checkIn} onChange={(e) => setField('checkIn', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Check-out <span className="text-destructive">*</span></Label>
                        <Input type="date" value={form.checkOut} onChange={(e) => setField('checkOut', e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Room Type</Label>
                        <Select value={form.roomType} onValueChange={(v) => setField('roomType', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['Standard', 'Deluxe', 'Super Deluxe', 'Suite', 'Premium', 'Executive', 'Villa', 'Cottage', 'Custom'].map((r) => (
                              <SelectItem key={r} value={r}>{r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Room Count</Label>
                        <Input type="number" min={1} value={form.roomCount} onChange={(e) => setField('roomCount', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Meal Plan</Label>
                        <Select value={form.mealPlan} onValueChange={(v) => setField('mealPlan', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="EP">EP — Room Only</SelectItem>
                            <SelectItem value="CP">CP — Continental (Breakfast)</SelectItem>
                            <SelectItem value="MAP">MAP — Half Board</SelectItem>
                            <SelectItem value="AP">AP — Full Board</SelectItem>
                            <SelectItem value="AI">AI — All Inclusive</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Confirmation Number</Label>
                        <Input value={form.confirmationNumber} onChange={(e) => setField('confirmationNumber', e.target.value)} placeholder="Hotel confirmation #" />
                      </div>
                      <div className="space-y-2">
                        <Label>Emergency Contact</Label>
                        <Input value={form.emergencyContact} onChange={(e) => setField('emergencyContact', e.target.value)} placeholder="+91 XXXXX XXXXX" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Guest Names <span className="text-destructive">*</span></Label>
                      <div className="space-y-2">
                        {form.guests.map((g, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Input value={g.name} onChange={(e) => updateGuest(i, e.target.value)} placeholder={`Guest ${i + 1} full name`} className="flex-1" />
                            {form.guests.length > 1 && (
                              <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeGuest(i)}><X className="h-4 w-4" /></Button>
                            )}
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={addGuest}><Plus className="h-3.5 w-3.5 mr-1" /> Add Guest</Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Special Requests</Label>
                      <Textarea value={form.specialRequests} onChange={(e) => setField('specialRequests', e.target.value)} rows={2} />
                    </div>
                  </>
                )}

                {/* TRANSPORT */}
                {form.voucherType === 'transport' && (
                  <>
                    <div className="space-y-2">
                      <Label>Vehicle Type <span className="text-destructive">*</span></Label>
                      <Select value={form.vehicleType} onValueChange={(v) => setField('vehicleType', v)}>
                        <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                        <SelectContent>
                          {['Sedan', 'SUV', 'Innova', 'Tempo Traveller (12-seater)', 'Mini Bus (20-seater)', 'Luxury Coach', 'Bus', 'Custom'].map((v) => (
                            <SelectItem key={v} value={v}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Driver Name</Label>
                        <Input value={form.driverName} onChange={(e) => setField('driverName', e.target.value)} placeholder="Driver name" />
                      </div>
                      <div className="space-y-2">
                        <Label>Driver Phone</Label>
                        <Input value={form.driverPhone} onChange={(e) => setField('driverPhone', e.target.value)} placeholder="+91 XXXXX XXXXX" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Pickup Location <span className="text-destructive">*</span></Label>
                        <Input value={form.pickupLocation} onChange={(e) => setField('pickupLocation', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Pickup Maps Link</Label>
                        <Input value={form.pickupMapsLink} onChange={(e) => setField('pickupMapsLink', e.target.value)} placeholder="https://..." />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Pickup Date &amp; Time <span className="text-destructive">*</span></Label>
                      <Input type="datetime-local" value={form.pickupTime} onChange={(e) => setField('pickupTime', e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Drop Location <span className="text-destructive">*</span></Label>
                        <Input value={form.dropLocation} onChange={(e) => setField('dropLocation', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Drop Maps Link</Label>
                        <Input value={form.dropMapsLink} onChange={(e) => setField('dropMapsLink', e.target.value)} placeholder="https://..." />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Route / Itinerary Summary</Label>
                      <Textarea value={form.route} onChange={(e) => setField('route', e.target.value)} rows={2} />
                    </div>
                    <ChipEditor label="Sightseeing" chips={form.sightseeing} onChange={(c) => setField('sightseeing', c)} />
                    <div className="space-y-2">
                      <Label>Terms &amp; Conditions</Label>
                      <Textarea value={form.terms} onChange={(e) => setField('terms', e.target.value)} rows={2} />
                    </div>
                  </>
                )}

                {/* FLIGHT */}
                {form.voucherType === 'flight' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Airline <span className="text-destructive">*</span></Label>
                        <Input value={form.airline} onChange={(e) => setField('airline', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Flight Number <span className="text-destructive">*</span></Label>
                        <Input value={form.flightNumber} onChange={(e) => setField('flightNumber', e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>From Airport <span className="text-destructive">*</span></Label>
                        <Input value={form.departureAirport} onChange={(e) => setField('departureAirport', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Departure Terminal</Label>
                        <Input value={form.departureTerminal} onChange={(e) => setField('departureTerminal', e.target.value)} placeholder="T2" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Departure Date &amp; Time <span className="text-destructive">*</span></Label>
                      <Input type="datetime-local" value={form.departureTime} onChange={(e) => setField('departureTime', e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>To Airport <span className="text-destructive">*</span></Label>
                        <Input value={form.arrivalAirport} onChange={(e) => setField('arrivalAirport', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Arrival Terminal</Label>
                        <Input value={form.arrivalTerminal} onChange={(e) => setField('arrivalTerminal', e.target.value)} placeholder="T3" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Arrival Date &amp; Time <span className="text-destructive">*</span></Label>
                      <Input type="datetime-local" value={form.arrivalTime} onChange={(e) => setField('arrivalTime', e.target.value)} />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Travel Class</Label>
                        <Select value={form.travelClass} onValueChange={(v) => setField('travelClass', v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="economy">Economy</SelectItem>
                            <SelectItem value="premium_economy">Premium Economy</SelectItem>
                            <SelectItem value="business">Business</SelectItem>
                            <SelectItem value="first">First</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Baggage Allowance</Label>
                        <Input value={form.baggageAllowance} onChange={(e) => setField('baggageAllowance', e.target.value)} placeholder="20kg + 7kg" />
                      </div>
                      <div className="space-y-2">
                        <Label>Seat Numbers</Label>
                        <Input value={form.seatNumbers} onChange={(e) => setField('seatNumbers', e.target.value)} placeholder="12A, 12B" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>PNR</Label>
                        <Input value={form.pnr} onChange={(e) => setField('pnr', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Meal Preference</Label>
                        <Input value={form.mealPreference} onChange={(e) => setField('mealPreference', e.target.value)} placeholder="Vegetarian" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Passengers <span className="text-destructive">*</span></Label>
                      <div className="space-y-2">
                        {form.passengers.map((p, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Input value={p.name} onChange={(e) => updatePassenger(i, 'name', e.target.value)} placeholder={`Passenger ${i + 1}`} className="flex-1" />
                            <Input value={p.pnr} onChange={(e) => updatePassenger(i, 'pnr', e.target.value)} placeholder="PNR" className="w-28" />
                            {form.passengers.length > 1 && (
                              <Button type="button" variant="ghost" size="icon-sm" onClick={() => removePassenger(i)}><X className="h-4 w-4" /></Button>
                            )}
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={addPassenger}><Plus className="h-3.5 w-3.5 mr-1" /> Add Passenger</Button>
                      </div>
                    </div>
                  </>
                )}

                {/* ACTIVITY */}
                {form.voucherType === 'activity' && (
                  <>
                    <div className="space-y-2">
                      <Label>Activity Name <span className="text-destructive">*</span></Label>
                      <Input value={form.activityName} onChange={(e) => setField('activityName', e.target.value)} placeholder="e.g., Scuba Diving" />
                    </div>
                    <div className="space-y-2">
                      <Label>Date &amp; Time <span className="text-destructive">*</span></Label>
                      <Input type="datetime-local" value={form.dateTime} onChange={(e) => setField('dateTime', e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Meeting Point <span className="text-destructive">*</span></Label>
                        <Input value={form.meetingPoint} onChange={(e) => setField('meetingPoint', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Meeting Point Maps Link</Label>
                        <Input value={form.meetingPointMapsLink} onChange={(e) => setField('meetingPointMapsLink', e.target.value)} placeholder="https://..." />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Duration</Label>
                      <Input value={form.duration} onChange={(e) => setField('duration', e.target.value)} placeholder="e.g., 4 hours" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Operator Contact</Label>
                        <Input value={form.operatorContact} onChange={(e) => setField('operatorContact', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Emergency Contact</Label>
                        <Input value={form.emergencyContactActivity} onChange={(e) => setField('emergencyContactActivity', e.target.value)} />
                      </div>
                    </div>
                    <ChipEditor label="Inclusions" chips={form.inclusions} onChange={(c) => setField('inclusions', c)}
                      suggestions={['Snorkeling gear', 'Instructor', 'Lunch', 'Transport', 'Insurance']} />
                    <ChipEditor label="What to Bring" chips={form.whatToBring} onChange={(c) => setField('whatToBring', c)}
                      suggestions={['Sunscreen', 'Swimwear', 'Towel', 'Water bottle', 'ID proof']} />
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* STEP 3 — Options */}
          {currentStep === 3 && (
            <Card>
              <CardHeader><CardTitle>Voucher Options</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {form.voucherType && (
                  <div className="space-y-2">
                    <Label>Supplier (optional)</Label>
                    <Combobox
                      options={supplierOptions}
                      value={form.supplierId}
                      onValueChange={(v) => {
                        const label = supplierOptions.find((o) => o.value === v)?.label ?? '';
                        setField('supplierId', v);
                        setField('supplierLabel', label);
                      }}
                      onSearch={setSupplierSearch}
                      placeholder="Search suppliers..."
                      emptyText="No suppliers found"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Voucher Title</Label>
                  <Input value={form.title} onChange={(e) => setField('title', e.target.value)} placeholder="Auto-generated if empty" />
                </div>
                <div className="space-y-2">
                  <Label>Language</Label>
                  <Select value={form.language} onValueChange={(v) => setField('language', v)}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="hi">Hindi</SelectItem>
                      <SelectItem value="ar">Arabic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={3} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 4 — Review */}
          {currentStep === 4 && (
            <Card>
              <CardHeader><CardTitle>Review &amp; Save</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <p className="text-sm text-blue-700 dark:text-blue-400">
                    Review your changes below and click <strong>Save Changes</strong> to update the voucher.
                    Only <strong>draft</strong> vouchers can be edited.
                  </p>
                </div>
                <div className="space-y-2 text-sm">
                  {[
                    ['Type', form.voucherType?.toUpperCase()],
                    ['Supplier', form.supplierLabel || '—'],
                    ['Language', form.language?.toUpperCase()],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b pb-1 last:border-0">
                      <span className="text-muted-foreground">{k}:</span>
                      <span className="font-medium">{v}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Footer nav */}
      <div className="border-t px-6 py-4 bg-background flex items-center justify-between">
        <Button variant="outline" onClick={() => setCurrentStep((s) => Math.max(1, s - 1))} disabled={currentStep === 1 || updateMutation.loading}>
          Previous
        </Button>
        <div className="flex items-center gap-2">
          {currentStep < 4 ? (
            <Button onClick={() => setCurrentStep((s) => s + 1)} disabled={!stepValid[currentStep - 1]}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={updateMutation.loading} className="gap-2">
              {updateMutation.loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <Save className="h-4 w-4" /> Update Voucher
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
