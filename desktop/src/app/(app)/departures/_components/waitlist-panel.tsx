'use client';

import * as React from 'react';
import { Info } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui';
import type { DepartureDetail } from '@/lib/api/departures';
import { useT } from '@/lib/i18n';
import { BookingsPanel } from './bookings-panel';

interface WaitlistPanelProps {
  departure: DepartureDetail;
  refreshKey: number;
  canEdit: boolean;
  /** The agency's waitlist offer mode: with auto_hold the seats go to the next party by themselves. */
  offerMode: 'suggest' | 'auto_hold';
  onOpenBooking: (id: string) => void;
  onChanged: () => void;
  onHold: () => void;
}

/** The waitlist in waiting order, with Offer per party and a note when seats are free and somebody waits. */
export function WaitlistPanel({ departure, refreshKey, canEdit, offerMode, onOpenBooking, onChanged, onHold }: WaitlistPanelProps) {
  const t = useT();
  const { left, waitlisted } = departure.seats;
  return (
    <div className="space-y-ds-3">
      {left > 0 && waitlisted > 0 && (
        <Alert data-testid="waitlist-suggestion">
          <Info aria-hidden="true" />
          <AlertDescription>
            {offerMode === 'auto_hold' ? t('departures.waitlist.autoHold', { left }) : t('departures.waitlist.suggest', { left, waiting: waitlisted })}
          </AlertDescription>
        </Alert>
      )}
      <BookingsPanel
        waitlistOnly
        departure={departure}
        refreshKey={refreshKey}
        canEdit={canEdit}
        onOpenBooking={onOpenBooking}
        onChanged={onChanged}
        onHold={onHold}
      />
    </div>
  );
}
