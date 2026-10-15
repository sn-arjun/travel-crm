'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { CreditCard } from 'lucide-react';
import { PageHeader, SectionCard, Button, Badge, Skeleton, Input } from '@/components/ui';
import { PageContainer } from '@/components/layout/page-container';
import { useApiQuery } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { formatCurrency } from '@/lib/utils';
import { formatDisplayDate } from '@/lib/dates';
import { billingApi, openCheckout, type BillingQuote, type SubscriptionStatus } from '@/lib/api/billing';
import type { ApiError } from '@/lib/api/client';
import { BuyMoreDialog } from '@/components/domain/buy-more-dialog';

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  none: 'No plan',
  trial: 'Free trial',
  active: 'Active',
  past_due: 'Payment overdue',
  expired: 'Expired (read-only)',
  cancelled: 'Cancelled',
};

function errorMessage(err: unknown, fallback: string): string {
  const e = err as Partial<ApiError> | undefined;
  return e?.message || fallback;
}

export default function BillingSettingsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'admin';

  const { data, loading, error, refetch } = useApiQuery(() => billingApi.overview(), []);
  const invoicesQuery = useApiQuery(() => billingApi.invoices(), []);
  const ordersQuery = useApiQuery(() => billingApi.addonOrders(), []);
  const addonsQuery = useApiQuery(() => billingApi.addons(), []);
  const overview = data && 'data' in data ? data.data : null;
  const addons = addonsQuery.data && 'data' in addonsQuery.data ? addonsQuery.data.data : null;
  const orders = ordersQuery.data && 'data' in ordersQuery.data ? ordersQuery.data.data.orders : [];
  const invoices = invoicesQuery.data && 'data' in invoicesQuery.data ? invoicesQuery.data.data.invoices : [];

  const [planKey, setPlanKey] = React.useState<string>('');
  const [extraUsers, setExtraUsers] = React.useState(0);
  const [quote, setQuote] = React.useState<BillingQuote | null>(null);
  const [quoteError, setQuoteError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [buyOpen, setBuyOpen] = React.useState(false);

  // Coming back from the payment page: the gateway tells the server, so just refresh.
  React.useEffect(() => {
    const result = params.get('checkout');
    if (result === 'success') {
      toast.success('Thank you. Your payment is being confirmed.');
      void refetch({ silent: true });
      void invoicesQuery.refetch({ silent: true });
    } else if (result === 'cancelled') {
      toast.message('Checkout was cancelled. Nothing was charged.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Back from an add-on payment page: the pack arrives when the gateway confirms, so refresh what is shown.
  React.useEffect(() => {
    const result = params.get('addon');
    if (result === 'success') {
      toast.success('Thank you. Your add-on arrives as soon as the payment is confirmed.');
      void ordersQuery.refetch({ silent: true });
      void addonsQuery.refetch({ silent: true });
      void refetch({ silent: true });
      void invoicesQuery.refetch({ silent: true });
    } else if (result === 'cancelled') {
      toast.message('The add-on payment was cancelled. Nothing was charged.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  React.useEffect(() => {
    if (!overview) return;
    setPlanKey((current) => current || (overview.subscription.planKey !== 'trial' ? overview.subscription.planKey : overview.plans.find((p) => p.available)?.key ?? ''));
    setExtraUsers((current) => (current === 0 ? overview.subscription.extraUsers : current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview?.subscription.planKey]);

  React.useEffect(() => {
    if (!isAdmin || !planKey || !overview?.configured) return;
    let cancelled = false;
    setQuoteError(null);
    billingApi
      .quote(planKey, extraUsers)
      .then((res) => {
        if (!cancelled && 'data' in res) setQuote(res.data);
      })
      .catch((err) => {
        if (cancelled) return;
        setQuote(null);
        setQuoteError(errorMessage(err, 'Could not price this plan.'));
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, planKey, extraUsers, overview?.configured]);

  async function pay() {
    setBusy(true);
    try {
      const res = await billingApi.checkout(planKey, extraUsers);
      if ('data' in res && res.data.url) {
        openCheckout(res.data.url);
        toast.success('The payment page opened in your browser.');
      }
    } catch (err) {
      toast.error(errorMessage(err, 'Could not start the payment. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!window.confirm('Stop renewals? You keep full access until the end of the period you have paid for.')) return;
    setBusy(true);
    try {
      await billingApi.cancel();
      toast.success('Renewals stopped. Access continues until the end of the paid period.');
      await refetch({ silent: true });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not cancel. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function download(id: string, number: string) {
    try {
      const blob = await billingApi.downloadInvoice(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${number}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not download the invoice.');
    }
  }

  const header = (
    <PageHeader
      title="Billing"
      description="Your plan, users, renewal and invoices."
      back={
        <Button variant="ghost" size="icon-sm" aria-label="Back" onClick={() => router.push('/settings')}>
          <CreditCard className="size-4" />
        </Button>
      }
    />
  );

  if (!isAdmin) {
    return (
      <PageContainer width="narrow">
        {header}
        <p className="text-sm text-ds-foreground-muted" data-testid="billing-admin-only">
          Only an administrator can manage billing.
        </p>
      </PageContainer>
    );
  }

  if (loading || !overview) {
    return (
      <PageContainer width="narrow">
        {header}
        {error ? (
          <p role="alert" className="text-sm text-ds-danger">Could not load billing. Please try again.</p>
        ) : (
          <div className="space-y-ds-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
      </PageContainer>
    );
  }

  const sub = overview.subscription;
  const money = (amount: number, currency: string | null) => formatCurrency(amount, currency ?? 'INR');
  const selected = overview.plans.find((p) => p.key === planKey);

  return (
    <PageContainer width="narrow">
      {header}

      {sub.status === 'past_due' && (
        <div role="alert" data-testid="billing-past-due" className="mb-ds-4 rounded-ds-md border border-ds-warning bg-ds-warning-subtle px-ds-4 py-ds-3 text-sm">
          Your last payment did not go through. Everything keeps working until {sub.graceEndsAt ? formatDisplayDate(sub.graceEndsAt) : `${sub.graceDays} days from the failed payment`}. After that the workspace becomes read-only until you pay. Nothing is deleted.
        </div>
      )}
      {overview.readOnly && (
        <div role="alert" data-testid="billing-read-only" className="mb-ds-4 rounded-ds-md border border-ds-danger bg-ds-danger-subtle px-ds-4 py-ds-3 text-sm">
          Your subscription has ended, so the workspace is read-only. Pay below to continue editing. Your data is safe.
        </div>
      )}

      <SectionCard title="Current plan">
        <dl className="grid grid-cols-1 gap-ds-3 text-sm sm:grid-cols-2" data-testid="billing-current">
          <div>
            <dt className="text-ds-foreground-muted">Plan</dt>
            <dd className="font-medium">{sub.planName}</dd>
          </div>
          <div>
            <dt className="text-ds-foreground-muted">Status</dt>
            <dd><Badge variant={sub.status === 'active' ? 'default' : 'secondary'}>{STATUS_LABEL[sub.status]}</Badge></dd>
          </div>
          <div>
            <dt className="text-ds-foreground-muted">{sub.status === 'trial' ? 'Trial ends' : sub.cancelAtPeriodEnd ? 'Access until' : 'Renews on'}</dt>
            <dd className="font-medium">
              {formatDisplayDate((sub.status === 'trial' ? sub.trialEndsAt : sub.currentPeriodEnd) ?? '') || 'Not set'}
            </dd>
          </div>
          <div>
            <dt className="text-ds-foreground-muted">Users</dt>
            <dd className="font-medium">
              {overview.seats.used} of {overview.seats.limit} in use
              {sub.extraUsers > 0 ? ` (${sub.extraUsers} extra)` : ''}
            </dd>
          </div>
        </dl>
        {sub.cancelAtPeriodEnd && (
          <p className="mt-ds-3 text-sm text-ds-foreground-muted">Renewals are stopped. Choose a plan below to keep the service after the paid period.</p>
        )}
      </SectionCard>

      {!overview.configured ? (
        <SectionCard title="Upgrade or change users">
          <p className="text-sm text-ds-foreground-muted" data-testid="billing-not-configured">
            Online payment is not set up yet. Please contact support to pay by other means.
          </p>
        </SectionCard>
      ) : (
        <SectionCard title="Upgrade or change users" description="Prices are per year.">
          <div className="space-y-ds-4">
            <div className="grid grid-cols-1 gap-ds-3 sm:grid-cols-3" role="radiogroup" aria-label="Plan">
              {overview.plans.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  role="radio"
                  aria-checked={planKey === p.key}
                  disabled={!p.available}
                  data-testid={`billing-plan-${p.key}`}
                  onClick={() => setPlanKey(p.key)}
                  className={`rounded-ds-md border p-ds-3 text-left text-sm disabled:opacity-50 ${planKey === p.key ? 'border-ds-primary bg-ds-primary-subtle' : 'border-ds-border'}`}
                >
                  <span className="block font-medium">{p.name}</span>
                  {p.available ? (
                    <>
                      <span className="block">{money(p.yearlyPrice ?? 0, p.currency)} per year</span>
                      <span className="block text-ds-foreground-muted">{p.includedUsers} users included</span>
                    </>
                  ) : (
                    <span className="block text-ds-foreground-muted">Not available in your region yet</span>
                  )}
                </button>
              ))}
            </div>

            <label className="block text-sm">
              <span className="mb-ds-1 block text-ds-foreground-muted">
                Extra users{selected?.extraUserYearlyPrice != null ? ` (${money(selected.extraUserYearlyPrice, selected.currency)} each per year)` : ''}
              </span>
              <Input
                type="number"
                min={0}
                max={5000}
                value={extraUsers}
                onChange={(e) => setExtraUsers(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                className="w-32"
                data-testid="billing-extra-users"
              />
            </label>

            {quoteError && <p role="alert" className="text-sm text-ds-danger">{quoteError}</p>}
            {quote && (
              <div className="rounded-ds-md bg-ds-surface-sunken p-ds-3 text-sm" data-testid="billing-quote">
                <div className="flex justify-between"><span>Subtotal</span><span>{money(quote.subtotal, quote.currency)}</span></div>
                {quote.taxLines.map((t) => (
                  <div key={`${t.code}-${t.rate}`} className="flex justify-between"><span>{t.label} {t.rate}%</span><span>{money(t.amount, quote.currency)}</span></div>
                ))}
                <div className="flex justify-between font-medium"><span>Total per year</span><span>{money(quote.total, quote.currency)}</span></div>
              </div>
            )}

            <div className="flex flex-wrap gap-ds-2">
              <Button onClick={() => void pay()} disabled={busy || !quote} data-testid="billing-pay">
                {sub.status === 'active' || sub.status === 'past_due' ? 'Change plan or users' : 'Choose this plan and pay'}
              </Button>
              {(sub.status === 'active' || sub.status === 'past_due') && !sub.cancelAtPeriodEnd && (
                <Button variant="outline" onClick={() => void cancel()} disabled={busy} data-testid="billing-cancel">
                  Stop renewals
                </Button>
              )}
            </div>
            <p className="text-xs text-ds-foreground-muted">
              Changing plan or users starts a new yearly subscription at the price shown, and the old one stops renewing.
            </p>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Add-ons" description="Extra users, AI credits and message packs, paid online. Packs count for the current month.">
        {!addons?.configured ? (
          <p className="text-sm text-ds-foreground-muted" data-testid="billing-addons-not-configured">
            Online payment is not set up yet. Use Request top-up on the Usage and limits page, or contact support.
          </p>
        ) : (
          <div className="space-y-ds-3">
            <ul className="space-y-ds-1 text-sm" data-testid="billing-addon-list">
              {addons.products.filter((p) => p.available).map((p) => (
                <li key={p.key} className="flex items-center justify-between rounded-ds-md border border-ds-border px-ds-3 py-ds-2">
                  <span>{p.name}</span>
                  <span className="font-medium">{money(p.unitPrice ?? 0, p.currency)}{p.kind === 'extra_user' ? ' per user' : ''}</span>
                </li>
              ))}
            </ul>
            {addons.purchasedUsers.quantity > 0 && (
              <p className="text-sm text-ds-foreground-muted" data-testid="billing-purchased-users">
                {addons.purchasedUsers.quantity} extra users bought online{addons.purchasedUsers.endsAt ? `, until ${formatDisplayDate(addons.purchasedUsers.endsAt)}` : ''}. To keep them after that, add them to your plan above when you renew.
              </p>
            )}
            <Button onClick={() => setBuyOpen(true)} data-testid="billing-buy-more">Buy more</Button>
          </div>
        )}
        {orders.length > 0 && (
          <table className="mt-ds-4 w-full text-sm" data-testid="billing-addon-orders">
            <thead>
              <tr className="border-b border-ds-border text-left text-ds-foreground-muted">
                <th className="py-ds-2 font-medium">Purchase</th>
                <th className="py-ds-2 font-medium">Date</th>
                <th className="py-ds-2 font-medium">Status</th>
                <th className="py-ds-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-ds-border/50 last:border-0">
                  <td className="py-ds-2">{o.description ?? o.productKey}</td>
                  <td className="py-ds-2">{formatDisplayDate(o.createdAt)}</td>
                  <td className="py-ds-2"><Badge variant={o.status === 'paid' ? 'default' : 'secondary'}>{o.status === 'paid' ? 'Paid' : o.status === 'failed' ? 'Failed' : 'Awaiting payment'}</Badge></td>
                  <td className="py-ds-2 text-right">{money(o.total, o.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
      <BuyMoreDialog open={buyOpen} onClose={() => { setBuyOpen(false); void ordersQuery.refetch({ silent: true }); }} />

      <SectionCard title="Invoices" flush>
        {invoices.length === 0 ? (
          <p className="p-ds-4 text-sm text-ds-foreground-muted" data-testid="billing-no-invoices">No invoices yet.</p>
        ) : (
          <table className="w-full text-sm" data-testid="billing-invoices">
            <thead>
              <tr className="border-b border-ds-border text-left text-ds-foreground-muted">
                <th className="px-ds-4 py-ds-2 font-medium">Invoice</th>
                <th className="px-ds-4 py-ds-2 font-medium">Date</th>
                <th className="px-ds-4 py-ds-2 text-right font-medium">Total</th>
                <th className="px-ds-4 py-ds-2" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-ds-border/50 last:border-0">
                  <td className="px-ds-4 py-ds-2">{inv.number}{inv.description ? <span className="block text-xs text-ds-foreground-muted">{inv.description}</span> : null}</td>
                  <td className="px-ds-4 py-ds-2">{formatDisplayDate(inv.issuedAt)}</td>
                  <td className="px-ds-4 py-ds-2 text-right">{money(inv.total, inv.currency)}</td>
                  <td className="px-ds-4 py-ds-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => void download(inv.id, inv.number)}>Download</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </PageContainer>
  );
}
