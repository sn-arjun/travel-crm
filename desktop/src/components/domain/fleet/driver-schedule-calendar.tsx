'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { mockTrips } from '@/lib/fleet-mock-data';

const REF_DATE = Date.now();

interface DriverScheduleCalendarProps {
  driverId: string;
}

export function DriverScheduleCalendar({ driverId }: DriverScheduleCalendarProps) {
  const [currentDate, setCurrentDate] = React.useState(new Date(REF_DATE));

  const driverTrips = mockTrips.filter((t: any) => t.driverId === driverId);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const getDayStatus = (day: number) => {
    const checkDate = new Date(year, month, day);
    const dateStr = checkDate.toISOString().split('T')[0] ?? '';

    const refDateObj = new Date(REF_DATE);
    const refDateStr = refDateObj.toISOString().split('T')[0] ?? '';

    // Past dates
    if (dateStr < refDateStr) {
      return 'past';
    }

    // Check if driver is on a trip
    const tripOnDate = driverTrips.some((t) => {
      const tripStart = new Date(t.startDate);
      const tripEnd = new Date(t.endDate);
      tripStart.setHours(0, 0, 0, 0);
      tripEnd.setHours(23, 59, 59, 999);
      return checkDate >= tripStart && checkDate <= tripEnd;
    });

    return tripOnDate ? 'on_trip' : 'available';
  };

  const getDayColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 text-green-900 hover:bg-green-200';
      case 'on_trip':
        return 'bg-blue-100 text-blue-900 hover:bg-blue-200';
      case 'past':
        return 'bg-gray-100 text-gray-500 hover:bg-gray-100 cursor-not-allowed';
      default:
        return 'bg-white';
    }
  };

  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Schedule Calendar</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium min-w-[150px] text-center">{monthName}</div>
          <Button variant="ghost" size="icon-sm" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Legend */}
          <div className="flex gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-green-100 border border-green-300" />
              <span>Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-blue-100 border border-blue-300" />
              <span>On Trip</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-gray-100 border border-gray-300" />
              <span>Past</span>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="border rounded-lg overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 bg-muted">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day: any) => (
                <div key={day} className="p-2 text-center text-sm font-semibold border-r border-b last:border-r-0">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar days */}
            {weeks.map((week, weekIdx) => (
              <div key={weekIdx} className="grid grid-cols-7">
                {week.map((day, dayIdx) => {
                  const status = day ? getDayStatus(day) : '';
                  const color = day ? getDayColor(status) : '';

                  return (
                    <div
                      key={dayIdx}
                      className={`aspect-square flex items-center justify-center border-r border-b text-sm font-medium cursor-default transition-colors last:border-r-0 ${
                        day ? color : 'bg-gray-50'
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
      </CardContent>
    </Card>
  );
}
