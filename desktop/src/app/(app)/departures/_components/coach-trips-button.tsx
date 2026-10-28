'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Spinner, Tag } from '@/components/ui';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { apiErrorCode, departuresApi, type CoachTrip, type DepartureDetail } from '@/lib/api/departures';
import { departureErrorText } from '@/lib/departures';
import { useT } from '@/lib/i18n';

type TripLink = Partial<CoachTrip> & { id: string };

interface CoachTripsButtonProps {
  departure: DepartureDetail;
  canEdit: boolean;
}

/**
 * "Create coach trips" on the departure page: one coach trip per vehicle of the departure, with the stops and the passengers
 * copied (R145, POST /departures/:id/trips). Once trips exist the button lists them with a link to each, and "Rebuild" makes them
 * again (?replace=1), which the API refuses for a trip that already has boarding ticks. Needs the coach_trips feature.
 */
export function CoachTripsButton({ departure, canEdit }: CoachTripsButtonProps) {
  const gate = useFeatureGate('coach_trips');
  if (!gate.enabled || !canEdit || departure.status === 'cancelled') return null;
  return <CoachTripsButtonBody departure={departure} />;
}

function CoachTripsButtonBody({ departure }: { departure: DepartureDetail }) {
  const t = useT();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [trips, setTrips] = React.useState<TripLink[] | null>(null);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    departuresApi
      .trips(departure.id)
      .then((list) => !cancelled && setTrips(list))
      .catch(() => !cancelled && setTrips([]));
    return () => {
      cancelled = true;
    };
  }, [departure.id]);

  async function make(replace: boolean) {
    setBusy(true);
    try {
      const res = await departuresApi.createTrips(departure.id, replace);
      setTrips(res.trips);
      setOpen(true);
      toast.success(res.created ? t('departures.coachTrips.created', { count: res.trips.length }) : t('departures.coachTrips.alreadyThere'));
    } catch (err) {
      toast.error(apiErrorCode(err) === 'TRIP_HAS_TICKS' ? t('departures.coachTrips.hasTicks') : departureErrorText(err, t, 'departures.coachTrips.failed'));
    } finally {
      setBusy(false);
    }
  }

  async function rebuild() {
    const ok = await confirm({
      title: t('departures.coachTrips.rebuildTitle'),
      description: t('departures.coachTrips.rebuildDescription'),
      confirmLabel: t('departures.coachTrips.rebuild'),
      tone: 'destructive',
    });
    if (ok) await make(true);
  }

  if (trips === null) return null;

  return (
    <>
      {trips.length === 0 ? (
        <Button size="sm" variant="outline" onClick={() => void make(false)} disabled={busy} data-testid="create-coach-trips">
          {busy ? <Spinner className="size-4" /> : <Bus aria-hidden="true" />} {t('departures.coachTrips.create')}
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="open-coach-trips">
          <Bus aria-hidden="true" /> {t('departures.coachTrips.open', { count: trips.length })}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('departures.coachTrips.title')}</DialogTitle>
            <DialogDescription>{t('departures.coachTrips.description')}</DialogDescription>
          </DialogHeader>
          <ul className="space-y-ds-2" data-testid="coach-trip-list">
            {trips.map((trip, i) => (
              <li key={trip.id} className="flex items-center justify-between gap-ds-3 rounded-ds-md border border-ds-border p-ds-2 text-sm">
                <Link href={`/fleet/trips/${trip.id}`} className="font-medium text-ds-primary hover:underline" data-testid="coach-trip-link">
                  {trip.vehicleRegistration ?? t('departures.coachTrips.tripNumber', { n: i + 1 })}
                </Link>
                <span className="flex items-center gap-ds-2 text-ds-foreground-muted">
                  {trip.driverName && <span>{trip.driverName}</span>}
                  {trip.status && <Tag size="sm">{trip.status}</Tag>}
                </span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => void rebuild()} disabled={busy} data-testid="rebuild-coach-trips">
              {busy ? <Spinner className="size-4" /> : <RefreshCw aria-hidden="true" />} {t('departures.coachTrips.rebuild')}
            </Button>
            <Button onClick={() => setOpen(false)}>{t('departures.coachTrips.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  );
}
