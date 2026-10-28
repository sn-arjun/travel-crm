'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';

import {
  Alert, AlertDescription, Button, Checkbox, Input, Label, Sheet, SheetContent, SheetHeader, SheetTitle, Skeleton, Spinner, Tag,
} from '@/components/ui';
import {
  seatBookingsApi, type DepartureDetail, type PassengerFieldDef, type RoomTypeDef, type SeatBookingDetail,
} from '@/lib/api/departures';
import { apiErrorCode } from '@/lib/api/departures';
import { bookingStatusLabel, bookingStatusTone, departureErrorText } from '@/lib/departures';
import { formatDisplayDateTime } from '@/lib/dates';
import { useT } from '@/lib/i18n';
import { useAuthStore } from '@/stores/auth-store';
import { HoldCountdown } from './hold-countdown';
import { TravellerLinkDialog } from './traveller-link-dialog';
import { useBookingActions } from './booking-actions';
import { inputsFromRows, PassengersEditor, rowFromPassenger, type PassengerRow } from './passengers-editor';

const INVOICE_ROLES = ['admin', 'sales_manager', 'accountant'];

/** Error codes of POST /seat-bookings/:id/invoice and the sentence that explains each. */
const INVOICE_ERRORS: Record<string, string> = {
  INVOICE_LOCKED: 'departures.invoice.locked',
  NOTHING_TO_INVOICE: 'departures.invoice.nothing',
  BOOKING_NOT_INVOICEABLE: 'departures.invoice.notAllowed',
};

interface BookingDrawerProps {
  bookingId: string | null;
  departure: DepartureDetail;
  fields: readonly PassengerFieldDef[];
  roomTypes: readonly RoomTypeDef[];
  preferredSeat?: boolean;
  onClose: () => void;
  /** Something changed (a confirm, a cancel, new passengers): the departure's seats and the lists reload. */
  onChanged: () => void;
  canEdit: boolean;
}

