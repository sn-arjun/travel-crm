'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { usageApi } from '@/lib/api/settings';
import { LIMIT_EVENT, type LimitInfo } from '@/lib/api/limit-events';
import { formatCurrency } from '@/lib/utils';
import { BuyMoreDialog, useCanBuyAddons } from './buy-more-dialog';

const CHANNEL_FOR_REQUEST: Record<string, 'ai' | 'sms' | 'whatsapp' | 'whatsapp_marketing' | 'otp' | 'call_minute' | 'email'> = {
  ai: 'ai', sms: 'sms', whatsapp: 'whatsapp', whatsapp_marketing: 'whatsapp_marketing', otp: 'otp', call_minute: 'call_minute', email: 'email',
};

interface AllowanceExhaustedDialogProps {
  limit: LimitInfo | null;
  onClose: () => void;
}

/**
 * Shown when the API answers 402 ALLOWANCE_EXHAUSTED (a monthly SMS / WhatsApp / email / login code / call-minute
 * allowance is used up) or SEAT_LIMIT (no free user seat). Offers the two ways on: upgrade the plan, or buy credits
 * (extra users for a seat limit). An administrator on a server with online payment set up can buy the pack right here
 * (Buy more); otherwise, and for upgrades, the request goes to the platform.
 */
export function AllowanceExhaustedDialog({ limit, onClose }: AllowanceExhaustedDialogProps) {
  const [sending, setSending] = React.useState<'plan' | 'top_up' | null>(null);
  const [sent, setSent] = React.useState(false);
  const [buying, setBuying] = React.useState(false);
  const canBuy = useCanBuyAddons();

  React.useEffect(() => {
    setSent(false);
    setSending(null);
    setBuying(false);
  }, [limit]);

  if (!limit) return null;
  const isSeat = limit.code === 'SEAT_LIMIT';
  const canUpgrade = limit.options.includes('upgrade');
  const canTopUp = limit.options.includes('top_up') || limit.options.includes('extra_users');

  const request = async (kind: 'plan' | 'top_up') => {
    setSending(kind);
    try {
      await usageApi.requestUpgrade({
        kind,
        channel: limit.channel ? CHANNEL_FOR_REQUEST[limit.channel] : undefined,
        note: isSeat ? 'Extra users or a larger plan (user limit reached)' : undefined,
      });
      setSent(true);
      toast.success('Request sent. We will get back to you shortly.');
    } catch {
      toast.error('Could not send the request. Please try again.');
    } finally {
      setSending(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent data-testid="allowance-exhausted-dialog">
        <DialogHeader>
          <DialogTitle>{isSeat ? 'User limit reached' : 'Monthly limit reached'}</DialogTitle>
          <DialogDescription>{limit.message}</DialogDescription>
        </DialogHeader>

        {!isSeat && limit.allowance !== undefined && (
          <p className="text-sm text-ds-foreground-muted">
            Used {limit.used ?? limit.allowance} of {limit.allowance} this month. The allowance renews at the start of next month.
          </p>
        )}

        {limit.upgradeTo && canUpgrade && (
          <p className="text-sm text-ds-foreground">
            {limit.upgradeTo.name} includes {limit.upgradeTo.allowance} per month.
          </p>
        )}

        {limit.addons.length > 0 && (
          <ul className="space-y-ds-1 text-sm text-ds-foreground">
            {limit.addons.map((pack) => (
              <li key={pack.key} className="flex items-center justify-between rounded-ds-md border border-ds-border px-ds-3 py-ds-2">
                <span>{pack.name}</span>
                <span className="font-medium">{formatCurrency(pack.price, pack.currency)}</span>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {canTopUp && canBuy && (
            <Button variant="outline" data-testid="allowance-buy-more" onClick={() => setBuying(true)}>
              Buy more
            </Button>
          )}
          {canTopUp && !canBuy && (
            <Button variant="outline" disabled={sending !== null || sent} onClick={() => request('top_up')}>
              {isSeat ? 'Request extra users' : 'Request credits'}
            </Button>
          )}
          {canUpgrade && (
            <Button disabled={sending !== null || sent} onClick={() => request('plan')}>
              Request upgrade
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
      {canBuy && (
        <BuyMoreDialog
          open={buying}
          focus={isSeat ? { users: true } : { channel: limit.channel }}
          onClose={() => setBuying(false)}
        />
      )}
    </Dialog>
  );
}

/** Listens for plan-limit errors from the API client and shows the dialog. Mount once in the app layout. */
export function LimitReachedHost() {
  const [limit, setLimit] = React.useState<LimitInfo | null>(null);

  React.useEffect(() => {
    const onLimit = (event: Event) => setLimit((event as CustomEvent<LimitInfo>).detail);
    window.addEventListener(LIMIT_EVENT, onLimit);
    return () => window.removeEventListener(LIMIT_EVENT, onLimit);
  }, []);

  return <AllowanceExhaustedDialog limit={limit} onClose={() => setLimit(null)} />;
}
