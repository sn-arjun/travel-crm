'use client';

import * as React from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { toast } from 'sonner';

import {
  Alert, AlertDescription, Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  Input, Label, PhoneInput, Spinner, Textarea,
} from '@/components/ui';
import {
  departuresApi, apiErrorCode, type DepartureDetail, type PassengerFieldDef, type RoomTypeDef, type SeatBookingDetail,
} from '@/lib/api/departures';
import { acceptsSeatRequests, departureErrorText } from '@/lib/departures';
import { defaultCountryCode, joinPhone } from '@/lib/phone';
import { useT } from '@/lib/i18n';
import { ContactCombobox, LeadCombobox } from './relation-pickers';
import { emptyPassenger, inputsFromRows, PassengersEditor, type PassengerRow } from './passengers-editor';
import { SimpleSelect } from './simple-select';
import { SeatsBar } from './seats-bar';

type Who = 'lead' | 'contact' | 'new';

interface HoldSeatsDialogProps {
  departure: DepartureDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The booking as the API returns it: held, waitlisted or (confirm mode auto) confirmed. */
  onHeld: (booking: SeatBookingDetail) => void;
  /** Reload the departure so the seats shown are current (called when the dialog opens and after a refusal). */
  onRefresh: () => void;
  fields: readonly PassengerFieldDef[];
  roomTypes: readonly RoomTypeDef[];
  waitlistEnabled: boolean;
  preferredSeat?: boolean;
  /** Pre-select a lead (opened from a lead page). */
  initialLeadId?: string | null;
}

