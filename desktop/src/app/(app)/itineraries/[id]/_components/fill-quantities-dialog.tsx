'use client';

import * as React from 'react';
import { ArrowRight, X } from 'lucide-react';
import { toast } from 'sonner';

import { RelationCombobox } from '@/components/domain/relation-combobox';
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Spinner, Tag,
} from '@/components/ui';
import { itinerariesApi, errorMessage, type FillQuantitiesRequest, type FillQuantitiesResult, type FillSource } from '@/lib/api/itineraries';
import { unwrapEntity } from '@/lib/api/envelope';
import { travellersApi } from '@/lib/api/visa';
import { bandRange, parseAgesText } from '@/lib/age-bands';
import { formatDisplayDate } from '@/lib/dates';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface TravellerOption {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
}

interface FillQuantitiesDialogProps {
  itineraryId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The lead's contact: its travellers are the ones offered. */
  contactId?: string | null;
  /** Adults on the lead, offered as the starting value when typing ages. */
  leadAdults?: number | null;
  /** The quantities changed: the page reads the quote again. */
  onApplied: () => void;
}

const SOURCES: Array<{ key: FillSource; labelKey: string }> = [
  { key: 'ages', labelKey: 'itineraries.fill.source.ages' },
  { key: 'travellers', labelKey: 'itineraries.fill.source.travellers' },
  { key: 'lead', labelKey: 'itineraries.fill.source.lead' },
];

/**
 * "Fill quantities": the band lines of a quote take their quantities from ages typed in, from the travellers of the lead's
 * contact (their dates of birth on the travel date), or from the lead and what the message reader found. A preview shows
 * every line that changes before anything is written.
 */
