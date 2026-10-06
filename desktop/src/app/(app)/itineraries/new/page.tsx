'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Plus, Save, Trash2, Hotel, Plane, Car, Utensils, Camera, ChevronDown, ChevronUp,
  Download, Loader2, BookOpen, GripVertical, LayoutTemplate,
} from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { CurrencyInput } from '@/components/ui/currency-input';
import { DatePicker } from '@/components/ui/date-picker';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { cn, formatCurrency } from '@/lib/utils';
import { itinerariesApi, errorMessage, type CreateItineraryRequest, type ItineraryItem } from '@/lib/api/itineraries';
import { client, type ApiResponse } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import { unwrapEntity } from '@/lib/api/envelope';
import type { RateCard } from '@/lib/api/rate-cards';
import { parseLocalDate, toLocalDateString } from '@/lib/dates';
import { RateCardPicker, rateCardSelling } from '../_components/rate-card-picker';
import { LeadCombobox } from '../_components/lead-combobox';
import { DayImageUploader, uploadDayImage, type DayImage } from '../_components/day-images';

type ActivityType = 'hotel' | 'flight' | 'transfer' | 'activity' | 'meal';

interface StructuredActivity {
  id: string;
  type: ActivityType;
  cost: number;
  sellingPrice: number;
  /** Set when the prices came from a rate card. */
  rateCardId?: string;
  supplierId?: string;
  /** Free-text service name for transfers and flights (e.g. the rate card name). */
  serviceName?: string;
  // Hotel fields
  hotelName?: string;
  checkInDate?: string;
  checkOutDate?: string;
  roomType?: 'Standard' | 'Deluxe' | 'Suite';
  mealPlan?: 'CP' | 'MAP' | 'AP';
  // Flight fields
  airline?: string;
  pnr?: string;
  flightClass?: 'Economy' | 'Business' | 'First';
  departureAirport?: string;
  arrivalAirport?: string;
  // Transfer fields
  vehicleType?: 'Sedan' | 'SUV' | 'Tempo';
  pickupLocation?: string;
  dropLocation?: string;
  // Activity fields
  activityName?: string;
  duration?: string;
  difficultyLevel?: 'Easy' | 'Moderate' | 'Hard';
  ageRestriction?: string;
  // Meal fields
  cuisineType?: string;
  restaurantName?: string;
}

interface Day {
  id: string;
  dayNumber: number;
  title: string;
  description: string;
  activities: StructuredActivity[];
  images: DayImage[];
  isExpanded: boolean;
}

interface Inclusion {
  id: string;
  text: string;
}

interface ItineraryDefaults {
  defaultTerms?: string;
  defaultInclusions?: string[];
  defaultExclusions?: string[];
}

const ACTIVITY_TYPES: ActivityType[] = ['hotel', 'flight', 'transfer', 'activity', 'meal'];

const activityIcons: Record<ActivityType, React.ElementType> = {
  hotel: Hotel, flight: Plane, transfer: Car, activity: Camera, meal: Utensils,
};

const activityColors: Record<ActivityType, string> = {
  hotel: 'bg-ds-info-subtle text-ds-info-on-subtle',
  flight: 'bg-ds-primary-subtle text-ds-primary-on-subtle',
  transfer: 'bg-ds-warning-subtle text-ds-warning-on-subtle',
  activity: 'bg-ds-success-subtle text-ds-success-on-subtle',
  meal: 'bg-ds-danger-subtle text-ds-danger-on-subtle',
};

/** Rate cards call transfers "transport". */
const RATE_CARD_TYPE: Record<ActivityType, 'hotel' | 'transport' | 'activity' | 'meal' | 'flight'> = {
  hotel: 'hotel', flight: 'flight', transfer: 'transport', activity: 'activity', meal: 'meal',
};

let idCounter = 0;
function generateId() {
  idCounter += 1;
  return `itin-item-${idCounter}`;
}

