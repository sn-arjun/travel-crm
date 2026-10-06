'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApiQuery } from '@/hooks/use-api';
import { fleetApi, type Trip } from '@/lib/api/fleet';
import { toast } from 'sonner';
import { toLocalDateString } from '@/lib/dates';

interface DriverScheduleCalendarProps {
  driverId: string;
}

function toDateStr(d: Date) {
  return toLocalDateString(d);
}

export function DriverScheduleCalendar({ driverId }: DriverScheduleCalendarProps) {
  const [currentDate, setCurrentDate] = React.useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const { data: scheduleResponse, loading, error } = useApiQuery(
    () => fleetApi.drivers.getSingleSchedule(driverId, { from: toDateStr(firstDay), to: toDateStr(lastDay) }),
    [driverId, year, month],
  );

  React.useEffect(() => {
    if (error) toast.error('Failed to load driver schedule');
  }, [error]);

  const scheduleEntries: Trip[] = Array.isArray(scheduleResponse?.data) ? scheduleResponse.data : [];

  const getDayStatus = (day: number) => {
    const checkDate = new Date(year, month, day);
    const dateStr = toDateStr(checkDate);
    const today = toDateStr(new Date());

    if (dateStr < today) return 'past';

    const onTrip = scheduleEntries.some((entry) => {
      const start = entry.startTime;
      const end = entry.endTime;
      if (!start) return false;
      const tripStart = new Date(start);
      const tripEnd = new Date(end || start);
      tripStart.setHours(0, 0, 0, 0);
      tripEnd.setHours(23, 59, 59, 999);
      return checkDate >= tripStart && checkDate <= tripEnd;
    });

    return onTrip ? 'on_trip' : 'available';
  };

  const getDayColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-ds-success-subtle text-ds-on-subtle hover:bg-ds-success-subtle';
      case 'on_trip':
        return 'bg-ds-info-subtle text-ds-on-subtle hover:bg-ds-info-subtle';
      case 'past':
        return 'bg-ds-surface-sunken text-ds-foreground-subtle cursor-not-allowed';
      default:
        return 'bg-ds-surface';
    }
  };

  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const days: (number | null)[] = Array.from({ length: startingDayOfWeek }, () => null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Schedule Calendar</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={handlePrevMonth} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium min-w-36 text-center">{monthName}</div>
          <Button variant="ghost" size="icon-sm" onClick={handleNextMonth} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-ds-foreground-muted">
            <Loader2 className="h-4 w-4 animate-spin" /><span>Loading schedule...</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-ds-success-subtle border border-ds-border" />
                <span>Available</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-ds-info-subtle border border-ds-border" />
                <span>On Trip</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-ds-surface-sunken border border-ds-border" />
                <span>Past</span>
              </div>
            </div>

            <div className="border border-ds-border rounded-ds-md overflow-hidden">
              <div className="grid grid-cols-7 bg-ds-surface-sunken">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day} className="p-2 text-center text-sm font-semibold border-r border-b border-ds-border last:border-r-0">
                    {day}
                  </div>
                ))}
              </div>

              {weeks.map((week, weekIdx) => (
                <div key={weekIdx} className="grid grid-cols-7">
                  {week.map((day, dayIdx) => {
                    const status = day ? getDayStatus(day) : '';
                    const color = day ? getDayColor(status) : '';
                    return (
                      <div
                        key={dayIdx}
                        className={`aspect-square flex items-center justify-center border-r border-b border-ds-border text-sm font-medium cursor-default transition-colors last:border-r-0 ${
                          day ? color : 'bg-ds-surface-sunken'
                        }`}
                      >
                        {day}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
