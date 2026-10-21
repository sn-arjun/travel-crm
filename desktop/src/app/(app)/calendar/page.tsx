'use client';


import { formatLocaleDate, formatLocaleTime } from '@/lib/format';
import * as React from 'react';
import {
  ChevronLeft, ChevronRight, Plus, X, Clock, Bell, AlertCircle, Loader2,
  Pencil, Link2, Users, User, Download,
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
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar } from '@/components/domain/filter-bar';
import { RelationCombobox } from '@/components/domain/relation-combobox';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { eventsApi, normalizeEventFlags, type CalendarEvent, type CreateEventRequest, type UpdateEventRequest, type EventType } from '@/lib/api/events';
import { leadsApi } from '@/lib/api/leads';
import { toast } from 'sonner';
import Link from 'next/link';
import { toLocalDateString, toLocalDayKey } from '@/lib/dates';
import { PageContainer } from '@/components/layout/page-container';
import { chartColors } from '@/design-system/tokens';
import { unwrapList, unwrapEntity } from '@/lib/api/envelope';
import { DepartureQuickDrawer, DepartureSeatsChip } from '@/components/domain/departure-seats';
import { useDepartureSeatsLive } from '@/hooks/use-departure-seats-live';
import { useGroupTours } from '@/hooks/use-group-tours';
import { useT } from '@/lib/i18n';
import type { SeatsSummary } from '@/lib/api/departures';

const DEFAULT_EVENT_COLOR = chartColors['chart-1'].light;

const REF_DATE = Date.now();

type ViewMode = 'month' | 'week' | 'day';

// ─── Event type config ───
const TONE = {
  info: { bg: 'bg-ds-info-subtle text-ds-info-on-subtle', dot: 'bg-ds-info', edge: 'border-l-ds-info' },
  primary: { bg: 'bg-ds-primary-subtle text-ds-primary-on-subtle', dot: 'bg-ds-primary', edge: 'border-l-ds-primary' },
  warning: { bg: 'bg-ds-warning-subtle text-ds-warning-on-subtle', dot: 'bg-ds-warning', edge: 'border-l-ds-warning' },
  danger: { bg: 'bg-ds-danger-subtle text-ds-danger-on-subtle', dot: 'bg-ds-danger', edge: 'border-l-ds-danger' },
  success: { bg: 'bg-ds-success-subtle text-ds-success-on-subtle', dot: 'bg-ds-success', edge: 'border-l-ds-success' },
  cyan: { bg: 'bg-ds-chart-2/15 text-ds-foreground', dot: 'bg-ds-chart-2', edge: 'border-l-ds-chart-2' },
  pink: { bg: 'bg-ds-chart-5/15 text-ds-foreground', dot: 'bg-ds-chart-5', edge: 'border-l-ds-chart-5' },
  neutral: { bg: 'bg-ds-surface-sunken text-ds-foreground-muted', dot: 'bg-ds-foreground-subtle', edge: 'border-l-ds-border-strong' },
} as const;

const EVENT_TYPES: {
  value: EventType;
  label: string;
  bg: string;
  dot: string;
  edge: string;
  badge: string;
}[] = [
  { value: 'trip_departure', label: 'Trip Departure', ...TONE.info, badge: TONE.info.bg },
  { value: 'trip_return', label: 'Trip Return', ...TONE.cyan, badge: TONE.cyan.bg },
  { value: 'meeting', label: 'Meeting', ...TONE.primary, badge: TONE.primary.bg },
  { value: 'follow_up', label: 'Follow Up', ...TONE.warning, badge: TONE.warning.bg },
  { value: 'deadline', label: 'Deadline', ...TONE.danger, badge: TONE.danger.bg },
  { value: 'reminder', label: 'Reminder', ...TONE.pink, badge: TONE.pink.bg },
  { value: 'holiday', label: 'Holiday', ...TONE.success, badge: TONE.success.bg },
  { value: 'call', label: 'Call', ...TONE.cyan, badge: TONE.cyan.bg },
  { value: 'other', label: 'Other', ...TONE.neutral, badge: TONE.neutral.bg },
];

