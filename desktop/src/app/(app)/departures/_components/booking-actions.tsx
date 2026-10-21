'use client';

import * as React from 'react';
import { toast } from 'sonner';

import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Label, Spinner, Textarea,
} from '@/components/ui';
import { seatBookingsApi, type SeatBooking, type SeatBookingDetail } from '@/lib/api/departures';
import { departureErrorText } from '@/lib/departures';
import { useT } from '@/lib/i18n';
import { DepartureCombobox } from './relation-pickers';

interface UseBookingActionsOptions {
  /** The departure the bookings belong to: a move offers the departures of the same tour. */
  tourId: string;
  departureId: string;
  /** Called after any change, with the booking as the API returns it (a move returns the new booking). */
  onChanged: (booking?: SeatBookingDetail) => void;
}

/**
 * The actions on one seat booking, shared by the bookings table, the waitlist and the booking drawer: confirm, offer to a
 * waitlisted party, cancel (with a reason) and move to another departure. `dialogs` must be rendered once by the caller.
 */
export function useBookingActions({ tourId, departureId, onChanged }: UseBookingActionsOptions) {
  const t = useT();
  const [cancelFor, setCancelFor] = React.useState<SeatBooking | null>(null);
  const [moveFor, setMoveFor] = React.useState<SeatBooking | null>(null);
  const [reason, setReason] = React.useState('');
  const [target, setTarget] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const who = (b: SeatBooking) => b.contactName ?? b.leadTitle ?? b.id;

  async function run(action: () => Promise<SeatBookingDetail>, ok: (b: SeatBookingDetail) => string, failKey: string): Promise<boolean> {
    setBusy(true);
    try {
      const result = await action();
      toast.success(ok(result));
      onChanged(result);
      return true;
    } catch (err) {
      toast.error(departureErrorText(err, t, failKey));
      onChanged();
      return false;
    } finally {
      setBusy(false);
    }
  }

  const confirmBooking = (b: SeatBooking) =>
    run(() => seatBookingsApi.confirm(b.id), () => t('departures.booking.confirmedToast', { name: who(b) }), 'departures.booking.confirmFailed');

  const offer = (b: SeatBooking) =>
    run(() => seatBookingsApi.offer(b.id), () => t('departures.booking.offeredToast', { name: who(b) }), 'departures.booking.offerFailed');

  const askCancel = (b: SeatBooking) => {
    setReason('');
    setCancelFor(b);
  };
  const askMove = (b: SeatBooking) => {
    setTarget(null);
    setMoveFor(b);
  };

  const dialogs = (
    <>
      <Dialog open={cancelFor !== null} onOpenChange={(o) => !busy && !o && setCancelFor(null)}>
        <DialogContent className="sm:max-w-md" data-testid="cancel-booking-dialog">
          <DialogHeader>
            <DialogTitle>{t('departures.booking.cancelTitle')}</DialogTitle>
            <DialogDescription>
              {cancelFor ? t('departures.booking.cancelDescription', { name: who(cancelFor), seats: cancelFor.seats }) : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-ds-2">
            <Label htmlFor="booking-cancel-reason">{t('departures.booking.cancelReason')}</Label>
            <Textarea id="booking-cancel-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelFor(null)} disabled={busy}>
              {t('departures.booking.keep')}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              data-testid="cancel-booking-confirm"
              onClick={async () => {
                if (!cancelFor) return;
                const ok = await run(
                  () => seatBookingsApi.cancel(cancelFor.id, reason.trim() || undefined),
                  () => t('departures.booking.cancelledToast', { name: who(cancelFor) }),
                  'departures.booking.cancelFailed',
                );
                if (ok) setCancelFor(null);
              }}
            >
              {busy && <Spinner className="size-4" />}
              {t('departures.booking.cancelConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={moveFor !== null} onOpenChange={(o) => !busy && !o && setMoveFor(null)}>
        <DialogContent className="sm:max-w-md" data-testid="move-booking-dialog">
          <DialogHeader>
            <DialogTitle>{t('departures.booking.moveTitle')}</DialogTitle>
            <DialogDescription>
              {moveFor ? t('departures.booking.moveDescription', { name: who(moveFor), seats: moveFor.seats }) : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-ds-2">
            <Label>{t('departures.booking.moveTo')}</Label>
            <DepartureCombobox value={target} onChange={setTarget} excludeId={departureId} tourId={tourId} aria-label={t('departures.booking.moveTo')} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveFor(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={busy || !target}
              data-testid="move-booking-confirm"
              onClick={async () => {
                if (!moveFor || !target) return;
                const ok = await run(
                  () => seatBookingsApi.move(moveFor.id, target),
                  () => t('departures.booking.movedToast', { name: who(moveFor) }),
                  'departures.booking.moveFailed',
                );
                if (ok) setMoveFor(null);
              }}
            >
              {busy && <Spinner className="size-4" />}
              {t('departures.booking.moveConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return { confirmBooking, offer, askCancel, askMove, dialogs, busy };
}
