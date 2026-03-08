'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { vouchersApi, type CreateVoucherRequest } from '@/lib/api/vouchers';
import { leadsApi } from '@/lib/api/leads';

interface FormState {
  // Step 1: Type Selection
  voucherType: 'hotel' | 'transport' | 'flight' | 'activity' | '';

  // Hotel specific
  hotelName: string;
  hotelAddress: string;
  checkInDate: string;
  checkOutDate: string;
  roomType: string;
  mealPlan: string;
  specialRequests: string;

  // Transport specific
  vehicleType: string;
  driverName: string;
  pickupLocation: string;
  dropLocation: string;
  pickupDate: string;
  pickupTime: string;

  // Flight specific
  airline: string;
  flightNumber: string;
  pnr: string;
  departureDate: string;
  departureTime: string;
  departureAirport: string;
  arrivalAirport: string;
  flightClass: string;
  baggage: string;

  // Activity specific
  activityName: string;
  activityLocation: string;
  activityDate: string;
  activityTime: string;
  duration: string;
  inclusions: string;

  // Common fields
  leadId: string;
  title: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  guestSpecialRequirements: string;
}

const initialFormState: FormState = {
  voucherType: '',
  hotelName: '',
  hotelAddress: '',
  checkInDate: '',
  checkOutDate: '',
  roomType: '',
  mealPlan: '',
  specialRequests: '',
  vehicleType: '',
  driverName: '',
  pickupLocation: '',
  dropLocation: '',
  pickupDate: '',
  pickupTime: '',
  airline: '',
  flightNumber: '',
  pnr: '',
  departureDate: '',
  departureTime: '',
  departureAirport: '',
  arrivalAirport: '',
  flightClass: '',
  baggage: '',
  activityName: '',
  activityLocation: '',
  activityDate: '',
  activityTime: '',
  duration: '',
  inclusions: '',
  leadId: '',
  title: '',
  guestName: '',
  guestEmail: '',
  guestPhone: '',
  guestSpecialRequirements: '',
};

