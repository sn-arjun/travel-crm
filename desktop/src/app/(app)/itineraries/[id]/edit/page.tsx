'use client';


import { formatLocaleTime } from '@/lib/format';
import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Loader2, Save, Plus, Trash2, GripVertical, Check, AlertCircle, FileText,
} from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DatePicker } from '@/components/ui/date-picker';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { PageContainer } from '@/components/layout/page-container';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/page-header';
import { useApiQuery } from '@/hooks/use-api';
import {
  itinerariesApi, ageBandsApi, toItineraryDetail, formatDestination, errorMessage,
  type UpdateItineraryRequest, type ItineraryItem, type ItineraryDay,
} from '@/lib/api/itineraries';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { unwrapEntity } from '@/lib/api/envelope';
import { DEFAULT_AGE_BANDS, bandsFor, type AgeBand } from '@/lib/age-bands';
import { formatDisplayDate, parseLocalDate, toLocalDateString } from '@/lib/dates';
import { DayImageUploader, imageFromKey, uploadDayImage, type DayImage } from '../../_components/day-images';
import { DayItemsEditor } from '../../_components/day-items-editor';

type ItineraryStatus = NonNullable<UpdateItineraryRequest['status']>;

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

interface FormState {
  title?: string;
  description?: string;
  validityDate?: string;
  destination?: string;
  status?: ItineraryStatus;
  currency?: string;
  markupType?: 'percentage' | 'fixed';
  markupValue?: number;
}

let editIdCounter = 0;
function generateEditId(): string {
  editIdCounter += 1;
  return `edit-day-${Date.now()}-${editIdCounter}`;
}

/** Only the fields the API accepts; the GET response carries extra columns (dayId, createdAt, nulls). */
function toRequestItem(item: ItineraryItem, sortOrder: number): ItineraryItem {
  return {
    id: item.id,
    type: item.type,
    title: item.title.trim() || 'Untitled item',
    description: item.description ?? undefined,
    supplierId: item.supplierId ?? undefined,
    rateCardId: item.rateCardId ?? undefined,
    costPrice: item.costPrice ?? 0,
    sellingPrice: item.sellingPrice ?? 0,
    markupType: item.markupType ?? undefined,
    markupValue: item.markupValue ?? undefined,
    taxRate: item.taxRate ?? 0,
    taxAmount: item.taxAmount ?? 0,
    quantity: item.quantity ?? 1,
    paxType: item.paxType ?? undefined,
    timeStart: item.timeStart ?? undefined,
    timeEnd: item.timeEnd ?? undefined,
    sortOrder,
    detailsJson: item.detailsJson ?? undefined,
    internalNotes: item.internalNotes ?? undefined,
  };
}