export function FillQuantitiesDialog({ itineraryId, open, onOpenChange, contactId, leadAdults, onApplied }: FillQuantitiesDialogProps) {
  const t = useT();
  const [source, setSource] = React.useState<FillSource>('lead');
  const [adults, setAdults] = React.useState('');
  const [agesText, setAgesText] = React.useState('');
  const [travellers, setTravellers] = React.useState<TravellerOption[]>([]);
  const [preview, setPreview] = React.useState<FillQuantitiesResult | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setPreview(null);
    setAgesText('');
    setTravellers([]);
    setAdults(leadAdults ? String(leadAdults) : '');
  }, [open, leadAdults]);

  const request = React.useMemo<FillQuantitiesRequest>(() => {
    if (source === 'ages') {
      const n = Number(adults);
      return { source, ...(adults.trim() !== '' && Number.isInteger(n) && n >= 0 ? { adults: n } : {}), ages: parseAgesText(agesText) };
    }
    if (source === 'travellers') return { source, travellerIds: travellers.map((x) => x.id) };
    return { source };
  }, [source, adults, agesText, travellers]);

  const ready = source === 'lead' || (source === 'travellers' ? travellers.length > 0 : adults.trim() !== '' || parseAgesText(agesText).length > 0);

  function edit<T>(setter: (v: T) => void) {
    return (value: T) => {
      setter(value);
      setPreview(null);
    };
  }

  async function run(apply: boolean) {
    setBusy(true);
    try {
      const result = unwrapEntity<FillQuantitiesResult>(await itinerariesApi.fillQuantities(itineraryId, request, apply));
      if (apply) {
        toast.success(t('itineraries.fill.applied', { count: result.lines.length }));
        onOpenChange(false);
        onApplied();
      } else {
        setPreview(result);
      }
    } catch (err) {
      toast.error(errorMessage(err, t('itineraries.fill.failed')));
    } finally {
      setBusy(false);
    }
  }

  const agesLabel = (ages: number[]) => (ages.length ? ages.join(', ') : t('itineraries.fill.noChildren'));

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="max-w-xl" data-testid="fill-quantities-dialog">
        <DialogHeader>
          <DialogTitle>{t('itineraries.fill.title')}</DialogTitle>
          <DialogDescription>{t('itineraries.fill.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-ds-4">
          <div role="radiogroup" aria-label={t('itineraries.fill.sourceLabel')} className="flex flex-wrap gap-ds-2">
            {SOURCES.map(({ key: s, labelKey }) => (
              <Button
                key={s}
                type="button"
                size="sm"
                role="radio"
                aria-checked={source === s}
                variant={source === s ? 'default' : 'outline'}
                onClick={() => { setSource(s); setPreview(null); }}
                data-testid={`fill-source-${s}`}
              >
                {t(labelKey)}
              </Button>
            ))}
          </div>

          {source === 'ages' && (
            <div className="grid gap-ds-3 sm:grid-cols-[8rem_1fr]">
              <div className="space-y-ds-1">
                <Label htmlFor="fill-adults">{t('itineraries.fill.adults')}</Label>
                <Input id="fill-adults" type="number" min={0} value={adults} onChange={(e) => edit(setAdults)(e.target.value)} />
              </div>
              <div className="space-y-ds-1">
                <Label htmlFor="fill-ages">{t('itineraries.fill.ages')}</Label>
                <Input
                  id="fill-ages"
                  value={agesText}
                  onChange={(e) => edit(setAgesText)(e.target.value)}
                  placeholder={t('itineraries.fill.agesPlaceholder')}
                />
                <p className="text-xs text-ds-foreground-muted">{t('itineraries.fill.agesHint')}</p>
              </div>
            </div>
          )}

          {source === 'travellers' && (
            <div className="space-y-ds-2">
              <Label>{t('itineraries.fill.travellers')}</Label>
              <RelationCombobox<TravellerOption>
                value={null}
                onChange={(id, item) => {
                  if (!id || !item || travellers.some((x) => x.id === id)) return;
                  edit(setTravellers)([...travellers, item]);
                }}
                fetcher={async (query, page) => {
                  // The travellers of the lead's contact; without a contact, everyone.
                  const params = { search: query || undefined, page, limit: 20, ...(contactId ? { contact_id: contactId } : {}) };
                  const res = await travellersApi.list(params as Parameters<typeof travellersApi.list>[0]);
                  return { items: res.data as TravellerOption[], total: res.pagination?.total ?? res.data.length };
                }}
                getOptionId={(x) => x.id}
                getOptionLabel={(x) => `${x.firstName} ${x.lastName}`.trim() || x.id}
                getOptionDescription={(x) => (x.dateOfBirth ? formatDisplayDate(x.dateOfBirth) : t('itineraries.fill.noBirthDate'))}
                placeholder={t('itineraries.fill.pickTraveller')}
                searchPlaceholder={t('itineraries.fill.searchTraveller')}
                emptyText={t('itineraries.fill.noTravellers')}
                aria-label={t('itineraries.fill.travellers')}
              />
              {travellers.length > 0 && (
                <ul className="flex flex-wrap gap-ds-2">
                  {travellers.map((x) => (
                    <li key={x.id}>
                      <Tag className="gap-ds-1">
                        {`${x.firstName} ${x.lastName}`.trim()}
                        <button
                          type="button"
                          aria-label={t('itineraries.fill.removeTraveller', { name: `${x.firstName} ${x.lastName}`.trim() })}
                          onClick={() => edit(setTravellers)(travellers.filter((y) => y.id !== x.id))}
                        >
                          <X className="size-3" aria-hidden="true" />
                        </button>
                      </Tag>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {source === 'lead' && <p className="text-sm text-ds-foreground-muted">{t('itineraries.fill.leadHint')}</p>}

          {preview && (
            <div className="space-y-ds-2 rounded-ds-md border border-ds-border bg-ds-surface-sunken p-ds-3" data-testid="fill-preview">
              <p className="text-sm font-medium text-ds-foreground">
                {t('itineraries.fill.party', { adults: preview.adults, children: agesLabel(preview.ages), date: formatDisplayDate(preview.travelDate) })}
              </p>
              <p className="text-xs text-ds-foreground-muted">
                {preview.bands.map((b) => `${b.label} (${bandRange(preview.bands, b.key)}): ${preview.counts[b.key] ?? 0}`).join(' · ')}
              </p>
              {preview.unknown > 0 && <p className="text-xs text-ds-warning-on-subtle">{t('itineraries.fill.unknownAges', { count: preview.unknown })}</p>}
              {preview.lines.length === 0 ? (
                <p className="text-sm text-ds-foreground-muted">{t('itineraries.fill.nothingToChange')}</p>
              ) : (
                <ul className="divide-y divide-ds-border">
                  {preview.lines.map((line) => (
                    <li key={line.id} className="flex items-center gap-ds-3 py-ds-1 text-sm" data-testid="fill-line">
                      <span className="min-w-0 flex-1 truncate">{line.title}</span>
                      <span className={cn('flex shrink-0 items-center gap-ds-1 tabular-nums')}>
                        <span className="text-ds-foreground-muted">{line.from}</span>
                        <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden="true" />
                        <span className="font-medium">{line.to}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{t('itineraries.fill.cancel')}</Button>
          <Button type="button" variant={preview ? 'outline' : 'default'} onClick={() => void run(false)} disabled={busy || !ready} data-testid="fill-preview-button">
            {busy && !preview ? <Spinner className="me-ds-1" /> : null}
            {t('itineraries.fill.preview')}
          </Button>
          {preview && (
            <Button type="button" onClick={() => void run(true)} disabled={busy || preview.lines.length === 0} data-testid="fill-apply">
              {t('itineraries.fill.apply')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
