'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Plus, Save, Trash2, Hotel, Plane,
  Car, Utensils, Camera, ChevronDown, ChevronUp, FileText, Send, Copy, Download, Loader2, Search, BookOpen,
  GripVertical, ImagePlus, X,
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
import {
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { cn } from '@/lib/utils';
import { useApiMutation, useApiQuery } from '@/hooks/use-api';
import { itinerariesApi, type CreateItineraryRequest } from '@/lib/api/itineraries';
import { client, type ApiResponse } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import { leadsApi } from '@/lib/api/leads';

const REF_DATE = Date.now();

interface StructuredActivity {
  id: string;
  type: 'hotel' | 'flight' | 'transfer' | 'activity' | 'meal';
  cost: number;
  sellingPrice: number;
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

interface DayImage {
  key: string;
  url: string;
  name: string;
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

const activityIcons: Record<string, React.ElementType> = {
  hotel: Hotel, flight: Plane, transfer: Car, activity: Camera, meal: Utensils,
};

const activityColors: Record<string, string> = {
  hotel: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  flight: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  transfer: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  activity: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  meal: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

let idCounter = 0;
function generateId() {
  idCounter += 1;
  return `itin-item-${idCounter}`;
}

/* ── Day Image Uploader ── */
function DayImageUploader({
  dayId,
  images,
  onUpload,
  onRemove,
}: {
  dayId: string;
  images: DayImage[];
  onUpload: (dayId: string, files: FileList) => void;
  onRemove: (dayId: string, imgIndex: number) => void;
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-xs">Images</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onUpload(dayId, e.target.files);
              e.target.value = '';
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-6 text-xs gap-1"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus className="h-3 w-3" /> Add Images
        </Button>
      </div>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, imgIdx) => (
            <div key={img.key} className="relative group">
              <img
                src={img.url}
                alt={img.name}
                className="h-20 w-20 object-cover rounded-md border"
              />
              <button
                type="button"
                onClick={() => onRemove(dayId, imgIdx)}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Sortable Day Card Wrapper ── */
function SortableDayCardWrapper({
  dayId,
  children,
}: {
  dayId: string;
  children: React.ReactNode;
}) {
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
        <button type="button" {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
      {children}
    </div>
  );
}

export default function ItineraryBuilderPage() {
  const router = useRouter();
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [destination, setDestination] = React.useState('');
  const [leadId, setLeadId] = React.useState('');
  const [leadSearch, setLeadSearch] = React.useState('');
  const [leadDropdownOpen, setLeadDropdownOpen] = React.useState(false);
  const [selectedLeadLabel, setSelectedLeadLabel] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [version, setVersion] = React.useState<'v1' | 'v2' | 'v3'>('v1');
  const [gstPercent, setGstPercent] = React.useState('18');
  const [markupPercent, setMarkupPercent] = React.useState('15');
  const [days, setDays] = React.useState<Day[]>([
    { id: generateId(), dayNumber: 1, title: 'Arrival', description: '', activities: [], images: [], isExpanded: true },
    { id: generateId(), dayNumber: 2, title: 'Day 2', description: '', activities: [], images: [], isExpanded: true },
    { id: generateId(), dayNumber: 3, title: 'Departure', description: '', activities: [], images: [], isExpanded: true },
  ]);
  const [inclusions, setInclusions] = React.useState<Inclusion[]>([
    { id: generateId(), text: 'Flights (economy)' },
    { id: generateId(), text: 'Hotels (3-star)' },
  ]);
  const [inclusionInput, setInclusionInput] = React.useState('');
  const [exclusions, setExclusions] = React.useState<Inclusion[]>([]);
  const [exclusionInput, setExclusionInput] = React.useState('');

  // Lead search query
  const { data: leadsResponse } = useApiQuery(
    () => leadsApi.list({ page: 1, limit: 20, search: leadSearch || undefined }),
    [leadSearch],
  );

  const leadOptions = React.useMemo(() => {
    if (!leadsResponse) return [];
    const data = (leadsResponse as any)?.data;
    const items = Array.isArray(data) ? data : (data as any)?.data ?? [];
    return items.map((l: any) => ({
      id: l.id,
      label: `${l.title}${l.contactName ? ` - ${l.contactName}` : ''}`,
    }));
  }, [leadsResponse]);

  // Task 2H: Currency selector
  const [currency, setCurrency] = React.useState('INR');

  // Task 2G: Rate card picker
  const [rateCardPickerOpen, setRateCardPickerOpen] = React.useState(false);
  const [rateCardPickerTarget, setRateCardPickerTarget] = React.useState<{ dayId: string; activityId: string; activityType: string } | null>(null);
  const [rateCardSearchQuery, setRateCardSearchQuery] = React.useState('');
  const [rateCardResults, setRateCardResults] = React.useState<any[]>([]);
  const [rateCardLoading, setRateCardLoading] = React.useState(false);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { mutate: createItinerary, loading: saveLoading } = useApiMutation(
    async (data: CreateItineraryRequest) => {
      const result = await itinerariesApi.create(data);
      if (result && typeof result === 'object' && 'data' in result) {
        return (result as any).data;
      }
      return result;
    },
  );

  function addDay() {
    setDays((prev) => [
      ...prev,
      { id: generateId(), dayNumber: prev.length + 1, title: `Day ${prev.length + 1}`, description: '', activities: [], images: [], isExpanded: true },
    ]);
  }

  function removeDay(dayId: string) {
    setDays((prev) => prev.filter((d: any) => d.id !== dayId).map((d, i) => ({ ...d, dayNumber: i + 1 })));
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

  function updateDayDescription(dayId: string, description: string) {
    setDays((prev) => prev.map((d: any) => d.id === dayId ? { ...d, description } : d));
  }

  async function uploadDayImages(dayId: string, files: FileList) {
    for (const file of Array.from(files)) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await client.post<ApiResponse<{ key: string; url: string; name: string; size: number }>>(
          API_ENDPOINTS.files.upload,
          formData as any,
        );
        const uploaded = (res as any)?.data ?? res;
        if (uploaded?.key) {
          setDays((prev) =>
            prev.map((d) =>
              d.id === dayId
                ? { ...d, images: [...d.images, { key: uploaded.key, url: uploaded.url, name: uploaded.name }] }
                : d,
            ),
          );
        }
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
  }

  function removeDayImage(dayId: string, imgIndex: number) {
    setDays((prev) =>
      prev.map((d) =>
        d.id === dayId
          ? { ...d, images: d.images.filter((_, j) => j !== imgIndex) }
          : d,
      ),
    );
  }

  function toggleDay(dayId: string) {
    setDays((prev) => prev.map((d: any) => d.id === dayId ? { ...d, isExpanded: !d.isExpanded } : d));
  }

  function updateDayTitle(dayId: string, title: string) {
    setDays((prev) => prev.map((d: any) => d.id === dayId ? { ...d, title } : d));
  }

  function addActivity(dayId: string, type: StructuredActivity['type']) {
    const activity: StructuredActivity = {
      id: generateId(),
      type,
      cost: 0,
      sellingPrice: 0,
    };
    setDays((prev) => prev.map((d: any) => d.id === dayId ? { ...d, activities: [...d.activities, activity] } : d));
  }

  function removeActivity(dayId: string, activityId: string) {
    setDays((prev) => prev.map((d: any) => d.id === dayId ? { ...d, activities: d.activities.filter((a: any) => a.id !== activityId) } : d));
  }

  function updateActivity(dayId: string, activityId: string, field: keyof StructuredActivity, value: string | number) {
    setDays((prev) =>
      prev.map((d: any) =>
        d.id === dayId
          ? { ...d, activities: d.activities.map((a: any) => (a.id === activityId ? { ...a, [field]: value } : a)) }
          : d,
      ),
    );
  }

  function addInclusion() {
    if (inclusionInput.trim()) {
      setInclusions((prev) => [...prev, { id: generateId(), text: inclusionInput }]);
      setInclusionInput('');
    }
  }

  function removeInclusion(id: string) {
    setInclusions((prev) => prev.filter((inc: any) => inc.id !== id));
  }

  function addExclusion() {
    if (exclusionInput.trim()) {
      setExclusions((prev) => [...prev, { id: generateId(), text: exclusionInput }]);
      setExclusionInput('');
    }
  }

  function removeExclusion(id: string) {
    setExclusions((prev) => prev.filter((exc: any) => exc.id !== id));
  }

  // Task 2G: open rate card picker for an activity
  function openRateCardPicker(dayId: string, activityId: string, activityType: string) {
    setRateCardPickerTarget({ dayId, activityId, activityType });
    setRateCardSearchQuery('');
    setRateCardResults([]);
    setRateCardPickerOpen(true);
    // Auto-search on open
    searchRateCards(activityType, '');
  }

  async function searchRateCards(type?: string, query?: string) {
    setRateCardLoading(true);
    try {
      const params: Record<string, string> = {};
      if (type) params.type = type;
      if (destination.trim()) params.destination = destination.trim();
      if (query?.trim()) params.search = query.trim();
      const result = await client.get<ApiResponse<any>>(API_ENDPOINTS.rateCards.lookup, { params });
      const data = (result as any)?.data;
      const items = Array.isArray(data) ? data : (data as any)?.data ?? [];
      setRateCardResults(items);
    } catch {
      setRateCardResults([]);
    } finally {
      setRateCardLoading(false);
    }
  }

  function selectRateCard(rateCard: any) {
    if (!rateCardPickerTarget) return;
    const { dayId, activityId } = rateCardPickerTarget;
    updateActivity(dayId, activityId, 'cost', rateCard.rate ?? rateCard.cost ?? 0);
    updateActivity(dayId, activityId, 'sellingPrice', rateCard.sellingPrice ?? rateCard.selling_price ?? rateCard.rate ?? 0);
    // Fill in name fields depending on type
    if (rateCard.serviceName || rateCard.service_name) {
      const name = rateCard.serviceName ?? rateCard.service_name;
      const type = rateCardPickerTarget.activityType;
      if (type === 'hotel') updateActivity(dayId, activityId, 'hotelName', name);
      else if (type === 'activity') updateActivity(dayId, activityId, 'activityName', name);
      else if (type === 'meal') updateActivity(dayId, activityId, 'restaurantName', name);
      else if (type === 'flight') updateActivity(dayId, activityId, 'airline', name);
    }
    toast.success('Rate card applied');
    setRateCardPickerOpen(false);
    setRateCardPickerTarget(null);
  }

  const totalCost = days.reduce((sum: any, d: any) => sum + d.activities.reduce((s: any, a: any) => s + a.cost, 0), 0);
  const markup = totalCost * (parseFloat(markupPercent) || 0) / 100;
  const subtotal = totalCost + markup;
  const gst = subtotal * (parseFloat(gstPercent) || 0) / 100;
  const grandTotal = subtotal + gst;

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Please enter an itinerary title');
      return;
    }
    if (!leadId.trim()) {
      toast.error('Please link this itinerary to a lead');
      return;
    }
    if (days.length === 0) {
      toast.error('Add at least one day to the itinerary');
      return;
    }

    try {
      function activityTitle(a: StructuredActivity): string {
        if (a.type === 'hotel') return a.hotelName || 'Hotel Stay';
        if (a.type === 'flight') return a.airline ? `${a.airline} Flight` : 'Flight';
        if (a.type === 'transfer') return a.pickupLocation ? `Transfer from ${a.pickupLocation}` : 'Transfer';
        if (a.type === 'activity') return a.activityName || 'Activity';
        if (a.type === 'meal') return a.restaurantName || 'Meal';
        return 'Item';
      }

      const payload: CreateItineraryRequest = {
        leadId: leadId.trim(),
        title: title.trim(),
        validityDate: endDate || undefined,
        notes: description.trim() || undefined,
        inclusions: inclusions.map(i => i.text),
        exclusions: exclusions.map(e => e.text),
        currency,
        markupType: 'percentage',
        markupValue: parseFloat(markupPercent) || 0,
        days: days.map((d) => ({
          dayNumber: d.dayNumber,
          title: d.title || `Day ${d.dayNumber}`,
          description: d.description || undefined,
          city: destination.trim() || undefined,
          images: d.images.length > 0 ? d.images.map((img) => img.key) : undefined,
          items: d.activities.map((a, si) => ({
            type: (a.type === 'transfer' ? 'transport' : a.type) as 'hotel' | 'flight' | 'activity' | 'meal' | 'transport',
            title: activityTitle(a),
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

      const result = await createItinerary(payload);
      if (result && result.id) {
        toast.success('Itinerary created successfully');
        router.push(`/itineraries/${result.id}`);
      } else {
        toast.error('Failed to create itinerary');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create itinerary';
      toast.error(errorMsg);
    }
  };

  function renderActivityFields(activity: StructuredActivity, dayId: string) {
    const updateField = (field: keyof StructuredActivity, value: string | number) => updateActivity(dayId, activity.id, field, value);

    switch (activity.type) {
      case 'hotel':
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Hotel name" value={activity.hotelName || ''} onChange={(e) => updateField('hotelName', e.target.value)} className="h-8 text-sm" />
              <Select value={activity.roomType || ''} onValueChange={(v) => updateField('roomType', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Room type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Standard">Standard</SelectItem>
                  <SelectItem value="Deluxe">Deluxe</SelectItem>
                  <SelectItem value="Suite">Suite</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Input type="date" value={activity.checkInDate || ''} onChange={(e) => updateField('checkInDate', e.target.value)} className="h-8 text-sm" placeholder="Check-in" />
              <Input type="date" value={activity.checkOutDate || ''} onChange={(e) => updateField('checkOutDate', e.target.value)} className="h-8 text-sm" placeholder="Check-out" />
              <Select value={activity.mealPlan || ''} onValueChange={(v) => updateField('mealPlan', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Meal" /></SelectTrigger>
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
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="Airline" value={activity.airline || ''} onChange={(e) => updateField('airline', e.target.value)} className="h-8 text-sm" />
              <Input placeholder="PNR" value={activity.pnr || ''} onChange={(e) => updateField('pnr', e.target.value)} className="h-8 text-sm" />
              <Select value={activity.flightClass || ''} onValueChange={(v) => updateField('flightClass', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Class" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Economy">Economy</SelectItem>
                  <SelectItem value="Business">Business</SelectItem>
                  <SelectItem value="First">First</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="From (airport)" value={activity.departureAirport || ''} onChange={(e) => updateField('departureAirport', e.target.value)} className="h-8 text-sm" />
              <Input placeholder="To (airport)" value={activity.arrivalAirport || ''} onChange={(e) => updateField('arrivalAirport', e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
        );
      case 'transfer':
        return (
          <div className="space-y-2">
            <Select value={activity.vehicleType || ''} onValueChange={(v) => updateField('vehicleType', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Vehicle type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Sedan">Sedan</SelectItem>
                <SelectItem value="SUV">SUV</SelectItem>
                <SelectItem value="Tempo">Tempo</SelectItem>
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Pickup location" value={activity.pickupLocation || ''} onChange={(e) => updateField('pickupLocation', e.target.value)} className="h-8 text-sm" />
              <Input placeholder="Drop location" value={activity.dropLocation || ''} onChange={(e) => updateField('dropLocation', e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
        );
      case 'activity':
        return (
          <div className="space-y-2">
            <Input placeholder="Activity name" value={activity.activityName || ''} onChange={(e) => updateField('activityName', e.target.value)} className="h-8 text-sm" />
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="Duration (e.g., 4 hours)" value={activity.duration || ''} onChange={(e) => updateField('duration', e.target.value)} className="h-8 text-sm" />
              <Select value={activity.difficultyLevel || ''} onValueChange={(v) => updateField('difficultyLevel', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Difficulty" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Easy">Easy</SelectItem>
                  <SelectItem value="Moderate">Moderate</SelectItem>
                  <SelectItem value="Hard">Hard</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Age restriction" value={activity.ageRestriction || ''} onChange={(e) => updateField('ageRestriction', e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
        );
      case 'meal':
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Restaurant name" value={activity.restaurantName || ''} onChange={(e) => updateField('restaurantName', e.target.value)} className="h-8 text-sm" />
              <Input placeholder="Cuisine type" value={activity.cuisineType || ''} onChange={(e) => updateField('cuisineType', e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
        );
      default:
        return null;
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
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Itinerary title..."
              className="text-lg font-bold border-none shadow-none p-0 h-auto focus-visible:ring-0"
              style={{ fontFamily: 'var(--font-display)' }}
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right text-sm">
            <p className="text-muted-foreground">Cost: <span className="font-medium text-foreground">{currency === 'INR' ? '\u20B9' : currency + ' '}{totalCost.toLocaleString('en-IN')}</span></p>
            <p className="text-muted-foreground">Markup: <span className="font-medium text-foreground">{currency === 'INR' ? '\u20B9' : currency + ' '}{markup.toLocaleString('en-IN')}</span></p>
            <p className={cn('font-semibold', grandTotal >= 0 ? 'text-green-600' : 'text-red-500')}>
              Total: {currency === 'INR' ? '\u20B9' : currency + ' '}{grandTotal.toLocaleString('en-IN')}
            </p>
          </div>
          <Separator orientation="vertical" className="h-10" />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={saveLoading}><FileText className="h-4 w-4 mr-1" /> PDF</Button>
            <Button variant="outline" size="sm" disabled={saveLoading}><Send className="h-4 w-4 mr-1" /> Share</Button>
          </div>
          <Separator orientation="vertical" className="h-10" />
          <Button variant="outline" onClick={() => router.back()} disabled={saveLoading}>Cancel</Button>
          <Button onClick={handleSave} disabled={saveLoading}>
            {saveLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            {saveLoading ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Version Tabs */}
      <div className="flex items-center gap-3 px-6 py-3 border-b">
        <span className="text-sm font-medium text-muted-foreground">Version:</span>
        {(['v1', 'v2', 'v3'] as const).map((v: any) => (
          <Button
            key={v}
            variant={version === v ? 'default' : 'outline'}
            size="sm"
            onClick={() => setVersion(v)}
          >
            {v.toUpperCase()}
          </Button>
        ))}
        <Button variant="outline" size="sm"><Plus className="h-3.5 w-3.5 mr-1" /> New Version</Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm"><Copy className="h-4 w-4 mr-1" /> Clone from template</Button>
      </div>

      {/* Builder */}
      <div className="flex-1 overflow-auto p-6" onClick={() => setLeadDropdownOpen(false)}>
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Basic Info Section */}
          <Card>
            <CardHeader><CardTitle className="text-base">Basic Information</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="dest" className="text-xs">Destination</Label>
                  <Input
                    id="dest"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="e.g., Maldives"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1 relative">
                  <Label htmlFor="lead" className="text-xs">Link to Lead</Label>
                  <div className="relative">
                    <Input
                      id="lead"
                      value={leadDropdownOpen ? leadSearch : selectedLeadLabel}
                      onChange={(e) => { setLeadSearch(e.target.value); setLeadDropdownOpen(true); }}
                      onFocus={() => setLeadDropdownOpen(true)}
                      placeholder="Search leads by name..."
                      className="h-8 text-sm"
                      autoComplete="off"
                    />
                    {leadId && (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => { setLeadId(''); setSelectedLeadLabel(''); setLeadSearch(''); }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {leadDropdownOpen && leadOptions.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md">
                      {leadOptions.map((opt: any) => (
                        <button
                          key={opt.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent truncate"
                          onClick={() => {
                            setLeadId(opt.id);
                            setSelectedLeadLabel(opt.label);
                            setLeadSearch('');
                            setLeadDropdownOpen(false);
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {leadDropdownOpen && leadSearch && leadOptions.length === 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border bg-popover shadow-md px-3 py-2 text-sm text-muted-foreground">
                      No leads found
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="start" className="text-xs">Start Date</Label>
                  <Input
                    id="start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="end" className="text-xs">End Date</Label>
                  <Input
                    id="end"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1">
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

          <Separator className="my-6" />

          {/* Days Section */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDayDragEnd}>
            <SortableContext items={days.map((d) => d.id)} strategy={verticalListSortingStrategy}>
              {days.map((day: any) => (
                <SortableDayCardWrapper key={day.id} dayId={day.id}>
                  <Card>
                    <CardHeader className="py-3 px-4 pl-10 cursor-pointer" onClick={() => toggleDay(day.id)}>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white text-sm font-bold">
                          {day.dayNumber}
                        </div>
                        <Input
                          value={day.title}
                          onChange={(e) => { e.stopPropagation(); updateDayTitle(day.id, e.target.value); }}
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm font-semibold border-none shadow-none p-0 h-auto focus-visible:ring-0 flex-1"
                          placeholder="Day title..."
                        />
                        <div className="flex items-center gap-1">
                          <Badge variant="secondary" className="text-[10px]">{day.activities.length} items</Badge>
                          {day.isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          {days.length > 1 && (
                            <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); removeDay(day.id); }}>
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>

                    {day.isExpanded && (
                      <CardContent className="pt-0 pb-4 px-4 space-y-3">
                        {/* Rich Text Description */}
                        <div className="space-y-1">
                          <Label className="text-xs">Day Description</Label>
                          <RichTextEditor
                            value={day.description}
                            onChange={(html) => updateDayDescription(day.id, html)}
                            placeholder="Describe this day's highlights and details..."
                            minHeight="60px"
                          />
                        </div>

                        {/* Image Upload */}
                        <DayImageUploader
                          dayId={day.id}
                          images={day.images}
                          onUpload={uploadDayImages}
                          onRemove={removeDayImage}
                        />

                        {day.activities.map((activity: any) => {
                          const Icon = activityIcons[activity.type] ?? Camera;
                          return (
                            <div key={activity.id} className="flex gap-3 p-3 rounded-lg border bg-muted/30">
                              <div className={cn('h-8 w-8 rounded-md flex items-center justify-center shrink-0', activityColors[activity.type])}>
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="flex-1 space-y-2">
                                {renderActivityFields(activity, day.id)}
                                <div className="flex items-center gap-2 pt-1">
                                  <div className="grid grid-cols-3 gap-2 flex-1">
                                    <Input
                                      type="number"
                                      value={activity.cost || ''}
                                      onChange={(e) => updateActivity(day.id, activity.id, 'cost', parseFloat(e.target.value) || 0)}
                                      className="h-7 text-xs"
                                      placeholder={`Cost ${currency === 'INR' ? '\u20B9' : currency}`}
                                    />
                                    <Input
                                      type="number"
                                      value={activity.sellingPrice || ''}
                                      onChange={(e) => updateActivity(day.id, activity.id, 'sellingPrice', parseFloat(e.target.value) || 0)}
                                      className="h-7 text-xs"
                                      placeholder={`Selling ${currency === 'INR' ? '\u20B9' : currency}`}
                                    />
                                    <div className="flex gap-1">
                                      {/* Task 2G: Rate Card Picker button */}
                                      <Button
                                        variant="outline"
                                        size="icon-sm"
                                        onClick={() => openRateCardPicker(day.id, activity.id, activity.type)}
                                        title="Select from Rate Card"
                                        className="text-muted-foreground hover:text-primary"
                                      >
                                        <BookOpen className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button variant="ghost" size="icon-sm" onClick={() => removeActivity(day.id, activity.id)} className="text-muted-foreground hover:text-destructive">
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* Add Activity Buttons */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {(['hotel', 'flight', 'transfer', 'activity', 'meal'] as const).map((type: any) => {
                            const Icon = activityIcons[type] ?? Camera;
                            return (
                              <Button
                                key={type}
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1"
                                onClick={() => addActivity(day.id, type)}
                              >
                                <Icon className="h-3 w-3" />
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
            <Plus className="h-4 w-4 mr-1.5" /> Add Day
          </Button>

          <Separator className="my-6" />

          {/* Inclusions */}
          <Card>
            <CardHeader><CardTitle className="text-base text-green-700 dark:text-green-400">Inclusions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {inclusions.map((inc: any) => (
                  <div key={inc.id} className="flex items-center gap-2 p-2 rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10">
                    <span className="text-green-600 dark:text-green-400 text-sm font-medium">+</span>
                    <span className="flex-1 text-sm">{inc.text}</span>
                    <Button variant="ghost" size="icon-sm" onClick={() => removeInclusion(inc.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={inclusionInput}
                  onChange={(e) => setInclusionInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addInclusion(); } }}
                  placeholder="Add inclusion (e.g., Airport transfers)"
                  className="h-8 text-sm"
                />
                <Button size="sm" onClick={addInclusion}><Plus className="h-3 w-3" /></Button>
              </div>
            </CardContent>
          </Card>

          {/* Exclusions */}
          <Card>
            <CardHeader><CardTitle className="text-base text-red-700 dark:text-red-400">Exclusions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {exclusions.map((exc: any) => (
                  <div key={exc.id} className="flex items-center gap-2 p-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10">
                    <span className="text-red-600 dark:text-red-400 text-sm font-medium">-</span>
                    <span className="flex-1 text-sm">{exc.text}</span>
                    <Button variant="ghost" size="icon-sm" onClick={() => removeExclusion(exc.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={exclusionInput}
                  onChange={(e) => setExclusionInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExclusion(); } }}
                  placeholder="Add exclusion (e.g., Visa fees)"
                  className="h-8 text-sm"
                />
                <Button size="sm" onClick={addExclusion}><Plus className="h-3 w-3" /></Button>
              </div>
            </CardContent>
          </Card>

          <Separator className="my-6" />

          {/* Pricing & Taxes */}
          <Card>
            <CardHeader><CardTitle className="text-base">Pricing & Taxes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-4 gap-4 max-w-md">
                {/* Task 2H: Currency selector */}
                <div className="space-y-1">
                  <Label htmlFor="currency" className="text-xs">Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger id="currency" className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INR">INR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="AED">AED</SelectItem>
                      <SelectItem value="THB">THB</SelectItem>
                      <SelectItem value="SGD">SGD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="markup" className="text-xs">Markup %</Label>
                  <Input id="markup" type="number" value={markupPercent} onChange={(e) => setMarkupPercent(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="gst" className="text-xs">GST %</Label>
                  <Input id="gst" type="number" value={gstPercent} onChange={(e) => setGstPercent(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Total</Label>
                  <div className="h-8 px-3 rounded-md border flex items-center justify-center font-bold text-sm">
                    {currency === 'INR' ? '\u20B9' : currency + ' '}{grandTotal.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground space-y-1 max-w-md">
                <p>Cost: {currency === 'INR' ? '\u20B9' : currency + ' '}{totalCost.toLocaleString('en-IN')}</p>
                <p>+ Markup ({markupPercent}%): {currency === 'INR' ? '\u20B9' : currency + ' '}{markup.toLocaleString('en-IN')}</p>
                <p>+ GST ({gstPercent}%): {currency === 'INR' ? '\u20B9' : currency + ' '}{gst.toLocaleString('en-IN')}</p>
                <p className="font-semibold text-foreground">= Grand Total: {currency === 'INR' ? '\u20B9' : currency + ' '}{grandTotal.toLocaleString('en-IN')}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Task 2G: Rate Card Picker Dialog */}
      <Dialog open={rateCardPickerOpen} onOpenChange={setRateCardPickerOpen}>
        <DialogContent className="max-w-lg max-h-[70vh] flex flex-col">
          <DialogTitle className="text-base">Select from Rate Cards</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Search and select a rate card to auto-fill pricing for this activity.
          </DialogDescription>
          <div className="flex gap-2 mt-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search rate cards..."
                value={rateCardSearchQuery}
                onChange={(e) => setRateCardSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    searchRateCards(rateCardPickerTarget?.activityType, rateCardSearchQuery);
                  }
                }}
                className="pl-9 h-8 text-sm"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => searchRateCards(rateCardPickerTarget?.activityType, rateCardSearchQuery)}
              disabled={rateCardLoading}
            >
              {rateCardLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto mt-2">
            {rateCardLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {!rateCardLoading && rateCardResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No rate cards found. Try a different search.
              </p>
            )}
            {!rateCardLoading && rateCardResults.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Service</TableHead>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs text-right">Rate</TableHead>
                    <TableHead className="text-xs w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rateCardResults.map((rc: any, idx: number) => (
                    <TableRow key={rc.id ?? idx} className="cursor-pointer hover:bg-accent" onClick={() => selectRateCard(rc)}>
                      <TableCell className="text-sm">{rc.serviceName ?? rc.service_name ?? 'N/A'}</TableCell>
                      <TableCell className="text-sm capitalize">{rc.category ?? 'N/A'}</TableCell>
                      <TableCell className="text-sm text-right font-mono">
                        {rc.currency ?? 'INR'} {(rc.rate ?? 0).toLocaleString('en-IN')}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-6 text-xs">Select</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