/* ── Sortable Day Card ── */
function SortableDayCard({
  item,
  index,
  currency,
  bands,
  updateDayItem,
  removeDayItem,
  onUploadImages,
  onRemoveImage,
  onCreateVoucher,
}: {
  item: DayItem;
  index: number;
  currency?: string;
  /** Age bands in force for the quote, when age-band pricing is on (R149). */
  bands?: AgeBand[];
  updateDayItem: <K extends keyof DayItem>(index: number, field: K, value: DayItem[K]) => void;
  removeDayItem: (index: number) => void;
  onUploadImages: (index: number, files: FileList) => void;
  onRemoveImage: (index: number, imgIndex: number) => void;
  onCreateVoucher?: (item: DayItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, position: 'relative' as const };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="border border-ds-border rounded-lg p-ds-4 space-y-ds-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-ds-2">
            <button
              type="button"
              aria-label="Reorder day"
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted"
            >
              <GripVertical className="size-4 text-muted-foreground" aria-hidden="true" />
            </button>
            <Badge variant="outline" className="text-xs">Day {item.dayNumber}</Badge>
          </div>
          <div className="flex items-center gap-ds-1">
            {onCreateVoucher && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-ds-1 text-ds-primary hover:text-ds-primary"
                onClick={() => onCreateVoucher(item)}
                title="Create voucher from this day"
              >
                <FileText className="size-3.5" aria-hidden="true" />
                Create Voucher
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" aria-label={`Remove day ${item.dayNumber}`} onClick={() => removeDayItem(index)}>
              <Trash2 className="size-4 text-ds-danger" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-ds-3">
          <div className="space-y-ds-1">
            <Label className="text-xs">Title</Label>
            <Input
              value={item.title}
              onChange={(e) => updateDayItem(index, 'title', e.target.value)}
              placeholder="Day title"
              aria-label={`Day ${item.dayNumber} title`}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-ds-1">
            <Label className="text-xs">Location</Label>
            <Input
              value={item.location ?? ''}
              onChange={(e) => updateDayItem(index, 'location', e.target.value)}
              placeholder="Location"
              aria-label={`Day ${item.dayNumber} location`}
              className="h-8 text-sm"
            />
          </div>
        </div>

        <div className="space-y-ds-1">
          <Label className="text-xs">Description</Label>
          <RichTextEditor
            value={item.description}
            onChange={(html) => updateDayItem(index, 'description', html)}
            placeholder="Activities and details for this day"
            minHeight="5rem"
          />
        </div>

        <DayItemsEditor
          items={item.items ?? []}
          currency={currency}
          bands={bands}
          onChange={(items) => updateDayItem(index, 'items', items)}
        />

        <DayImageUploader
          images={item.images ?? []}
          onUpload={(files) => onUploadImages(index, files)}
          onRemove={(imgIdx) => onRemoveImage(index, imgIdx)}
        />
      </div>
    </div>
  );
}

export default function ItineraryEditPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [form, setForm] = React.useState<FormState>({});
  const [dayItems, setDayItems] = React.useState<DayItem[]>([]);
  const [inclusions, setInclusions] = React.useState<string[]>([]);
  const [exclusions, setExclusions] = React.useState<string[]>([]);
  const [terms, setTerms] = React.useState('');
  const [newInclusion, setNewInclusion] = React.useState('');
  const [newExclusion, setNewExclusion] = React.useState('');

  const { data: itinerary, loading, error } = useApiQuery(
    () => itinerariesApi.getById(id).then(toItineraryDetail),
    [id],
  );

  // The bands the lines can be priced by: the quote's own snapshot, else the agency's (R149).
  const bandsGate = useFeatureGate('age_band_pricing');
  const [agencyBands, setAgencyBands] = React.useState<AgeBand[] | null>(null);
  React.useEffect(() => {
    if (!bandsGate.enabled) return;
    ageBandsApi.get().then((res) => setAgencyBands(unwrapEntity<{ bands: AgeBand[] }>(res).bands)).catch(() => setAgencyBands(DEFAULT_AGE_BANDS));
  }, [bandsGate.enabled]);
  const lineBands = bandsGate.enabled && agencyBands ? bandsFor(itinerary?.ageBands, agencyBands) : undefined;

  const [isSaving, setIsSaving] = React.useState(false);
  const updateItinerary = React.useCallback(
    async (data: UpdateItineraryRequest) => {
      setIsSaving(true);
      try {
        return await itinerariesApi.update(id, data);
      } finally {
        setIsSaving(false);
      }
    },
    [id],
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

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Schedule auto-save after 30 seconds of inactivity
    autoSaveTimerRef.current = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('itinerary-auto-save'));
    }, 30000);
  }, []);

  React.useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Initialize form from loaded data
  React.useEffect(() => {
    if (itinerary) {
      const rawDays: ItineraryDay[] = itinerary.days ?? [];
      setForm({
        title: itinerary.title ?? '',
        description: itinerary.notes ?? '',
        validityDate: itinerary.validityDate ?? '',
        destination: rawDays.find((d) => d.city)?.city ?? formatDestination(itinerary.lead?.destination),
        status: itinerary.status ?? 'draft',
        currency: itinerary.currency ?? undefined,
        markupType: itinerary.markupType ?? undefined,
        markupValue: itinerary.markupValue ?? undefined,
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
      setInclusions(itinerary.inclusions ?? []);
      setExclusions(itinerary.exclusions ?? []);
      setTerms(itinerary.termsConditions ?? '');
      // Allow dirty tracking after initial data load
      setTimeout(() => { isInitializedRef.current = true; }, 100);
    }
  }, [itinerary]);

  function patchForm(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
    markDirty();
  }

  // Destination is a convenience over the per-day location: days that still carry the old destination follow it.
  function updateDestination(value: string) {
    const previous = form.destination ?? '';
    setDayItems((prev) => prev.map((d) => (
      (d.location ?? '') === previous ? { ...d, location: value } : d
    )));
    patchForm({ destination: value });
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
      return reordered.map((item, i) => ({ ...item, dayNumber: i + 1 }));
    });
    markDirty();
  }

  async function uploadDayImages(dayIndex: number, files: FileList) {
    for (const file of Array.from(files)) {
      try {
        const image = await uploadDayImage(file);
        if (image) {
          setDayItems((prev) =>
            prev.map((item, i) => (i === dayIndex ? { ...item, images: [...(item.images ?? []), image] } : item)),
          );
          markDirty();
        }
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
  }

  function removeDayImage(dayIndex: number, imgIndex: number) {
    setDayItems((prev) =>
      prev.map((item, i) =>
        i === dayIndex ? { ...item, images: (item.images ?? []).filter((_, j) => j !== imgIndex) } : item,
      ),
    );
    markDirty();
  }

  function updateDayItem<K extends keyof DayItem>(index: number, field: K, value: DayItem[K]) {
    setDayItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
    markDirty();
  }

  function removeDayItem(index: number) {
    setDayItems((prev) => prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, dayNumber: i + 1 })));
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
      status: form.status,
      currency: form.currency,
      markupType: form.markupType,
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
        items: (d.items ?? []).map((item, itemIdx) => toRequestItem(item, itemIdx)),
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

    try {
      await updateItinerary(buildPayload());
      setIsDirty(false);
      setAutoSaveStatus('saved');
      setLastSavedAt(new Date());
      toast.success('Itinerary updated successfully');
      router.push(`/itineraries/${id}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update itinerary'));
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
      await updateItinerary(buildPayload());
      setIsDirty(false);
      setAutoSaveStatus('saved');
      setLastSavedAt(new Date());
    } catch {
      setAutoSaveStatus('error');
    }
  }

  // Listen for auto-save events
  React.useEffect(() => {
    const handler = () => { void handleAutoSave(); };
    window.addEventListener('itinerary-auto-save', handler);
    return () => window.removeEventListener('itinerary-auto-save', handler);
  });

  if (loading) {
    return (
      <PageContainer width="narrow">
        <div className="flex flex-col gap-ds-4" role="status" aria-busy="true" aria-label="Loading itinerary" data-testid="itinerary-edit-skeleton">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </PageContainer>
    );
  }

  if (error || !itinerary) {
    return (
      <PageContainer width="narrow">
        <div className="flex flex-col items-center justify-center gap-ds-4 py-ds-9">
          <p className="text-ds-danger">Failed to load itinerary</p>
          <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Edit Itinerary"
        description={itinerary.title}
        breadcrumbs={[
          { label: 'Itineraries', href: '/itineraries' },
          { label: itinerary.title, href: `/itineraries/${id}` },
          { label: 'Edit' },
        ]}
        actions={
          <>
            {autoSaveStatus === 'saving' && (
              <div className="flex items-center gap-ds-2 text-xs text-ds-foreground-muted animate-pulse">
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                <span>Saving...</span>
              </div>
            )}
            {autoSaveStatus === 'saved' && lastSavedAt && (
              <div className="flex items-center gap-ds-2 text-xs text-ds-success">
                <Check className="size-3.5" aria-hidden="true" />
                <span>Saved at {formatLocaleTime(lastSavedAt, { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )}
            {autoSaveStatus === 'error' && (
              <div className="flex items-center gap-ds-2 text-xs text-ds-warning">
                <AlertCircle className="size-3.5" aria-hidden="true" />
                <span>Auto-save failed</span>
              </div>
            )}
            {isDirty && autoSaveStatus === 'idle' && (
              <span className="text-xs text-ds-foreground-muted">Unsaved changes</span>
            )}
            <Button variant="outline" onClick={() => router.back()} disabled={isSaving}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="size-4 animate-spin me-1.5" aria-hidden="true" /> : <Save className="size-4 me-1.5" aria-hidden="true" />}
              Save Changes
            </Button>
          </>
        }
      />

      <div className="space-y-ds-5">
        {/* Basic Information */}
        <Card>
          <CardHeader><CardTitle className="text-base">Basic Information</CardTitle></CardHeader>
          <CardContent className="space-y-ds-4">
            <div className="space-y-ds-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={form.title ?? ''}
                onChange={(e) => patchForm({ title: e.target.value })}
                placeholder="Itinerary title"
              />
            </div>

            <div className="space-y-ds-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description ?? ''}
                onChange={(e) => patchForm({ description: e.target.value })}
                placeholder="Brief description"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 gap-ds-4 sm:grid-cols-3">
              <div className="space-y-ds-2">
                <Label htmlFor="destination">Destination</Label>
                <Input
                  id="destination"
                  value={form.destination ?? ''}
                  onChange={(e) => updateDestination(e.target.value)}
                  placeholder="e.g., Bali, Maldives"
                />
              </div>
              <div className="space-y-ds-2">
                <Label htmlFor="validity">Valid Until</Label>
                <DatePicker
                  id="validity"
                  value={form.validityDate ? parseLocalDate(form.validityDate) : undefined}
                  onChange={(d) => patchForm({ validityDate: d ? toLocalDateString(d) : '' })}
                  placeholder={form.validityDate ? formatDisplayDate(form.validityDate) : 'Pick a date'}
                  toYear={new Date().getFullYear() + 3}
                />
              </div>
              <div className="space-y-ds-2">
                <Label htmlFor="status">Status</Label>
                <Select value={form.status ?? 'draft'} onValueChange={(v) => patchForm({ status: v as ItineraryStatus })}>
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
                <Plus className="size-4 me-1" aria-hidden="true" /> Add Day
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-ds-4">
            {dayItems.length === 0 && (
              <p className="text-sm text-ds-foreground-muted text-center py-ds-4">No day items yet. Click &quot;Add Day&quot; to start.</p>
            )}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={dayItems.map((d) => d.id)} strategy={verticalListSortingStrategy}>
                {dayItems.map((item, idx) => (
                  <SortableDayCard
                    key={item.id}
                    item={item}
                    index={idx}
                    currency={form.currency}
                    bands={lineBands}
                    updateDayItem={updateDayItem}
                    removeDayItem={removeDayItem}
                    onUploadImages={uploadDayImages}
                    onRemoveImage={removeDayImage}
                    onCreateVoucher={(dayItem) => {
                      const leadId = itinerary.leadId ?? '';
                      const title = dayItem.title?.toLowerCase() ?? '';
                      let voucherType = 'hotel';
                      if (title.includes('transport') || title.includes('transfer')) voucherType = 'transport';
                      else if (title.includes('flight')) voucherType = 'flight';
                      else if (title.includes('activity') || title.includes('tour')) voucherType = 'activity';

                      const query = new URLSearchParams();
                      if (dayItem.id) query.set('itineraryItemId', dayItem.id);
                      query.set('type', voucherType);
                      if (leadId) query.set('leadId', leadId);
                      if (dayItem.title) query.set('title', dayItem.title);
                      if (dayItem.location) query.set('location', dayItem.location);
                      router.push(`/vouchers/new?${query.toString()}`);
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
          <CardContent className="space-y-ds-3">
            {inclusions.map((item, idx) => (
              <div key={idx} className="flex items-center gap-ds-2">
                <span className="text-sm flex-1">{item}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove inclusion ${item}`}
                  onClick={() => { setInclusions((prev) => prev.filter((_, i) => i !== idx)); markDirty(); }}
                >
                  <Trash2 className="size-3.5 text-ds-danger" aria-hidden="true" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-ds-2">
              <Input
                value={newInclusion}
                onChange={(e) => setNewInclusion(e.target.value)}
                placeholder="Add inclusion..."
                className="h-8 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && addInclusion()}
              />
              <Button variant="outline" size="sm" aria-label="Add inclusion" onClick={addInclusion}>
                <Plus className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Exclusions */}
        <Card>
          <CardHeader><CardTitle className="text-base">Exclusions</CardTitle></CardHeader>
          <CardContent className="space-y-ds-3">
            {exclusions.map((item, idx) => (
              <div key={idx} className="flex items-center gap-ds-2">
                <span className="text-sm flex-1">{item}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove exclusion ${item}`}
                  onClick={() => { setExclusions((prev) => prev.filter((_, i) => i !== idx)); markDirty(); }}
                >
                  <Trash2 className="size-3.5 text-ds-danger" aria-hidden="true" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-ds-2">
              <Input
                value={newExclusion}
                onChange={(e) => setNewExclusion(e.target.value)}
                placeholder="Add exclusion..."
                className="h-8 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && addExclusion()}
              />
              <Button variant="outline" size="sm" aria-label="Add exclusion" onClick={addExclusion}>
                <Plus className="size-4" aria-hidden="true" />
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
              onChange={(e) => { setTerms(e.target.value); markDirty(); }}
              placeholder="Enter terms and conditions..."
              rows={6}
              aria-label="Terms and conditions"
            />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
