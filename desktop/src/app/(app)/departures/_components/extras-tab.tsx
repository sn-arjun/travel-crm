'use client';

import * as React from 'react';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';

import {
  Alert, AlertDescription, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, SectionCard, Skeleton, Spinner, Tag,
} from '@/components/ui';
import {
  apiErrorCode, departuresApi, seatBookingsApi, type DepartureDetail, type DepartureExtra, type ExtrasOverview, type PassengerChoice,
} from '@/lib/api/departures';
import { formatDisplayDateTime } from '@/lib/dates';
import { departureErrorText, bandLabel } from '@/lib/departures';
import { formatExactCurrency } from '@/lib/format';
import { MAX_QUANTITY } from '@/lib/extras';
import { useT } from '@/lib/i18n';
import { ExtrasEditor, fromExtraRows, toExtraRows, type ExtraRow } from '../../tours/_components/extras-editor';

interface ExtrasTabProps {
  departure: DepartureDetail;
  canEdit: boolean;
  currency: string;
  /** Something elsewhere changed (a booking, a payment): read the extras again. */
  refreshKey: number;
  onChanged: () => void;
}

const editableStatus = (d: DepartureDetail) => !['cancelled', 'completed'].includes(d.status);

const statusTone = (s: PassengerChoice['status']) => (s === 'paid' ? 'success' : s === 'invoiced' ? 'info' : 'neutral');

/** Total quantity per extra id of one passenger's live choices. */
function quantities(choices: readonly PassengerChoice[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of choices) if (c.status !== 'cancelled') out[c.tourExtraId] = (out[c.tourExtraId] ?? 0) + c.quantity;
  return out;
}

/**
 * The Extras tab of a departure (R150): what it sells (the tour's extras with this departure's own changes), how much is sold and
 * paid, the changes for this departure, and what each passenger chose, which staff can change at any time, also after the cut-off.
 */
