'use client';

import * as React from 'react';
import { toast } from 'sonner';

import { Button, SectionCard, Skeleton } from '@/components/ui';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { ageBandsApi, errorMessage, type AgeBandsSettings } from '@/lib/api/itineraries';
import { unwrapEntity } from '@/lib/api/envelope';
import { useAuthStore } from '@/stores/auth-store';
import { useT } from '@/lib/i18n';
import { AgeBandsEditor, rowsError, rowsFromBands, rowsToRequest, type BandRow } from './age-bands-editor';

/**
 * Settings > Itinerary defaults > Age bands: the labels and minimum ages quotes and templates are priced by (design 4.2).
 * It saves on its own, apart from the page's form. Renders nothing while the plan does not include age-band pricing.
 */
export function AgeBandsCard() {
  const gate = useFeatureGate('age_band_pricing');
  if (gate.loading) return <Skeleton className="h-40 w-full" />;
  if (!gate.enabled) return null;
  return <AgeBandsCardBody />;
}

function AgeBandsCardBody() {
  const t = useT();
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const [state, setState] = React.useState<AgeBandsSettings | null>(null);
  const [rows, setRows] = React.useState<BandRow[]>([]);
  const [failed, setFailed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const settings = unwrapEntity<AgeBandsSettings>(await ageBandsApi.get());
      setState(settings);
      setRows(rowsFromBands(settings.bands));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function save(bands: ReturnType<typeof rowsToRequest> | null) {
    setBusy(true);
    try {
      const settings = unwrapEntity<AgeBandsSettings>(await ageBandsApi.save(bands));
      setState(settings);
      setRows(rowsFromBands(settings.bands));
      toast.success(t(bands ? 'ageBands.settings.saved' : 'ageBands.settings.resetDone'));
    } catch (err) {
      toast.error(errorMessage(err, t('ageBands.settings.saveFailed')));
    } finally {
      setBusy(false);
    }
  }

  const error = rowsError(rows);

  return (
    <SectionCard title={t('ageBands.settings.title')} description={t('ageBands.settings.description')}>
      {failed ? (
        <div className="flex items-center gap-ds-3">
          <p className="text-sm text-ds-foreground-muted">{t('ageBands.settings.loadFailed')}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>{t('ageBands.settings.retry')}</Button>
        </div>
      ) : !state ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="space-y-ds-4" data-testid="age-bands-card">
          <AgeBandsEditor rows={rows} onChange={setRows} disabled={busy || !isAdmin} />
          <p className="text-xs text-ds-foreground-muted">
            {state.isDefault ? t('ageBands.settings.usingDefaults') : t('ageBands.settings.hint')}
          </p>
          {!isAdmin && <p className="text-xs text-ds-foreground-muted">{t('ageBands.settings.adminOnly')}</p>}
          {isAdmin && (
            <div className="flex flex-wrap gap-ds-2">
              <Button type="button" size="sm" disabled={busy || !!error} onClick={() => void save(rowsToRequest(rows))} data-testid="age-bands-save">
                {t('ageBands.settings.save')}
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={busy || state.isDefault} onClick={() => void save(null)}>
                {t('ageBands.settings.reset')}
              </Button>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
