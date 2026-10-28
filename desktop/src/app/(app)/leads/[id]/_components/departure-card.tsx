'use client';

import * as React from 'react';
import Link from 'next/link';
import { Link2, Ticket, Unlink } from 'lucide-react';
import { toast } from 'sonner';

import { DepartureSeatsChip } from '@/components/domain/departure-seats';
import {
  Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, SectionCard, Skeleton, Spinner, Tag,
} from '@/components/ui';
import { useDepartureSeatsLive } from '@/hooks/use-departure-seats-live';
import { useGroupTours } from '@/hooks/use-group-tours';
import { usePermission } from '@/hooks/use-permission';
import { departuresApi, seatBookingsApi, type DepartureDetail, type SeatBooking } from '@/lib/api/departures';
import { formatDisplayDate } from '@/lib/dates';
import {
  acceptsSeatRequests, bookingStatusLabel, bookingStatusTone, departureErrorText, departureStatusLabel, departureStatusTone, holdCountdownText, seatsBreakdown,
} from '@/lib/departures';
import { useT } from '@/lib/i18n';
import { SeatsBar } from '@/app/(app)/departures/_components/seats-bar';
import { DepartureCombobox } from '@/app/(app)/departures/_components/relation-pickers';

interface DepartureCardProps {
  leadId: string;
  /** leads.departure_id: the departure the enquiry is about. */
  departureId: string | null;
  /** The first destination of the lead: the link picker offers departures that go there first. */
  destination?: string | null;
  /** The party size of the lead: the default number of seats to hold. */
  partySize?: number;
  /** The lead changed (a link, a hold): the page reloads it. */
  onChanged: () => void;
}

const ACTIVE: ReadonlyArray<SeatBooking['status']> = ['held', 'confirmed', 'waitlisted'];

/**
 * The Departure card of a lead: the departure it is about, the seats this lead holds or has confirmed, the seats left on the
 * departure now (live), the hold expiry, and the actions Hold seats / Confirm / Open departure. "Link a departure" points the
 * enquiry at an open departure without holding anything. Renders only when group departures are on for the plan and the agency.
 */
export function DepartureCard(props: DepartureCardProps) {
  const { enabled } = useGroupTours();
  if (!enabled) return null;
  return <DepartureCardBody {...props} />;
}

