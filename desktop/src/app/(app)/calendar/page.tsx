'use client';

import * as React from 'react';
import {
  ChevronLeft, ChevronRight, Plus, X, Clock, Bell, AlertCircle, Loader2,
  Pencil, Link2, Users, User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Combobox } from '@/components/ui/combobox';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { eventsApi, type CalendarEvent, type EventType } from '@/lib/api/events';
import { toast } from 'sonner';
import Link from 'next/link';

const REF_DATE = Date.now();

// ─── Event type config ───
const EVENT_TYPES: {
  value: EventType;
  label: string;
  bg: string;
  dot: string;
  badge: string;
}[] = [
  { value: 'trip_departure', label: 'Trip Departure', bg: 'text-blue-700 bg-blue-50 dark:bg-blue-950/50', dot: 'bg-blue-500', badge: 'bg-blue-100 text-blue-800' },
  { value: 'trip_return', label: 'Trip Return', bg: 'text-cyan-700 bg-cyan-50 dark:bg-cyan-950/50', dot: 'bg-cyan-500', badge: 'bg-cyan-100 text-cyan-800' },
  { value: 'meeting', label: 'Meeting', bg: 'text-purple-700 bg-purple-50 dark:bg-purple-950/50', dot: 'bg-purple-500', badge: 'bg-purple-100 text-purple-800' },
  { value: 'follow_up', label: 'Follow Up', bg: 'text-amber-700 bg-amber-50 dark:bg-amber-950/50', dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800' },
  { value: 'deadline', label: 'Deadline', bg: 'text-red-700 bg-red-50 dark:bg-red-950/50', dot: 'bg-red-500', badge: 'bg-red-100 text-red-800' },
  { value: 'reminder', label: 'Reminder', bg: 'text-orange-700 bg-orange-50 dark:bg-orange-950/50', dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-800' },
  { value: 'holiday', label: 'Holiday', bg: 'text-green-700 bg-green-50 dark:bg-green-950/50', dot: 'bg-green-500', badge: 'bg-green-100 text-green-800' },
  // legacy
  { value: 'call' as EventType, label: 'Call', bg: 'text-teal-700 bg-teal-50', dot: 'bg-teal-500', badge: 'bg-teal-100 text-teal-800' },
  { value: 'other' as EventType, label: 'Other', bg: 'text-gray-700 bg-gray-50', dot: 'bg-gray-400', badge: 'bg-gray-100 text-gray-800' },
];

function getTypeConfig(type: string) {
  return EVENT_TYPES.find((t) => t.value === type) ?? EVENT_TYPES.find((t) => t.value === 'other')!;
}

function normalizeEvent(e: any): CalendarEvent & { startTime: string; endTime: string; type: EventType } {
  const startTime = e.startTime || e.start_at || '';
  const endTime = e.endTime || e.end_at || '';
  const type = (e.event_type || e.type || 'other') as EventType;
  return {
    ...e,
    startTime, endTime, type, event_type: type,
    leadId: e.leadId || e.related_lead_id,
    lead_title: e.lead_title as string | undefined,
  };
}

// ─── Calendar Grid ───
function CalendarGrid({
  year, month, onDateSelect, events, selectedDate,
}: {
  year: number; month: number;
  onDateSelect: (date: string) => void;
  events: ReturnType<typeof normalizeEvent>[];
  selectedDate: string | null;
}) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startingDayOfWeek = firstDay.getDay();
  const todayStr = new Date(REF_DATE).toISOString().split('T')[0];

  const getDayEvents = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.filter((e) => (e.startTime || '').split('T')[0] === dateStr);
  };

  const days: (number | null)[] = Array.from({ length: startingDayOfWeek }, () => null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="grid grid-cols-7 bg-muted border-b">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="p-3 text-center text-xs font-semibold border-r last:border-r-0 text-muted-foreground">
            {d}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
          {week.map((day, di) => {
            const dayStr = day
              ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              : null;
            const dayEvents = day ? getDayEvents(day) : [];
            const isToday = dayStr === todayStr;
            const isSelected = dayStr === selectedDate;

            return (
              <div
                key={di}
                className={cn(
                  'min-h-24 p-2 border-r last:border-r-0 cursor-pointer hover:bg-muted/50 transition-colors',
                  isToday && 'bg-primary/5',
                  isSelected && 'ring-2 ring-inset ring-primary/40',
                  !day && 'bg-muted/20 cursor-default',
                )}
                onClick={() => day && dayStr && onDateSelect(dayStr)}
              >
                {day && (
                  <>
                    <div className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold mb-1',
                      isToday && 'bg-primary text-primary-foreground',
                    )}>
                      {day}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((event) => (
                        <div
                          key={event.id}
                          className={cn('text-[10px] px-1.5 py-0.5 rounded truncate', getTypeConfig(event.type).bg)}
                          title={event.title}
                        >
                          {event.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] px-1.5 text-muted-foreground font-medium">
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Calendar Skeleton ───
function CalendarSkeleton() {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="grid grid-cols-7 bg-muted border-b">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="p-3 text-center border-r last:border-r-0">
            <Skeleton className="h-4 w-8 mx-auto" />
          </div>
        ))}
      </div>
      {[0, 1, 2, 3, 4].map((wi) => (
        <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
          {Array.from({ length: 7 }).map((_, di) => (
            <div key={di} className="min-h-24 p-2 border-r last:border-r-0 space-y-1">
              <Skeleton className="h-4 w-4" />
              {wi === 0 && di < 3 && <Skeleton className="h-3 w-full" />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Event Form (shared between create and edit) ───
interface EventFormData {
  title: string;
  type: EventType;
  startTime: string;
  endTime: string;
  allDay: boolean;
  description: string;
  location: string;
  color: string;
  leadId: string;
  leadTitle: string;
  assignedTo: string;
}

function EventForm({
  value, onChange, selectedDate, leadOptions, userOptions, onLeadSearch,
}: {
  value: EventFormData;
  onChange: (v: EventFormData) => void;
  selectedDate?: string | null;
  leadOptions: { value: string; label: string }[];
  userOptions: { value: string; label: string }[];
  onLeadSearch: (q: string) => void;
}) {
  const set = (patch: Partial<EventFormData>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Title <span className="text-destructive">*</span></Label>
        <Input
          placeholder="Event title"
          value={value.title}
          onChange={(e) => set({ title: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={value.type} onValueChange={(v) => set({ type: v as EventType })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {EVENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Color</Label>
          <Input
            type="color"
            value={value.color || '#6366F1'}
            onChange={(e) => set({ color: e.target.value })}
            className="h-9 p-1 cursor-pointer"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          checked={value.allDay}
          onCheckedChange={(v) => set({ allDay: v })}
          id="allDay"
        />
        <Label htmlFor="allDay">All Day</Label>
      </div>

      {!value.allDay && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Start Time</Label>
            <Input
              type="time"
              value={value.startTime}
              onChange={(e) => set({ startTime: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>End Time</Label>
            <Input
              type="time"
              value={value.endTime}
              onChange={(e) => set({ endTime: e.target.value })}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Location</Label>
        <Input
          placeholder="Add location"
          value={value.location}
          onChange={(e) => set({ location: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>Linked Lead</Label>
        <Combobox
          options={[
            ...(value.leadId && value.leadTitle ? [{ value: value.leadId, label: value.leadTitle }] : []),
            ...leadOptions.filter((o) => o.value !== value.leadId),
          ]}
          value={value.leadId}
          onValueChange={(v) => {
            const opt = leadOptions.find((o) => o.value === v);
            set({ leadId: v, leadTitle: opt?.label || '' });
          }}
          onSearch={onLeadSearch}
          placeholder="Search leads..."
          searchPlaceholder="Search by lead title..."
        />
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          placeholder="Add description"
          value={value.description}
          onChange={(e) => set({ description: e.target.value })}
          rows={3}
        />
      </div>
    </div>
  );
}

// ─── Main Page ───
const EMPTY_FORM: EventFormData = {
  title: '', type: 'meeting', startTime: '09:00', endTime: '10:00',
  allDay: false, description: '', location: '', color: '#6366F1',
  leadId: '', leadTitle: '', assignedTo: '',
};

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = React.useState(new Date(REF_DATE));
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const [calendarView, setCalendarView] = React.useState<'my' | 'team'>('my');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editEvent, setEditEvent] = React.useState<(CalendarEvent & { startTime: string; endTime: string; type: EventType }) | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [formData, setFormData] = React.useState<EventFormData>(EMPTY_FORM);
  const [editFormData, setEditFormData] = React.useState<EventFormData>(EMPTY_FORM);
  const [leadSearch, setLeadSearch] = React.useState('');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthStart = new Date(year, month, 1).toISOString();
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

  const { data: eventsResp, loading, error, refetch } = useApiQuery(
    () => eventsApi.list({ start_date: monthStart, end_date: monthEnd, view: calendarView }),
    [year, month, calendarView],
  );

  const { data: leadsResp } = useApiQuery(
    () => import('@/lib/api/leads').then((m) => m.leadsApi.list({ search: leadSearch || undefined, limit: 30 })),
    [leadSearch],
  );

  const leads = React.useMemo(() => {
    const raw = (leadsResp as any)?.data?.data ?? (leadsResp as any)?.data ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [leadsResp]);
  const leadOptions = leads.map((l: any) => ({ value: l.id, label: l.title || l.name || l.id }));

  const createMutation = useApiMutation((data: any) => eventsApi.create(data));
  const updateMutation = useApiMutation(({ id, data }: { id: string; data: any }) => eventsApi.update(id, data));
  const deleteMutation = useApiMutation((eventId: string) => eventsApi.delete(eventId));

  const rawEvents = (eventsResp as any)?.data?.data ?? (eventsResp as any)?.data ?? [];
  const events = React.useMemo(
    () => (Array.isArray(rawEvents) ? rawEvents : []).map(normalizeEvent),
    [rawEvents],
  );

  const handlePrevMonth = () => { setCurrentDate(new Date(year, month - 1, 1)); setSelectedDate(null); };
  const handleNextMonth = () => { setCurrentDate(new Date(year, month + 1, 1)); setSelectedDate(null); };
  const handleToday = () => { setCurrentDate(new Date(REF_DATE)); setSelectedDate(new Date(REF_DATE).toISOString().split('T')[0] ?? null); };

  const selectedDateEvents = selectedDate
    ? events.filter((e) => (e.startTime || '').split('T')[0] === selectedDate)
    : [];

  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const buildEventPayload = (form: EventFormData, date: string) => {
    const startAt = form.allDay
      ? `${date}T00:00:00.000Z`
      : new Date(`${date}T${form.startTime}:00`).toISOString();
    const endAt = form.allDay
      ? `${date}T23:59:59.000Z`
      : new Date(`${date}T${form.endTime}:00`).toISOString();
    return {
      title: form.title,
      event_type: form.type,
      start_at: startAt,
      end_at: endAt,
      all_day: form.allDay,
      description: form.description || undefined,
      location: form.location || undefined,
      color: form.color || undefined,
      related_lead_id: form.leadId || undefined,
      assigned_to: form.assignedTo || undefined,
    };
  };

  const handleCreateEvent = async () => {
    if (!formData.title || !selectedDate) {
      toast.error('Title is required');
      return;
    }
    try {
      await createMutation.mutate(buildEventPayload(formData, selectedDate));
      toast.success('Event created');
      setCreateOpen(false);
      setFormData(EMPTY_FORM);
      await refetch();
    } catch {
      toast.error('Failed to create event');
    }
  };

  const handleEditOpen = (event: typeof events[number]) => {
    setEditEvent(event);
    const startDate = (event.startTime || '').split('T')[0] ?? '';
    const startTimePart = event.all_day ? '09:00'
      : new Date(event.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const endTimePart = event.all_day ? '10:00'
      : new Date(event.endTime || event.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    setEditFormData({
      title: event.title,
      type: event.type || 'meeting',
      startTime: startTimePart,
      endTime: endTimePart,
      allDay: Boolean(event.all_day),
      description: event.description || '',
      location: event.location || '',
      color: event.color || '#6366F1',
      leadId: event.leadId || event.related_lead_id || '',
      leadTitle: '',
      assignedTo: event.assigned_to || '',
    });
    setEditOpen(true);
  };

  const handleUpdateEvent = async () => {
    if (!editEvent || !editFormData.title) {
      toast.error('Title is required');
      return;
    }
    const startDate = (editEvent.startTime || '').split('T')[0] ?? selectedDate ?? new Date().toISOString().split('T')[0]!;
    try {
      await updateMutation.mutate({ id: editEvent.id, data: buildEventPayload(editFormData, startDate) });
      toast.success('Event updated');
      setEditOpen(false);
      setEditEvent(null);
      await refetch();
    } catch {
      toast.error('Failed to update event');
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    try {
      await deleteMutation.mutate(eventId);
      toast.success('Event deleted');
      await refetch();
    } catch {
      toast.error('Failed to delete event');
    }
  };

  return (
    <div className="flex h-full gap-6 p-6 overflow-hidden">
      {/* Calendar */}
      <div className="flex-1 flex flex-col gap-4 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight">Calendar</h1>
            {/* My / Team toggle */}
            <div className="flex rounded-md border overflow-hidden text-xs font-medium">
              <button
                className={cn('px-3 py-1.5 flex items-center gap-1 transition-colors', calendarView === 'my' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                onClick={() => setCalendarView('my')}
              >
                <User className="h-3 w-3" /> My Calendar
              </button>
              <button
                className={cn('px-3 py-1.5 flex items-center gap-1 transition-colors', calendarView === 'team' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                onClick={() => setCalendarView('team')}
              >
                <Users className="h-3 w-3" /> Team
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleToday}>Today</Button>
            <Button variant="ghost" size="icon-sm" onClick={handlePrevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-medium min-w-[130px] text-center">{monthName}</div>
            <Button variant="ghost" size="icon-sm" onClick={handleNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Legend — all 7 event types */}
        <div className="flex gap-3 flex-wrap text-xs">
          {EVENT_TYPES.slice(0, 7).map((t) => (
            <div key={t.value} className="flex items-center gap-1.5">
              <div className={cn('w-2.5 h-2.5 rounded-full', t.dot)} />
              <span className="text-muted-foreground">{t.label}</span>
            </div>
          ))}
        </div>

        {/* Loading */}
        {loading && <CalendarSkeleton />}

        {/* Error */}
        {error && !loading && (
          <div className="flex items-center justify-center h-96 text-muted-foreground">
            <div className="text-center">
              <AlertCircle className="h-8 w-8 mx-auto mb-2" />
              <p>{error.message}</p>
              <Button size="sm" onClick={() => refetch()} className="mt-4">Retry</Button>
            </div>
          </div>
        )}

        {/* Calendar Grid */}
        {!loading && !error && (
          <CalendarGrid
            year={year} month={month}
            onDateSelect={setSelectedDate}
            events={events}
            selectedDate={selectedDate}
          />
        )}
      </div>

      {/* Side Panel — Events for Selected Date */}
      <Sheet open={!!selectedDate} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <SheetContent className="w-[360px] flex flex-col p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle>
              {selectedDate
                ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
                : 'Events'}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-auto space-y-3 px-6 py-4">
            {selectedDateEvents.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">
                <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No events on this day</p>
                <p className="text-xs mt-1">Click "Add Event" to create one</p>
              </div>
            ) : (
              selectedDateEvents.map((event) => {
                const cfg = getTypeConfig(event.type);
                const leadDisplay = event.lead_title || (event.leadId ? `Lead #${event.leadId.slice(0, 8)}` : null);
                return (
                  <Card key={event.id} className="overflow-hidden">
                    <div className={cn('h-1', cfg.dot.replace('bg-', 'bg-'))} />
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge className={cn('text-[10px]', cfg.badge)}>{cfg.label}</Badge>
                            {event.all_day && <Badge variant="outline" className="text-[10px]">All Day</Badge>}
                          </div>
                          <h3 className="font-semibold text-sm">{event.title}</h3>
                          {!event.all_day && event.startTime && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(event.startTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                              {event.endTime && ' — '}
                              {event.endTime && new Date(event.endTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                          {event.location && (
                            <p className="text-xs text-muted-foreground">{event.location}</p>
                          )}
                          {event.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{event.description}</p>
                          )}
                          {leadDisplay && (
                            <Link
                              href={`/leads/${event.leadId || event.related_lead_id}`}
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              <Link2 className="h-3 w-3" /> {leadDisplay}
                            </Link>
                          )}
                          {event.assignee_name && (
                            <p className="text-xs text-muted-foreground">
                              Assignee: {event.assignee_name}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => handleEditOpen(event)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDeleteEvent(event.id)}
                          >
                            <X className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          {selectedDate && (
            <div className="border-t px-6 py-4">
              <Button className="w-full" size="sm" onClick={() => { setFormData(EMPTY_FORM); setCreateOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Event
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Create Event Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Event</DialogTitle>
            <DialogDescription>
              {selectedDate && new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </DialogDescription>
          </DialogHeader>
          <EventForm
            value={formData}
            onChange={setFormData}
            selectedDate={selectedDate}
            leadOptions={leadOptions}
            userOptions={[]}
            onLeadSearch={setLeadSearch}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateEvent} disabled={createMutation.loading}>
              {createMutation.loading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Event Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Event</DialogTitle>
            <DialogDescription>{editEvent?.title}</DialogDescription>
          </DialogHeader>
          <EventForm
            value={editFormData}
            onChange={setEditFormData}
            selectedDate={selectedDate}
            leadOptions={leadOptions}
            userOptions={[]}
            onLeadSearch={setLeadSearch}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateEvent} disabled={updateMutation.loading}>
              {updateMutation.loading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
