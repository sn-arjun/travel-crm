'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, Link2, Unlink } from 'lucide-react';
import { toast } from 'sonner';

import { DepartureSeatsChip } from '@/components/domain/departure-seats';
import {
  Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, SectionCard, Spinner, Tag,
} from '@/components/ui';
import { useDepartureSeatsLive } from '@/hooks/use-departure-seats-live';
import { useGroupTours } from '@/hooks/use-group-tours';
import { usePermission } from '@/hooks/use-permission';
import { departuresApi, type DepartureSummary, type QuoteSeats, type SeatsSummary } from '@/lib/api/departures';
import { formatDisplayDate } from '@/lib/dates';
import { departureErrorText, departureStatusLabel, departureStatusTone } from '@/lib/departures';
import { useT } from '@/lib/i18n';
import { DepartureCombobox } from '@/app/(app)/departures/_components/relation-pickers';

interface DeparturePanelProps {
  itineraryId: string;
  /** From GET /itineraries/:id: the linked departure with its seats, or null. */
  departure: DepartureSummary | null | undefined;
  /** From the same call: the seats this quote asks for and whether they fit. */
  seats: QuoteSeats | null | undefined;
  /** First destination of the lead, to offer departures that go there first. */
  destination?: string | null;
  /** The quote changed: the page reads it again. */
  onChanged: () => void;
}

/**
 * The departure a quote is for: its dates, the seats this quote asks for and the seats left (live), with a warning when the party
 * does not fit. "Link departure" sets departure_id and seats_requested on the quote. Renders only when group departures are on
 * for the plan and the agency, so an agency that sells custom trips never sees it.
 */
export function DeparturePanel(props: DeparturePanelProps) {
  const { enabled } = useGroupTours();
  if (!enabled) return null;
  return <DeparturePanelBody {...props} />;
}

function DeparturePanelBody({ itineraryId, departure, seats, destination, onChanged }: DeparturePanelProps) {
  const t = useT();
  const canEdit = usePermission('itineraries', 'edit');
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [live, setLive] = React.useState<SeatsSummary | null>(null);

  // The seats left come from the page's read, then follow the realtime channel.
  React.useEffect(() => setLive(null), [departure?.id, departure?.seats.left]);
  useDepartureSeatsLive((e) => {
    if (e.seats) setLive(e.seats);
  }, departure?.id ?? '__none__');

  const current = live ?? departure?.seats ?? null;
  const requested = seats?.requested ?? null;
  const fits = requested === null || !current || requested <= current.left;

  async function unlink() {
    setBusy(true);
    try {
      await departuresApi.linkQuote(itineraryId, null);
      toast.success(t('departures.quotePanel.unlinked'));
      onChanged();
    } catch (err) {
      toast.error(departureErrorText(err, t, 'departures.quotePanel.linkFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title={t('departures.quotePanel.title')}
      actions={
        <div className="flex gap-ds-2">
          {departure && canEdit && (
            <Button size="sm" variant="ghost" onClick={() => void unlink()} disabled={busy}>
              <Unlink aria-hidden="true" /> {t('departures.quotePanel.unlink')}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={!canEdit} data-testid="quote-link-departure">
            <Link2 aria-hidden="true" /> {departure ? t('departures.quotePanel.change') : t('departures.quotePanel.link')}
          </Button>
        </div>
      }
    >
      <div data-testid="quote-departure-panel" className="space-y-ds-2">
        {!departure && <p className="text-sm text-ds-foreground-muted">{t('departures.quotePanel.none')}</p>}
        {departure && current && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-ds-2">
              <div>
                <Link href={`/departures/${departure.id}`} className="font-mono text-sm font-medium text-ds-primary hover:underline">
                  {departure.code}
                </Link>
                <p className="text-sm text-ds-foreground-muted">{[departure.tourTitle, formatDisplayDate(departure.startDate)].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="flex items-center gap-ds-2">
                <Tag tone={departureStatusTone(departure.status)}>{departureStatusLabel(departure.status, t)}</Tag>
                <DepartureSeatsChip seats={current} />
              </div>
            </div>
            <p className="text-sm" data-testid="quote-seats-text" data-left={current.left} data-requested={requested ?? ''}>
              {requested !== null
                ? t('departures.quotePanel.requestedOfLeft', { requested, left: current.left })
                : t('departures.quotePanel.left', { left: current.left, capacity: current.capacity })}
            </p>
            {!fits && (
              <p className="flex items-center gap-ds-1 text-sm text-ds-warning-on-subtle" role="alert">
                <AlertTriangle className="size-4" aria-hidden="true" /> {t('departures.quotePanel.doesNotFit', { requested: requested ?? 0, left: current.left })}
              </p>
            )}
          </>
        )}
      </div>

      <LinkDialog
        open={open}
        onOpenChange={setOpen}
        itineraryId={itineraryId}
        current={departure?.id ?? null}
        requested={requested}
        destination={destination ?? null}
        onLinked={() => {
          setOpen(false);
          onChanged();
        }}
      />
    </SectionCard>
  );
}

function LinkDialog({
  open, onOpenChange, itineraryId, current, requested, destination, onLinked,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  itineraryId: string;
  current: string | null;
  requested: number | null;
  destination: string | null;
  onLinked: () => void;
}) {
  const t = useT();
  const [pick, setPick] = React.useState<string | null>(current);
  const [count, setCount] = React.useState<string>(requested ? String(requested) : '');
  const [onlyDestination, setOnlyDestination] = React.useState(Boolean(destination));
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setPick(current);
      setCount(requested ? String(requested) : '');
      setOnlyDestination(Boolean(destination));
    }
  }, [open, current, requested, destination]);

  async function save() {
    if (!pick) return;
    setSaving(true);
    try {
      await departuresApi.linkQuote(itineraryId, pick, count ? Math.max(1, Math.min(200, Number(count) || 1)) : undefined);
      toast.success(t('departures.quotePanel.linked'));
      onLinked();
    } catch (err) {
      toast.error(departureErrorText(err, t, 'departures.quotePanel.linkFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('departures.quotePanel.linkTitle')}</DialogTitle>
          <DialogDescription>{t('departures.quotePanel.linkDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-ds-3">
          <DepartureCombobox
            key={onlyDestination ? 'destination' : 'all'}
            value={pick}
            onChange={setPick}
            destination={onlyDestination && destination ? destination : undefined}
            aria-label={t('departures.quotePanel.linkTitle')}
          />
          {destination && (
            <label className="flex items-center gap-ds-2 text-sm">
              <Checkbox checked={onlyDestination} onCheckedChange={(c) => setOnlyDestination(c === true)} />
              {t('departures.quotePanel.onlyDestination', { destination })}
            </label>
          )}
          <div className="space-y-ds-1">
            <Label htmlFor="quote-seats-requested">{t('departures.quotePanel.seatsLabel')}</Label>
            <Input id="quote-seats-requested" type="number" min={1} max={200} value={count} placeholder={t('departures.quotePanel.seatsPlaceholder')} onChange={(e) => setCount(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('departures.quotePanel.cancel')}</Button>
          <Button onClick={() => void save()} disabled={!pick || saving} data-testid="quote-link-save">
            {saving && <Spinner className="size-4" />} {t('departures.quotePanel.linkSave')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