function activityTitle(a: StructuredActivity): string {
  if (a.type === 'hotel') return a.hotelName || 'Hotel Stay';
  if (a.type === 'flight') return a.serviceName || (a.airline ? `${a.airline} Flight` : 'Flight');
  if (a.type === 'transfer') return a.serviceName || (a.pickupLocation ? `Transfer from ${a.pickupLocation}` : 'Transfer');
  if (a.type === 'activity') return a.activityName || 'Activity';
  if (a.type === 'meal') return a.restaurantName || 'Meal';
  return 'Item';
}

function toDate(value?: string): Date | undefined {
  return value ? parseLocalDate(value) : undefined;
}

/* ── Sortable Day Card Wrapper ── */
function SortableDayCardWrapper({ dayId, children }: { dayId: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dayId });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="absolute left-2 top-4 z-10">
        <button
          type="button"
          aria-label="Reorder day"
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted"
        >
          <GripVertical className="size-4 text-muted-foreground" aria-hidden="true" />
        </button>
      </div>
      {children}
    </div>
  );
}

export default function ItineraryBuilderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillLeadId = searchParams.get('leadId') ?? '';
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [destination, setDestination] = React.useState('');
  const [leadId, setLeadId] = React.useState<string | null>(prefillLeadId || null);
  const [validityDate, setValidityDate] = React.useState<Date | undefined>(undefined);
  const [gstPercent, setGstPercent] = React.useState('18');
  const [markupPercent, setMarkupPercent] = React.useState('15');
  const [days, setDays] = React.useState<Day[]>(() => [
    { id: generateId(), dayNumber: 1, title: 'Arrival', description: '', activities: [], images: [], isExpanded: true },
    { id: generateId(), dayNumber: 2, title: 'Day 2', description: '', activities: [], images: [], isExpanded: true },
    { id: generateId(), dayNumber: 3, title: 'Departure', description: '', activities: [], images: [], isExpanded: true },
  ]);
  const [inclusions, setInclusions] = React.useState<Inclusion[]>(() => [
    { id: generateId(), text: 'Flights (economy)' },
    { id: generateId(), text: 'Hotels (3-star)' },
  ]);
  const [inclusionInput, setInclusionInput] = React.useState('');
  const [exclusions, setExclusions] = React.useState<Inclusion[]>([]);
  const [exclusionInput, setExclusionInput] = React.useState('');
  const [termsConditions, setTermsConditions] = React.useState('');
  const [loadingDefaults, setLoadingDefaults] = React.useState(false);
  const [titleError, setTitleError] = React.useState('');
  const [leadError, setLeadError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [currency, setCurrency] = React.useState('INR');

  // Rate card picker
  const [pickerTarget, setPickerTarget] = React.useState<{ dayId: string; activityId: string; type: ActivityType } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function addDay() {
    setDays((prev) => [
      ...prev,
      { id: generateId(), dayNumber: prev.length + 1, title: `Day ${prev.length + 1}`, description: '', activities: [], images: [], isExpanded: true },
    ]);
  }

  function removeDay(dayId: string) {
    setDays((prev) => prev.filter((d) => d.id !== dayId).map((d, i) => ({ ...d, dayNumber: i + 1 })));
  }

  function handleDayDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setDays((prev) => {
      const oldIndex = prev.findIndex((d) => d.id === active.id);
      const newIndex = prev.findIndex((d) => d.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const reordered = [...prev];
      const [moved] = reordered.splice(oldIndex, 1) as [Day];
      reordered.splice(newIndex, 0, moved);
      return reordered.map((d, i) => ({ ...d, dayNumber: i + 1 }));
    });
  }

  function patchDay(dayId: string, patch: Partial<Day>) {
    setDays((prev) => prev.map((d) => (d.id === dayId ? { ...d, ...patch } : d)));
  }

  async function uploadDayImages(dayId: string, files: FileList) {
    for (const file of Array.from(files)) {
      try {
        const image = await uploadDayImage(file);
        if (image) {
          setDays((prev) => prev.map((d) => (d.id === dayId ? { ...d, images: [...d.images, image] } : d)));
        }
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
  }

  function removeDayImage(dayId: string, imgIndex: number) {
    setDays((prev) => prev.map((d) => (d.id === dayId ? { ...d, images: d.images.filter((_, j) => j !== imgIndex) } : d)));
  }

  function addActivity(dayId: string, type: ActivityType) {
    const activity: StructuredActivity = { id: generateId(), type, cost: 0, sellingPrice: 0 };
    setDays((prev) => prev.map((d) => (d.id === dayId ? { ...d, activities: [...d.activities, activity] } : d)));
  }

  function removeActivity(dayId: string, activityId: string) {
    setDays((prev) => prev.map((d) => (d.id === dayId ? { ...d, activities: d.activities.filter((a) => a.id !== activityId) } : d)));
  }

  function patchActivity(dayId: string, activityId: string, patch: Partial<StructuredActivity>) {
    setDays((prev) =>
      prev.map((d) =>
        d.id === dayId
          ? { ...d, activities: d.activities.map((a) => (a.id === activityId ? { ...a, ...patch } : a)) }
          : d,
      ),
    );
  }

  function addInclusion() {
    if (inclusionInput.trim()) {
      setInclusions((prev) => [...prev, { id: generateId(), text: inclusionInput.trim() }]);
      setInclusionInput('');
    }
  }

  function addExclusion() {
    if (exclusionInput.trim()) {
      setExclusions((prev) => [...prev, { id: generateId(), text: exclusionInput.trim() }]);
      setExclusionInput('');
    }
  }

  async function loadDefaults() {
    setLoadingDefaults(true);
    try {
      const defaults = unwrapEntity<ItineraryDefaults>(
        await client.get<ApiResponse<ItineraryDefaults>>(API_ENDPOINTS.settings.itineraryDefaults),
      );
      if (defaults?.defaultTerms) setTermsConditions(defaults.defaultTerms);
      if (Array.isArray(defaults?.defaultInclusions)) {
        setInclusions(defaults.defaultInclusions.map((text) => ({ id: generateId(), text })));
      }
      if (Array.isArray(defaults?.defaultExclusions)) {
        setExclusions(defaults.defaultExclusions.map((text) => ({ id: generateId(), text })));
      }
      toast.success('Defaults loaded from settings');
    } catch {
      toast.error('Failed to load defaults');
    } finally {
      setLoadingDefaults(false);
    }
  }

  function applyRateCard(rc: RateCard) {
    if (!pickerTarget) return;
    const { dayId, activityId, type } = pickerTarget;
    const patch: Partial<StructuredActivity> = {
      cost: rc.costPrice,
      sellingPrice: rateCardSelling(rc),
      rateCardId: rc.id,
      supplierId: rc.supplierId ?? undefined,
    };
    if (type === 'hotel') patch.hotelName = rc.name;
    else if (type === 'activity') patch.activityName = rc.name;
    else if (type === 'meal') patch.restaurantName = rc.name;
    else patch.serviceName = rc.name;
    patchActivity(dayId, activityId, patch);
    toast.success('Rate card applied');
    setPickerTarget(null);
  }

  const totalCost = days.reduce((sum, d) => sum + d.activities.reduce((s, a) => s + a.cost, 0), 0);
  const markup = (totalCost * (parseFloat(markupPercent) || 0)) / 100;
  const subtotal = totalCost + markup;
  const gst = (subtotal * (parseFloat(gstPercent) || 0)) / 100;
  const grandTotal = subtotal + gst;
  const money = (n: number) => formatCurrency(n, currency);

  const handleSave = async () => {
    setTitleError('');
    setLeadError('');
    if (!title.trim()) {
      setTitleError('Enter an itinerary title');
      toast.error('Please enter an itinerary title');
      document.getElementById('title')?.focus();
      return;
    }
    if (!leadId) {
      setLeadError('Link this itinerary to a lead');
      toast.error('Please link this itinerary to a lead');
      return;
    }
    if (days.length === 0) {
      toast.error('Add at least one day to the itinerary');
      return;
    }

    const payload: CreateItineraryRequest = {
      leadId,
      title: title.trim(),
      validityDate: validityDate ? toLocalDateString(validityDate) : undefined,
      notes: description.trim() || undefined,
      inclusions: inclusions.map((i) => i.text),
      exclusions: exclusions.map((e) => e.text),
      termsConditions: termsConditions.trim() || undefined,
      currency,
      markupType: 'percentage',
      markupValue: parseFloat(markupPercent) || 0,
      days: days.map((d) => ({
        dayNumber: d.dayNumber,
        title: d.title || `Day ${d.dayNumber}`,
        description: d.description || undefined,
        city: destination.trim() || undefined,
        images: d.images.length > 0 ? d.images.map((img) => img.key) : undefined,
        items: d.activities.map((a, si): ItineraryItem => ({
          type: a.type === 'transfer' ? 'transport' : a.type,
          title: activityTitle(a),
          rateCardId: a.rateCardId,
          supplierId: a.supplierId,
          costPrice: a.cost || 0,
          sellingPrice: a.sellingPrice || 0,
          quantity: 1,
          sortOrder: si,
          detailsJson: JSON.stringify({
            hotelName: a.hotelName, checkInDate: a.checkInDate, checkOutDate: a.checkOutDate,
            roomType: a.roomType, mealPlan: a.mealPlan, airline: a.airline, pnr: a.pnr,
            flightClass: a.flightClass, departureAirport: a.departureAirport,
            arrivalAirport: a.arrivalAirport, vehicleType: a.vehicleType,
            pickupLocation: a.pickupLocation, dropLocation: a.dropLocation,
            activityName: a.activityName, duration: a.duration,
            difficultyLevel: a.difficultyLevel, ageRestriction: a.ageRestriction,
            restaurantName: a.restaurantName, cuisineType: a.cuisineType,
          }),
        })),
      })),
    };

    setSaving(true);
    try {
      const created = unwrapEntity<{ id?: string }>(await itinerariesApi.create(payload));
      if (created?.id) {
        toast.success('Itinerary created successfully');
        router.push(`/itineraries/${created.id}`);
      } else {
        toast.error('Failed to create itinerary');
      }
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to create itinerary'));
    } finally {
      setSaving(false);
    }
  };

  function renderActivityFields(activity: StructuredActivity, dayId: string) {
    const patch = (p: Partial<StructuredActivity>) => patchActivity(dayId, activity.id, p);
    const field = 'h-8 text-sm';

    switch (activity.type) {
      case 'hotel':
        return (
          <div className="space-y-ds-2">
            <div className="grid grid-cols-2 gap-ds-2">
              <Input placeholder="Hotel name" aria-label="Hotel name" value={activity.hotelName || ''} onChange={(e) => patch({ hotelName: e.target.value })} className={field} />
              <Select value={activity.roomType || ''} onValueChange={(v) => patch({ roomType: v as StructuredActivity['roomType'] })}>
                <SelectTrigger className="h-8 text-xs" aria-label="Room type"><SelectValue placeholder="Room type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Standard">Standard</SelectItem>
                  <SelectItem value="Deluxe">Deluxe</SelectItem>
                  <SelectItem value="Suite">Suite</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-ds-2">
              <DatePicker
                value={toDate(activity.checkInDate)}
                onChange={(d) => patch({ checkInDate: d ? toLocalDateString(d) : undefined })}
                placeholder="Check-in"
                aria-label="Check-in date"
                className="h-8 text-sm"
              />
              <DatePicker
                value={toDate(activity.checkOutDate)}
                onChange={(d) => patch({ checkOutDate: d ? toLocalDateString(d) : undefined })}
                placeholder="Check-out"
                aria-label="Check-out date"
                minDate={toDate(activity.checkInDate)}
                className="h-8 text-sm"
              />
              <Select value={activity.mealPlan || ''} onValueChange={(v) => patch({ mealPlan: v as StructuredActivity['mealPlan'] })}>
                <SelectTrigger className="h-8 text-xs" aria-label="Meal plan"><SelectValue placeholder="Meal" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CP">CP (Room Only)</SelectItem>
                  <SelectItem value="MAP">MAP (Half Board)</SelectItem>
                  <SelectItem value="AP">AP (Full Board)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      case 'flight':
        return (
          <div className="space-y-ds-2">
            <Input placeholder="Flight / service name" aria-label="Flight service name" value={activity.serviceName || ''} onChange={(e) => patch({ serviceName: e.target.value })} className={field} />
            <div className="grid grid-cols-3 gap-ds-2">
              <Input placeholder="Airline" aria-label="Airline" value={activity.airline || ''} onChange={(e) => patch({ airline: e.target.value })} className={field} />
              <Input placeholder="PNR" aria-label="PNR" value={activity.pnr || ''} onChange={(e) => patch({ pnr: e.target.value })} className={field} />
              <Select value={activity.flightClass || ''} onValueChange={(v) => patch({ flightClass: v as StructuredActivity['flightClass'] })}>
                <SelectTrigger className="h-8 text-xs" aria-label="Flight class"><SelectValue placeholder="Class" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Economy">Economy</SelectItem>
                  <SelectItem value="Business">Business</SelectItem>
                  <SelectItem value="First">First</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-ds-2">
              <Input placeholder="From (airport)" aria-label="From airport" value={activity.departureAirport || ''} onChange={(e) => patch({ departureAirport: e.target.value })} className={field} />
              <Input placeholder="To (airport)" aria-label="To airport" value={activity.arrivalAirport || ''} onChange={(e) => patch({ arrivalAirport: e.target.value })} className={field} />
            </div>
          </div>
        );
      case 'transfer':
        return (
          <div className="space-y-ds-2">
            <div className="grid grid-cols-2 gap-ds-2">
              <Input placeholder="Transfer / vehicle name" aria-label="Transfer name" value={activity.serviceName || ''} onChange={(e) => patch({ serviceName: e.target.value })} className={field} />
              <Select value={activity.vehicleType || ''} onValueChange={(v) => patch({ vehicleType: v as StructuredActivity['vehicleType'] })}>
                <SelectTrigger className="h-8 text-xs" aria-label="Vehicle type"><SelectValue placeholder="Vehicle type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sedan">Sedan</SelectItem>
                  <SelectItem value="SUV">SUV</SelectItem>
                  <SelectItem value="Tempo">Tempo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-ds-2">
              <Input placeholder="Pickup location" aria-label="Pickup location" value={activity.pickupLocation || ''} onChange={(e) => patch({ pickupLocation: e.target.value })} className={field} />
              <Input placeholder="Drop location" aria-label="Drop location" value={activity.dropLocation || ''} onChange={(e) => patch({ dropLocation: e.target.value })} className={field} />
            </div>
          </div>
        );
      case 'activity':
        return (
          <div className="space-y-ds-2">
            <Input placeholder="Activity name" aria-label="Activity name" value={activity.activityName || ''} onChange={(e) => patch({ activityName: e.target.value })} className={field} />
            <div className="grid grid-cols-3 gap-ds-2">
              <Input placeholder="Duration (e.g., 4 hours)" aria-label="Duration" value={activity.duration || ''} onChange={(e) => patch({ duration: e.target.value })} className={field} />
              <Select value={activity.difficultyLevel || ''} onValueChange={(v) => patch({ difficultyLevel: v as StructuredActivity['difficultyLevel'] })}>
                <SelectTrigger className="h-8 text-xs" aria-label="Difficulty"><SelectValue placeholder="Difficulty" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Easy">Easy</SelectItem>
                  <SelectItem value="Moderate">Moderate</SelectItem>
                  <SelectItem value="Hard">Hard</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Age restriction" aria-label="Age restriction" value={activity.ageRestriction || ''} onChange={(e) => patch({ ageRestriction: e.target.value })} className={field} />
            </div>
          </div>
        );
      case 'meal':
        return (
          <div className="grid grid-cols-2 gap-ds-2">
            <Input placeholder="Restaurant name" aria-label="Restaurant name" value={activity.restaurantName || ''} onChange={(e) => patch({ restaurantName: e.target.value })} className={field} />
            <Input placeholder="Cuisine type" aria-label="Cuisine type" value={activity.cuisineType || ''} onChange={(e) => patch({ cuisineType: e.target.value })} className={field} />
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="New Itinerary"
        description="Plan the days, price each item, then save it against a lead."
        breadcrumbs={[{ label: 'Itineraries', href: '/itineraries' }, { label: 'New' }]}
        actions={
          <>
            <Button variant="outline" onClick={() => router.push('/itineraries/templates')} disabled={saving}>
              <LayoutTemplate className="size-4 mr-1.5" aria-hidden="true" /> Start from a template
            </Button>
            <Button variant="outline" onClick={() => router.back()} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" aria-hidden="true" /> : <Save className="size-4 mr-1.5" aria-hidden="true" />}
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </>
        }
      />

      <div className="space-y-ds-4">
        {/* Basic Info Section */}
        <Card>
          <CardHeader><CardTitle className="text-base">Basic Information</CardTitle></CardHeader>
          <CardContent className="space-y-ds-3">
            <div className="space-y-ds-1">
              <Label htmlFor="title" className="text-xs">Title <span className="text-ds-danger" aria-hidden="true">*</span></Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => { setTitle(e.target.value); if (titleError) setTitleError(''); }}
                placeholder="Itinerary title, e.g. Nair Family - Kerala Backwaters"
                aria-required="true"
                aria-invalid={titleError ? true : undefined}
              />
              {titleError && <p role="alert" className="text-xs text-ds-danger">{titleError}</p>}
            </div>
            <div className="grid gap-ds-3 sm:grid-cols-2">
              <div className="space-y-ds-1">
                <Label className="text-xs">Link to Lead <span className="text-ds-danger" aria-hidden="true">*</span></Label>
                <LeadCombobox
                  value={leadId}
                  onChange={(id) => { setLeadId(id); if (id) setLeadError(''); }}
                  required
                  error={leadError || undefined}
                  aria-label="Link to lead"
                />
              </div>
              <div className="space-y-ds-1">
                <Label htmlFor="dest" className="text-xs">Destination</Label>
                <Input
                  id="dest"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="e.g., Maldives"
                />
              </div>
            </div>
            <div className="space-y-ds-1 max-w-xs">
              <Label htmlFor="validity" className="text-xs">Valid Until</Label>
              <DatePicker
                id="validity"
                value={validityDate}
                onChange={setValidityDate}
                placeholder="Pick a date"
                minDate={new Date()}
                toYear={new Date().getFullYear() + 3}
              />
            </div>
            <div className="space-y-ds-1">
              <Label htmlFor="desc" className="text-xs">Description (optional)</Label>
              <Textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add itinerary description..."
                className="h-20 text-sm resize-none"
              />
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* Days Section */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDayDragEnd}>
          <SortableContext items={days.map((d) => d.id)} strategy={verticalListSortingStrategy}>
            {days.map((day) => (
              <SortableDayCardWrapper key={day.id} dayId={day.id}>
                <Card className="mb-ds-4">
                  <CardHeader className="py-3 px-4 pl-10 cursor-pointer" onClick={() => patchDay(day.id, { isExpanded: !day.isExpanded })}>
                    <div className="flex items-center gap-ds-3">
                      <div className="flex size-8 items-center justify-center rounded-full bg-ds-primary text-ds-primary-foreground text-sm font-bold">
                        {day.dayNumber}
                      </div>
                      <Input
                        value={day.title}
                        onChange={(e) => patchDay(day.id, { title: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                        className="text-sm font-semibold border-none shadow-none p-0 h-auto focus-visible:ring-0 flex-1"
                        placeholder="Day title..."
                        aria-label={`Day ${day.dayNumber} title`}
                      />
                      <div className="flex items-center gap-ds-1">
                        <Badge variant="secondary" className="text-xs">{day.activities.length} items</Badge>
                        {day.isExpanded ? <ChevronUp className="size-4 text-muted-foreground" aria-hidden="true" /> : <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />}
                        {days.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove day ${day.dayNumber}`}
                            onClick={(e) => { e.stopPropagation(); removeDay(day.id); }}
                          >
                            <Trash2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  {day.isExpanded && (
                    <CardContent className="pt-0 pb-4 px-4 space-y-ds-3">
                      <div className="space-y-ds-1">
                        <Label className="text-xs">Day Description</Label>
                        <RichTextEditor
                          value={day.description}
                          onChange={(html) => patchDay(day.id, { description: html })}
                          placeholder="Describe this day's highlights and details..."
                          minHeight="4rem"
                        />
                      </div>

                      <DayImageUploader
                        images={day.images}
                        onUpload={(files) => void uploadDayImages(day.id, files)}
                        onRemove={(idx) => removeDayImage(day.id, idx)}
                      />

                      {day.activities.map((activity) => {
                        const Icon = activityIcons[activity.type] ?? Camera;
                        return (
                          <div key={activity.id} className="flex gap-ds-3 p-ds-3 rounded-lg border border-ds-border bg-ds-surface-sunken">
                            <div className={cn('size-8 rounded-md flex items-center justify-center shrink-0', activityColors[activity.type])}>
                              <Icon className="size-4" aria-hidden="true" />
                            </div>
                            <div className="flex-1 min-w-0 space-y-ds-2">
                              {renderActivityFields(activity, day.id)}
                              <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-ds-2 pt-ds-1">
                                <CurrencyInput
                                  value={activity.cost || undefined}
                                  onChange={(v) => patchActivity(day.id, activity.id, { cost: v ?? 0 })}
                                  currency={currency}
                                  className="h-8 text-xs"
                                  placeholder="Cost"
                                  aria-label="Cost price"
                                />
                                <CurrencyInput
                                  value={activity.sellingPrice || undefined}
                                  onChange={(v) => patchActivity(day.id, activity.id, { sellingPrice: v ?? 0 })}
                                  currency={currency}
                                  className="h-8 text-xs"
                                  placeholder="Selling"
                                  aria-label="Selling price"
                                />
                                <div className="flex gap-ds-1">
                                  <Button
                                    variant="outline"
                                    size="icon-sm"
                                    onClick={() => setPickerTarget({ dayId: day.id, activityId: activity.id, type: activity.type })}
                                    title="Select from Rate Card"
                                    aria-label="Select from Rate Card"
                                    className="text-muted-foreground hover:text-primary"
                                  >
                                    <BookOpen className="size-3.5" aria-hidden="true" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="Remove item"
                                    onClick={() => removeActivity(day.id, activity.id)}
                                    className="text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="size-3.5" aria-hidden="true" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      <div className="flex flex-wrap gap-ds-2 pt-ds-1">
                        {ACTIVITY_TYPES.map((type) => {
                          const Icon = activityIcons[type];
                          return (
                            <Button
                              key={type}
                              variant="outline"
                              size="sm"
                              className="gap-ds-1"
                              onClick={() => addActivity(day.id, type)}
                            >
                              <Icon className="size-3" aria-hidden="true" />
                              <span className="capitalize">{type}</span>
                            </Button>
                          );
                        })}
                      </div>
                    </CardContent>
                  )}
                </Card>
              </SortableDayCardWrapper>
            ))}
          </SortableContext>
        </DndContext>

        <Button variant="outline" className="w-full" onClick={addDay}>
          <Plus className="size-4 mr-1.5" aria-hidden="true" /> Add Day
        </Button>

        <Separator />

        {/* Inclusions */}
        <Card>
          <CardHeader><CardTitle className="text-base text-ds-success">Inclusions</CardTitle></CardHeader>
          <CardContent className="space-y-ds-3">
            <div className="space-y-ds-2">
              {inclusions.map((inc) => (
                <div key={inc.id} className="flex items-center gap-ds-2 p-ds-2 rounded-lg border border-ds-border bg-ds-success-subtle">
                  <span className="text-ds-success-on-subtle text-sm font-medium">+</span>
                  <span className="flex-1 text-sm">{inc.text}</span>
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove inclusion ${inc.text}`} onClick={() => setInclusions((prev) => prev.filter((i) => i.id !== inc.id))}>
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-ds-2">
              <Input
                value={inclusionInput}
                onChange={(e) => setInclusionInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addInclusion(); } }}
                placeholder="Add inclusion (e.g., Airport transfers)"
                className="h-8 text-sm"
              />
              <Button size="sm" aria-label="Add inclusion" onClick={addInclusion}><Plus className="size-3" aria-hidden="true" /></Button>
            </div>
          </CardContent>
        </Card>

        {/* Exclusions */}
        <Card>
          <CardHeader><CardTitle className="text-base text-ds-danger">Exclusions</CardTitle></CardHeader>
          <CardContent className="space-y-ds-3">
            <div className="space-y-ds-2">
              {exclusions.map((exc) => (
                <div key={exc.id} className="flex items-center gap-ds-2 p-ds-2 rounded-lg border border-ds-border bg-ds-danger-subtle">
                  <span className="text-ds-danger-on-subtle text-sm font-medium">-</span>
                  <span className="flex-1 text-sm">{exc.text}</span>
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove exclusion ${exc.text}`} onClick={() => setExclusions((prev) => prev.filter((e) => e.id !== exc.id))}>
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-ds-2">
              <Input
                value={exclusionInput}
                onChange={(e) => setExclusionInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExclusion(); } }}
                placeholder="Add exclusion (e.g., Visa fees)"
                className="h-8 text-sm"
              />
              <Button size="sm" aria-label="Add exclusion" onClick={addExclusion}><Plus className="size-3" aria-hidden="true" /></Button>
            </div>
          </CardContent>
        </Card>

        {/* Terms & Conditions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Terms & Conditions</CardTitle>
              <Button variant="outline" size="sm" onClick={loadDefaults} disabled={loadingDefaults} className="gap-ds-2">
                {loadingDefaults ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : <Download className="size-3" aria-hidden="true" />}
                Load from Settings
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              value={termsConditions}
              onChange={(e) => setTermsConditions(e.target.value)}
              placeholder="Enter terms and conditions, or click 'Load from Settings' to use tenant defaults..."
              rows={6}
              className="text-sm resize-none"
              aria-label="Terms and conditions"
            />
          </CardContent>
        </Card>

        <Separator />

        {/* Pricing & Taxes */}
        <Card>
          <CardHeader><CardTitle className="text-base">Pricing & Taxes</CardTitle></CardHeader>
          <CardContent className="space-y-ds-3">
            <div className="grid grid-cols-2 gap-ds-4 sm:grid-cols-4 max-w-xl">
              <div className="space-y-ds-1">
                <Label htmlFor="currency" className="text-xs">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="currency" className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['INR', 'USD', 'EUR', 'GBP', 'AED', 'THB', 'SGD'].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-ds-1">
                <Label htmlFor="markup" className="text-xs">Markup %</Label>
                <Input id="markup" type="number" value={markupPercent} onChange={(e) => setMarkupPercent(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-ds-1">
                <Label htmlFor="gst" className="text-xs">GST %</Label>
                <Input id="gst" type="number" value={gstPercent} onChange={(e) => setGstPercent(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-ds-1">
                <Label className="text-xs text-muted-foreground">Total</Label>
                <div className="h-8 px-3 rounded-md border border-ds-border flex items-center justify-center font-bold text-sm">
                  {money(grandTotal)}
                </div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground space-y-ds-1 max-w-md">
              <p>Cost: {money(totalCost)}</p>
              <p>+ Markup ({markupPercent || 0}%): {money(markup)}</p>
              <p>+ GST ({gstPercent || 0}%): {money(gst)}</p>
              <p className="font-semibold text-foreground">= Grand Total: {money(grandTotal)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <RateCardPicker
        open={pickerTarget !== null}
        onOpenChange={(open) => { if (!open) setPickerTarget(null); }}
        serviceType={pickerTarget ? RATE_CARD_TYPE[pickerTarget.type] : undefined}
        onSelect={applyRateCard}
      />
    </PageContainer>
  );
}