/** One seat booking: who, status, hold countdown, the passengers (editable) and every action that applies to its status. */
export function BookingDrawer({ bookingId, departure, fields, roomTypes, preferredSeat, onClose, onChanged, canEdit }: BookingDrawerProps) {
  const t = useT();
  const [booking, setBooking] = React.useState<SeatBookingDetail | null>(null);
  const [rows, setRows] = React.useState<PassengerRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [createTravellers, setCreateTravellers] = React.useState(false);
  const [seatsDraft, setSeatsDraft] = React.useState(1);
  const [invoicing, setInvoicing] = React.useState(false);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const role = useAuthStore((s) => s.user?.role as string | undefined);
  // The invoice route is for these roles only (the same rule as the Invoices page).
  const canInvoice = role !== undefined && INVOICE_ROLES.includes(role);

  const apply = React.useCallback((b: SeatBookingDetail) => {
    setBooking(b);
    setRows(b.passengers.map(rowFromPassenger));
    setSeatsDraft(b.seats);
  }, []);

  const load = React.useCallback(async () => {
    if (!bookingId) return;
    setLoading(true);
    setError(null);
    try {
      apply(await seatBookingsApi.get(bookingId));
    } catch (err) {
      setError(departureErrorText(err, t, 'departures.booking.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [bookingId, apply, t]);

  React.useEffect(() => {
    setBooking(null);
    setRows([]);
    void load();
    // Reload when another booking is opened only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const actions = useBookingActions({
    tourId: departure.tourId,
    departureId: departure.id,
    onChanged: (b) => {
      onChanged();
      if (b && b.id === bookingId) apply(b);
      else if (b && b.id !== bookingId) onClose(); // a move leaves a new booking on the other departure
      else void load();
    },
  });

  async function savePassengers() {
    if (!booking) return;
    setSaving(true);
    try {
      apply(await seatBookingsApi.replacePassengers(booking.id, inputsFromRows(rows), createTravellers));
      toast.success(t('departures.booking.passengersSaved'));
      onChanged();
    } catch (err) {
      toast.error(departureErrorText(err, t, 'departures.booking.passengersFailed'));
    } finally {
      setSaving(false);
    }
  }

  /** Makes the invoice from the passengers' bands, room supplements and seat surcharge, or refreshes it while it is a draft. */
  async function createInvoice() {
    if (!booking) return;
    const existed = Boolean(booking.invoiceId);
    setInvoicing(true);
    try {
      const result = await seatBookingsApi.invoice(booking.id);
      apply(result.booking);
      toast.success(t(existed ? 'departures.invoice.updated' : 'departures.invoice.created', { number: result.invoiceNumber }));
      onChanged();
    } catch (err) {
      const known = INVOICE_ERRORS[apiErrorCode(err) ?? ''];
      toast.error(known ? t(known) : departureErrorText(err, t, 'departures.invoice.failed'));
    } finally {
      setInvoicing(false);
    }
  }

  async function saveSeats() {
    if (!booking) return;
    setSaving(true);
    try {
      apply(await seatBookingsApi.changeSeats(booking.id, seatsDraft));
      toast.success(t('departures.booking.seatsSaved'));
      onChanged();
    } catch (err) {
      toast.error(departureErrorText(err, t, 'departures.booking.seatsFailed'));
      setSeatsDraft(booking.seats);
    } finally {
      setSaving(false);
    }
  }

  const active = booking && (booking.status === 'held' || booking.status === 'confirmed' || booking.status === 'waitlisted');
  const editable = canEdit && Boolean(active);

  return (
    <Sheet open={bookingId !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl" data-testid="booking-drawer">
        <SheetHeader>
          <SheetTitle>{booking?.contactName ?? t('departures.booking.drawerTitle')}</SheetTitle>
        </SheetHeader>
        <div className="space-y-ds-4 px-ds-4 pb-ds-4">
          {loading && !booking && (
            <div className="space-y-ds-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {booking && (
            <>
              <div className="flex flex-wrap items-center gap-ds-2">
                <Tag tone={bookingStatusTone(booking.status)} size="lg" data-testid="booking-status">
                  {bookingStatusLabel(booking.status, t)}
                </Tag>
                <span className="text-sm tabular-nums">{t('departures.booking.seatsCount', { count: booking.seats })}</span>
                {booking.status === 'held' && <HoldCountdown expiresAt={booking.holdExpiresAt} />}
                {booking.status === 'waitlisted' && booking.waitlistPosition != null && (
                  <Tag tone="info">{t('departures.booking.waitlistPosition', { position: booking.waitlistPosition })}</Tag>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-ds-3 text-sm">
                <div>
                  <dt className="text-ds-foreground-muted">{t('departures.booking.lead')}</dt>
                  <dd>
                    <Link href={`/leads/${booking.leadId}`} className="text-ds-primary hover:underline">
                      {booking.leadTitle ?? booking.leadId}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt className="text-ds-foreground-muted">{t('departures.booking.contact')}</dt>
                  <dd>
                    <Link href={`/contacts/${booking.contactId}`} className="text-ds-primary hover:underline">
                      {booking.contactName ?? booking.contactId}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt className="text-ds-foreground-muted">{t('departures.booking.created')}</dt>
                  <dd>{formatDisplayDateTime(booking.createdAt)}</dd>
                </div>
                {booking.invoiceId && (
                  <div>
                    <dt className="text-ds-foreground-muted">{t('departures.invoice.title')}</dt>
                    <dd>
                      <Link href={`/invoices/${booking.invoiceId}`} className="text-ds-primary hover:underline" data-testid="drawer-invoice-link">
                        {t('departures.invoice.view')}
                      </Link>
                    </dd>
                  </div>
                )}
                {booking.confirmedAt && (
                  <div>
                    <dt className="text-ds-foreground-muted">{t('departures.booking.confirmedAt')}</dt>
                    <dd>{formatDisplayDateTime(booking.confirmedAt)}</dd>
                  </div>
                )}
                {booking.cancelReason && (
                  <div className="col-span-2">
                    <dt className="text-ds-foreground-muted">{t('departures.booking.cancelReasonLabel')}</dt>
                    <dd>{booking.cancelReason}</dd>
                  </div>
                )}
                {booking.notes && (
                  <div className="col-span-2">
                    <dt className="text-ds-foreground-muted">{t('departures.booking.notes')}</dt>
                    <dd>{booking.notes}</dd>
                  </div>
                )}
              </dl>

              {editable && (
                <div className="flex flex-wrap gap-ds-2">
                  {booking.status === 'held' && (
                    <Button size="sm" disabled={actions.busy} onClick={() => void actions.confirmBooking(booking)} data-testid="drawer-confirm">
                      {t('departures.booking.confirm')}
                    </Button>
                  )}
                  {booking.status === 'waitlisted' && (
                    <Button size="sm" disabled={actions.busy} onClick={() => void actions.offer(booking)} data-testid="drawer-offer">
                      {t('departures.booking.offer')}
                    </Button>
                  )}
                  {(booking.status === 'held' || booking.status === 'confirmed') && canInvoice && (
                    <Button size="sm" variant="outline" disabled={actions.busy || invoicing} onClick={() => void createInvoice()} data-testid="drawer-create-invoice">
                      {invoicing && <Spinner className="size-4" />}
                      {t(booking.invoiceId ? 'departures.invoice.update' : 'departures.invoice.create')}
                    </Button>
                  )}
                  {(booking.status === 'held' || booking.status === 'confirmed') && (
                    <Button size="sm" variant="outline" disabled={actions.busy} onClick={() => setLinkOpen(true)} data-testid="drawer-traveller-link">
                      {t('extras.link.button')}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" disabled={actions.busy} onClick={() => actions.askMove(booking)}>
                    {t('departures.booking.move')}
                  </Button>
                  <Button size="sm" variant="outline" disabled={actions.busy} onClick={() => actions.askCancel(booking)} data-testid="drawer-cancel">
                    {t('departures.booking.cancel')}
                  </Button>
                </div>
              )}

              {editable && booking.passengers.length === 0 && (
                <div className="flex items-end gap-ds-2">
                  <div className="space-y-ds-1">
                    <Label htmlFor="booking-seats">{t('departures.booking.changeSeats')}</Label>
                    <Input id="booking-seats" type="number" min={1} max={200} value={seatsDraft} className="w-28" onChange={(e) => setSeatsDraft(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
                  </div>
                  <Button size="sm" variant="outline" disabled={saving || seatsDraft === booking.seats} onClick={() => void saveSeats()}>
                    {saving && <Spinner className="size-4" />}
                    {t('departures.booking.saveSeats')}
                  </Button>
                </div>
              )}

              <section className="space-y-ds-2">
                <h3 className="text-sm font-semibold">{t('departures.booking.passengers')}</h3>
                <PassengersEditor
                  value={rows}
                  onChange={setRows}
                  fields={fields}
                  roomTypes={roomTypes}
                  stops={departure.stops}
                  travelDate={departure.startDate}
                  preferredSeat={preferredSeat}
                  disabled={!editable}
                />
                {editable && (
                  <>
                    <label className="flex items-center gap-ds-2 text-sm">
                      <Checkbox checked={createTravellers} onCheckedChange={(c) => setCreateTravellers(c === true)} />
                      {t('departures.hold.createTravellers')}
                    </label>
                    <Button size="sm" disabled={saving} onClick={() => void savePassengers()} data-testid="save-passengers">
                      {saving && <Spinner className="size-4" />}
                      {t('departures.booking.savePassengers')}
                    </Button>
                  </>
                )}
              </section>
            </>
          )}
        </div>
        {actions.dialogs}
        {booking && <TravellerLinkDialog booking={booking} open={linkOpen} onOpenChange={setLinkOpen} />}
      </SheetContent>
    </Sheet>
  );
}
