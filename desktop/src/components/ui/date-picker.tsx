'use client';

import * as React from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/* ─── Tiny inline calendar (no dependency) ─── */

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

interface MiniCalendarProps {
  selected?: Date;
  onSelect: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
}

function MiniCalendar({ selected, onSelect, minDate, maxDate }: MiniCalendarProps) {
  const [viewYear, setViewYear] = React.useState(selected?.getFullYear() ?? new Date().getFullYear());
  const [viewMonth, setViewMonth] = React.useState(selected?.getMonth() ?? new Date().getMonth());

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);
  const today = new Date();

  function prev() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }
  function next() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  function isDisabled(day: number) {
    const d = new Date(viewYear, viewMonth, day);
    if (minDate && d < minDate) return true;
    if (maxDate && d > maxDate) return true;
    return false;
  }

  return (
    <div className="p-3 w-70">
      <div className="flex items-center justify-between mb-3">
        <Button variant="ghost" size="icon-sm" onClick={prev}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="text-sm font-semibold">{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <Button variant="ghost" size="icon-sm" onClick={next}><ChevronRight className="h-4 w-4" /></Button>
      </div>
      <div className="grid grid-cols-7 gap-0">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-[0.6875rem] font-medium text-muted-foreground py-1">{d}</div>
        ))}
        {Array.from({ length: firstDay }, (_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const date = new Date(viewYear, viewMonth, day);
          const isSelected = selected && isSameDay(date, selected);
          const isToday = isSameDay(date, today);
          const disabled = isDisabled(day);
          return (
            <button
              key={day}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(date)}
              className={cn(
                'h-8 w-8 mx-auto rounded-md text-sm transition-colors',
                isSelected ? 'bg-primary text-primary-foreground font-semibold' :
                isToday ? 'bg-accent text-accent-foreground font-medium' :
                'hover:bg-muted',
                disabled && 'opacity-30 cursor-not-allowed hover:bg-transparent'
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── DatePicker ─── */
export interface DatePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
  disabled?: boolean;
}

export function DatePicker({ value, onChange, placeholder = 'Pick a date', minDate, maxDate, className, disabled }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn('w-full justify-start text-left font-normal h-9', !value && 'text-muted-foreground', className)}
        >
          <Calendar className="mr-2 h-4 w-4" />
          {value ? value.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <MiniCalendar
          selected={value}
          onSelect={(d) => { onChange(d); setOpen(false); }}
          minDate={minDate}
          maxDate={maxDate}
        />
      </PopoverContent>
    </Popover>
  );
}

/* ─── DateTimePicker ─── */
export interface DateTimePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  minDate?: Date;
  className?: string;
  disabled?: boolean;
}

export function DateTimePicker({ value, onChange, placeholder = 'Pick date & time', minDate, className, disabled }: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [hours, setHours] = React.useState(value ? value.getHours() : 10);
  const [minutes, setMinutes] = React.useState(value ? value.getMinutes() : 0);

  function handleDateSelect(date: Date) {
    const d = new Date(date);
    d.setHours(hours, minutes, 0, 0);
    onChange(d);
  }

  function handleTimeChange(h: number, m: number) {
    setHours(h);
    setMinutes(m);
    if (value) {
      const d = new Date(value);
      d.setHours(h, m, 0, 0);
      onChange(d);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn('w-full justify-start text-left font-normal h-9', !value && 'text-muted-foreground', className)}
        >
          <Calendar className="mr-2 h-4 w-4" />
          {value
            ? `${value.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} ${value.getHours().toString().padStart(2, '0')}:${value.getMinutes().toString().padStart(2, '0')}`
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <MiniCalendar
          selected={value}
          onSelect={handleDateSelect}
          minDate={minDate}
        />
        <div className="border-t px-3 py-2 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <select
            value={hours}
            onChange={(e) => handleTimeChange(Number(e.target.value), minutes)}
            className="h-8 rounded-md border bg-background px-2 text-sm"
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
            ))}
          </select>
          <span className="text-sm font-medium">:</span>
          <select
            value={minutes}
            onChange={(e) => handleTimeChange(hours, Number(e.target.value))}
            className="h-8 rounded-md border bg-background px-2 text-sm"
          >
            {[0, 15, 30, 45].map((m) => (
              <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>
            ))}
          </select>
          <Button size="sm" className="ml-auto h-7 text-xs" onClick={() => setOpen(false)}>Done</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ─── DateRangePicker ─── */
export interface DateRangePickerProps {
  startDate?: Date;
  endDate?: Date;
  onStartChange: (date: Date | undefined) => void;
  onEndChange: (date: Date | undefined) => void;
  placeholder?: string;
  className?: string;
}

export function DateRangePicker({ startDate, endDate, onStartChange, onEndChange, placeholder = 'Select date range', className }: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [selecting, setSelecting] = React.useState<'start' | 'end'>('start');

  function handleSelect(date: Date) {
    if (selecting === 'start') {
      onStartChange(date);
      onEndChange(undefined);
      setSelecting('end');
    } else {
      if (startDate && date < startDate) {
        onStartChange(date);
        onEndChange(undefined);
        setSelecting('end');
      } else {
        onEndChange(date);
        setSelecting('start');
        setOpen(false);
      }
    }
  }

  const displayText = startDate && endDate
    ? `${startDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${endDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : startDate
    ? `${startDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ...`
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('w-full justify-start text-left font-normal h-9', !startDate && 'text-muted-foreground', className)}>
          <Calendar className="mr-2 h-4 w-4" />
          {displayText}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-2 text-xs text-center text-muted-foreground border-b">
          {selecting === 'start' ? 'Select start date' : 'Select end date'}
        </div>
        <MiniCalendar selected={selecting === 'start' ? startDate : endDate} onSelect={handleSelect} />
      </PopoverContent>
    </Popover>
  );
}
