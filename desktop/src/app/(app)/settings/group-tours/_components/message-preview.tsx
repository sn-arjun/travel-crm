'use client';

import * as React from 'react';
import { toast } from 'sonner';

import {
  Alert, AlertDescription, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Label, Skeleton, Spinner, Tag,
} from '@/components/ui';
import { departureMessagesApi, type PreviewItem, type RulePreview, type SendOutcome } from '@/lib/api/departure-messages';
import { formatDisplayDateTime } from '@/lib/dates';
import { departureErrorText } from '@/lib/departures';
import { useT } from '@/lib/i18n';
import { DepartureCombobox } from '../../../departures/_components/relation-pickers';

interface MessagePreviewProps {
  ruleId: string;
  ruleName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The departure to show first (the link of a suggestion opens the list for its departure). */
  departureId?: string | null;
  /** Called after messages were sent, so the list behind can refresh. */
  onSent?: () => void;
  /** Whether the person may send (communications permission). */
  canSend: boolean;
}

const TONES: Record<SendOutcome, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  send: 'info',
  sent: 'success',
  suggested: 'info',
  skipped_opt_out: 'warning',
  skipped_cap: 'warning',
  skipped_no_address: 'warning',
  failed: 'danger',
};

/** A row can still go out unless it was sent or failed before; the person shown is only skipped, or waiting for a click. */
const isSendable = (i: PreviewItem): boolean => i.outcome === 'send' && (i.sentStatus === null || i.sentStatus === 'suggested' || i.sentStatus.startsWith('skipped_'));

/**
 * What a rule would send on a departure, person by person, with each person's own text. Nothing is sent by looking.
 * Pressing send runs the rule for that departure now (people who already got the message are left out).
 */
export function MessagePreview({ ruleId, ruleName, open, onOpenChange, departureId: initialDeparture, onSent, canSend }: MessagePreviewProps) {
  const t = useT();
  const [departureId, setDepartureId] = React.useState<string | null>(initialDeparture ?? null);
  const [data, setData] = React.useState<RulePreview | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) setDepartureId(initialDeparture ?? null);
  }, [open, initialDeparture, ruleId]);

  const load = React.useCallback(async () => {
    if (!departureId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await departureMessagesApi.preview(ruleId, departureId));
    } catch (err) {
      setData(null);
      setError(departureErrorText(err, t, 'departureMessages.preview.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [ruleId, departureId, t]);

  React.useEffect(() => {
    if (open) void load();
    // Reload when the rule or the departure changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ruleId, departureId]);

  const sendable = data ? data.items.filter(isSendable).length : 0;

  async function send() {
    if (!departureId) return;
    setSending(true);
    try {
      const r = await departureMessagesApi.send(ruleId, departureId);
      toast.success(t('departureMessages.preview.sendResult', { sent: r.sent, held: r.skipped_cap + r.skipped_opt_out + r.skipped_no_address + r.failed }));
      onSent?.();
      await load();
    } catch (err) {
      toast.error(departureErrorText(err, t, 'departureMessages.preview.sendFailed'));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" data-testid="message-preview">
        <DialogHeader>
          <DialogTitle>{t('departureMessages.preview.title')}: {ruleName}</DialogTitle>
          <DialogDescription>{t('departureMessages.preview.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-ds-3">
          <div className="space-y-ds-1">
            <Label htmlFor="dm-preview-departure">{t('departureMessages.preview.departure')}</Label>
            <DepartureCombobox
              value={departureId}
              onChange={setDepartureId}
              anyStatus
              placeholder={t('departureMessages.preview.departurePlaceholder')}
              aria-label={t('departureMessages.preview.departure')}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {loading && <Skeleton className="h-24 w-full" />}

          {data && !loading && (
            <>
              {data.dueAt && <p className="text-xs text-ds-foreground-muted" data-testid="preview-due">{t('departureMessages.preview.dueAt', { when: formatDisplayDateTime(data.dueAt) })}</p>}
              {data.items.length === 0 ? (
                <p className="text-sm text-ds-foreground-muted" data-testid="preview-empty">{t('departureMessages.preview.nobody')}</p>
              ) : (
                <ul className="max-h-[50vh] divide-y divide-ds-border overflow-y-auto rounded-ds-md border border-ds-border" data-testid="preview-items">
                  {data.items.map((i) => {
                    const shown: SendOutcome = i.sentStatus ?? i.outcome;
                    return (
                      <li key={`${i.bookingId}-${i.passengerId ?? ''}`} className="space-y-ds-1 p-ds-3" data-testid="preview-item">
                        <div className="flex flex-wrap items-center justify-between gap-ds-2">
                          <p className="text-sm font-medium">{i.name}</p>
                          <Tag tone={TONES[shown]}>{t(`departureMessages.outcome.${shown}`)}</Tag>
                        </div>
                        {i.to && <p className="text-xs text-ds-foreground-muted">{t('departureMessages.preview.to')}: {i.to}</p>}
                        {i.subject && <p className="text-xs font-medium">{i.subject}</p>}
                        <p className="whitespace-pre-line text-sm text-ds-foreground-muted" data-testid="preview-body">{i.body}</p>
                        {i.detail && i.outcome !== 'send' && <p className="text-xs text-ds-foreground-subtle">{i.detail}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('departureMessages.preview.close')}</Button>
          {canSend && (
            <Button onClick={() => void send()} disabled={sending || sendable === 0} data-testid="preview-send">
              {sending && <Spinner className="size-4" />}
              {sendable === 0 ? t('departureMessages.preview.nothingToSend') : t('departureMessages.preview.sendNow', { count: sendable })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
