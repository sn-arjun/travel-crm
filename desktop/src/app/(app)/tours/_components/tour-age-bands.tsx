'use client';

import * as React from 'react';

import { Checkbox, Label } from '@/components/ui';
import { unwrapEntity } from '@/lib/api/envelope';
import { ageBandsApi } from '@/lib/api/itineraries';
import { DEFAULT_AGE_BANDS, bandRange, parseBands, resolveBands, type AgeBand } from '@/lib/age-bands';
import { useT } from '@/lib/i18n';
import { AgeBandsEditor, rowsError, rowsFromBands, rowsToRequest, type BandRow } from '../../itineraries/_components/age-bands-editor';

/** The agency's age bands, loaded once; the built-in three while loading or when they cannot be read. */
export function useAgencyBands(): AgeBand[] {
  const [bands, setBands] = React.useState<AgeBand[]>(DEFAULT_AGE_BANDS);
  React.useEffect(() => {
    let cancelled = false;
    ageBandsApi
      .get()
      .then((res) => !cancelled && setBands(unwrapEntity<{ bands: AgeBand[] }>(res).bands))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return bands;
}

/** The bands in force for a tour as typed: its own list when it is on and valid, else the agency's (R164-2 resolution order). */
export function tourBandsInForce(custom: boolean, rows: BandRow[], agencyBands: AgeBand[]): AgeBand[] {
  const typed = custom ? parseBands(rowsToRequest(rows)) : null;
  return resolveBands([typed && !typed.error ? typed.bands : null], agencyBands);
}

/** The reason the tour's own bands cannot be saved, or null. Always null while the tour uses the agency's. */
export const tourBandsError = (custom: boolean, rows: BandRow[]) => (custom ? rowsError(rows) : null);

interface TourAgeBandsProps {
  custom: boolean;
  rows: BandRow[];
  agencyBands: AgeBand[];
  onChange: (next: { custom: boolean; rows: BandRow[] }) => void;
  disabled?: boolean;
}

/**
 * A tour's own age bands (R164-2), the same editor as the agency's and a template's. Off: the booking page, passengers and extras of
 * the tour use the agency's bands. On: the tour's list wins, so one tour can start adults at 13 while another starts them at 12.
 */
export function TourAgeBands({ custom, rows, agencyBands, onChange, disabled }: TourAgeBandsProps) {
  const t = useT();
  return (
    <div className="space-y-ds-2" data-testid="tour-age-bands">
      <div className="flex items-center gap-ds-2">
        <Checkbox
          id="tour-custom-bands"
          checked={custom}
          disabled={disabled}
          onCheckedChange={(v) => {
            const on = v === true;
            // Start the tour's list from the agency's, so it is a change of a few rows and not a blank page.
            onChange({ custom: on, rows: on && rows.length === 0 ? rowsFromBands(agencyBands) : rows });
          }}
          data-testid="tour-custom-bands"
        />
        <Label htmlFor="tour-custom-bands">{t('tours.bands.custom')}</Label>
      </div>
      {custom ? (
        <AgeBandsEditor rows={rows} onChange={(next) => onChange({ custom, rows: next })} disabled={disabled} />
      ) : (
        <p className="text-sm text-ds-foreground-muted" data-testid="tour-bands-inherit">
          {t('tours.bands.inherit', { bands: agencyBands.map((b) => `${b.label} (${bandRange(agencyBands, b.key)})`).join(', ') })}
        </p>
      )}
    </div>
  );
}