export function DepartureExtrasTab({ departure, canEdit, currency, refreshKey, onChanged }: ExtrasTabProps) {
  const t = useT();
  const [data, setData] = React.useState<ExtrasOverview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<ExtraRow[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [editing, setEditing] = React.useState<ExtrasOverview['passengers'][number] | null>(null);
  const locked = !canEdit || !editableStatus(departure);

  const load = React.useCallback(async () => {
    try {
      const d = await departuresApi.getExtras(departure.id);
      setData(d);
      setRows(toExtraRows(d.own));
      setError(null);
    } catch (err) {
      setError(departureErrorText(err, t, 'extras.dep.loadFailed'));
    }
  }, [departure.id, t]);

  React.useEffect(() => {
    void load();
    // Read again when another departure is opened or something changed elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departure.id, refreshKey]);

  async function save() {
    setSaving(true);
    try {
      const d = await departuresApi.replaceExtras(departure.id, fromExtraRows(rows, currency));
      setData(d);
      setRows(toExtraRows(d.own));
      toast.success(t('extras.dep.saved'));
    } catch (err) {
      toast.error(departureErrorText(err, t, 'extras.dep.failed'));
    } finally {
      setSaving(false);
    }
  }

  /** A copy of a tour row among this departure's own rows: same name and day, so it replaces the tour's row here. */
  function customise(extra: DepartureExtra) {
    if (rows.some((r) => r.title.trim().toLowerCase() === extra.title.trim().toLowerCase() && (r.dayNumber ?? null) === (extra.dayNumber ?? null))) {
      toast.info(t('extras.dep.alreadyCustomised'));
      return;
    }
    setRows([...rows, ...toExtraRows([{ ...extra, id: undefined, departureId: null }])]);
    toast.info(t('extras.dep.customised'));
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!data) return <Skeleton className="h-48 w-full" />;

  const money = (n: number) => formatExactCurrency(n, data.currency);
  const sourceLabel = (s: DepartureExtra['source']) => t(s === 'departure' ? 'extras.dep.fromDeparture' : s === 'tour' ? 'extras.dep.fromTour' : 'extras.dep.fromAllTours');

  return (
    <div className="space-y-ds-4" data-testid="departure-extras">
      <SectionCard title={t('extras.dep.sells')} description={t('extras.dep.sellsDescription')}>
        {data.extras.length === 0 ? (
          <p className="text-sm text-ds-foreground-muted" data-testid="extras-none">{t('extras.dep.none')}</p>
        ) : (
          <ul className="divide-y divide-ds-border text-sm" data-testid="effective-extras">
            {data.extras.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-ds-3 py-ds-2" data-testid="effective-extra">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium">
                    {e.title}
                    {e.dayNumber ? <span className="ms-ds-2 font-normal text-ds-foreground-muted">{t('extras.detail.day', { day: e.dayNumber })}</span> : null}
                  </p>
                  <p className="text-xs text-ds-foreground-muted">
                    {e.cutoffAt ? t(e.open ? 'extras.dep.closesAt' : 'extras.dep.closedAt', { when: formatDisplayDateTime(e.cutoffAt) }) : t('extras.dep.noCutoff')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-ds-3">
                  <Tag tone={e.source === 'departure' ? 'primary' : 'neutral'}>{sourceLabel(e.source)}</Tag>
                  {!e.open && <Tag tone="warning">{t('extras.dep.closed')}</Tag>}
                  <span className="tabular-nums">{money(e.listPrice)}</span>
                  <span className="tabular-nums text-ds-foreground-muted" data-testid="extra-sold">
                    {e.capacity == null ? t('extras.dep.soldOf', { sold: e.sold }) : t('extras.dep.soldOfLimit', { sold: e.sold, limit: e.capacity })}
                  </span>
                  <span className="tabular-nums text-ds-foreground-muted">{t('extras.dep.paidOf', { paid: money(e.paid), total: money(e.revenue) })}</span>
                  {!locked && e.source !== 'departure' && (
                    <Button size="sm" variant="ghost" onClick={() => customise(e)} data-testid="customise-extra">
                      {t('extras.dep.customise')}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={t('extras.dep.overrides')} description={t('extras.dep.overridesDescription')}>
        <ExtrasEditor value={rows} onChange={setRows} currency={currency} disabled={locked} />
        {!locked && (
          <div className="mt-ds-4">
            <Button onClick={() => void save()} disabled={saving} data-testid="tab-save">
              {saving && <Spinner className="size-4" />}
              {t('extras.dep.save')}
            </Button>
          </div>
        )}
      </SectionCard>

      <SectionCard title={t('extras.dep.chosen')} description={t('extras.dep.chosenDescription')}>
        {data.passengers.length === 0 ? (
          <p className="text-sm text-ds-foreground-muted">{t('extras.dep.noPassengers')}</p>
        ) : (
          <ul className="divide-y divide-ds-border text-sm" data-testid="extras-passengers">
            {data.passengers.map((p) => {
              const live = p.choices.filter((c) => c.status !== 'cancelled');
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-ds-3 py-ds-2" data-testid="extras-passenger">
                  <div className="min-w-0">
                    <p className="font-medium">{p.name || t('extras.dep.unnamed')}</p>
                    <p className="text-xs text-ds-foreground-muted">{[p.contactName, p.bandKey ? bandLabel(p.bandKey, t) : null].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-ds-2">
                    {live.length === 0 && <span className="text-ds-foreground-muted">{t('extras.dep.nothingChosen')}</span>}
                    {live.map((c) => (
                      <Tag key={c.id} tone={statusTone(c.status)} data-testid="choice-tag">
                        {c.quantity > 1 ? `${c.title} x${c.quantity}` : c.title}
                        {' · '}
                        {t(`extras.status.${c.status}`)}
                      </Tag>
                    ))}
                    {!locked && data.extras.length > 0 && (
                      <Button size="icon-sm" variant="ghost" aria-label={t('extras.dep.editChoices', { name: p.name })} onClick={() => setEditing(p)} data-testid="edit-choices">
                        <Pencil aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <ChoicesDialog
        passenger={editing}
        extras={data.extras}
        money={money}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
          onChanged();
        }}
      />
    </div>
  );
}

interface ChoicesDialogProps {
  passenger: ExtrasOverview['passengers'][number] | null;
  extras: readonly DepartureExtra[];
  money: (n: number) => string;
  onClose: () => void;
  onSaved: () => void;
}

/** One passenger's extras, as a quantity per extra. Staff are not held to the cut-off; the extras invoice follows. */
function ChoicesDialog({ passenger, extras, money, onClose, onSaved }: ChoicesDialogProps) {
  const t = useT();
  const [draft, setDraft] = React.useState<Record<string, number>>({});
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setDraft(passenger ? quantities(passenger.choices) : {});
  }, [passenger]);

  async function save() {
    if (!passenger) return;
    setBusy(true);
    try {
      const choices = extras.filter((e) => (draft[e.id] ?? 0) > 0).map((e) => ({ passengerId: passenger.id, extraId: e.id, quantity: draft[e.id] ?? 0 }));
      const result = await seatBookingsApi.setExtras(passenger.bookingId, choices, [passenger.id]);
      toast.success(result.invoice ? t('extras.dep.savedInvoice', { number: result.invoice.invoiceNumber }) : t('extras.dep.savedChoices'));
      for (const r of result.refunds) toast.info(t('extras.dep.refund', { title: r.title, amount: money(r.amount) }));
      onSaved();
    } catch (err) {
      const code = apiErrorCode(err);
      toast.error(code === 'EXTRA_FULL' ? t('extras.dep.errorFull') : departureErrorText(err, t, 'extras.dep.choicesFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={passenger !== null} onOpenChange={(o) => !busy && !o && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="choices-dialog">
        <DialogHeader>
          <DialogTitle>{t('extras.dep.choicesTitle', { name: passenger?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('extras.dep.choicesDescription')}</DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-ds-border text-sm">
          {extras.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-ds-3 py-ds-2">
              <label htmlFor={`choice-${e.id}`} className="min-w-0">
                <span className="font-medium">{e.title}</span>
                {e.dayNumber ? <span className="ms-ds-2 text-ds-foreground-muted">{t('extras.detail.day', { day: e.dayNumber })}</span> : null}
              </label>
              <Input
                id={`choice-${e.id}`}
                type="number"
                min={0}
                max={MAX_QUANTITY}
                className="w-20"
                value={draft[e.id] ?? 0}
                onChange={(ev) => setDraft({ ...draft, [e.id]: Math.max(0, Math.min(MAX_QUANTITY, Math.floor(Number(ev.target.value) || 0))) })}
                data-testid={`choice-qty-${e.title}`}
              />
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button onClick={() => void save()} disabled={busy} data-testid="choices-save">
            {busy && <Spinner className="size-4" />}
            {t('extras.dep.saveChoices')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
