'use client';

import * as React from 'react';
import {
  ChevronLeft, ChevronRight, Plus, X, MapPin, Clock, FileText,
  MessageSquare, Zap, Bell, AlertCircle, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { eventsApi, type CalendarEvent, type CreateEventRequest } from '@/lib/api/events';
import { toast } from 'sonner';

const REF_DATE = Date.now();

function getEventTypeColor(type: string) {
  const colors: Record<string, string> = {
    'trip': 'text-blue-600 bg-blue-50',
    'meeting': 'text-purple-600 bg-purple-50',
    'call': 'text-amber-600 bg-amber-50',
    'task': 'text-red-600 bg-red-50',
    'other': 'text-green-600 bg-green-50',
  };
  return colors[type] ?? colors['other'];
}

function getEventBadgeColor(type: string) {
  const colors: Record<string, string> = {
    'trip': 'bg-blue-100 text-blue-900',
    'meeting': 'bg-purple-100 text-purple-900',
    'call': 'bg-amber-100 text-amber-900',
    'task': 'bg-red-100 text-red-900',
    'other': 'bg-green-100 text-green-900',
  };
  return colors[type] ?? colors['other'];
}

function getEventTypeLabel(type: string) {
  const labels: Record<string, string> = {
    'trip': 'Trip',
    'meeting': 'Meeting',
    'call': 'Call',
    'task': 'Task',
    'other': 'Other',
  };
  return labels[type] ?? type;
}

function CalendarGrid({
  year,
  month,
  onDateSelect,
  events,
}: {
  year: number
  month: number
  onDateSelect: (date: string) => void
  events: CalendarEvent[]
}) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const getDayEvents = (day: number) => {
    const dateStr = new Date(year, month, day).toISOString().split('T')[0] ?? '';
    return events.filter((e: any) => {
      const eventDate = e.startTime.split('T')[0] ?? '';
      return eventDate === dateStr;
    });
  };

  const days: (number | null)[] = Array.from({ length: startingDayOfWeek }, () => null);
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 bg-muted border-b">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day: any) => (
          <div key={day} className="p-3 text-center text-sm font-semibold border-r last:border-r-0">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar days */}
      {weeks.map((week, weekIdx) => (
        <div key={weekIdx} className="grid grid-cols-7 border-b last:border-b-0">
          {week.map((day, dayIdx) => {
            const dayEvents = day ? getDayEvents(day) : [];
            const isToday = day && new Date(year, month, day).toISOString().split('T')[0] === new Date(REF_DATE).toISOString().split('T')[0];

            return (
              <div
                key={dayIdx}
                className={cn(
                  'min-h-24 p-2 border-r last:border-r-0 cursor-pointer hover:bg-muted/50 transition-colors',
                  isToday && 'bg-primary/5',
                  !day && 'bg-muted/30',
                )}
                onClick={() => day && onDateSelect(new Date(year, month, day).toISOString().split('T')[0] ?? '')}
              >
                {day && (
                  <div>
                    <div className={cn('text-sm font-semibold mb-1', isToday && 'text-primary')}>
                      {day}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((event: any) => (
                        <div
                          key={event.id}
                          className={cn('text-[10px] px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80', getEventTypeColor(event.type))}
                          title={event.title}
                        >
                          {event.title}
                        </div>
                      ))}
                      {(dayEvents.length ?? 0) > 3 && (
                        <div className="text-[10px] px-1.5 py-0.5 text-muted-foreground font-medium">
                          +{(dayEvents.length ?? 0) - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = React.useState(new Date(REF_DATE));
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [newEvent, setNewEvent] = React.useState({
    title: '',
    type: 'meeting',
    time: '09:00',
    description: '',
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Fetch events for the month
  const monthStart = new Date(year, month, 1).toISOString();
  const monthEnd = new Date(year, month + 1, 0).toISOString();

  const { data: eventsResponse, loading, error, refetch } = useApiQuery(
    () => eventsApi.list({
      start_date: monthStart,
      end_date: monthEnd,
    }),
    [year, month],
  );

  const createEventMutation = useApiMutation((data: CreateEventRequest) => eventsApi.create(data));

  const deleteEventMutation = useApiMutation((eventId: string) => eventsApi.delete(eventId));

  const rawEvents = eventsResponse?.data?.data ?? eventsResponse?.data ?? [];
  // Map backend snake_case fields to frontend camelCase
  const events: CalendarEvent[] = (Array.isArray(rawEvents) ? rawEvents : []).map((e: any) => ({
    ...e,
    startTime: e.startTime || e.start_at,
    endTime: e.endTime || e.end_at,
    type: e.type || e.event_type || 'other',
    createdBy: e.createdBy || e.created_by,
    createdAt: e.createdAt || e.created_at,
    updatedAt: e.updatedAt || e.updated_at,
  }));

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDate(null);
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDate(null);
  };

  const selectedDateEvents = selectedDate
    ? events.filter((e: any) => {
      const eventDate = e.startTime.split('T')[0] ?? '';
      return eventDate === selectedDate;
    })
    : [];

  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const handleCreateEvent = async () => {
    if (!newEvent.title || !selectedDate) return;

    try {
      const [year, month, day] = selectedDate.split('-');
      const startDateTime = new Date(`${selectedDate}T${newEvent.time}:00`).toISOString();
      const endDateTime = new Date(new Date(startDateTime).getTime() + 60 * 60 * 1000).toISOString();

      await createEventMutation.mutate({
        title: newEvent.title,
        description: newEvent.description,
        startTime: startDateTime,
        endTime: endDateTime,
        type: newEvent.type as any,
      } as any);

      toast.success('Event created');
      setCreateDialogOpen(false);
      setNewEvent({ title: '', type: 'meeting', time: '09:00', description: '' });
      await refetch();
    } catch {
      toast.error('Failed to create event');
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    try {
      await deleteEventMutation.mutate(eventId);
      toast.success('Event deleted');
      await refetch();
    } catch {
      toast.error('Failed to delete event');
    }
  };

  return (
    <div className="flex h-full gap-6 p-6">
      {/* Calendar */}
      <div className="flex-1 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Calendar</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" onClick={handlePrevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-medium min-w-[120px] text-center">{monthName}</div>
            <Button variant="ghost" size="icon-sm" onClick={handleNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-4 text-xs flex-wrap">
          {['meeting', 'call', 'task', 'other'].map((type: any) => (
            <div key={type} className="flex items-center gap-2">
              <div className={cn('w-3 h-3 rounded', {
                'bg-purple-500': type === 'meeting',
                'bg-amber-500': type === 'call',
                'bg-red-500': type === 'task',
                'bg-green-500': type === 'other',
              })} />
              <span className="capitalize">{getEventTypeLabel(type)}</span>
            </div>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center h-96">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

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
          <CalendarGrid year={year} month={month} onDateSelect={setSelectedDate} events={events} />
        )}
      </div>

      {/* Side Panel - Events for Selected Date */}
      <Sheet open={!!selectedDate} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <SheetContent className="w-96 flex flex-col">
          <SheetHeader>
            <SheetTitle>
              {selectedDate ? new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'Events'}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-auto space-y-3">
            {selectedDateEvents.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No events on this day</p>
              </div>
            ) : (
              selectedDateEvents.map((event: any) => (
                <Card key={event.id} className="cursor-pointer hover:shadow-sm transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={cn('text-xs', getEventBadgeColor(event.type))}>
                            {getEventTypeLabel(event.type)}
                          </Badge>
                        </div>
                        <h3 className="font-semibold text-sm truncate">{event.title}</h3>
                        {event.startTime && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <Clock className="h-3 w-3" />
                            {new Date(event.startTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                        {event.description && (
                          <p className="text-xs text-muted-foreground mt-2">{event.description}</p>
                        )}
                        {event.leadId && (
                          <p className="text-xs text-muted-foreground mt-2">
                            <span className="font-semibold">Lead:</span> {event.leadId}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDeleteEvent(event.id)}
                      >
                        <X className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {selectedDate && (
            <div className="border-t pt-4">
              <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Event
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Create Event</DialogTitle>
                    <DialogDescription>
                      {selectedDate && new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="title" className="text-sm">Event Title</Label>
                      <Input
                        id="title"
                        placeholder="Enter event title"
                        value={newEvent.title}
                        onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="type" className="text-sm">Event Type</Label>
                      <Select value={newEvent.type} onValueChange={(value) => setNewEvent({ ...newEvent, type: value })}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['meeting', 'call', 'task', 'other'].map((type: any) => (
                            <SelectItem key={type} value={type}>
                              {getEventTypeLabel(type)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="time" className="text-sm">Time (optional)</Label>
                      <Input
                        id="time"
                        type="time"
                        value={newEvent.time}
                        onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="description" className="text-sm">Description (optional)</Label>
                      <Input
                        id="description"
                        placeholder="Add event details"
                        value={newEvent.description}
                        onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                        className="mt-1"
                      />
                    </div>

                    <Button className="w-full" onClick={handleCreateEvent} disabled={createEventMutation.loading}>
                      {createEventMutation.loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Create Event
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
