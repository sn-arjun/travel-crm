'use client';

import * as React from 'react';
import { toast } from 'sonner';

import {
  Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Label,
} from '@/components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ageBandsApi, errorMessage, itineraryTemplatesApi, templateDays, type ItineraryTemplate } from '@/lib/api/itineraries';
import { unwrapEntity } from '@/lib/api/envelope';
import { DEFAULT_AGE_BANDS, PER_PERSON, bandRange, bandsFor, parseBands, type AgeBand } from '@/lib/age-bands';
import { useT } from '@/lib/i18n';
import { AgeBandsEditor, rowsError, rowsFromBands, rowsToRequest, type BandRow } from '../../_components/age-bands-editor';

const FIXED = '__fixed';

interface LineRow {
  day: number;
  item: number;
  dayLabel: string;
  title: string;
  paxType: string | null;
  original: string | null;
}

interface TemplateBandsDialogProps {
  /** The template with its templateData loaded. */
  template: ItineraryTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/**
 * The age bands of one template: inherit the agency's list or keep its own, and which band (or "per person") each line is
 * priced by. Lines are named by their position in the template, which is how the API addresses them.
 */
export function TemplateBandsDialog({ template, open, onOpenChange, onSaved }: TemplateBandsDialogProps) {
  const t = useT();
  const [agencyBands, setAgencyBands] = React.useState<AgeBand[]>(DEFAULT_AGE_BANDS);
  const [custom, setCustom] = React.useState(false);
  const [rows, setRows] = React.useState<BandRow[]>([]);
  const [lines, setLines] = React.useState<LineRow[]>([]);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    ageBandsApi.get().then((res) => setAgencyBands(unwrapEntity<{ bands: AgeBand[] }>(res).bands)).catch(() => setAgencyBands(DEFAULT_AGE_BANDS));
  }, [open]);

  React.useEffect(() => {
    if (!open || !template) return;
    const own = template.ageBands && template.ageBands.length > 0 ? template.ageBands : null;
    setCustom(!!own);
    setRows(rowsFromBands(own ?? agencyBands));
    const next: LineRow[] = [];
    templateDays(template).forEach((day, di) => {
      (day.items ?? []).forEach((item, ii) => {
        next.push({
          day: di,
          item: ii,
          dayLabel: t('ageBands.template.dayLabel', { n: day.dayNumber ?? di + 1 }),
          title: item.title || '-',
          paxType: item.paxType ?? null,
          original: item.paxType ?? null,
        });
      });
    });
    setLines(next);
    // agencyBands only seeds the rows of a template that has none of its own, once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template?.id]);

  // The list in force while editing: the typed custom list when it is valid, else the agency's.
  const typed = custom ? parseBands(rowsToRequest(rows)) : null;
  const inForce = typed && !typed.error ? typed.bands : bandsFor(null, agencyBands);
  const error = custom ? rowsError(rows) : null;
  const allowed = new Set<string>([PER_PERSON, ...inForce.map((b) => b.key)]);
  const orphaned = lines.filter((l) => l.paxType && !allowed.has(l.paxType)).length;

  function setLine(index: number, paxType: string | null) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, paxType } : l)));
  }

  function toggleCustom(next: boolean) {
    setCustom(next);
    // Start the custom list from the agency's, so it is a change of a few rows and not a blank page.
    if (next && rows.length === 0) setRows(rowsFromBands(agencyBands));
  }

  async function save() {
    if (!template) return;
    setBusy(true);
    try {
      const changed = lines
        .map((l) => ({ ...l, paxType: l.paxType && allowed.has(l.paxType) ? l.paxType : null }))
        .filter((l) => l.paxType !== l.original)
        .map((l) => ({ day: l.day, item: l.item, paxType: l.paxType }));
      await itineraryTemplatesApi.saveAgeBands(template.id, {
        ageBands: custom ? rowsToRequest(rows) : null,
        ...(changed.length ? { lines: changed } : {}),
      });
      toast.success(t('ageBands.template.saved'));
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err, t('ageBands.template.saveFailed')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="max-w-2xl" data-testid="template-bands-dialog">
        <DialogHeader>
          <DialogTitle>{t('ageBands.template.title')}</DialogTitle>
          <DialogDescription>{t('ageBands.template.description')}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-ds-4 overflow-y-auto pe-ds-1">
          <div className="space-y-ds-2">
            <div className="flex items-center gap-ds-2">
              <Checkbox id="template-custom-bands" checked={custom} onCheckedChange={(v) => toggleCustom(v === true)} data-testid="template-custom-bands" />
              <Label htmlFor="template-custom-bands">{t('ageBands.template.custom')}</Label>
            </div>
            {custom ? (
              <AgeBandsEditor rows={rows} onChange={setRows} disabled={busy} />
            ) : (
              <p className="text-sm text-ds-foreground-muted">
                {t('ageBands.template.inherit', { bands: agencyBands.map((b) => `${b.label} (${bandRange(agencyBands, b.key)})`).join(', ') })}
              </p>
            )}
          </div>

          <div className="space-y-ds-2">
            <p className="text-sm font-medium text-ds-foreground">{t('ageBands.template.linesTitle')}</p>
            {lines.length === 0 ? (
              <p className="text-sm text-ds-foreground-muted">{t('ageBands.template.noLines')}</p>
            ) : (
              <ul className="divide-y divide-ds-border rounded-ds-md border border-ds-border">
                {lines.map((line, index) => (
                  <li key={`${line.day}:${line.item}`} className="flex items-center gap-ds-3 px-ds-3 py-ds-2" data-testid="template-line">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{line.title}</p>
                      <p className="text-xs text-ds-foreground-muted">{line.dayLabel}</p>
                    </div>
                    <Select value={line.paxType ?? FIXED} onValueChange={(v) => setLine(index, v === FIXED ? null : v)}>
                      <SelectTrigger className="h-8 w-52 text-xs" aria-label={t('ageBands.template.lineBand', { title: line.title })}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={FIXED}>{t('itineraries.pricedBy.fixed')}</SelectItem>
                        <SelectItem value={PER_PERSON}>{t('itineraries.pricedBy.perPerson')}</SelectItem>
                        {inForce.map((b) => (
                          <SelectItem key={b.key} value={b.key}>{`${b.label} (${bandRange(inForce, b.key)})`}</SelectItem>
                        ))}
                        {line.paxType && !allowed.has(line.paxType) && (
                          <SelectItem value={line.paxType}>{t('itineraries.pricedBy.unknownBand', { key: line.paxType })}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </li>
                ))}
              </ul>
            )}
            {orphaned > 0 && <p className="text-xs text-ds-warning-on-subtle">{t('ageBands.template.orphaned', { count: orphaned })}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{t('ageBands.template.cancel')}</Button>
          <Button type="button" onClick={() => void save()} disabled={busy || !!error} data-testid="template-bands-save">
            {t('ageBands.template.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