function DepartureCardBody({ leadId, departureId, destination, partySize = 1, onChanged }: DepartureCardProps) {
  const t = useT();
  const canEdit = usePermission('departures', 'edit');
  const canCreate = usePermission('departures', 'create');
  const [bookings, setBookings] = React.useState<SeatBooking[] | null>(null);
  const [departure, setDeparture] = React.useState<DepartureDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [holdOpen, setHoldOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const active = (bookings ?? []).filter((b) => ACTIVE.includes(b.status));
  // The departure the lead is linked to, else the one of its latest active booking.
  const shownId = departureId ?? active[0]?.departureId ?? null;
  const booking = active.find((b) => b.departureId === shownId) ?? null;

  const loadBookings = React.useCallback(async () => {
    try {
      setBookings(await departuresApi.leadBookings(leadId));
      setError(null);
    } catch (err) {
      setError(departureErrorText(err, t, 'departures.leadCard.loadFailed'));
    }
  }, [leadId, t]);

  React.useEffect(() => {
    void loadBookings();
    // Once per lead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  React.useEffect(() => {
    if (!shownId) {
      setDeparture(null);
      return;
    }
    let cancelled = false;
    departuresApi
      .get(shownId)
      .then((d) => !cancelled && setDeparture(d))
      .catch((err) => !cancelled && setError(departureErrorText(err, t, 'departures.leadCard.loadFailed')));
    return () => {
      cancelled = true;
    };
  }, [shownId, t]);

  // Somebody else took or freed seats: the seats left redraw at once and the lead's own bookings are read again.
  useDepartureSeatsLive((e) => {
    if (e.seats) setDeparture((d) => (d ? { ...d, seats: e.seats! } : d));
    void loadBookings();
  }, shownId);

  async function confirm() {
    if (!booking) return;
    setBusy(true);
    try {
      await seatBookingsApi.confirm(booking.id);
      toast.success(t('departures.leadCard.confirmed'));
      await loadBookings();
      onChanged();
    } catch (err) {
      toast.error(departureErrorText(err, t, 'departures.leadCard.confirmFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    try {
      await departuresApi.linkLead(leadId, null);
      toast.success(t('departures.leadCard.unlinked'));
      onChanged();
    } catch (err) {
      toast.error(departureErrorText(err, t, 'departures.leadCard.linkFailed'));
    } finally {
      setBusy(false);
    }
  }

  const holdText = booking?.status === 'held' ? holdCountdownText(booking.holdExpiresAt, new Date(), t) : null;
  const canHold = canCreate && !booking && departure && acceptsSeatRequests(departure.status);

  return (
    <SectionCard
      title={t('departures.leadCard.title')}
      actions={
        <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)} disabled={!canEdit || Boolean(booking)} data-testid="lead-link-departure">
          <Link2 aria-hidden="true" /> {shownId ? t('departures.leadCard.change') : t('departures.leadCard.link')}
        </Button>
      }
    >
      <div data-testid="lead-departure-card" className="space-y-ds-3">
        {error && <p className="text-sm text-ds-danger">{error}</p>}
        {bookings === null && !error && <Skeleton className="h-16 w-full" />}
        {bookings !== null && !shownId && <p className="text-sm text-ds-foreground-muted">{t('departures.leadCard.none')}</p>}
        {shownId && !departure && !error && <Skeleton className="h-16 w-full" />}

        {departure && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-ds-2">
              <div>
                <Link href={`/departures/${departure.id}`} className="font-mono text-sm font-medium text-ds-primary hover:underline">
                  {departure.code}
                </Link>
                <p className="text-sm text-ds-foreground-muted">
                  {[departure.tourTitle, formatDisplayDate(departure.startDate)].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex items-center gap-ds-2">
                <Tag tone={departureStatusTone(departure.status)}>{departureStatusLabel(departure.status, t)}</Tag>
                <DepartureSeatsChip seats={departure.seats} />
              </div>
            </div>

            <SeatsBar seats={departure.seats} variant="full" />
            <p className="text-sm" data-testid="lead-departure-seats-left" data-left={departure.seats.left}>
              {t('departures.leadCard.seatsLeft', { left: departure.seats.left, capacity: departure.seats.capacity })}
            </p>

            {booking ? (
              <div className="rounded-ds-md border border-ds-border bg-ds-surface-sunken p-ds-3 text-sm" data-testid="lead-booking" data-status={booking.status}>
                <div className="flex flex-wrap items-center gap-ds-2">
                  <Tag tone={bookingStatusTone(booking.status)}>{bookingStatusLabel(booking.status, t)}</Tag>
                  <span>{t('departures.leadCard.seatsForLead', { count: booking.seats })}</span>
                  {booking.status === 'waitlisted' && booking.waitlistPosition != null && (
                    <span className="text-ds-foreground-muted">{t('departures.leadCard.waitlistPosition', { position: booking.waitlistPosition })}</span>
                  )}
                  {holdText && <span className="text-ds-foreground-muted">{holdText}</span>}
                </div>
                <p className="mt-ds-1 text-xs text-ds-foreground-muted">{seatsBreakdown(departure.seats, t)}</p>
              </div>
            ) : (
              <p className="text-sm text-ds-foreground-muted">{t('departures.leadCard.noSeats')}</p>
            )}

            <div className="flex flex-wrap gap-ds-2">
              {canHold && (
                <Button size="sm" onClick={() => setHoldOpen(true)} data-testid="lead-hold-seats">
                  <Ticket aria-hidden="true" /> {t('departures.leadCard.holdSeats')}
                </Button>
              )}
              {booking?.status === 'held' && canEdit && (
                <Button size="sm" onClick={() => void confirm()} disabled={busy} data-testid="lead-confirm-seats">
                  {busy && <Spinner className="size-4" />} {t('departures.leadCard.confirm')}
                </Button>
              )}
              <Link href={`/departures/${departure.id}`}>
                <Button size="sm" variant="outline">{t('departures.leadCard.open')}</Button>
              </Link>
              {!booking && canEdit && departureId && (
                <Button size="sm" variant="ghost" onClick={() => void unlink()} disabled={busy}>
                  <Unlink aria-hidden="true" /> {t('departures.leadCard.unlink')}
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      <LinkDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        leadId={leadId}
        destination={destination ?? null}
        current={departureId}
        onLinked={() => {
          setLinkOpen(false);
          onChanged();
        }}
      />
      {departure && (
        <HoldDialog
          open={holdOpen}
          onOpenChange={setHoldOpen}
          leadId={leadId}
          departure={departure}
          defaultSeats={partySize}
          onHeld={() => {
            setHoldOpen(false);
            void loadBookings();
            onChanged();
          }}
        />
      )}
    </SectionCard>
  );
}

function LinkDialog({
  open, onOpenChange, leadId, destination, current, onLinked,
}: { open: boolean; onOpenChange: (o: boolean) => void; leadId: string; destination: string | null; current: string | null; onLinked: () => void }) {
  const t = useT();
  const [pick, setPick] = React.useState<string | null>(current);
  const [onlyDestination, setOnlyDestination] = React.useState(Boolean(destination));
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setPick(current);
      setOnlyDestination(Boolean(destination));
    }
  }, [open, current, destination]);

  async function save() {
    if (!pick) return;
    setSaving(true);
    try {
      await departuresApi.linkLead(leadId, pick);
      toast.success(t('departures.leadCard.linked'));
      onLinked();
    } catch (err) {
      toast.error(departureErrorText(err, t, 'departures.leadCard.linkFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('departures.leadCard.linkTitle')}</DialogTitle>
          <DialogDescription>{t('departures.leadCard.linkDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-ds-3">
          {/* Re-keyed so the list is fetched again when the destination filter changes. */}
          <DepartureCombobox
            key={onlyDestination ? 'destination' : 'all'}
            value={pick}
            onChange={setPick}
            destination={onlyDestination && destination ? destination : undefined}
            aria-label={t('departures.leadCard.linkTitle')}
          />
          {destination && (
            <label className="flex items-center gap-ds-2 text-sm">
              <Checkbox checked={onlyDestination} onCheckedChange={(c) => setOnlyDestination(c === true)} />
              {t('departures.leadCard.onlyDestination', { destination })}
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('departures.leadCard.cancel')}</Button>
          <Button onClick={() => void save()} disabled={!pick || saving} data-testid="lead-link-save">
            {saving && <Spinner className="size-4" />} {t('departures.leadCard.linkSave')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HoldDialog({
  open, onOpenChange, leadId, departure, defaultSeats, onHeld,
}: { open: boolean; onOpenChange: (o: boolean) => void; leadId: string; departure: DepartureDetail; defaultSeats: number; onHeld: () => void }) {
  const t = useT();
  const [seats, setSeats] = React.useState(defaultSeats);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) setSeats(Math.max(1, defaultSeats));
  }, [open, defaultSeats]);

  async function hold() {
    setSaving(true);
    try {
      const b = await departuresApi.holdForLead(leadId, departure.id, seats);
      toast.success(b.status === 'waitlisted' ? t('departures.leadCard.waitlisted') : t('departures.leadCard.held'));
      onHeld();
    } catch (err) {
      toast.error(departureErrorText(err, t, 'departures.leadCard.holdFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('departures.leadCard.holdTitle', { code: departure.code })}</DialogTitle>
          <DialogDescription>{t('departures.leadCard.holdDescription', { left: departure.seats.left })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-ds-1">
          <Label htmlFor="lead-hold-count">{t('departures.leadCard.seatsLabel')}</Label>
          <Input
            id="lead-hold-count"
            type="number"
            min={1}
            max={200}
            value={seats}
            onChange={(e) => setSeats(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('departures.leadCard.cancel')}</Button>
          <Button onClick={() => void hold()} disabled={saving} data-testid="lead-hold-confirm">
            {saving && <Spinner className="size-4" />} {t('departures.leadCard.holdSeats')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
