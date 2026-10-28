'use client';

import * as React from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

import { Alert, AlertDescription, Button, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Skeleton, Tag } from '@/components/ui';
import { SeatsBar } from '@/app/(app)/departures/_components/seats-bar';
import { useDepartureSeatsLive } from '@/hooks/use-departure-seats-live';
import { departuresApi, type DepartureDetail, type SeatsSummary } from '@/lib/api/departures';
import { formatDisplayDate } from '@/lib/dates';
import { departureErrorText, departureStatusLabel, departureStatusTone, seatsChipText, seatsTone } from '@/lib/departures';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface DepartureSeatsChipProps {
  seats: SeatsSummary;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * "12 left" / "Full" / "Waitlist 3": the seats of a departure in one small chip, for the calendar, the lead and the quote.
 * The counts are on the element (data-left, data-waitlisted) for tests and scripts.
 */
export function DepartureSeatsChip({ seats, className, onClick }: DepartureSeatsChipProps) {
  const t = useT();
  const text = seatsChipText(seats, t);
  return (
    <Tag
      tone={seatsTone(seats)}
      size="sm"
      className={cn('shrink-0 tabular-nums', onClick && 'cursor-pointer', className)}
      data-testid="departure-seats-chip"
      data-left={seats.left}
      data-waitlisted={seats.waitlisted}
      title={t('departures.chip.title', { left: seats.left, capacity: seats.capacity })}
      onClick={onClick}
    >
      {text}
    </Tag>
  );
}

interface DepartureQuickDrawerProps {
  departureId: string | null;
  onClose: () => void;
}

/** A departure at a glance from another screen (the calendar): status, dates, seats now, and the link to its page. */
export function DepartureQuickDrawer({ departureId, onClose }: DepartureQuickDrawerProps) {
  const t = useT();
  const [departure, setDeparture] = React.useState<DepartureDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!departureId) return;
    try {
      setDeparture(await departuresApi.get(departureId));
      setError(null);
    } catch (err) {
      setError(departureErrorText(err, t, 'departures.calendar.loadFailed'));
    }
  }, [departureId, t]);

  React.useEffect(() => {
    setDeparture(null);
    setError(null);
    void load();
    // Load again when another departure is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departureId]);

  useDepartureSeatsLive((e) => {
    if (e.seats) setDeparture((d) => (d ? { ...d, seats: e.seats! } : d));
  }, departureId);

  const dates = departure
    ? departure.endDate !== departure.startDate
      ? `${formatDisplayDate(departure.startDate)} - ${formatDisplayDate(departure.endDate)}`
      : formatDisplayDate(departure.startDate)
    : '';

  return (
    <Sheet open={!!departureId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-96 flex-col gap-ds-4" data-testid="departure-drawer">
        <SheetHeader>
          <SheetTitle>{departure?.code ?? t('departures.calendar.drawerTitle')}</SheetTitle>
          <SheetDescription>{departure ? [departure.tourTitle, dates].filter(Boolean).join(' · ') : t('departures.calendar.drawerTitle')}</SheetDescription>
        </SheetHeader>
        <div className="space-y-ds-4 px-ds-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {!departure && !error && <Skeleton className="h-24 w-full" />}
          {departure && (
            <>
              <Tag tone={departureStatusTone(departure.status)}>{departureStatusLabel(departure.status, t)}</Tag>
              <SeatsBar seats={departure.seats} variant="full" />
              <Link href={`/departures/${departure.id}`} onClick={onClose}>
                <Button className="w-full" data-testid="departure-drawer-open">
                  <ExternalLink aria-hidden="true" /> {t('departures.calendar.openDeparture')}
                </Button>
              </Link>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
