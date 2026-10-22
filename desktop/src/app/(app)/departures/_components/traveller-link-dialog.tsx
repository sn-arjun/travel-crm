'use client';

import * as React from 'react';
import { Check, Copy, Send } from 'lucide-react';
import { toast } from 'sonner';

import {
  Alert, AlertDescription, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, Label, Spinner,
} from '@/components/ui';
import { SendMessageDialog } from '@/components/communication/send-message-dialog';
import { contactsApi } from '@/lib/api/contacts';
import { seatBookingsApi, type SeatBookingDetail, type SelfServiceLink } from '@/lib/api/departures';
import { unwrapEntity } from '@/lib/api/envelope';
import { departureErrorText } from '@/lib/departures';
import { useT } from '@/lib/i18n';
import { SimpleSelect } from './simple-select';

interface TravellerLinkDialogProps {
  booking: SeatBookingDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const WHOLE = '__booking__';

interface MessageContact {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}

/**
 * The self-service link of a booking (R150): one address for the whole party, or one for a single traveller. The party opens it
 * to enter traveller details as on the travel document, pick extras per person and day, and pay. The link goes out through the
 * Communication Hub (the send dialog with a template that carries it), never by a mail or chat link of its own.
 */
export function TravellerLinkDialog({ booking, open, onOpenChange }: TravellerLinkDialogProps) {
  const t = useT();
  const [scope, setScope] = React.useState<string>(WHOLE);
  const [link, setLink] = React.useState<SelfServiceLink | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [sendTo, setSendTo] = React.useState<MessageContact | null>(null);

  React.useEffect(() => {
    if (open) {
      setScope(WHOLE);
      setLink(null);
      setError(null);
      setCopied(false);
    }
  }, [open, booking.id]);

  const people = booking.passengers.filter((p) => p.status !== 'cancelled');
  const options = [
    { value: WHOLE, label: t('extras.link.wholeBooking') },
    ...people.map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName}`.trim() || t('extras.dep.unnamed') })),
  ];

  async function makeLink(next: string) {
    setScope(next);
    setLink(null);
    setError(null);
    setBusy(true);
    try {
      setLink(await seatBookingsApi.selfServiceLink(booking.id, next === WHOLE ? 'booking' : 'passenger', next === WHOLE ? undefined : next));
    } catch (err) {
      setError(departureErrorText(err, t, 'extras.link.failed'));
    } finally {
      setBusy(false);
    }
  }

  React.useEffect(() => {
    if (open && !link && !busy && !error) void makeLink(WHOLE);
    // The first address is made when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.tripUrl);
      setCopied(true);
      toast.success(t('extras.link.copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the address stays selectable in its field.
    }
  }

  async function send() {
    try {
      const c = unwrapEntity<{ id: string; name?: string; email?: string | null; phone?: string | null }>(await contactsApi.getById(booking.contactId));
      setSendTo({ id: c.id, name: c.name ?? booking.contactName ?? '', email: c.email, phone: c.phone });
    } catch (err) {
      toast.error(departureErrorText(err, t, 'extras.link.contactFailed'));
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg" data-testid="traveller-link-dialog">
          <DialogHeader>
            <DialogTitle>{t('extras.link.title')}</DialogTitle>
            <DialogDescription>{t('extras.link.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-ds-3">
            {people.length > 1 && (
              <div className="space-y-ds-1">
                <Label>{t('extras.link.whose')}</Label>
                <SimpleSelect value={scope} onChange={(v) => void makeLink(v ?? WHOLE)} options={options} aria-label={t('extras.link.whose')} />
              </div>
            )}
            {busy && <Spinner className="size-5" />}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {link && (
              <div className="space-y-ds-2">
                <Label htmlFor="traveller-link-url">{t('extras.link.address')}</Label>
                <div className="flex gap-ds-2">
                  <Input id="traveller-link-url" readOnly dir="ltr" value={link.tripUrl} onFocus={(e) => e.currentTarget.select()} data-testid="traveller-link-url" />
                  <Button type="button" variant="outline" size="icon" aria-label={t('extras.link.copy')} onClick={() => void copy()} data-testid="traveller-link-copy">
                    {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  </Button>
                </div>
                <p className="text-xs text-ds-foreground-muted">{t('extras.link.hint')}</p>
                <Button type="button" onClick={() => void send()} data-testid="traveller-link-send">
                  <Send aria-hidden="true" />
                  {t('extras.link.send')}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {sendTo && link && (
        <SendMessageDialog
          open
          onOpenChange={(o) => !o && setSendTo(null)}
          contact={sendTo}
          leadId={booking.leadId}
          variables={{ details_link: link.detailsLink, extras_link: link.extrasLink }}
          onSent={() => toast.success(t('extras.link.sent'))}
        />
      )}
    </>
  );
}
