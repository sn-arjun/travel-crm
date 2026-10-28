'use client';

import * as React from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, Button, ConfirmDialog, Input, SectionCard, Skeleton, Spinner, Tag, Textarea } from '@/components/ui';
import { departuresApi, type DepartureDetail, type PublicPageLink } from '@/lib/api/departures';
import { departureErrorText } from '@/lib/departures';
import { useT } from '@/lib/i18n';

interface PublicPageCardProps {
  departure: DepartureDetail;
  canEdit: boolean;
}

/** The snippet to paste into an agency website: the booking page in a frame. */
export function embedSnippet(url: string, title: string): string {
  return `<iframe src="${url}" title="${title.replace(/"/g, '&quot;')}" style="width:100%;min-height:60rem;border:0" loading="lazy"></iframe>`;
}

/**
 * The "Public booking page" card of a departure (R148): switch the page on, copy its link, copy the code that embeds it in the
 * agency's website, switch it off (the link stops working). Bookings made there arrive as a contact, a lead, passengers and held seats.
 */
export function PublicPageCard({ departure, canEdit }: PublicPageCardProps) {
  const t = useT();
  const [link, setLink] = React.useState<PublicPageLink | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [confirmOff, setConfirmOff] = React.useState(false);
  const [copied, setCopied] = React.useState<'link' | 'embed' | null>(null);
  const copiedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const id = departure.id;
  React.useEffect(() => {
    let cancelled = false;
    setLink(null);
    departuresApi
      .publicLink(id)
      .then((l) => !cancelled && setLink(l))
      .catch((err) => !cancelled && setError(departureErrorText(err, t, 'departures.publicPage.loadFailed')));
    return () => {
      cancelled = true;
    };
    // The card reads again when another departure is opened only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  React.useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  async function enable() {
    setBusy(true);
    try {
      setLink(await departuresApi.enablePublicLink(id));
      toast.success(t('departures.publicPage.switchedOn'));
    } catch (err) {
      toast.error(departureErrorText(err, t, 'departures.publicPage.failed'));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    try {
      setLink(await departuresApi.disablePublicLink(id));
      toast.success(t('departures.publicPage.switchedOff'));
    } catch (err) {
      toast.error(departureErrorText(err, t, 'departures.publicPage.failed'));
    }
  }

  async function copy(kind: 'link' | 'embed', text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      toast.success(t('departures.publicPage.copied'));
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard blocked: the text stays selectable in its field.
    }
  }

  const url = link?.enabled ? link.url : null;

  return (
    <SectionCard title={t('departures.publicPage.title')} description={t('departures.publicPage.description')} className="max-w-3xl">
      <div className="space-y-ds-3" data-testid="public-page-card">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!link && !error && <Skeleton className="h-9 w-full" />}

        {link && !link.available && <p className="text-sm text-ds-foreground-muted">{t('departures.publicPage.unavailable')}</p>}

        {link && link.available && !url && (
          <div className="flex flex-wrap items-center gap-ds-3">
            <Tag tone="neutral">{t('departures.publicPage.off')}</Tag>
            {canEdit && (
              <Button size="sm" onClick={() => void enable()} disabled={busy} data-testid="public-page-enable">
                {busy && <Spinner className="size-4" />}
                {t('departures.publicPage.enable')}
              </Button>
            )}
          </div>
        )}

        {url && (
          <>
            <div className="flex flex-wrap items-center gap-ds-2">
              <Tag tone="success">{t('departures.publicPage.on')}</Tag>
              {departure.status !== 'open' && <span className="text-xs text-ds-foreground-muted">{t('departures.publicPage.needsOpen')}</span>}
            </div>
            <div className="space-y-ds-1">
              <label htmlFor="public-page-url" className="text-sm font-medium">{t('departures.publicPage.link')}</label>
              <div className="flex flex-wrap gap-ds-2">
                <Input id="public-page-url" readOnly value={url} className="min-w-0 flex-1" onFocus={(e) => e.currentTarget.select()} data-testid="public-page-url" />
                <Button size="sm" variant="outline" onClick={() => void copy('link', url)} data-testid="public-page-copy">
                  {copied === 'link' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {t('departures.publicPage.copy')}
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={url} target="_blank" rel="noreferrer" data-testid="public-page-open">
                    <ExternalLink aria-hidden="true" /> {t('departures.publicPage.open')}
                  </a>
                </Button>
              </div>
            </div>
            <div className="space-y-ds-1">
              <label htmlFor="public-page-embed" className="text-sm font-medium">{t('departures.publicPage.embed')}</label>
              <Textarea id="public-page-embed" readOnly rows={3} value={embedSnippet(url, `${departure.tourTitle ?? departure.code}`)} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} data-testid="public-page-embed" />
              <p className="text-xs text-ds-foreground-muted">{t('departures.publicPage.embedHint')}</p>
              <Button size="sm" variant="outline" onClick={() => void copy('embed', embedSnippet(url, `${departure.tourTitle ?? departure.code}`))} data-testid="public-page-copy-embed">
                {copied === 'embed' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {t('departures.publicPage.copyEmbed')}
              </Button>
            </div>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => setConfirmOff(true)} data-testid="public-page-disable">
                {t('departures.publicPage.disable')}
              </Button>
            )}
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirmOff}
        onOpenChange={setConfirmOff}
        title={t('departures.publicPage.disable')}
        description={t('departures.publicPage.confirmOff')}
        tone="destructive"
        onConfirm={disable}
      />
    </SectionCard>
  );
}
