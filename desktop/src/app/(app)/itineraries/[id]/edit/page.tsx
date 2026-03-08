'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Loader2, Save, Plus, Trash2, GripVertical, MapPin, Calendar, ImagePlus, X,
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
import { itinerariesApi, type UpdateItineraryRequest } from '@/lib/api/itineraries';
import { client, type ApiResponse } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
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
  meals?: string;
  accommodation?: string;
  images?: DayImage[];
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
}: {
  item: DayItem;
  index: number;
  updateDayItem: (index: number, field: keyof DayItem, value: any) => void;
  removeDayItem: (index: number) => void;
  onUploadImages: (index: number, files: FileList) => void;
  onRemoveImage: (index: number, imgIndex: number) => void;
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
          <Button variant="ghost" size="icon-sm" onClick={() => removeDayItem(index)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
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

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Meals</Label>
            <Input
              value={item.meals ?? ''}
              onChange={(e) => updateDayItem(index, 'meals', e.target.value)}
              placeholder="e.g., Breakfast, Lunch, Dinner"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Accommodation</Label>
            <Input
              value={item.accommodation ?? ''}
              onChange={(e) => updateDayItem(index, 'accommodation', e.target.value)}
              placeholder="e.g., Hotel Name"
              className="h-8 text-sm"
            />
          </div>
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
    startDate?: string;
    endDate?: string;
    destination?: string;
    budget?: number;
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

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Initialize form from loaded data
  React.useEffect(() => {
    if (itinerary) {
      const itin = itinerary as any;
      setForm({
        title: itin.title ?? '',
        description: itin.description ?? '',
        startDate: itin.startDate ?? '',
        endDate: itin.endDate ?? '',
        destination: itin.destination ?? '',
        budget: itin.budget ?? undefined,
        status: itin.status ?? 'draft',
      });
      // Ensure each dayItem has a stable id for dnd-kit
      const rawItems: DayItem[] = itin.dayItems ?? itin.items ?? [];
      setDayItems(rawItems.map((item) => ({
        ...item,
        id: item.id || generateEditId(),
        images: item.images ?? [],
      })));
      setInclusions(itin.inclusions ?? []);
      setExclusions(itin.exclusions ?? []);
      setTerms(itin.terms ?? itin.termsAndConditions ?? '');
    }
  }, [itinerary]);

  function updateField(field: string, value: any) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function addDayItem() {
    const nextDay = dayItems.length > 0 ? Math.max(...dayItems.map((d) => d.dayNumber)) + 1 : 1;
    setDayItems((prev) => [...prev, {
      id: generateEditId(),
      dayNumber: nextDay,
      title: '',
      description: '',
      location: '',
      meals: '',
      accommodation: '',
      images: [],
    }]);
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
  }

  function removeDayItem(index: number) {
    setDayItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addInclusion() {
    if (!newInclusion.trim()) return;
    setInclusions((prev) => [...prev, newInclusion.trim()]);
    setNewInclusion('');
  }

  function addExclusion() {
    if (!newExclusion.trim()) return;
    setExclusions((prev) => [...prev, newExclusion.trim()]);
    setNewExclusion('');
  }

  async function handleSave() {
    if (!form.title?.trim()) {
      toast.error('Title is required');
      return;
    }

    const payload: UpdateItineraryRequest = {
      title: form.title,
      notes: form.description,
      status: form.status as any,
      currency: form.currency,
      markupType: form.markupType as any,
      markupValue: form.markupValue,
      inclusions,
      exclusions,
      termsConditions: terms,
    };

    const result = await updateItinerary(payload);
    if (result) {
      toast.success('Itinerary updated successfully');
      router.push(`/itineraries/${id}`);
    } else {
      toast.error('Failed to update itinerary');
    }
  }

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
        <div className="flex items-center gap-2">
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
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
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