export function HoldSeatsDialog({
  departure, open, onOpenChange, onHeld, onRefresh, fields, roomTypes, waitlistEnabled, preferredSeat, initialLeadId = null,
}: HoldSeatsDialogProps) {
  const t = useT();
  const [who, setWho] = React.useState<Who>('lead');
  const [leadId, setLeadId] = React.useState<string | null>(initialLeadId);
  const [contactId, setContactId] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [countryCode, setCountryCode] = React.useState<string>(() => defaultCountryCode());
  const [email, setEmail] = React.useState('');
  const [seats, setSeats] = React.useState(1);
  const [notes, setNotes] = React.useState('');
  const [withPassengers, setWithPassengers] = React.useState(false);
  const [passengers, setPassengers] = React.useState<PassengerRow[]>([]);
  const [createTravellers, setCreateTravellers] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Fresh form (and fresh seat numbers) each time the dialog opens.
  React.useEffect(() => {
    if (!open) return;
    setWho('lead');
    setLeadId(initialLeadId);
    setContactId(null);
    setName('');
    setPhone('');
    setEmail('');
    setSeats(1);
    setNotes('');
    setWithPassengers(false);
    setPassengers([]);
    setCreateTravellers(false);
    setError(null);
    onRefresh();
    // onRefresh is the parent's stable reload; only the opening matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const wanted = withPassengers && passengers.length > 0 ? passengers.length : seats;
  const left = departure.seats.left;
  const accepts = acceptsSeatRequests(departure.status);
  const overflow = wanted > left;
  const whoReady = who === 'lead' ? Boolean(leadId) : who === 'contact' ? Boolean(contactId) : name.trim().length > 0 && phone.trim().length > 0;
  const canSubmit = accepts && whoReady && wanted >= 1 && (!overflow || waitlistEnabled) && !busy;
  const pickups = departure.stops;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const people = withPassengers && passengers.length > 0 ? inputsFromRows(passengers) : undefined;
      const booking = await departuresApi.holdSeats(departure.id, {
        ...(who === 'lead' ? { leadId: leadId as string } : {}),
        ...(who === 'contact' ? { contact: { contactId: contactId as string } } : {}),
        ...(who === 'new' ? { contact: { name: name.trim(), phone: joinPhone(countryCode, phone), ...(email.trim() ? { email: email.trim() } : {}) } } : {}),
        ...(people ? { passengers: people, ...(createTravellers ? { createTravellers: true } : {}) } : { seats }),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      if (booking.status === 'waitlisted') {
        toast.info(t('departures.hold.waitlistedToast', { position: booking.waitlistPosition ?? 1 }));
      } else if (booking.status === 'confirmed') {
        toast.success(t('departures.hold.confirmedToast', { seats: booking.seats }));
      } else {
        toast.success(t('departures.hold.heldToast', { seats: booking.seats }));
      }
      onHeld(booking);
      onOpenChange(false);
    } catch (err) {
      // A full departure (409 SEATS_UNAVAILABLE) is a message in the dialog with the current seats, never a crash.
      setError(departureErrorText(err, t, 'departures.hold.failed'));
      if (apiErrorCode(err) === 'SEATS_UNAVAILABLE' || apiErrorCode(err) === 'DEPARTURE_NOT_OPEN') onRefresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl" data-testid="hold-seats-dialog">
        <DialogHeader>
          <DialogTitle>{t('departures.hold.title', { code: departure.code })}</DialogTitle>
          <DialogDescription>{t('departures.hold.description')}</DialogDescription>
        </DialogHeader>

        <div className="rounded-ds-md border border-ds-border bg-ds-surface-sunken p-ds-3">
          <SeatsBar seats={departure.seats} variant="full" />
        </div>

        {!accepts && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{t('departures.hold.notOpen')}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-ds-4">
          <div className="space-y-ds-1">
            <Label htmlFor="hold-who">{t('departures.hold.who')}</Label>
            <SimpleSelect
              id="hold-who"
              value={who}
              onChange={(v) => setWho((v as Who) ?? 'lead')}
              options={[
                { value: 'lead', label: t('departures.hold.whoLead') },
                { value: 'contact', label: t('departures.hold.whoContact') },
                { value: 'new', label: t('departures.hold.whoNew') },
              ]}
            />
          </div>

          {who === 'lead' && (
            <div className="space-y-ds-1">
              <Label>{t('departures.hold.lead')}</Label>
              <LeadCombobox value={leadId} onChange={setLeadId} aria-label={t('departures.hold.lead')} required />
            </div>
          )}
          {who === 'contact' && (
            <div className="space-y-ds-1">
              <Label>{t('departures.hold.contact')}</Label>
              <ContactCombobox value={contactId} onChange={setContactId} aria-label={t('departures.hold.contact')} required />
              <p className="text-xs text-ds-foreground-muted">{t('departures.hold.contactHint')}</p>
            </div>
          )}
          {who === 'new' && (
            <div className="grid gap-ds-3 sm:grid-cols-2">
              <div className="space-y-ds-1">
                <Label htmlFor="hold-name">{t('departures.hold.name')}</Label>
                <Input id="hold-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-ds-1">
                <Label>{t('departures.hold.phone')}</Label>
                <PhoneInput value={phone} onChange={setPhone} countryCode={countryCode} onCountryCodeChange={(code) => setCountryCode(code)} />
              </div>
              <div className="space-y-ds-1 sm:col-span-2">
                <Label htmlFor="hold-email">{t('departures.hold.email')}</Label>
                <Input id="hold-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
          )}

          <div className="grid gap-ds-3 sm:grid-cols-2">
            <div className="space-y-ds-1">
              <Label htmlFor="hold-seats">{t('departures.hold.seats')}</Label>
              <Input
                id="hold-seats"
                type="number"
                min={1}
                max={200}
                value={wanted}
                disabled={withPassengers && passengers.length > 0}
                onChange={(e) => setSeats(Math.max(1, Math.min(200, Math.floor(Number(e.target.value) || 1))))}
              />
              {withPassengers && passengers.length > 0 && <p className="text-xs text-ds-foreground-muted">{t('departures.hold.seatsFromPassengers')}</p>}
            </div>
            <div className="space-y-ds-1">
              <Label htmlFor="hold-notes">{t('departures.hold.notes')}</Label>
              <Textarea id="hold-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          {accepts && overflow && (
            <Alert data-testid="hold-waitlist-note">
              <Info aria-hidden="true" />
              <AlertDescription>
                {waitlistEnabled
                  ? t('departures.hold.willWaitlist', { wanted, left })
                  : t('departures.hold.noWaitlist', { wanted, left })}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-ds-2">
            <label className="flex items-center gap-ds-2 text-sm">
              <Checkbox
                checked={withPassengers}
                onCheckedChange={(c) => {
                  const on = c === true;
                  setWithPassengers(on);
                  if (on && passengers.length === 0) setPassengers(Array.from({ length: seats }, () => emptyPassenger()));
                }}
              />
              {t('departures.hold.addPassengers')}
            </label>
            {withPassengers && (
              <>
                <PassengersEditor
                  value={passengers}
                  onChange={setPassengers}
                  fields={fields}
                  roomTypes={roomTypes}
                  stops={pickups}
                  travelDate={departure.startDate}
                  preferredSeat={preferredSeat}
                />
                <label className="flex items-center gap-ds-2 text-sm">
                  <Checkbox checked={createTravellers} onCheckedChange={(c) => setCreateTravellers(c === true)} />
                  {t('departures.hold.createTravellers')}
                </label>
              </>
            )}
          </div>

          {error && (
            <Alert variant="destructive" data-testid="hold-error">
              <AlertCircle aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit} data-testid="hold-submit">
            {busy && <Spinner className="size-4" />}
            {overflow && waitlistEnabled ? t('departures.hold.submitWaitlist') : t('departures.hold.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