function getTypeConfig(type: string) {
  return EVENT_TYPES.find((t) => t.value === type) ?? EVENT_TYPES.find((t) => t.value === 'other')!;
}

function normalizeEvent(e: CalendarEvent): CalendarEvent & { startTime: string; endTime: string; type: EventType } {
  const startTime = e.startTime || e.start_at || '';
  const endTime = e.endTime || e.end_at || '';
  const type = (e.event_type || e.type || 'other') as EventType;
  return {
    ...normalizeEventFlags(e),
    startTime, endTime, type, event_type: type,
    leadId: e.leadId || e.related_lead_id,
    lead_title: e.lead_title as string | undefined,
  };
}

// ─── Helpers ───
const HOUR_START = 7;  // 7 AM
const HOUR_END = 21;   // 9 PM
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

function formatHour(hour: number): string {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  return `${h} ${ampm}`;
}

function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekDays(date: Date): Date[] {
  const day = date.getDay(); // 0=Sun
  const start = new Date(date);
  start.setDate(start.getDate() - day); // go to Sunday
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

function getEventHourPosition(event: ReturnType<typeof normalizeEvent>) {
  if (event.all_day || !event.startTime) return null;
  const start = new Date(event.startTime);
  const end = event.endTime ? new Date(event.endTime) : new Date(start.getTime() + 60 * 60 * 1000);
  const startHour = start.getHours() + start.getMinutes() / 60;
  const endHour = end.getHours() + end.getMinutes() / 60;
  // Clamp to visible range
  const top = Math.max(startHour - HOUR_START, 0);
  const bottom = Math.min(endHour - HOUR_START, HOUR_END - HOUR_START + 1);
  const height = Math.max(bottom - top, 0.5); // minimum 30min height
  return { top, height };
}

// ─── Calendar Grid (Month View) ───
function CalendarGrid({
  year, month, onDateSelect, events, selectedDate, onEventDrop, onDepartureOpen,
}: {
  year: number; month: number;
  onDateSelect: (date: string) => void;
  onDepartureOpen: (departureId: string) => void;
  events: ReturnType<typeof normalizeEvent>[];
  selectedDate: string | null;
  onEventDrop: (eventId: string, newDateStr: string) => void;
}) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startingDayOfWeek = firstDay.getDay();
  const todayStr = toLocalDateString(new Date(REF_DATE));

  const getDayEvents = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.filter((e) => toLocalDayKey(e.startTime || '') === dateStr);
  };

  type Cell = { day: number; inMonth: boolean; dayStr: string };
  const cells: Cell[] = [];
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    cells.push({ day: prevMonthDays - i, inMonth: false, dayStr: '' });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ day: i, inMonth: true, dayStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}` });
  }
  for (let i = 1; cells.length % 7 !== 0; i++) cells.push({ day: i, inMonth: false, dayStr: '' });
  const weeks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div className="overflow-hidden rounded-ds-lg border border-ds-border">
      <div className="grid grid-cols-7 border-b border-ds-border bg-ds-surface-sunken">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="border-r border-ds-border p-ds-3 text-center text-xs font-semibold text-ds-foreground-muted last:border-r-0">
            {d}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b border-ds-border last:border-b-0">
          {week.map((cell, di) => {
            if (!cell.inMonth) {
              return (
                <div
                  key={di}
                  data-out-of-month="true"
                  className="min-h-24 border-r border-ds-border bg-ds-surface-sunken p-ds-2 last:border-r-0"
                >
                  <span className="inline-flex size-6 items-center justify-center text-sm text-ds-foreground-subtle">{cell.day}</span>
                </div>
              );
            }
            const { day, dayStr } = cell;
            const dayEvents = getDayEvents(day);
            const isToday = dayStr === todayStr;
            const isSelected = dayStr === selectedDate;

            return (
              <div
                key={di}
                className={cn(
                  'min-h-24 cursor-pointer border-r border-ds-border p-ds-2 transition-colors last:border-r-0 hover:bg-ds-surface-sunken',
                  isSelected && 'ring-2 ring-inset ring-ds-ring',
                )}
                onClick={() => onDateSelect(dayStr)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const eventId = e.dataTransfer.getData('text/event-id');
                  if (eventId) onEventDrop(eventId, dayStr);
                }}
              >
                <div className={cn(
                  'mb-ds-1 inline-flex size-6 items-center justify-center rounded-full text-sm font-semibold text-ds-foreground',
                  isToday && 'bg-ds-primary text-ds-primary-foreground',
                )}>
                  {day}
                </div>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map((event) => (
                    <div
                      key={event.id}
                      // A departure moves with its dates, not by dragging its calendar entry.
                      draggable={!event.departure}
                      onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData('text/event-id', event.id); }}
                      onClick={event.departure ? (e) => { e.stopPropagation(); onDepartureOpen(event.departure!.id); } : undefined}
                      className={cn(
                        'truncate rounded-ds-sm px-ds-2 py-0.5 text-xs',
                        event.departure ? 'flex cursor-pointer items-center justify-between gap-ds-1' : 'cursor-grab active:cursor-grabbing',
                        getTypeConfig(event.type).bg,
                      )}
                      title={event.title}
                      data-testid={event.departure ? 'calendar-departure-event' : undefined}
                    >
                      <span className="truncate">{event.title}</span>
                      {event.departure && <DepartureSeatsChip seats={event.departure.seats} />}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="px-ds-2 text-xs font-medium text-ds-foreground-muted">
                      +{dayEvents.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Week View ───
function WeekView({
  currentDate, events, onEventClick, onDateSelect, onEventDrop,
}: {
  currentDate: Date;
  events: ReturnType<typeof normalizeEvent>[];
  onEventClick: (event: ReturnType<typeof normalizeEvent>) => void;
  onDateSelect: (date: string) => void;
  onEventDrop: (eventId: string, newDateStr: string) => void;
}) {
  const weekDays = getWeekDays(currentDate);
  const todayStr = toLocalDateString(new Date(REF_DATE));
  const ROW_HEIGHT = 60; // px per hour

  const getEventsForDay = (dayStr: string) =>
    events.filter((e) => toLocalDayKey(e.startTime || '') === dayStr);

  const getAllDayEvents = (dayStr: string) =>
    events.filter((e) => e.all_day && toLocalDayKey(e.startTime || '') === dayStr);

  return (
    <div className="border rounded-lg overflow-hidden flex flex-col">
      {/* Day headers */}
      <div className="grid grid-cols-[3.75rem_repeat(7,1fr)] bg-muted border-b">
        <div className="p-2 border-r" />
        {weekDays.map((day) => {
          const dayStr = formatDateStr(day);
          const isToday = dayStr === todayStr;
          return (
            <div
              key={dayStr}
              className={cn(
                'p-2 text-center border-r last:border-r-0 cursor-pointer hover:bg-muted/80 transition-colors',
                isToday && 'bg-primary/10',
              )}
              onClick={() => onDateSelect(dayStr)}
            >
              <div className="text-xs font-medium text-muted-foreground uppercase">
                {day.toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
              <div className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold mt-0.5',
                isToday && 'bg-primary text-primary-foreground',
              )}>
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day events row */}
      {weekDays.some((day) => getAllDayEvents(formatDateStr(day)).length > 0) && (
        <div className="grid grid-cols-[3.75rem_repeat(7,1fr)] border-b bg-muted/30">
          <div className="p-1 border-r text-xs text-muted-foreground text-right pr-2 pt-2">
            All Day
          </div>
          {weekDays.map((day) => {
            const dayStr = formatDateStr(day);
            const allDayEvts = getAllDayEvents(dayStr);
            return (
              <div key={dayStr} className="p-1 border-r last:border-r-0 min-h-7">
                {allDayEvts.map((event) => {
                  const cfg = getTypeConfig(event.type);
                  return (
                    <div
                      key={event.id}
                      className={cn('mb-0.5 flex cursor-pointer items-center justify-between gap-1 truncate rounded px-1.5 py-0.5 text-xs', cfg.bg)}
                      title={event.title}
                      onClick={() => onEventClick(event)}
                    >
                      <span className="truncate">{event.title}</span>
                      {event.departure && <DepartureSeatsChip seats={event.departure.seats} />}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Time grid */}
      <div className="flex-1 overflow-auto">
        <div className="relative grid grid-cols-[3.75rem_repeat(7,1fr)]" style={{ minHeight: HOURS.length * ROW_HEIGHT }}>
          {/* Time labels */}
          <div className="border-r">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="border-b last:border-b-0 text-xs text-muted-foreground text-right pr-2 pt-1"
                style={{ height: ROW_HEIGHT }}
              >
                {formatHour(hour)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day) => {
            const dayStr = formatDateStr(day);
            const isToday = dayStr === todayStr;
            const dayEvents = getEventsForDay(dayStr).filter((e) => !e.all_day);

            return (
              <div
                key={dayStr}
                className={cn('relative border-r last:border-r-0', isToday && 'bg-primary/[0.02] dark:bg-primary/[0.04]')}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const eventId = e.dataTransfer.getData('text/event-id'); if (eventId) onEventDrop(eventId, dayStr); }}
              >
                {/* Hour grid lines */}
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="border-b last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
                    style={{ height: ROW_HEIGHT }}
                    onClick={() => onDateSelect(dayStr)}
                  />
                ))}

                {/* Events positioned absolutely */}
                {dayEvents.map((event) => {
                  const pos = getEventHourPosition(event);
                  if (!pos) return null;
                  const cfg = getTypeConfig(event.type);
                  return (
                    <div
                      key={event.id}
                      draggable
                      onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData('text/event-id', event.id); }}
                      className={cn(
                        'absolute left-0.5 right-0.5 rounded px-1.5 py-0.5 overflow-hidden cursor-grab active:cursor-grabbing',
                        'border-l-2 shadow-sm hover:shadow-md transition-shadow',
                        cfg.bg,
                      )}
                      style={{
                        top: pos.top * ROW_HEIGHT,
                        height: Math.max(pos.height * ROW_HEIGHT - 2, 20),
                      }}
                      title={`${event.title}\n${formatLocaleTime(event.startTime, { hour: '2-digit', minute: '2-digit' })} - ${event.endTime ? formatLocaleTime(event.endTime, { hour: '2-digit', minute: '2-digit' }) : ''}`}
                      onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-xs font-semibold leading-tight">{event.title}</span>
                        {event.departure && <DepartureSeatsChip seats={event.departure.seats} />}
                      </div>
                      {pos.height * ROW_HEIGHT > 30 && (
                        <div className="text-xs opacity-75 truncate">
                          {formatLocaleTime(event.startTime, { hour: '2-digit', minute: '2-digit' })}
                          {event.endTime && ` - ${formatLocaleTime(event.endTime, { hour: '2-digit', minute: '2-digit' })}`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Day View ───
function DayView({
  currentDate, events, onEventClick, onDateSelect,
}: {
  currentDate: Date;
  events: ReturnType<typeof normalizeEvent>[];
  onEventClick: (event: ReturnType<typeof normalizeEvent>) => void;
  onDateSelect: (date: string) => void;
}) {
  const dayStr = formatDateStr(currentDate);
  const todayStr = toLocalDateString(new Date(REF_DATE));
  const isToday = dayStr === todayStr;
  const ROW_HEIGHT = 64; // px per hour

  const dayEvents = events.filter((e) => toLocalDayKey(e.startTime || '') === dayStr);
  const allDayEvents = dayEvents.filter((e) => e.all_day);
  const timedEvents = dayEvents.filter((e) => !e.all_day);

  return (
    <div className="border rounded-lg overflow-hidden flex flex-col">
      {/* Day header */}
      <div className="bg-muted border-b p-3 text-center">
        <div className="text-xs font-medium text-muted-foreground uppercase">
          {currentDate.toLocaleDateString('en-US', { weekday: 'long' })}
        </div>
        <div className={cn(
          'inline-flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold mt-1',
          isToday && 'bg-primary text-primary-foreground',
        )}>
          {currentDate.getDate()}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </div>
      </div>

      {/* All-day events */}
      {allDayEvents.length > 0 && (
        <div className="border-b bg-muted/30 p-2 space-y-1">
          <div className="text-xs text-muted-foreground font-medium mb-1">All Day</div>
          {allDayEvents.map((event) => {
            const cfg = getTypeConfig(event.type);
            return (
              <div
                key={event.id}
                className={cn('flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-xs', cfg.bg)}
                onClick={() => onEventClick(event)}
              >
                <span className="truncate">{event.title}</span>
                {event.departure && <DepartureSeatsChip seats={event.departure.seats} />}
              </div>
            );
          })}
        </div>
      )}

      {/* Time grid */}
      <div className="flex-1 overflow-auto">
        <div className="relative grid grid-cols-[3.75rem_1fr]" style={{ minHeight: HOURS.length * ROW_HEIGHT }}>
          {/* Time labels */}
          <div className="border-r">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="border-b last:border-b-0 text-xs text-muted-foreground text-right pr-2 pt-1"
                style={{ height: ROW_HEIGHT }}
              >
                {formatHour(hour)}
              </div>
            ))}
          </div>

          {/* Event column */}
          <div className={cn('relative', isToday && 'bg-primary/[0.02] dark:bg-primary/[0.04]')}>
            {/* Hour grid lines */}
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="border-b last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
                style={{ height: ROW_HEIGHT }}
                onClick={() => onDateSelect(dayStr)}
              />
            ))}

            {/* Events */}
            {timedEvents.map((event) => {
              const pos = getEventHourPosition(event);
              if (!pos) return null;
              const cfg = getTypeConfig(event.type);
              return (
                <div
                  key={event.id}
                  className={cn(
                    'absolute left-1 right-1 rounded-md px-3 py-1.5 overflow-hidden cursor-pointer',
                    'border-l-3 shadow-sm hover:shadow-md transition-shadow',
                    cfg.bg,
                  )}
                  style={{
                    top: pos.top * ROW_HEIGHT,
                    height: Math.max(pos.height * ROW_HEIGHT - 2, 24),
                  }}
                  title={event.title}
                  onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs font-semibold">{event.title}</span>
                    {event.departure && <DepartureSeatsChip seats={event.departure.seats} />}
                  </div>
                  {pos.height * ROW_HEIGHT > 36 && (
                    <div className="text-xs opacity-75 mt-0.5">
                      {formatLocaleTime(event.startTime, { hour: '2-digit', minute: '2-digit' })}
                      {event.endTime && ` - ${formatLocaleTime(event.endTime, { hour: '2-digit', minute: '2-digit' })}`}
                    </div>
                  )}
                  {pos.height * ROW_HEIGHT > 56 && event.location && (
                    <div className="text-xs opacity-60 mt-0.5 truncate">{event.location}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
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
  value, onChange,
}: {
  value: EventFormData;
  onChange: (v: EventFormData) => void;
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
            value={value.color || DEFAULT_EVENT_COLOR}
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
        <RelationCombobox<{ id: string; title?: string; name?: string }>
          value={value.leadId || null}
          onChange={(id, item) => set({ leadId: id ?? '', leadTitle: item ? (item.title || item.name || '') : '' })}
          fetcher={async (q, page) => {
            const r = unwrapList<{ id: string; title?: string; name?: string }>(await leadsApi.list({ search: q || undefined, page, limit: 20 }));
            return { items: r.data, total: r.pagination.total };
          }}
          getOptionId={(l) => l.id}
          getOptionLabel={(l) => l.title || l.name || l.id}
          resolveSelected={async (id) => {
            const r = await leadsApi.getById(id);
            return unwrapEntity<{ id: string; title?: string; name?: string } | null>(r) ?? null;
          }}
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
  allDay: false, description: '', location: '', color: DEFAULT_EVENT_COLOR,
  leadId: '', leadTitle: '', assignedTo: '',
};

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = React.useState(new Date(REF_DATE));
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const [calendarView, setCalendarView] = React.useState<'my' | 'team'>('my');
  const [viewMode, setViewMode] = React.useState<ViewMode>('month');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editEvent, setEditEvent] = React.useState<(CalendarEvent & { startTime: string; endTime: string; type: EventType }) | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [formData, setFormData] = React.useState<EventFormData>(EMPTY_FORM);
  const [editFormData, setEditFormData] = React.useState<EventFormData>(EMPTY_FORM);
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState<string>('');
  // A group departure's entry opens its drawer; its seats redraw when the API announces a change.
  const [drawerDeparture, setDrawerDeparture] = React.useState<string | null>(null);
  const [liveSeats, setLiveSeats] = React.useState<Record<string, SeatsSummary>>({});
  const { enabled: groupToursOn } = useGroupTours();
  const t = useT();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // ─── Date range based on view mode ───
  const { rangeStart, rangeEnd } = React.useMemo(() => {
    if (viewMode === 'month') {
      return {
        rangeStart: new Date(year, month, 1).toISOString(),
        rangeEnd: new Date(year, month + 1, 0, 23, 59, 59).toISOString(),
      };
    }
    if (viewMode === 'week') {
      const weekDays = getWeekDays(currentDate);
      const wStart = weekDays[0]!;
      const wEnd = weekDays[6]!;
      return {
        rangeStart: new Date(wStart.getFullYear(), wStart.getMonth(), wStart.getDate()).toISOString(),
        rangeEnd: new Date(wEnd.getFullYear(), wEnd.getMonth(), wEnd.getDate(), 23, 59, 59).toISOString(),
      };
    }
    // day
    return {
      rangeStart: new Date(year, month, currentDate.getDate()).toISOString(),
      rangeEnd: new Date(year, month, currentDate.getDate(), 23, 59, 59).toISOString(),
    };
  }, [viewMode, year, month, currentDate]);

  const { data: eventsResp, loading, error, refetch } = useApiQuery(
    () => eventsApi.list({ start_date: rangeStart, end_date: rangeEnd, view: calendarView }),
    [rangeStart, rangeEnd, calendarView],
  );

  const createMutation = useApiMutation((data: CreateEventRequest) => eventsApi.create(data));
  const updateMutation = useApiMutation(({ id, data }: { id: string; data: UpdateEventRequest }) => eventsApi.update(id, data));
  const deleteMutation = useApiMutation((eventId: string) => eventsApi.delete(eventId));
  const rescheduleMutation = useApiMutation(({ id, data }: { id: string; data: { start_at: string; end_at?: string } }) => eventsApi.reschedule(id, data));

  const rawEvents = unwrapList<CalendarEvent>(eventsResp).data;

  // Seats announced since the list was read are shown until the next read.
  useDepartureSeatsLive((e) => {
    if (e.seats) setLiveSeats((prev) => ({ ...prev, [e.departureId]: e.seats! }));
  });
  React.useEffect(() => setLiveSeats({}), [eventsResp]);

  const allEvents = React.useMemo(
    () =>
      rawEvents.map((raw) => {
        const e = normalizeEvent(raw);
        // Seat chips show only when the plan has group departures and the agency switched them on.
        if (!e.departure) return e;
        if (!groupToursOn) return { ...e, departure: undefined };
        const live = liveSeats[e.departure.id];
        return live ? { ...e, departure: { ...e.departure, seats: live } } : e;
      }),
    [rawEvents, liveSeats, groupToursOn],
  );

  const events = React.useMemo(() => {
    return allEvents.filter((e) => {
      if (typeFilter && e.type !== typeFilter) return false;
      if (search && !e.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [allEvents, typeFilter, search]);

  const handleEventDrop = async (eventId: string, newDateStr: string) => {
    const event = allEvents.find((e) => e.id === eventId);
    if (!event) return;
    const oldDateStr = toLocalDayKey(event.startTime || '');
    if (oldDateStr === newDateStr) return;
    const start = event.startTime ? new Date(event.startTime) : null;
    const end = event.endTime ? new Date(event.endTime) : null;
    const [ny, nm, nd] = newDateStr.split('-').map(Number);
    const newStart = event.all_day || !start
      ? `${newDateStr}T00:00:00.000Z`
      : new Date(ny!, nm! - 1, nd!, start.getHours(), start.getMinutes()).toISOString();
    const newEnd = event.all_day || !end
      ? `${newDateStr}T23:59:59.000Z`
      : new Date(ny!, nm! - 1, nd!, end.getHours(), end.getMinutes()).toISOString();
    try {
      await rescheduleMutation.mutate({ id: eventId, data: { start_at: newStart, end_at: newEnd } });
      toast.success('Event rescheduled');
      await refetch();
    } catch {
      toast.error('Failed to reschedule event');
    }
  };

  // ─── View-aware navigation ───
  const handlePrev = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(year, month - 1, 1));
    } else if (viewMode === 'week') {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 7);
      setCurrentDate(d);
    } else {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 1);
      setCurrentDate(d);
    }
    setSelectedDate(null);
  };

  const handleNext = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(year, month + 1, 1));
    } else if (viewMode === 'week') {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 7);
      setCurrentDate(d);
    } else {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 1);
      setCurrentDate(d);
    }
    setSelectedDate(null);
  };

  const handleToday = () => {
    setCurrentDate(new Date(REF_DATE));
    setSelectedDate(toLocalDateString(new Date(REF_DATE)));
  };

  const selectedDateEvents = selectedDate
    ? events.filter((e) => toLocalDayKey(e.startTime || '') === selectedDate)
    : [];

  // ─── View-aware header label ───
  const headerLabel = React.useMemo(() => {
    if (viewMode === 'month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    if (viewMode === 'week') {
      const weekDays = getWeekDays(currentDate);
      const start = weekDays[0]!;
      const end = weekDays[6]!;
      if (start.getMonth() === end.getMonth()) {
        return `${start.toLocaleDateString('en-US', { month: 'short' })} ${start.getDate()} - ${end.getDate()}, ${end.getFullYear()}`;
      }
      return `${start.toLocaleDateString('en-US', { month: 'short' })} ${start.getDate()} - ${end.toLocaleDateString('en-US', { month: 'short' })} ${end.getDate()}, ${end.getFullYear()}`;
    }
    // day
    return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }, [viewMode, currentDate]);

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
      color: event.color || DEFAULT_EVENT_COLOR,
      leadId: event.leadId || event.related_lead_id || '',
      leadTitle: '',
      assignedTo: event.assigned_to || '',
    });
    setEditOpen(true);
  };

  const handleEventClick = (event: typeof events[number]) => {
    if (event.departure) {
      setDrawerDeparture(event.departure.id);
      return;
    }
    // Set selected date to the event's date and open side panel
    const eventDate = toLocalDayKey(event.startTime || '');
    if (eventDate) {
      setSelectedDate(eventDate);
    }
  };

  const handleUpdateEvent = async () => {
    if (!editEvent || !editFormData.title) {
      toast.error('Title is required');
      return;
    }
    const startDate = (toLocalDayKey(editEvent.startTime || '') || selectedDate) ?? toLocalDateString(new Date());
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

  const handleExport = () => {
    const header = ['Title', 'Type', 'Start', 'End', 'All day', 'Location', 'Linked lead'];
    const rows = events.map((e) => [
      e.title,
      getTypeConfig(e.type).label,
      e.startTime ?? '',
      e.endTime ?? '',
      e.all_day ? 'Yes' : 'No',
      e.location ?? '',
      e.lead_title ?? '',
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calendar-events-${formatDateStr(currentDate)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageContainer>
      {/* Calendar */}
      <div className="flex flex-col gap-ds-4">
        <PageHeader
          title="Calendar"
          description="Trip departures, meetings, deadlines and reminders."
          count={events.length}
          actions={
            <Button variant="outline" size="sm" onClick={handleExport} disabled={events.length === 0}>
              <Download className="h-4 w-4 mr-1.5" /> Export
            </Button>
          }
        />

        {/* View controls */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
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
            {/* View mode toggle: Month | Week | Day */}
            <div className="flex rounded-md border overflow-hidden text-xs font-medium">
              {(['month', 'week', 'day'] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  className={cn(
                    'px-3 py-1.5 transition-colors capitalize',
                    viewMode === mode ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                  onClick={() => setViewMode(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleToday}>Today</Button>
            <Button variant="ghost" size="icon-sm" aria-label="Previous" onClick={handlePrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-medium min-w-32 text-center">{headerLabel}</div>
            <Button variant="ghost" size="icon-sm" aria-label="Next" onClick={handleNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search events..."
          activeFilters={typeFilter ? [{ id: 'type', label: 'Type', value: getTypeConfig(typeFilter).label }] : []}
          onRemoveFilter={() => setTypeFilter('')}
          onClearFilters={() => { setSearch(''); setTypeFilter(''); }}
          actions={
            <Select value={typeFilter || 'all'} onValueChange={(v) => setTypeFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Event type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {EVENT_TYPES.slice(0, 7).map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

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

        {/* Empty state — no events at all in range (regardless of filters) */}
        {!loading && !error && allEvents.length === 0 && (
          <EmptyState
            icon={<Bell className="h-8 w-8" />}
            title="No events in this range"
            description="Create an event to see it on the calendar."
            action={
              <Button size="sm" onClick={() => { setSelectedDate(formatDateStr(currentDate)); setFormData(EMPTY_FORM); setCreateOpen(true); }}>
                <Plus className="h-4 w-4 mr-1.5" /> Add event
              </Button>
            }
          />
        )}

        {/* Calendar Views */}
        {!loading && !error && allEvents.length > 0 && viewMode === 'month' && (
          <CalendarGrid
            year={year} month={month}
            onDateSelect={setSelectedDate}
            events={events}
            selectedDate={selectedDate}
            onEventDrop={handleEventDrop}
            onDepartureOpen={setDrawerDeparture}
          />
        )}

        {!loading && !error && allEvents.length > 0 && viewMode === 'week' && (
          <WeekView
            currentDate={currentDate}
            events={events}
            onEventClick={handleEventClick}
            onDateSelect={setSelectedDate}
            onEventDrop={handleEventDrop}
          />
        )}

        {!loading && !error && allEvents.length > 0 && viewMode === 'day' && (
          <DayView
            currentDate={currentDate}
            events={events}
            onEventClick={handleEventClick}
            onDateSelect={(date) => setSelectedDate(date)}
          />
        )}
      </div>

      {/* Side Panel — Events for Selected Date */}
      <Sheet open={!!selectedDate} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <SheetContent className="w-90 flex flex-col p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle>
              {selectedDate
                ? formatLocaleDate(selectedDate + 'T12:00:00', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
                : 'Events'}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-auto space-y-3 px-6 py-4">
            {selectedDateEvents.length === 0 ? (
              <EmptyState
                icon={<Bell className="h-8 w-8" />}
                title="No events on this day"
                description='Click "Add Event" to create one.'
              />
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
                            <Badge className={cn('text-xs', cfg.badge)}>{cfg.label}</Badge>
                            {event.all_day ? <Badge variant="outline" className="text-xs">All Day</Badge> : null}
                          </div>
                          <h3 className="font-semibold text-sm">{event.title}</h3>
                          {event.departure && (
                            <div className="flex items-center gap-2">
                              <DepartureSeatsChip seats={event.departure.seats} />
                              <button
                                type="button"
                                className="text-xs text-primary hover:underline"
                                onClick={() => setDrawerDeparture(event.departure!.id)}
                              >
                                {t('departures.calendar.openDeparture')}
                              </button>
                            </div>
                          )}
                          {!event.all_day && event.startTime && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatLocaleTime(event.startTime, { hour: '2-digit', minute: '2-digit' })}
                              {event.endTime && ' — '}
                              {event.endTime && formatLocaleTime(event.endTime, { hour: '2-digit', minute: '2-digit' })}
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
                          <Button variant="ghost" size="icon-sm" aria-label="Edit event" onClick={() => handleEditOpen(event)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Delete event"
                            onClick={() => handleDeleteEvent(event.id)}
                          >
                            <X className="h-3.5 w-3.5 text-ds-danger" />
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

      <DepartureQuickDrawer departureId={drawerDeparture} onClose={() => setDrawerDeparture(null)} />

      {/* Create Event Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Event</DialogTitle>
            <DialogDescription>
              {selectedDate && formatLocaleDate(selectedDate + 'T12:00:00', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </DialogDescription>
          </DialogHeader>
          <EventForm
            value={formData}
            onChange={setFormData}
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
    </PageContainer>
  );
}
