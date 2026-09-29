'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Loader2, Save, Plus, Trash2, GripVertical, MapPin, Calendar, ImagePlus, X, Check, AlertCircle, FileText,
} from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { itinerariesApi, type UpdateItineraryRequest, type ItineraryItem, type ItineraryDay } from '@/lib/api/itineraries';
import { client, type ApiResponse } from '@/lib/api/client';
import { API_ENDPOINTS, API_BASE_URL } from '@/lib/api/config';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import type { Itinerary } from '@travelcrm/shared';
import { toast } from 'sonner';

interface DayImage {
  key: string;
  url: string;
  name: string;
}

interface DayItem {
  id: string;
  dayNumber: number;
  title: string;
  description: string;
  location?: string;
  overnightCity?: string;
  isFreeDay?: boolean;
  images?: DayImage[];
  items?: ItineraryItem[];
}

function imageFromKey(key: string): DayImage {
  const url = /^https?:\/\//.test(key) ? key : `${API_BASE_URL}${API_ENDPOINTS.files.get(key)}`;
  return { key, url, name: key.split('/').pop() ?? key };
}

let editIdCounter = 0;
function generateEditId(): string {
  editIdCounter += 1;
  return `edit-day-${Date.now()}-${editIdCounter}`;
}

/* ── Sortable Day Card ── */
function SortableDayCard({
  item,
  index,
  updateDayItem,
  removeDayItem,
  onUploadImages,
  onRemoveImage,
  onCreateVoucher,
}: {
  item: DayItem;
  index: number;
  updateDayItem: (index: number, field: keyof DayItem, value: any) => void;
  removeDayItem: (index: number) => void;
  onUploadImages: (index: number, files: FileList) => void;
  onRemoveImage: (index: number, imgIndex: number) => void;
  onCreateVoucher?: (item: DayItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, position: 'relative' as const };
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div ref={setNodeRef} style={style}>
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button type="button" {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>
            <Badge variant="outline" className="text-xs">Day {item.dayNumber}</Badge>
          </div>
          <div className="flex items-center gap-1">
            {onCreateVoucher && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-primary hover:text-primary"
                onClick={() => onCreateVoucher(item)}
                title="Create voucher from this day"
              >
                <FileText className="h-3.5 w-3.5" />
                Create Voucher
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" onClick={() => removeDayItem(index)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Title</Label>
            <Input
              value={item.title}
              onChange={(e) => updateDayItem(index, 'title', e.target.value)}
              placeholder="Day title"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Location</Label>
            <Input
              value={item.location ?? ''}
              onChange={(e) => updateDayItem(index, 'location', e.target.value)}
              placeholder="Location"
              className="h-8 text-sm"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Description</Label>
          <RichTextEditor
            value={item.description}
            onChange={(html) => updateDayItem(index, 'description', html)}
            placeholder="Activities and details for this day"
            minHeight="80px"
          />
        </div>

        {/* Images */}
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
                  onUploadImages(index, e.target.files);
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
          {item.images && item.images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.images.map((img, imgIdx) => (
                <div key={img.key} className="relative group">
                  <img
                    src={img.url}
                    alt={img.name}
                    className="h-20 w-20 object-cover rounded-md border"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveImage(index, imgIdx)}
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ItineraryEditPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [form, setForm] = React.useState<{
    title?: string;
    description?: string;
    validityDate?: string;
    destination?: string;
    status?: string;
    termsConditions?: string;
    currency?: string;
    markupType?: string;
    markupValue?: number;
  }>({});
  const [dayItems, setDayItems] = React.useState<DayItem[]>([]);
  const [inclusions, setInclusions] = React.useState<string[]>([]);
  const [exclusions, setExclusions] = React.useState<string[]>([]);
  const [terms, setTerms] = React.useState('');
  const [newInclusion, setNewInclusion] = React.useState('');
  const [newExclusion, setNewExclusion] = React.useState('');

  const { data: itinerary, loading, error } = useApiQuery(
    () => itinerariesApi.getById(id).then((res) => {
      if (res && typeof res === 'object' && 'data' in res) return (res as any).data as Itinerary;
      return res as Itinerary;
    }),
    [id],
  );

  const { mutate: updateItinerary, loading: isSaving } = useApiMutation<UpdateItineraryRequest, any>(
    (data) => itinerariesApi.update(id, data),
  );

  // Auto-save state
  const [isDirty, setIsDirty] = React.useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  const autoSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitializedRef = React.useRef(false);

  // Warn user when navigating away with unsaved changes
  useUnsavedChanges(isDirty);

  // Mark form dirty and schedule auto-save
  const markDirty = React.useCallback(() => {
    if (!isInitializedRef.current) return;
    setIsDirty(true);
    setAutoSaveStatus('idle');

    // Clear existing auto-save timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Schedule auto-save after 30 seconds of inactivity
    autoSaveTimerRef.current = setTimeout(() => {
      // Trigger auto-save via a custom event so the save logic can read current state
      window.dispatchEvent(new CustomEvent('itinerary-auto-save'));
    }, 30000);
  }, []);

  // Cleanup timer on unmount
  React.useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Initialize form from loaded data
  React.useEffect(() => {
    if (itinerary) {
      const itin = itinerary as any;
      const rawDays: ItineraryDay[] = itin.days ?? [];
      setForm({
        title: itin.title ?? '',
        description: itin.notes ?? '',
        validityDate: itin.validityDate ?? '',
        destination: rawDays.find((d) => d.city)?.city ?? itin.lead?.destination ?? '',
        status: itin.status ?? 'draft',
        currency: itin.currency ?? undefined,
        markupType: itin.markupType ?? undefined,
        markupValue: itin.markupValue ?? undefined,
      });
      setDayItems(rawDays.map((d) => ({
        id: d.id || generateEditId(),
        dayNumber: d.dayNumber,
        title: d.title ?? '',
        description: d.description ?? '',
        location: d.city ?? '',
        overnightCity: d.overnightCity ?? undefined,
        isFreeDay: d.isFreeDay ?? false,
        images: (d.images ?? []).map(imageFromKey),
        items: d.items ?? [],
      })));
      setInclusions(itin.inclusions ?? []);
      setExclusions(itin.exclusions ?? []);
      setTerms(itin.termsConditions ?? '');
      // Allow dirty tracking after initial data load
      setTimeout(() => { isInitializedRef.current = true; }, 100);
    }
  }, [itinerary]);

  function updateField(field: string, value: any) {
    setForm((prev) => ({ ...prev, [field]: value }));
    markDirty();
  }

  // Destination is a convenience over the per-day location: days that still carry the old destination follow it.
  function updateDestination(value: string) {
    const previous = form.destination ?? '';
    setDayItems((prev) => prev.map((d) => (
      (d.location ?? '') === previous ? { ...d, location: value } : d
    )));
    updateField('destination', value);
  }

  function addDayItem() {
    const nextDay = dayItems.length > 0 ? Math.max(...dayItems.map((d) => d.dayNumber)) + 1 : 1;
    setDayItems((prev) => [...prev, {
      id: generateEditId(),
      dayNumber: nextDay,
      title: '',
      description: '',
      location: form.destination ?? '',
      images: [],
      items: [],
    }]);
    markDirty();
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setDayItems((prev) => {
      const oldIndex = prev.findIndex((item) => item.id === active.id);
      const newIndex = prev.findIndex((item) => item.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const reordered = [...prev];
      const [moved] = reordered.splice(oldIndex, 1) as [DayItem];
      reordered.splice(newIndex, 0, moved);
      // Recalculate dayNumbers
      return reordered.map((item, i) => ({ ...item, dayNumber: i + 1 }));
    });
    markDirty();
  }

  async function uploadDayImages(dayIndex: number, files: FileList) {
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
          setDayItems((prev) =>
            prev.map((item, i) =>
              i === dayIndex
                ? { ...item, images: [...(item.images ?? []), { key: uploaded.key, url: uploaded.url, name: uploaded.name }] }
                : item,
            ),
          );
        }
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
  }

  function removeDayImage(dayIndex: number, imgIndex: number) {
    setDayItems((prev) =>
      prev.map((item, i) =>
        i === dayIndex
          ? { ...item, images: (item.images ?? []).filter((_, j) => j !== imgIndex) }
          : item,
      ),
    );
  }

  function updateDayItem(index: number, field: keyof DayItem, value: any) {
    setDayItems((prev) => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
    markDirty();
  }

  function removeDayItem(index: number) {
    setDayItems((prev) => prev.filter((_, i) => i !== index));
    markDirty();
  }

  function addInclusion() {
    if (!newInclusion.trim()) return;
    setInclusions((prev) => [...prev, newInclusion.trim()]);
    setNewInclusion('');
    markDirty();
  }

  function addExclusion() {
    if (!newExclusion.trim()) return;
    setExclusions((prev) => [...prev, newExclusion.trim()]);
    setNewExclusion('');
    markDirty();
  }

  function buildPayload(): UpdateItineraryRequest {
    return {
      title: form.title,
      notes: form.description,
      validityDate: form.validityDate || undefined,
      status: form.status as any,
      currency: form.currency,
      markupType: form.markupType as any,
      markupValue: form.markupValue,
      inclusions,
      exclusions,
      termsConditions: terms,
      days: dayItems.map((d, i) => ({
        id: d.id.startsWith('edit-day-') ? undefined : d.id,
        dayNumber: i + 1,
        title: d.title,
        description: d.description,
        city: d.location || undefined,
        overnightCity: d.overnightCity,
        isFreeDay: d.isFreeDay,
        images: (d.images ?? []).map((img) => img.key),
        items: d.items ?? [],
      })),
    };
  }

  function validateForm(): boolean {
    return !!(form.title?.trim());
  }

  async function handleSave() {
    if (!validateForm()) {
      toast.error('Title is required');
      return;
    }

    const result = await updateItinerary(buildPayload());
    if (result) {
      setIsDirty(false);
      setAutoSaveStatus('saved');
      setLastSavedAt(new Date());
      toast.success('Itinerary updated successfully');
      router.push(`/itineraries/${id}`);
    } else {
      toast.error('Failed to update itinerary');
    }
  }

  async function handleAutoSave() {
    if (!isDirty || isSaving) return;
    if (!validateForm()) {
      setAutoSaveStatus('error');
      return;
    }

    setAutoSaveStatus('saving');
    try {
      const result = await updateItinerary(buildPayload());
      if (result) {
        setIsDirty(false);
        setAutoSaveStatus('saved');
        setLastSavedAt(new Date());
      } else {
        setAutoSaveStatus('error');
      }
    } catch {
      setAutoSaveStatus('error');
    }
  }

  // Listen for auto-save events
  React.useEffect(() => {
    const handler = () => handleAutoSave();
    window.addEventListener('itinerary-auto-save', handler);
    return () => window.removeEventListener('itinerary-auto-save', handler);
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Loading itinerary...</p>
      </div>
    );
  }

  if (error || !itinerary) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-destructive">Failed to load itinerary</p>
        <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Edit Itinerary
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Auto-save status indicator */}
          {autoSaveStatus === 'saving' && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Saving...</span>
            </div>
          )}
          {autoSaveStatus === 'saved' && lastSavedAt && (
            <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
              <Check className="h-3.5 w-3.5" />
              <span>Auto-saved at {lastSavedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          )}
          {autoSaveStatus === 'error' && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>Auto-save failed</span>
            </div>
          )}
          {isDirty && autoSaveStatus === 'idle' && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Unsaved changes</span>
            </div>
          )}
          <Button variant="outline" onClick={() => router.back()} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save Changes
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader><CardTitle className="text-base">Basic Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={form.title ?? ''}
                  onChange={(e) => updateField('title', e.target.value)}
                  placeholder="Itinerary title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={form.description ?? ''}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="Brief description"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="destination">Destination</Label>
                  <Input
                    id="destination"
                    value={form.destination ?? ''}
                    onChange={(e) => updateField('destination', e.target.value)}
                    placeholder="e.g., Bali, Maldives"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={form.startDate ?? ''}
                    onChange={(e) => updateField('startDate', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={form.endDate ?? ''}
                    onChange={(e) => updateField('endDate', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="budget">Budget</Label>
                  <Input
                    id="budget"
                    type="number"
                    value={form.budget ?? ''}
                    onChange={(e) => updateField('budget', parseFloat(e.target.value) || undefined)}
                    placeholder="0"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={form.status ?? 'draft'} onValueChange={(v) => updateField('status', v as any)}>
                    <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Day Items */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Day-wise Itinerary ({dayItems.length} days)</CardTitle>
                <Button variant="outline" size="sm" onClick={addDayItem}>
                  <Plus className="h-4 w-4 mr-1" /> Add Day
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {dayItems.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No day items yet. Click &quot;Add Day&quot; to start.</p>
              )}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={dayItems.map((d) => d.id)} strategy={verticalListSortingStrategy}>
                  {dayItems.map((item, idx) => (
                    <SortableDayCard
                      key={item.id}
                      item={item}
                      index={idx}
                      updateDayItem={updateDayItem}
                      removeDayItem={removeDayItem}
                      onUploadImages={uploadDayImages}
                      onRemoveImage={removeDayImage}
                      onCreateVoucher={(dayItem) => {
                        const itin = itinerary as any;
                        const leadId = itin?.leadId || itin?.lead_id || '';
                        // Determine voucher type based on day content
                        let voucherType = 'hotel';
                        if (dayItem.accommodation) voucherType = 'hotel';
                        else if (dayItem.title?.toLowerCase().includes('transport') || dayItem.title?.toLowerCase().includes('transfer')) voucherType = 'transport';
                        else if (dayItem.title?.toLowerCase().includes('flight')) voucherType = 'flight';
                        else if (dayItem.title?.toLowerCase().includes('activity') || dayItem.title?.toLowerCase().includes('tour')) voucherType = 'activity';

                        const params = new URLSearchParams();
                        if (dayItem.id) params.set('itineraryItemId', dayItem.id);
                        params.set('type', voucherType);
                        if (leadId) params.set('leadId', leadId);
                        if (dayItem.title) params.set('title', dayItem.title);
                        if (dayItem.accommodation) params.set('hotelName', dayItem.accommodation);
                        if (dayItem.location) params.set('location', dayItem.location);
                        router.push(`/vouchers/new?${params.toString()}`);
                      }}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </CardContent>
          </Card>

          {/* Inclusions */}
          <Card>
            <CardHeader><CardTitle className="text-base">Inclusions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {inclusions.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-sm flex-1">{item}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setInclusions((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Input
                  value={newInclusion}
                  onChange={(e) => setNewInclusion(e.target.value)}
                  placeholder="Add inclusion..."
                  className="h-8 text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && addInclusion()}
                />
                <Button variant="outline" size="sm" onClick={addInclusion}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Exclusions */}
          <Card>
            <CardHeader><CardTitle className="text-base">Exclusions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {exclusions.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-sm flex-1">{item}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setExclusions((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Input
                  value={newExclusion}
                  onChange={(e) => setNewExclusion(e.target.value)}
                  placeholder="Add exclusion..."
                  className="h-8 text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && addExclusion()}
                />
                <Button variant="outline" size="sm" onClick={addExclusion}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Terms & Conditions */}
          <Card>
            <CardHeader><CardTitle className="text-base">Terms & Conditions</CardTitle></CardHeader>
            <CardContent>
              <Textarea
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                placeholder="Enter terms and conditions..."
                rows={6}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
