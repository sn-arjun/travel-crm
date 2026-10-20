'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/stores/auth-store';
import { formatCurrency } from '@/lib/utils';
import { formatDisplayDate } from '@/lib/dates';
import {
  billingApi, openCheckout,
  type AddonOffer, type AddonQuote, type AddonsOverview,
} from '@/lib/api/billing';
import type { ApiError } from '@/lib/api/client';

/** What the agency ran out of: narrows the dialog to the packs that fix it. */
export interface BuyMoreFocus {
  /** ai, sms, whatsapp, otp, call_minute (the allowance channel names the API uses). */
  channel?: string;
  /** Out of user seats. */
  users?: boolean;
}

function matches(offer: AddonOffer, focus?: BuyMoreFocus): boolean {
  if (!focus) return true;
  if (focus.users) return offer.kind === 'extra_user';
  if (focus.channel === 'ai') return offer.kind === 'ai_credit_pack';
  if (focus.channel) return offer.kind === 'comm_pack' && offer.channel === focus.channel;
  return true;
}

/**
 * Whether online purchase is possible for this user: an administrator, on a server whose payment gateway is set up.
 * False (not loading, not an error) otherwise, so callers fall back to "Request top-up".
 */
export function useCanBuyAddons(): boolean {
  const isAdmin = useAuthStore((s) => s.user?.role) === 'admin';
  const [configured, setConfigured] = React.useState(false);
  React.useEffect(() => {
    if (!isAdmin) {
      setConfigured(false);
      return;
    }
    let cancelled = false;
    billingApi
      .addons()
      .then((res) => {
        if (!cancelled) setConfigured('data' in res && res.data.configured && res.data.products.some((p) => p.available));
      })
      .catch(() => {
        if (!cancelled) setConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);
  return isAdmin && configured;
}

function newKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `k${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
  }
}

function errorMessage(err: unknown, fallback: string): string {
  const e = err as Partial<ApiError> | undefined;
  return e?.message || fallback;
}

interface BuyMoreDialogProps {
  open: boolean;
  onClose: () => void;
  focus?: BuyMoreFocus;
}

/**
 * Buy extra users, an AI credit pack or a communication pack online. Prices come from the server (catalogue, tax
 * included in the total); payment happens on the gateway's page, and the pack arrives when the payment is confirmed.
 */
export function BuyMoreDialog({ open, onClose, focus }: BuyMoreDialogProps) {
  const [overview, setOverview] = React.useState<AddonsOverview | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [productKey, setProductKey] = React.useState('');
  const [quantity, setQuantity] = React.useState(1);
  const [quote, setQuote] = React.useState<AddonQuote | null>(null);
  const [quoteError, setQuoteError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const attemptKey = React.useRef(newKey());

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadError(null);
    billingApi
      .addons()
      .then((res) => {
        if (cancelled || !('data' in res)) return;
        setOverview(res.data);
        const first = res.data.products.find((p) => p.available && matches(p, focus));
        setProductKey((current) => current || first?.key || '');
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorMessage(err, 'Could not load the add-ons.'));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A new product or quantity is a new purchase: it gets its own idempotency key.
  React.useEffect(() => {
    attemptKey.current = newKey();
  }, [productKey, quantity]);

  React.useEffect(() => {
    if (!open || !productKey || !overview?.configured) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setQuoteError(null);
    billingApi
      .addonQuote(productKey, quantity)
      .then((res) => {
        if (!cancelled && 'data' in res) setQuote(res.data);
      })
      .catch((err) => {
        if (cancelled) return;
        setQuote(null);
        setQuoteError(errorMessage(err, 'Could not price this add-on.'));
      });
    return () => {
      cancelled = true;
    };
  }, [open, productKey, quantity, overview?.configured]);

  const offers = (overview?.products ?? []).filter((p) => matches(p, focus));
  const money = (amount: number, currency: string | null) => formatCurrency(amount, currency ?? undefined);
  const selected = offers.find((p) => p.key === productKey);

  async function pay() {
    if (!productKey) return;
    setBusy(true);
    try {
      const res = await billingApi.addonCheckout(productKey, quantity, attemptKey.current);
      if ('data' in res && res.data.url) {
        openCheckout(res.data.url);
        toast.success('The payment page opened in your browser. Your add-on arrives as soon as the payment is confirmed.');
        onClose();
      }
    } catch (err) {
      toast.error(errorMessage(err, 'Could not start the payment. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent data-testid="buy-more-dialog">
        <DialogHeader>
          <DialogTitle>Buy more</DialogTitle>
          <DialogDescription>
            Packs count for this month only. Extra users last until your paid year ends; renew with them to keep them.
          </DialogDescription>
        </DialogHeader>

        {loadError && <p role="alert" className="text-sm text-ds-danger">{loadError}</p>}
        {overview && !overview.configured && (
          <p className="text-sm text-ds-foreground-muted" data-testid="buy-more-not-configured">
            Online payment is not set up yet. Please contact support, or use Request top-up.
          </p>
        )}

        {overview && overview.configured && offers.length === 0 && (
          <p className="text-sm text-ds-foreground-muted">Nothing to buy online for this yet. Please contact support.</p>
        )}

        {overview && overview.configured && offers.length > 0 && (
          <div className="space-y-ds-3">
            <div className="grid gap-ds-2" role="radiogroup" aria-label="Add-on">
              {offers.map((offer) => (
                <button
                  key={offer.key}
                  type="button"
                  role="radio"
                  aria-checked={productKey === offer.key}
                  disabled={!offer.available}
                  data-testid={`buy-more-${offer.key}`}
                  onClick={() => setProductKey(offer.key)}
                  className={`flex items-center justify-between rounded-ds-md border px-ds-3 py-ds-2 text-left text-sm disabled:opacity-50 ${productKey === offer.key ? 'border-ds-primary bg-ds-primary-subtle' : 'border-ds-border'}`}
                >
                  <span>
                    <span className="block font-medium">{offer.name}</span>
                    {!offer.available && (
                      <span className="block text-xs text-ds-foreground-muted">
                        {offer.reason === 'NO_ACTIVE_SUBSCRIPTION' ? 'Choose a paid plan first' : 'Not available in your region yet'}
                      </span>
                    )}
                    {offer.available && offer.kind === 'extra_user' && offer.expiresAt && (
                      <span className="block text-xs text-ds-foreground-muted">Until {formatDisplayDate(offer.expiresAt)}</span>
                    )}
                  </span>
                  {offer.available && offer.unitPrice != null && (
                    <span className="font-medium">
                      {money(offer.unitPrice, offer.currency)}{offer.kind === 'extra_user' ? ' per user' : ''}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <label className="block text-sm">
              <span className="mb-ds-1 block text-ds-foreground-muted">{selected?.kind === 'extra_user' ? 'Users' : 'Packs'}</span>
              <Input
                type="number"
                min={1}
                max={selected?.kind === 'extra_user' ? 500 : 100}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                className="w-28"
                data-testid="buy-more-quantity"
              />
            </label>

            {quoteError && <p role="alert" className="text-sm text-ds-danger">{quoteError}</p>}
            {quote && (
              <div className="rounded-ds-md bg-ds-surface-sunken p-ds-3 text-sm" data-testid="buy-more-quote">
                <div className="flex justify-between"><span>Subtotal</span><span>{money(quote.subtotal, quote.currency)}</span></div>
                {quote.taxLines.map((t) => (
                  <div key={`${t.code}-${t.rate}`} className="flex justify-between"><span>{t.label} {t.rate}%</span><span>{money(t.amount, quote.currency)}</span></div>
                ))}
                <div className="flex justify-between font-medium"><span>Total</span><span>{money(quote.total, quote.currency)}</span></div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {overview?.configured && (
            <Button disabled={busy || !quote} onClick={() => void pay()} data-testid="buy-more-pay">
              Pay now
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