export default function NewVoucherPage() {
  const router = useRouter();
  const [form, setForm] = React.useState<FormState>(initialFormState);
  const [currentStep, setCurrentStep] = React.useState(1);

  const createMutation = useApiMutation<CreateVoucherRequest, any>((data) => vouchersApi.create(data));

  const leadsQuery = useApiQuery(
    () => leadsApi.list({ limit: 100 }),
    []
  );
  const leadsList: any[] = React.useMemo(() => {
    const data = leadsQuery.data?.data;
    return Array.isArray(data) ? data : (data?.data ?? []);
  }, [leadsQuery.data]);

  const updateField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const isStep1Valid = form.voucherType !== '';
  const isStep2Valid =
    form.voucherType === 'hotel'
      ? form.hotelName.trim() !== '' && form.checkInDate && form.checkOutDate
      : form.voucherType === 'transport'
        ? form.vehicleType && form.pickupLocation && form.dropLocation && form.pickupDate
        : form.voucherType === 'flight'
          ? form.airline && form.pnr && form.departureAirport && form.arrivalAirport && form.departureDate
          : form.voucherType === 'activity'
            ? form.activityName && form.activityLocation && form.activityDate
            : false;
  const isStep3Valid = form.guestName.trim() !== '' && form.guestEmail && form.guestPhone;

  const stepValid = [isStep1Valid, isStep2Valid, isStep3Valid, true];

  async function handleSave() {
    if (!form.leadId.trim()) {
      toast.error('Please enter a Lead ID');
      return;
    }
    if (!form.voucherType) {
      toast.error('Please select a voucher type');
      return;
    }

    const titleStr = form.title.trim() ||
      (form.voucherType === 'hotel' ? `Hotel - ${form.hotelName}` :
       form.voucherType === 'flight' ? `Flight - ${form.airline}` :
       form.voucherType === 'activity' ? `Activity - ${form.activityName}` :
       `Transport - ${form.pickupLocation} to ${form.dropLocation}`);

    const voucherData: CreateVoucherRequest = {
      leadId: form.leadId.trim(),
      type: form.voucherType as 'hotel' | 'transport' | 'flight' | 'activity',
      title: titleStr,
      details: {
        guestName: form.guestName,
        guestEmail: form.guestEmail,
        guestPhone: form.guestPhone,
        guestSpecialRequirements: form.guestSpecialRequirements,
        hotelName: form.hotelName, hotelAddress: form.hotelAddress,
        checkInDate: form.checkInDate, checkOutDate: form.checkOutDate,
        roomType: form.roomType, mealPlan: form.mealPlan, specialRequests: form.specialRequests,
        vehicleType: form.vehicleType, driverName: form.driverName,
        pickupLocation: form.pickupLocation, dropLocation: form.dropLocation,
        pickupDate: form.pickupDate, pickupTime: form.pickupTime,
        airline: form.airline, flightNumber: form.flightNumber, pnr: form.pnr,
        departureDate: form.departureDate, departureTime: form.departureTime,
        departureAirport: form.departureAirport, arrivalAirport: form.arrivalAirport,
        flightClass: form.flightClass, baggage: form.baggage,
        activityName: form.activityName, activityLocation: form.activityLocation,
        activityDate: form.activityDate, activityTime: form.activityTime,
        duration: form.duration, inclusions: form.inclusions,
      },
      notes: form.guestSpecialRequirements || undefined,
    };

    const result = await createMutation.mutate(voucherData);
    if (result) {
      toast.success('Voucher created successfully!');
      router.push('/vouchers');
    } else {
      toast.error(createMutation.error?.message ?? 'Failed to create voucher');
    }
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
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>New Voucher</h1>
            <p className="text-sm text-muted-foreground">Step {currentStep} of 4</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button onClick={handleSave}><Save className="h-4 w-4 mr-1.5" /> Save</Button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-6 py-4 border-b">
        <div className="flex items-center justify-between mb-2">
          {Array.from({ length: 4 }, (_, i) => (
            <React.Fragment key={i}>
              <button
                onClick={() => setCurrentStep(i + 1)}
                className={cn(
                  'h-10 w-10 rounded-full flex items-center justify-center font-semibold transition-colors',
                  stepValid[i]
                    ? 'bg-primary text-primary-foreground cursor-pointer'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {i + 1}
              </button>
              {i < 3 && (
                <div
                  className={cn(
                    'flex-1 h-1 mx-2 transition-colors',
                    stepValid[i] ? 'bg-primary' : 'bg-muted',
                  )}
                />
              )}
            </React.Fragment>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Type</span>
          <span>Details</span>
          <span>Guest Info</span>
          <span>Review</span>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {/* Step 1: Type Selection */}
          {currentStep === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Select Voucher Type</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { value: 'hotel', label: 'Hotel Voucher', desc: 'Hotel accommodation details' },
                  { value: 'transport', label: 'Transport Voucher', desc: 'Vehicle hire & transfers' },
                  { value: 'flight', label: 'Flight Voucher', desc: 'Flight booking details' },
                  { value: 'activity', label: 'Activity Voucher', desc: 'Tours & activities' },
                ].map((type: any) => (
                  <label
                    key={type.value}
                    className={cn(
                      'flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-all',
                      form.voucherType === type.value
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50',
                    )}
                  >
                    <input
                      type="radio"
                      name="voucherType"
                      value={type.value}
                      checked={form.voucherType === type.value}
                      onChange={(e) => updateField('voucherType', e.target.value as any)}
                      className="h-5 w-5 mt-0.5"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{type.label}</p>
                      <p className="text-xs text-muted-foreground">{type.desc}</p>
                    </div>
                  </label>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Step 2: Type-Specific Details */}
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
                {/* Hotel */}
                {form.voucherType === 'hotel' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="hotelName">Hotel Name *</Label>
                      <Input id="hotelName" value={form.hotelName} onChange={(e) => updateField('hotelName', e.target.value)} placeholder="e.g., Taj Hotels" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hotelAddress">Address</Label>
                      <Input id="hotelAddress" value={form.hotelAddress} onChange={(e) => updateField('hotelAddress', e.target.value)} placeholder="Hotel address" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="checkInDate">Check-in Date *</Label>
                        <Input id="checkInDate" type="date" value={form.checkInDate} onChange={(e) => updateField('checkInDate', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="checkOutDate">Check-out Date *</Label>
                        <Input id="checkOutDate" type="date" value={form.checkOutDate} onChange={(e) => updateField('checkOutDate', e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="roomType">Room Type</Label>
                        <Select value={form.roomType} onValueChange={(v) => updateField('roomType', v)}>
                          <SelectTrigger id="roomType"><SelectValue placeholder="Select room type" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="standard">Standard</SelectItem>
                            <SelectItem value="deluxe">Deluxe</SelectItem>
                            <SelectItem value="suite">Suite</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="mealPlan">Meal Plan</Label>
                        <Select value={form.mealPlan} onValueChange={(v) => updateField('mealPlan', v)}>
                          <SelectTrigger id="mealPlan"><SelectValue placeholder="Select meal plan" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cp">CP (Room Only)</SelectItem>
                            <SelectItem value="map">MAP (Half Board)</SelectItem>
                            <SelectItem value="ap">AP (Full Board)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="specialRequests">Special Requests</Label>
                      <Textarea id="specialRequests" value={form.specialRequests} onChange={(e) => updateField('specialRequests', e.target.value)} placeholder="e.g., High floor, near elevator..." rows={3} />
                    </div>
                  </>
                )}

                {/* Transport */}
                {form.voucherType === 'transport' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="vehicleType">Vehicle Type *</Label>
                      <Select value={form.vehicleType} onValueChange={(v) => updateField('vehicleType', v)}>
                        <SelectTrigger id="vehicleType"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sedan">Sedan</SelectItem>
                          <SelectItem value="suv">SUV</SelectItem>
                          <SelectItem value="tempo">Tempo</SelectItem>
                          <SelectItem value="bus">Bus</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="driverName">Driver Name</Label>
                      <Input id="driverName" value={form.driverName} onChange={(e) => updateField('driverName', e.target.value)} placeholder="Driver name" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="pickupLocation">Pickup Location *</Label>
                        <Input id="pickupLocation" value={form.pickupLocation} onChange={(e) => updateField('pickupLocation', e.target.value)} placeholder="Pickup location" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="dropLocation">Drop Location *</Label>
                        <Input id="dropLocation" value={form.dropLocation} onChange={(e) => updateField('dropLocation', e.target.value)} placeholder="Drop location" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="pickupDate">Pickup Date *</Label>
                        <Input id="pickupDate" type="date" value={form.pickupDate} onChange={(e) => updateField('pickupDate', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pickupTime">Pickup Time</Label>
                        <Input id="pickupTime" type="time" value={form.pickupTime} onChange={(e) => updateField('pickupTime', e.target.value)} />
                      </div>
                    </div>
                  </>
                )}

                {/* Flight */}
                {form.voucherType === 'flight' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="airline">Airline *</Label>
                        <Input id="airline" value={form.airline} onChange={(e) => updateField('airline', e.target.value)} placeholder="e.g., Air India" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pnr">PNR *</Label>
                        <Input id="pnr" value={form.pnr} onChange={(e) => updateField('pnr', e.target.value)} placeholder="Booking reference" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="flightNumber">Flight Number</Label>
                      <Input id="flightNumber" value={form.flightNumber} onChange={(e) => updateField('flightNumber', e.target.value)} placeholder="e.g., AI101" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="departureAirport">From Airport *</Label>
                        <Input id="departureAirport" value={form.departureAirport} onChange={(e) => updateField('departureAirport', e.target.value)} placeholder="e.g., BOM (Mumbai)" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="arrivalAirport">To Airport *</Label>
                        <Input id="arrivalAirport" value={form.arrivalAirport} onChange={(e) => updateField('arrivalAirport', e.target.value)} placeholder="e.g., DEL (Delhi)" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="departureDate">Departure Date *</Label>
                        <Input id="departureDate" type="date" value={form.departureDate} onChange={(e) => updateField('departureDate', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="departureTime">Departure Time</Label>
                        <Input id="departureTime" type="time" value={form.departureTime} onChange={(e) => updateField('departureTime', e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="flightClass">Class</Label>
                        <Select value={form.flightClass} onValueChange={(v) => updateField('flightClass', v)}>
                          <SelectTrigger id="flightClass"><SelectValue placeholder="Select class" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="economy">Economy</SelectItem>
                            <SelectItem value="business">Business</SelectItem>
                            <SelectItem value="first">First</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="baggage">Baggage</Label>
                        <Input id="baggage" value={form.baggage} onChange={(e) => updateField('baggage', e.target.value)} placeholder="e.g., 20kg + 7kg" />
                      </div>
                    </div>
                  </>
                )}

                {/* Activity */}
                {form.voucherType === 'activity' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="activityName">Activity Name *</Label>
                      <Input id="activityName" value={form.activityName} onChange={(e) => updateField('activityName', e.target.value)} placeholder="e.g., Scuba Diving" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="activityLocation">Location *</Label>
                      <Input id="activityLocation" value={form.activityLocation} onChange={(e) => updateField('activityLocation', e.target.value)} placeholder="Activity location" />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="activityDate">Date *</Label>
                        <Input id="activityDate" type="date" value={form.activityDate} onChange={(e) => updateField('activityDate', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="activityTime">Time</Label>
                        <Input id="activityTime" type="time" value={form.activityTime} onChange={(e) => updateField('activityTime', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="duration">Duration *</Label>
                        <Input id="duration" value={form.duration} onChange={(e) => updateField('duration', e.target.value)} placeholder="e.g., 4 hours" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="inclusions">Inclusions</Label>
                      <Textarea id="inclusions" value={form.inclusions} onChange={(e) => updateField('inclusions', e.target.value)} placeholder="What is included in this activity..." rows={3} />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 3: Guest Information */}
          {currentStep === 3 && (
            <Card>
              <CardHeader>
                <CardTitle>Guest & Lead Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="leadId">Lead *</Label>
                    <Select value={form.leadId} onValueChange={(v) => updateField('leadId', v)}>
                      <SelectTrigger><SelectValue placeholder="Select a lead" /></SelectTrigger>
                      <SelectContent>
                        {leadsList.map((lead: any) => (
                          <SelectItem key={lead.id} value={lead.id}>
                            {lead.title || lead.name || lead.id.slice(0, 8)} {lead.contactName ? `— ${lead.contactName}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="title">Voucher Title</Label>
                    <Input id="title" value={form.title} onChange={(e) => updateField('title', e.target.value)} placeholder="Auto-generated if empty" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guestName">Guest Name *</Label>
                  <Input id="guestName" value={form.guestName} onChange={(e) => updateField('guestName', e.target.value)} placeholder="Full name" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="guestEmail">Email *</Label>
                    <Input id="guestEmail" type="email" value={form.guestEmail} onChange={(e) => updateField('guestEmail', e.target.value)} placeholder="guest@example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="guestPhone">Phone *</Label>
                    <Input id="guestPhone" value={form.guestPhone} onChange={(e) => updateField('guestPhone', e.target.value)} placeholder="+91 XXXXX XXXXX" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guestSpecialRequirements">Special Requirements</Label>
                  <Textarea id="guestSpecialRequirements" value={form.guestSpecialRequirements} onChange={(e) => updateField('guestSpecialRequirements', e.target.value)} placeholder="Any special needs or preferences..." rows={4} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Review */}
          {currentStep === 4 && (
            <Card>
              <CardHeader>
                <CardTitle>Review & Confirm</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <p className="text-sm text-blue-700 dark:text-blue-400">
                    <strong>Summary:</strong> Your {form.voucherType?.charAt(0).toUpperCase() + form.voucherType?.slice(1)} voucher for{' '}
                    <strong>{form.guestName}</strong> is ready to be saved. You can send it via email or WhatsApp after saving.
                  </p>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Voucher Type:</span>
                    <span className="font-medium">{form.voucherType?.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Guest Name:</span>
                    <span className="font-medium">{form.guestName || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Contact:</span>
                    <span className="font-medium">{form.guestEmail}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="border-t px-6 py-4 bg-background flex items-center justify-between">
        <div />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
            disabled={currentStep === 1 || createMutation.loading}
          >
            Previous
          </Button>
          {currentStep < 4 ? (
            <Button
              onClick={() => setCurrentStep(currentStep + 1)}
              disabled={!stepValid[currentStep - 1]}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={createMutation.loading} className="gap-2">
              {createMutation.loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <Save className="h-4 w-4" /> Save Voucher
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
