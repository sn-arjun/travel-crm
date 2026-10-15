'use client';

import * as React from 'react';
import Link from 'next/link';
import { LinkIcon, Send } from 'lucide-react';
import { Button, SectionCard, Tag, useConfirm } from '@/components/ui';
import { SendMessageDialog } from '@/components/communication/send-message-dialog';
import { invoicesApi, type InvoiceDetail } from '@/lib/api/invoices';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';

const STATUS_TONE: Record<string, 'info' | 'success' | 'warning' | 'neutral'> = {
  created: 'info',
  paid: 'success',
  expired: 'warning',
  cancelled: 'neutral',
};

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * Pay-online section of an invoice: create a link through the agency's own gateway, then send it to the customer.
 * Sending goes through the Communication Hub (SendMessageDialog); there is no mailto: or wa.me anywhere.
 */
export function PaymentLinkCard({ invoice, contact, onChanged }: {
  invoice: InvoiceDetail;
  contact: { name: string; email?: string | null; phone?: string | null };
  onChanged: () => void;
}) {
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = React.useState(false);
  const [sendOpen, setSendOpen] = React.useState(false);
  const [needsGateway, setNeedsGateway] = React.useState(false);

  const link = invoice.paymentLink;
  const settled = invoice.balanceDue <= 0.01 || ['paid', 'void', 'cancelled'].includes(invoice.status);
  // Nothing to show on an invoice with no link that has nothing left to collect.
  if (settled && !link) return null;

  const live = link && link.status === 'created';

  const handleCreate = async () => {
    setBusy(true);
    setNeedsGateway(false);
    try {
      await invoicesApi.createPaymentLink(invoice.id);
      toast.success('Payment link created');
      onChanged();
    } catch (err) {
      const message = errorMessage(err, 'Could not create the payment link');
      setNeedsGateway(/connect razorpay or stripe/i.test(message));
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    const ok = await confirm({
      title: 'Cancel this payment link?',
      description: 'The customer will no longer be able to pay through it.',
      confirmLabel: 'Cancel link',
      tone: 'destructive',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await invoicesApi.cancelPaymentLink(invoice.id);
      toast.success('Payment link cancelled');
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not cancel the payment link'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title="Pay online"
      description="A link the customer opens to pay the balance through your own payment gateway. The payment is recorded here automatically."
      actions={
        settled ? undefined : (
          <Button size="sm" variant="outline" onClick={handleCreate} disabled={busy}>
            <LinkIcon aria-hidden="true" />
            {live ? 'Create a new link' : 'Create payment link'}
          </Button>
        )
      }
    >
      {dialog}
      <div className="flex flex-col gap-ds-3" data-testid="invoice-payment-link">
        {needsGateway && (
          <p role="alert" className="text-sm text-ds-danger">
            No payment gateway is connected yet.{' '}
            <Link href="/settings/integrations" className="font-medium underline">Connect Razorpay or Stripe</Link>
          </p>
        )}
        {link ? (
          <>
            <div className="flex flex-wrap items-center gap-ds-2">
              <Tag tone={STATUS_TONE[link.status] ?? 'neutral'}>{link.status.charAt(0).toUpperCase() + link.status.slice(1)}</Tag>
              {link.gateway && <span className="text-xs capitalize text-ds-foreground-muted">{link.gateway}</span>}
              <span className="truncate font-mono text-xs text-ds-foreground-muted" data-testid="invoice-payment-link-url">{link.url}</span>
            </div>
            {live && (
              <div className="flex flex-wrap gap-ds-2">
                <Button size="sm" onClick={() => setSendOpen(true)} disabled={busy}>
                  <Send aria-hidden="true" />
                  Send payment link
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancel} disabled={busy}>Cancel link</Button>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-ds-foreground-muted">No payment link yet.</p>
        )}
      </div>

      {link && live && (
        <SendMessageDialog
          open={sendOpen}
          onOpenChange={setSendOpen}
          contact={{ id: invoice.contactId, name: contact.name, email: contact.email, phone: contact.phone }}
          leadId={invoice.leadId}
          variables={{
            payment_link: link.url,
            invoice_number: invoice.invoiceNumber,
            amount: formatCurrency(invoice.balanceDue, invoice.currency),
          }}
        />
      )}
    </SectionCard>
  );
}
