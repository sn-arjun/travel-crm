'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Label, Spinner, Tag, Textarea,
} from '@/components/ui';
import { departuresApi, type DepartureDetail, type DepartureStatus } from '@/lib/api/departures';
import { departureActionLabel, departureErrorText, departureStatusLabel, departureStatusTone, nextStatuses } from '@/lib/departures';
import { useT } from '@/lib/i18n';

interface DepartureStatusMenuProps {
  departureId: string;
  status: DepartureStatus;
  /** Called with the departure as the API returns it after a move. */
  onChanged: (departure: DepartureDetail) => void;
  /** Hide the current status chip (the list row already shows one). */
  hideChip?: boolean;
  disabled?: boolean;
}

/** The status chip and, beside it, a menu of the moves the status table allows from here. Cancelling asks for a reason. */
export function DepartureStatusMenu({ departureId, status, onChanged, hideChip, disabled }: DepartureStatusMenuProps) {
  const t = useT();
  const moves = nextStatuses(status);
  const [busy, setBusy] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');

  async function move(to: DepartureStatus, why?: string) {
    setBusy(true);
    try {
      const updated = await departuresApi.changeStatus(departureId, to, why);
      toast.success(t('departures.status.changedTo', { status: departureStatusLabel(to, t) }));
      onChanged(updated);
      return true;
    } catch (err) {
      toast.error(departureErrorText(err, t, 'departures.status.changeFailed'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-ds-2">
      {!hideChip && (
        <Tag tone={departureStatusTone(status)} size="lg" data-testid="departure-status">
          {departureStatusLabel(status, t)}
        </Tag>
      )}
      {moves.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={disabled || busy} data-testid="status-menu-trigger" onClick={(e) => e.stopPropagation()}>
              {busy ? <Spinner className="size-4" /> : null}
              {t('departures.status.change')}
              <ChevronDown aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {moves.filter((m) => m !== 'cancelled').map((m) => (
              <DropdownMenuItem key={m} onSelect={() => void move(m)}>
                {departureActionLabel(m, t)}
              </DropdownMenuItem>
            ))}
            {moves.includes('cancelled') && (
              <>
                {moves.length > 1 && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  className="text-ds-danger"
                  onSelect={() => {
                    setReason('');
                    setCancelOpen(true);
                  }}
                >
                  {departureActionLabel('cancelled', t)}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Dialog open={cancelOpen} onOpenChange={(o) => !busy && setCancelOpen(o)}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{t('departures.cancel.title')}</DialogTitle>
            <DialogDescription>{t('departures.cancel.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-ds-2">
            <Label htmlFor="departure-cancel-reason">{t('departures.cancel.reason')}</Label>
            <Textarea id="departure-cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={busy}>
              {t('departures.cancel.keep')}
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !reason.trim()}
              onClick={async () => {
                if (await move('cancelled', reason.trim())) setCancelOpen(false);
              }}
            >
              {busy && <Spinner className="size-4" />}
              {t('departures.cancel.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
